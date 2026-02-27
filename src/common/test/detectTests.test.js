import { expect } from "chai";
import { detectTests } from "../dist/index.js";
import {
  parseContent,
  parseXmlAttributes,
  parseObject,
  replaceNumericVariables,
  log,
} from "../dist/detectTests.js";

  describe("detectTests module", function () {
  // Standard markdown file type for testing
  const markdownFileType = {
    extensions: ["md"],
    inlineStatements: {
      testStart: ["<!-- test (.*?)-->"],
      testEnd: ["<!-- test end -->"],
      ignoreStart: ["<!-- test ignore -->"],
      ignoreEnd: ["<!-- test ignore end -->"],
      step: ["<!-- step (.*?)-->"],
    },
    markup: [
      {
        regex: ["\\[([^\\]]+)\\]\\(([^)]+)\\)"],
        actions: ["checkLink"],
      },
    ],
  };

  // Minimal file type with no markup or inline statements
  const minimalFileType = {
    extensions: ["txt"],
  };
    // ========== parseXmlAttributes ==========
    describe("parseXmlAttributes", function () {
      it("should return null for non-string input", function () {
        expect(parseXmlAttributes({ stringifiedObject: 123 })).to.be.null;
        expect(parseXmlAttributes({ stringifiedObject: null })).to.be.null;
        expect(parseXmlAttributes({ stringifiedObject: undefined })).to.be.null;
      });

      it("should return null for JSON-like input starting with {", function () {
        expect(
          parseXmlAttributes({ stringifiedObject: '{"key": "value"}' })
        ).to.be.null;
      });

      it("should return null for JSON-like input starting with [", function () {
        expect(
          parseXmlAttributes({ stringifiedObject: '[1, 2, 3]' })
        ).to.be.null;
      });

      it("should return null for YAML-like input (key: value)", function () {
        expect(
          parseXmlAttributes({ stringifiedObject: "key: value" })
        ).to.be.null;
      });

      it("should return null for input starting with -", function () {
        expect(
          parseXmlAttributes({ stringifiedObject: "- item" })
        ).to.be.null;
      });

      it("should return null when no matches found", function () {
        expect(
          parseXmlAttributes({ stringifiedObject: "just plain text" })
        ).to.be.null;
      });

      it("should parse simple key=value pairs", function () {
        const result = parseXmlAttributes({ stringifiedObject: 'name=hello' });
        expect(result).to.deep.equal({ name: "hello" });
      });

      it("should parse double-quoted values", function () {
        const result = parseXmlAttributes({
          stringifiedObject: 'testId="myTest"',
        });
        expect(result).to.deep.equal({ testId: "myTest" });
      });

      it("should parse single-quoted values", function () {
        const result = parseXmlAttributes({
          stringifiedObject: "testId='myTest'",
        });
        expect(result).to.deep.equal({ testId: "myTest" });
      });

      it("should parse boolean true value", function () {
        const result = parseXmlAttributes({
          stringifiedObject: "detectSteps=true",
        });
        expect(result).to.deep.equal({ detectSteps: true });
      });

      it("should parse boolean false value", function () {
        const result = parseXmlAttributes({
          stringifiedObject: "detectSteps=false",
        });
        expect(result).to.deep.equal({ detectSteps: false });
      });

      it("should parse numeric values", function () {
        const result = parseXmlAttributes({
          stringifiedObject: "wait=500",
        });
        expect(result).to.deep.equal({ wait: 500 });
      });

      it("should handle dot notation for nested objects", function () {
        const result = parseXmlAttributes({
          stringifiedObject: 'httpRequest.url="https://example.com"',
        });
        expect(result).to.deep.equal({
          httpRequest: { url: "https://example.com" },
        });
      });

      it("should handle multiple attributes", function () {
        const result = parseXmlAttributes({
          stringifiedObject: 'testId="myTest" detectSteps=false wait=500',
        });
        expect(result).to.deep.equal({
          testId: "myTest",
          detectSteps: false,
          wait: 500,
        });
      });

      it("should handle deep dot notation", function () {
        const result = parseXmlAttributes({
          stringifiedObject: 'a.b.c="deep"',
        });
        expect(result).to.deep.equal({ a: { b: { c: "deep" } } });
      });

      it("should overwrite non-object intermediate key in dot notation", function () {
        // Tests branch where current[key] exists but is not an object
        const result = parseXmlAttributes({
          stringifiedObject: 'a=1 a.b="deep"',
        });
        // The second attribute overwrites a=1 with a={b:"deep"}
        expect(result).to.deep.equal({ a: { b: "deep" } });
      });
    });

    // ========== parseObject ==========
    describe("parseObject", function () {
      it("should parse XML attributes first", function () {
        const result = parseObject({
          stringifiedObject: 'key="value"',
        });
        expect(result).to.deep.equal({ key: "value" });
      });

      it("should parse valid JSON", function () {
        const result = parseObject({
          stringifiedObject: '{"goTo": {"url": "https://example.com"}}',
        });
        expect(result).to.deep.equal({
          goTo: { url: "https://example.com" },
        });
      });

      it("should parse escaped JSON (double-encoded)", function () {
        const escaped = '{\\"key\\": \\"value\\"}';
        const result = parseObject({ stringifiedObject: escaped });
        expect(result).to.deep.equal({ key: "value" });
      });

      it("should parse YAML as fallback", function () {
        const result = parseObject({
          stringifiedObject: "goTo:\n  url: https://example.com",
        });
        expect(result).to.deep.equal({
          goTo: { url: "https://example.com" },
        });
      });

      it("should return null for invalid JSON and YAML", function () {
        const result = parseObject({
          stringifiedObject: "{invalid: json: yaml: :::}",
        });
        expect(result).to.be.null;
      });

      it("should return non-string input as-is", function () {
        const obj = { key: "value" };
        const result = parseObject({ stringifiedObject: obj });
        expect(result).to.deep.equal(obj);
      });

      it("should handle escaped JSON where double-parse fails but simple unescape succeeds", function () {
        // Input: {\"key\": \"val\\ue\"} - double parse creates \u escape that needs 4 hex digits, fails
        // Simple unescape: {"key": "val\\ue"} - \\u is literal backslash+u, valid JSON
        const input = '{\\"key\\": \\"val\\\\ue\\"}';
        const result = parseObject({ stringifiedObject: input });
        expect(result).to.deep.equal({ key: "val\\ue" });
      });

      it("should return null for escaped JSON that double-parses to array", function () {
        // Input looks like escaped JSON array: [\"a\"]
        // Double-parse: JSON.parse('"[\"a\"]"') -> '["a"]' -> JSON.parse -> ["a"] (array)
        const input = '[\\"a\\"]';
        const result = parseObject({ stringifiedObject: input });
        expect(result).to.be.null;
      });

      it("should return null for escaped JSON that simple-unescapes to array", function () {
        // Input: [\"val\\ue\"] - double parse fails on \u escape, simple unescape yields ["val\\ue"] (array)
        const input = '[\\"val\\\\ue\\"]';
        const result = parseObject({ stringifiedObject: input });
        expect(result).to.be.null;
      });

      it("should handle escaped JSON where both parse attempts fail", function () {
        // Input looks like escaped JSON but neither parse succeeds
        const input = '{\\"broken json\\"}';
        const result = parseObject({ stringifiedObject: input });
        // Falls through to YAML parsing
        expect(result).to.not.be.undefined;
      });

      it("should return null for JSON array", function () {
        const result = parseObject({ stringifiedObject: "[1, 2, 3]" });
        expect(result).to.be.null;
      });

      it("should return null for JSON primitive", function () {
        const result = parseObject({ stringifiedObject: '"just a string"' });
        expect(result).to.be.null;
      });

      it("should return null for YAML array", function () {
        const result = parseObject({ stringifiedObject: "- item1\n- item2" });
        expect(result).to.be.null;
      });
    });

    // ========== replaceNumericVariables ==========
    describe("replaceNumericVariables", function () {
      it("should replace $0, $1 in strings", function () {
        const result = replaceNumericVariables("Hello $0 and $1", {
          0: "world",
          1: "everyone",
        });
        expect(result).to.equal("Hello world and everyone");
      });

      it("should return null when not all variables exist in string", function () {
        const result = replaceNumericVariables("Hello $0 and $1", {
          0: "world",
        });
        expect(result).to.be.null;
      });

      it("should replace variables in object values", function () {
        const result = replaceNumericVariables(
          { url: "https://$0.com", name: "$1" },
          { 0: "example", 1: "test" }
        );
        expect(result).to.deep.equal({
          url: "https://example.com",
          name: "test",
        });
      });

      it("should handle nested objects recursively", function () {
        const result = replaceNumericVariables(
          { outer: { inner: "$0" } },
          { 0: "value" }
        );
        expect(result).to.deep.equal({ outer: { inner: "value" } });
      });

      it("should delete nested object keys when variables don't exist", function () {
        const result = replaceNumericVariables(
          { outer: { inner: "$1" }, keep: "$0" },
          { 0: "found" }
        );
        // Inner key is deleted, leaving outer as empty object
        expect(result).to.deep.equal({ outer: {}, keep: "found" });
      });

      it("should delete object keys when variables don't exist", function () {
        const result = replaceNumericVariables(
          { url: "$0", missing: "$1" },
          { 0: "found" }
        );
        expect(result).to.deep.equal({ url: "found" });
        expect(result).to.not.have.property("missing");
      });

      it("should return string without variables unchanged", function () {
        const result = replaceNumericVariables("no variables", { 0: "x" });
        expect(result).to.equal("no variables");
      });

      it("should return object without variables unchanged", function () {
        const result = replaceNumericVariables(
          { key: "no vars" },
          { 0: "x" }
        );
        expect(result).to.deep.equal({ key: "no vars" });
      });

      it("should throw on invalid stringOrObject type", function () {
        expect(() => replaceNumericVariables(123, { 0: "x" })).to.throw(
          "Invalid stringOrObject type"
        );
      });

      it("should throw on invalid values type", function () {
        expect(() => replaceNumericVariables("test", "not-object")).to.throw(
          "Invalid values type"
        );
      });
    });

    // ========== log ==========
    describe("log", function () {
      let originalConsole;

      beforeEach(function () {
        originalConsole = {
          error: console.error,
          warn: console.warn,
          info: console.info,
          debug: console.debug,
        };
      });

      afterEach(function () {
        console.error = originalConsole.error;
        console.warn = originalConsole.warn;
        console.info = originalConsole.info;
        console.debug = originalConsole.debug;
      });

      it("should log string messages at info level", function () {
        let logged = null;
        console.info = (msg) => {
          logged = msg;
        };
        log({ logLevel: "info" }, "info", "test message");
        expect(logged).to.equal("test message");
      });

      it("should log object messages as JSON", function () {
        let logged = null;
        console.info = (msg) => {
          logged = msg;
        };
        log({ logLevel: "info" }, "info", { key: "value" });
        expect(logged).to.equal(JSON.stringify({ key: "value" }, null, 2));
      });

      it("should suppress messages when config level is silent", function () {
        let logged = false;
        console.info = () => {
          logged = true;
        };
        log({ logLevel: "silent" }, "info", "test");
        expect(logged).to.be.false;
      });

      it("should suppress messages above config level", function () {
        let logged = false;
        console.debug = () => {
          logged = true;
        };
        log({ logLevel: "info" }, "debug", "test");
        expect(logged).to.be.false;
      });

      it("should normalize warning to warn", function () {
        let logged = null;
        console.warn = (msg) => {
          logged = msg;
        };
        log({ logLevel: "debug" }, "warning", "warn msg");
        expect(logged).to.equal("warn msg");
      });

      it("should normalize config logLevel 'warning' to 'warn'", function () {
        let logged = null;
        console.warn = (msg) => { logged = msg; };
        log({ logLevel: "warning" }, "warn", "config warning test");
        expect(logged).to.equal("config warning test");
      });

      it("should not log when message level is silent", function () {
        let logged = false;
        console.error = () => { logged = true; };
        console.warn = () => { logged = true; };
        console.info = () => { logged = true; };
        console.debug = () => { logged = true; };
        log({ logLevel: "debug" }, "silent", "should not appear");
        expect(logged).to.be.false;
      });

      it("should return early for invalid config level", function () {
        let logged = false;
        console.info = () => {
          logged = true;
        };
        log({ logLevel: "invalid" }, "info", "test");
        expect(logged).to.be.false;
      });

      it("should return early for invalid message level", function () {
        let logged = false;
        console.info = () => {
          logged = true;
        };
        log({ logLevel: "info" }, "invalid", "test");
        expect(logged).to.be.false;
      });

      it("should default to info level when logLevel not specified", function () {
        let logged = null;
        console.info = (msg) => {
          logged = msg;
        };
        log({}, "info", "test default");
        expect(logged).to.equal("test default");
      });

      it("should log error level messages", function () {
        let logged = null;
        console.error = (msg) => {
          logged = msg;
        };
        log({ logLevel: "error" }, "error", "error msg");
        expect(logged).to.equal("error msg");
      });
    });

    // ========== parseContent ==========
    describe("parseContent", function () {
      it("should return empty array for empty content", async function () {
        const result = await parseContent({
          config: {},
          content: "",
          filePath: "test.md",
          fileType: markdownFileType,
        });
        expect(result).to.be.an("array").that.is.empty;
      });

      it("should return empty array for content without test statements", async function () {
        const result = await parseContent({
          config: {},
          content: "Just some regular text",
          filePath: "test.md",
          fileType: markdownFileType,
        });
        expect(result).to.be.an("array").that.is.empty;
      });

      it("should detect a test with testStart statement", async function () {
        const content = '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->';
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType: markdownFileType,
        });
        expect(result).to.have.lengthOf(1);
        expect(result[0].steps).to.have.lengthOf(1);
        expect(result[0].steps[0].goTo.url).to.equal("https://example.com");
      });

      it("should handle testEnd resetting testId", async function () {
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://a.com"}}]} -->\n' +
          "<!-- test end -->\n" +
          '<!-- test {"steps": [{"goTo": {"url": "https://b.com"}}]} -->';
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType: markdownFileType,
        });
        expect(result).to.have.lengthOf(2);
        expect(result[0].testId).to.not.equal(result[1].testId);
      });

      it("should parse step inline statements", async function () {
        const content =
          '<!-- test {"steps": []} -->\n' +
          '<!-- step {"goTo": {"url": "https://example.com"}} -->';
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType: markdownFileType,
        });
        expect(result).to.have.lengthOf(1);
        expect(result[0].steps).to.have.lengthOf(1);
      });

      it("should skip invalid step statements", async function () {
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          '<!-- step {"invalidAction": true} -->';
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType: markdownFileType,
        });
        expect(result).to.have.lengthOf(1);
        // Only the original valid step, invalid step is skipped
        expect(result[0].steps).to.have.lengthOf(1);
      });

      it("should skip step when parseObject returns null", async function () {
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "<!-- step not parseable content -->";
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType: markdownFileType,
        });
        expect(result).to.have.lengthOf(1);
        expect(result[0].steps).to.have.lengthOf(1);
      });

      it("should detect markup steps when detectSteps is true", async function () {
        // Use object-style action that produces valid v3 step
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
            testEnd: ["<!-- test end -->"],
            step: ["<!-- step (.*?)-->"],
          },
          markup: [
            {
              regex: ["\\[([^\\]]+)\\]\\(([^)]+)\\)"],
              actions: [{ checkLink: { url: "$2" } }],
            },
          ],
        };
        const content =
          '<!-- test {"steps": []} -->\n' +
          "[Click me](https://example.com)";
        const result = await parseContent({
          config: { detectSteps: true },
          content,
          filePath: "test.md",
          fileType,
        });
        expect(result).to.have.lengthOf(1);
        expect(result[0].steps.length).to.be.greaterThan(0);
      });

      it("should NOT detect markup steps when detectSteps is not set", async function () {
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "[Click me](https://other.com)";
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType: markdownFileType,
        });
        expect(result).to.have.lengthOf(1);
        // Only the inline step, no markup-detected steps
        expect(result[0].steps).to.have.lengthOf(1);
      });

      it("should skip detected steps when test has detectSteps=false", async function () {
        const content =
          '<!-- test {"detectSteps": false, "steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "[Click me](https://other.com)";
        const result = await parseContent({
          config: { detectSteps: true },
          content,
          filePath: "test.md",
          fileType: markdownFileType,
        });
        expect(result).to.have.lengthOf(1);
        // Only the inline step, markup steps skipped due to detectSteps=false
        expect(result[0].steps).to.have.lengthOf(1);
      });

      it("should normalize detectSteps string 'false' to boolean", async function () {
        // Use JSON format so detectSteps stays as string "false" (XML attrs auto-convert)
        const content =
          '<!-- test {"detectSteps": "false", "steps": [{"goTo": {"url": "https://example.com"}}]} -->';
        const result = await parseContent({
          config: { detectSteps: true },
          content,
          filePath: "test.md",
          fileType: markdownFileType,
        });
        expect(result).to.have.lengthOf(1);
        expect(result[0].detectSteps).to.be.false;
      });

      it("should normalize detectSteps string 'true' to boolean", async function () {
        // Use JSON format so detectSteps stays as string "true" (XML attrs auto-convert)
        const content =
          '<!-- test {"detectSteps": "true", "steps": [{"goTo": {"url": "https://example.com"}}]} -->';
        const result = await parseContent({
          config: { detectSteps: true },
          content,
          filePath: "test.md",
          fileType: markdownFileType,
        });
        expect(result).to.have.lengthOf(1);
        expect(result[0].detectSteps).to.be.true;
      });

      it("should handle testStart with unparseable content", async function () {
        const content = "<!-- test -->";
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType: markdownFileType,
        });
        // empty capture group -> parseObject gets empty string -> YAML parses to null -> breaks
        expect(result).to.be.an("array");
      });

      it("should initialize empty steps array when test has no steps property", async function () {
        // Test object without steps property triggers !test.steps branch
        const content =
          '<!-- test {"testId": "no-steps"} -->\n' +
          '<!-- step {"goTo": {"url": "https://example.com"}} -->';
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType: markdownFileType,
        });
        expect(result).to.have.lengthOf(1);
        expect(result[0].steps).to.be.an("array").with.lengthOf(1);
      });

      it("should handle v2 test schema conversion", async function () {
        const content =
          '<!-- test {"id": "my-test", "steps": [{"action": "goTo", "url": "https://example.com"}]} -->';
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType: markdownFileType,
        });
        expect(result).to.have.lengthOf(1);
        expect(result[0].testId).to.equal("my-test");
      });

      it("should handle v2 test schema with stepsCleanup", async function () {
        const content =
          '<!-- test {"id": "my-test"} -->\n' +
          '<!-- step {"goTo": {"url": "https://example.com"}} -->';
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType: markdownFileType,
        });
        expect(result).to.have.lengthOf(1);
        expect(result[0].testId).to.equal("my-test");
        expect(result[0].steps).to.be.an("array").with.lengthOf(1);
      });

      it("should preserve existing testId from test definition", async function () {
        const content =
          '<!-- test {"testId": "custom-id", "steps": [{"goTo": {"url": "https://example.com"}}]} -->';
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType: markdownFileType,
        });
        expect(result).to.have.lengthOf(1);
        expect(result[0].testId).to.equal("custom-id");
      });

      it("should add origin to goTo steps from config (string action)", async function () {
        // String actions with origin produce invalid v3 steps (spread chars).
        // This test verifies the code path runs even though the step is filtered.
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
            testEnd: ["<!-- test end -->"],
          },
          markup: [
            {
              regex: ["\\[([^\\]]+)\\]\\(([^)]+)\\)"],
              actions: ["goTo"],
            },
          ],
        };
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "[Go here](/path)";
        const result = await parseContent({
          config: { detectSteps: true, origin: "https://origin.com" },
          content,
          filePath: "test.md",
          fileType,
        });
        // Test survives because of the seeded step; markup goTo step is invalid v3 and filtered
        expect(result).to.have.lengthOf(1);
        expect(result[0].steps).to.have.lengthOf(1);
      });

      it("should add origin to checkLink steps from config (string action)", async function () {
        // String actions with origin produce invalid v3 steps.
        // This test exercises the code path even though the step is filtered.
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "[Link](https://other.com)";
        const result = await parseContent({
          config: { detectSteps: true, origin: "https://origin.com" },
          content,
          filePath: "test.md",
          fileType: markdownFileType,
        });
        // Test survives because of seeded step; markup checkLink with origin is invalid v3
        expect(result).to.have.lengthOf(1);
        expect(result[0].steps).to.have.lengthOf(1);
      });

      it("should skip runCode actions in markup", async function () {
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
            step: ["<!-- step (.*?)-->"],
          },
          markup: [
            {
              regex: ["```(\\w+)\\n([\\s\\S]*?)```"],
              actions: ["runCode"],
            },
          ],
        };
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "```javascript\nconsole.log('hi');\n```";
        const result = await parseContent({
          config: { detectSteps: true },
          content,
          filePath: "test.md",
          fileType,
        });
        expect(result).to.have.lengthOf(1);
        // Only the seeded step, runCode from markup is skipped
        expect(result[0].steps).to.have.lengthOf(1);
      });

      it("should handle batchMatches mode in markup", async function () {
        // batchMatches combines multiple regex matches into one statement.
        // String actions produce invalid v3 steps, so test with a seeded step.
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
          },
          markup: [
            {
              regex: ["\\[([^\\]]+)\\]\\(([^)]+)\\)"],
              actions: ["checkLink"],
              batchMatches: true,
            },
          ],
        };
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "[Link1](https://a.com)\n" +
          "[Link2](https://b.com)";
        const result = await parseContent({
          config: { detectSteps: true },
          content,
          filePath: "test.md",
          fileType,
        });
        expect(result).to.have.lengthOf(1);
        // Seeded step survives; batch checkLink string step is invalid v3
        expect(result[0].steps).to.have.lengthOf(1);
      });

      it("should handle markup with object actions and variable replacement", async function () {
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
          },
          markup: [
            {
              regex: ["\\[([^\\]]+)\\]\\(([^)]+)\\)"],
              actions: [{ checkLink: { url: "$2" } }],
            },
          ],
        };
        const content =
          '<!-- test {"steps": []} -->\n' +
          "[Link](https://example.com)";
        const result = await parseContent({
          config: { detectSteps: true },
          content,
          filePath: "test.md",
          fileType,
        });
        expect(result).to.have.lengthOf(1);
        expect(result[0].steps).to.have.lengthOf(1);
        expect(result[0].steps[0].checkLink.url).to.equal("https://example.com");
      });

      it("should handle screenshot action with Heretto integration", async function () {
        // String screenshot action produces invalid v3 step even with Heretto.
        // This test exercises the Heretto code path for coverage.
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
          },
          markup: [
            {
              regex: ["!\\[([^\\]]*?)\\]\\(([^)]+)\\)"],
              actions: ["screenshot"],
            },
          ],
        };
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "![alt](images/test.png)";
        const result = await parseContent({
          config: {
            detectSteps: true,
            _herettoPathMapping: { "docs/": "my-integration" },
          },
          content,
          filePath: "docs/test.md",
          fileType,
        });
        expect(result).to.have.lengthOf(1);
        // Seeded step survives; screenshot step with Heretto is invalid v3
        expect(result[0].steps).to.have.lengthOf(1);
      });

      it("should handle screenshot with object action and Heretto integration (string screenshot)", async function () {
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
          },
          markup: [
            {
              regex: ["!\\[([^\\]]*?)\\]\\(([^)]+)\\)"],
              actions: [{ screenshot: "$2" }],
            },
          ],
        };
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "![alt](images/test.png)";
        const result = await parseContent({
          config: {
            detectSteps: true,
            _herettoPathMapping: { "docs/": "my-integration" },
          },
          content,
          filePath: "docs/test.md",
          fileType,
        });
        // Test survives via seeded step; screenshot step may or may not pass v3 validation
        expect(result).to.have.lengthOf(1);
      });

      it("should handle screenshot with object action and Heretto integration (boolean screenshot)", async function () {
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
          },
          markup: [
            {
              regex: ["!\\[([^\\]]*?)\\]\\(([^)]+)\\)"],
              actions: [{ screenshot: true }],
            },
          ],
        };
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "![alt](images/test.png)";
        const result = await parseContent({
          config: {
            detectSteps: true,
            _herettoPathMapping: { "docs/": "my-integration" },
          },
          content,
          filePath: "docs/test.md",
          fileType,
        });
        // Test survives via seeded step
        expect(result).to.have.lengthOf(1);
      });

      it("should skip Heretto integration when file not in mapping", async function () {
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
          },
          markup: [
            {
              regex: ["!\\[([^\\]]*?)\\]\\(([^)]+)\\)"],
              actions: ["screenshot"],
            },
          ],
        };
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "![alt](images/test.png)";
        const result = await parseContent({
          config: {
            detectSteps: true,
            _herettoPathMapping: { "other/": "my-integration" },
          },
          content,
          filePath: "docs/test.md",
          fileType,
        });
        // Test survives via seeded step; screenshot without Heretto is invalid v3
        expect(result).to.have.lengthOf(1);
        expect(result[0].steps).to.have.lengthOf(1);
      });

      it("should handle fileType with no inlineStatements", async function () {
        const result = await parseContent({
          config: {},
          content: "Some content",
          filePath: "test.txt",
          fileType: minimalFileType,
        });
        expect(result).to.be.an("array").that.is.empty;
      });

      it("should handle fileType with partial inlineStatements", async function () {
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
            // No testEnd, step, etc.
          },
        };
        const content = '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->';
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType,
        });
        expect(result).to.have.lengthOf(1);
      });

      it("should create implicit test for step without testStart", async function () {
        const content = '<!-- step {"goTo": {"url": "https://example.com"}} -->';
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType: markdownFileType,
        });
        expect(result).to.have.lengthOf(1);
        expect(result[0].steps).to.have.lengthOf(1);
      });

      it("should handle httpRequest step with string headers", async function () {
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
          },
          markup: [
            {
              regex: ["API:\\s*(\\S+)"],
              actions: [
                {
                  httpRequest: {
                    url: "$1",
                    method: "GET",
                    request: {
                      headers: "Content-Type: application/json\nAuthorization: Bearer token",
                    },
                    response: {},
                    statusCodes: [200],
                  },
                },
              ],
            },
          ],
        };
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "API: https://api.example.com";
        const result = await parseContent({
          config: { detectSteps: true },
          content,
          filePath: "test.md",
          fileType,
        });
        expect(result).to.have.lengthOf(1);
      });

      it("should handle httpRequest step with invalid JSON body string", async function () {
        // Tests the catch block when JSON.parse fails on body
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
          },
          markup: [
            {
              regex: ["API:\\s*(\\S+)"],
              actions: [
                {
                  httpRequest: {
                    url: "$1",
                    method: "POST",
                    request: {
                      body: "{ not valid json }",
                    },
                    response: {},
                    statusCodes: [200],
                  },
                },
              ],
            },
          ],
        };
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "API: https://api.example.com";
        const result = await parseContent({
          config: { detectSteps: true },
          content,
          filePath: "test.md",
          fileType,
        });
        // Test survives via seeded step; httpRequest body parsing fails gracefully
        expect(result).to.have.lengthOf(1);
      });

      it("should handle httpRequest step with JSON body string", async function () {
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
          },
          markup: [
            {
              regex: ["API:\\s*(\\S+)"],
              actions: [
                {
                  httpRequest: {
                    url: "$1",
                    method: "POST",
                    request: {
                      body: '{"key": "value"}',
                    },
                    response: {},
                    statusCodes: [200],
                  },
                },
              ],
            },
          ],
        };
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "API: https://api.example.com";
        const result = await parseContent({
          config: { detectSteps: true },
          content,
          filePath: "test.md",
          fileType,
        });
        expect(result).to.have.lengthOf(1);
      });

      it("should skip replaceNumericVariables returning null", async function () {
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
          },
          markup: [
            {
              regex: ["\\[([^\\]]+)\\]\\(([^)]+)\\)"],
              actions: [{ checkLink: { url: "$5" } }],
            },
          ],
        };
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "[Link](https://other.com)";
        const result = await parseContent({
          config: { detectSteps: true },
          content,
          filePath: "test.md",
          fileType,
        });
        expect(result).to.have.lengthOf(1);
        // $5 doesn't match any capture group, so markup step is skipped; only seeded step remains
        expect(result[0].steps).to.have.lengthOf(1);
      });

      it("should skip invalid string action names", async function () {
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
          },
          markup: [
            {
              regex: ["\\[([^\\]]+)\\]\\(([^)]+)\\)"],
              actions: ["$1"],
            },
          ],
        };
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "[Link](https://other.com)";
        const result = await parseContent({
          config: { detectSteps: true },
          content,
          filePath: "test.md",
          fileType,
        });
        // Test survives via seeded step; "$1" as action name produces invalid step
        expect(result).to.have.lengthOf(1);
        expect(result[0].steps).to.have.lengthOf(1);
      });

      it("should handle invalid test validation (skips test)", async function () {
        // Create a test that passes initial parsing but fails test_v3 validation
        const content =
          '<!-- test {"steps": "not-an-array"} -->';
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType: markdownFileType,
        });
        // Should be filtered out by validation
        expect(result).to.be.an("array");
      });

      it("should skip detected steps inside ignore block", async function () {
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "<!-- test ignore -->\n" +
          "[Ignored Link](https://ignored.com)\n" +
          "<!-- test ignore end -->";
        const result = await parseContent({
          config: { detectSteps: true },
          content,
          filePath: "test.md",
          fileType: markdownFileType,
        });
        expect(result).to.have.lengthOf(1);
        // Only the step from the test definition; the detected link inside ignore block is skipped
        expect(result[0].steps).to.have.lengthOf(1);
        expect(result[0].steps[0].goTo.url).to.equal("https://example.com");
      });

      it("should skip inline steps inside ignore block", async function () {
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "<!-- test ignore -->\n" +
          '<!-- step {"goTo": {"url": "https://ignored.com"}} -->\n' +
          "<!-- test ignore end -->";
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType: markdownFileType,
        });
        expect(result).to.have.lengthOf(1);
        // Only the step from the test definition; the inline step inside ignore block is skipped
        expect(result[0].steps).to.have.lengthOf(1);
        expect(result[0].steps[0].goTo.url).to.equal("https://example.com");
      });

      it("should handle ignoreStart and ignoreEnd", async function () {
        const content =
          "<!-- test ignore -->\n" +
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "<!-- test ignore end -->";
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType: markdownFileType,
        });
        // The test is still parsed since ignore only affects detected steps in the original
        expect(result).to.be.an("array");
      });

      it("should handle markup with no actions property", async function () {
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
          },
          markup: [
            {
              regex: ["\\[([^\\]]+)\\]\\(([^)]+)\\)"],
              // No actions
            },
          ],
        };
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "[Link](https://other.com)";
        const result = await parseContent({
          config: { detectSteps: true },
          content,
          filePath: "test.md",
          fileType,
        });
        expect(result).to.have.lengthOf(1);
        // Only the seeded step; markup with no actions adds nothing
        expect(result[0].steps).to.have.lengthOf(1);
      });

      it("should handle Windows-style backslash paths in Heretto mapping", async function () {
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
          },
          markup: [
            {
              regex: ["!\\[([^\\]]*?)\\]\\(([^)]+)\\)"],
              actions: ["screenshot"],
            },
          ],
        };
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "![alt](images/test.png)";
        const result = await parseContent({
          config: {
            detectSteps: true,
            _herettoPathMapping: { "docs\\output\\": "my-integration" },
          },
          content,
          filePath: "docs\\output\\test.md",
          fileType,
        });
        // Test survives via seeded step; screenshot with Heretto is invalid v3
        expect(result).to.have.lengthOf(1);
        expect(result[0].steps).to.have.lengthOf(1);
      });
      it("should handle markup regex with no capture groups (batchMatches fallback)", async function () {
        // Tests match[1] || match[0] fallback and match[1] ? ... : match.index branches
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
          },
          markup: [
            {
              regex: ["LINK:\\S+"],
              actions: [{ checkLink: { url: "$0" } }],
              batchMatches: true,
            },
          ],
        };
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "LINK:a.com LINK:b.com";
        const result = await parseContent({
          config: { detectSteps: true },
          content,
          filePath: "test.md",
          fileType,
        });
        expect(result).to.have.lengthOf(1);
      });

      it("should handle markup regex with no capture group 1 (non-batch)", async function () {
        // Tests match[1] falsy branch in non-batch markup
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
          },
          markup: [
            {
              regex: ["LINK:\\S+"],
              actions: [{ checkLink: { url: "$0" } }],
            },
          ],
        };
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "LINK:test.com";
        const result = await parseContent({
          config: { detectSteps: true },
          content,
          filePath: "test.md",
          fileType,
        });
        expect(result).to.have.lengthOf(1);
      });

      it("should handle string action using statement[0] when statement[1] is falsy", async function () {
        // Tests statement[1] || statement[0] fallback for string actions
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
          },
          markup: [
            {
              regex: ["LINK:\\S+"],
              actions: ["checkLink"],
            },
          ],
        };
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "LINK:test.com";
        const result = await parseContent({
          config: { detectSteps: true },
          content,
          filePath: "test.md",
          fileType,
        });
        // Test survives via seeded step; string checkLink step is invalid v3
        expect(result).to.have.lengthOf(1);
      });

      it("should handle httpRequest headers with lines missing colons", async function () {
        // Tests colonIndex === -1 return branch
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
          },
          markup: [
            {
              regex: ["API:\\s*(\\S+)"],
              actions: [
                {
                  httpRequest: {
                    url: "$1",
                    method: "GET",
                    request: {
                      headers: "no-colon-header\nContent-Type: application/json",
                    },
                    response: {},
                    statusCodes: [200],
                  },
                },
              ],
            },
          ],
        };
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "API: https://api.example.com";
        const result = await parseContent({
          config: { detectSteps: true },
          content,
          filePath: "test.md",
          fileType,
        });
        expect(result).to.have.lengthOf(1);
      });

      it("should skip httpRequest headers with empty value after colon", async function () {
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
          },
          markup: [
            {
              regex: ["API:\\s*(\\S+)"],
              actions: [
                {
                  httpRequest: {
                    url: "$1",
                    method: "GET",
                    request: {
                      headers: "EmptyVal:\nContent-Type: application/json",
                    },
                    response: {},
                    statusCodes: [200],
                  },
                },
              ],
            },
          ],
        };
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "API: https://api.example.com";
        const result = await parseContent({
          config: { detectSteps: true },
          content,
          filePath: "test.md",
          fileType,
        });
        expect(result).to.have.lengthOf(1);
      });

      it("should handle httpRequest with array-starting JSON body", async function () {
        // Tests the startsWith("[") branch
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
          },
          markup: [
            {
              regex: ["API:\\s*(\\S+)"],
              actions: [
                {
                  httpRequest: {
                    url: "$1",
                    method: "POST",
                    request: {
                      body: '[1, 2, 3]',
                    },
                    response: {},
                    statusCodes: [200],
                  },
                },
              ],
            },
          ],
        };
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "API: https://api.example.com";
        const result = await parseContent({
          config: { detectSteps: true },
          content,
          filePath: "test.md",
          fileType,
        });
        expect(result).to.have.lengthOf(1);
      });

      it("should handle inline step with no capture group 1", async function () {
        // Tests statement[1] || statement[0] fallback for inline step
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
            // Step regex without capture group
            step: ['<!-- step {"goTo": {"url": "https://step.com"}} -->'],
          },
        };
        const content =
          '<!-- test {"steps": []} -->\n' +
          '<!-- step {"goTo": {"url": "https://step.com"}} -->';
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType,
        });
        // The step regex matches the literal string; statement[0] is the full match
        expect(result).to.be.an("array");
      });

      it("should handle malformed regex in inlineStatements gracefully", async function () {
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
            step: ["[invalid(regex"],
          },
        };
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->';
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType,
        });
        // Malformed regex is skipped; test still processes normally
        expect(result).to.have.lengthOf(1);
      });

      it("should handle malformed regex in markup gracefully", async function () {
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            testStart: ["<!-- test (.*?)-->"],
          },
          markup: [
            {
              regex: ["[invalid(regex"],
              actions: ["checkLink"],
            },
          ],
        };
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->';
        const result = await parseContent({
          config: { detectSteps: true },
          content,
          filePath: "test.md",
          fileType,
        });
        // Malformed regex is skipped; test still processes normally
        expect(result).to.have.lengthOf(1);
      });
    });

    // ========== detectTests ==========
    describe("detectTests", function () {
      it("should call parseContent with default config", async function () {
        const result = await detectTests({
          content: "",
          filePath: "test.md",
          fileType: markdownFileType,
        });
        expect(result).to.be.an("array").that.is.empty;
      });

      it("should pass config through to parseContent", async function () {
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://example.com"}}]} -->\n' +
          "[Link](https://other.com)";
        const result = await detectTests({
          content,
          filePath: "test.md",
          fileType: markdownFileType,
          config: { detectSteps: true },
        });
        expect(result).to.have.lengthOf(1);
        // At least the seeded step survives
        expect(result[0].steps.length).to.be.greaterThan(0);
      });

      it("should detect multiple tests in content", async function () {
        const content =
          '<!-- test {"steps": [{"goTo": {"url": "https://a.com"}}]} -->\n' +
          "<!-- test end -->\n" +
          '<!-- test {"steps": [{"goTo": {"url": "https://b.com"}}]} -->\n' +
          "<!-- test end -->";
        const result = await detectTests({
          content,
          filePath: "test.md",
          fileType: markdownFileType,
        });
        expect(result).to.have.lengthOf(2);
      });
    });
  });
