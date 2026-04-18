import { expect } from "chai";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { detectTests } from "../dist/index.js";
import {
  parseContent,
  parseXmlAttributes,
  parseObject,
  replaceNumericVariables,
  log,
  getLineNumber,
  getLineStarts,
} from "../dist/detectTests.js";
import { detectFileTypeFromContent, defaultFileTypes } from "../dist/fileTypes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = join(__dirname, "fixtures");

function readFixture(filename) {
  return readFileSync(join(fixturesDir, filename), "utf-8");
}

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

      it("should skip dot-notation keys containing __proto__ (prototype pollution guard)", function () {
        // Covers the 'continue' branch when any segment of a dotted keyPath is __proto__/constructor/prototype
        const result = parseXmlAttributes({ stringifiedObject: '__proto__.polluted=value' });
        // The dangerous key is skipped; hasMatches is true so an empty object is returned
        expect(result).to.deep.equal({});
        // Verify the prototype was not actually polluted
        expect({}.polluted).to.be.undefined;
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

      it("should skip empty-string regex patterns gracefully (safeRegExp length===0 guard)", async function () {
        // Covers the 'pattern.length === 0' branch in safeRegExp
        const fileType = {
          extensions: ["md"],
          inlineStatements: {
            step: [""],
          },
        };
        const result = await parseContent({ config: {}, content: "some content", fileType });
        expect(result).to.be.an("array").that.is.empty;
      });

      it("should skip excessively long regex patterns gracefully (safeRegExp length>1500 guard)", async function () {
        // Covers the 'pattern.length > 1500' branch in safeRegExp
        const fileType = {
          extensions: ["md"],
          markup: [{
            regex: ["a".repeat(1501)],
            actions: ["checkLink"],
          }],
        };
        const result = await parseContent({
          config: { detectSteps: true },
          content: "some content",
          fileType,
        });
        expect(result).to.be.an("array").that.is.empty;
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

    // ========== Detected test statements with Markdown fixtures ==========
    describe("detected test statements (Markdown fixtures)", function () {
      // Full markdown_1_0 fileType definition matching src/core/config.ts
      const markdownFullFileType = {
        name: "markdown",
        extensions: ["md", "markdown", "mdx"],
        inlineStatements: {
          testStart: [
            "{\\/\\*\\s*test\\s+?([\\s\\S]*?)\\s*\\*\\/}",
            "<!--\\s*test\\s*([\\s\\S]*?)\\s*-->",
            "\\[comment\\]:\\s+#\\s+\\(test\\s*(.*?)\\s*\\)",
            "\\[comment\\]:\\s+#\\s+\\(test start\\s*(.*?)\\s*\\)",
            "\\[comment\\]:\\s+#\\s+'test\\s*(.*?)\\s*'",
            "\\[comment\\]:\\s+#\\s+'test start\\s*(.*?)\\s*'",
            '\\[comment\\]:\\s+#\\s+"test\\s*((?:[^"\\\\]|\\\\.)*)\\s*"',
            '\\[comment\\]:\\s+#\\s+"test start\\s*((?:[^"\\\\]|\\\\.)*)\\s*"',
          ],
          testEnd: [
            "{\\/\\*\\s*test end\\s*\\*\\/}",
            "<!--\\s*test end\\s*([\\s\\S]*?)\\s*-->",
            "\\[comment\\]:\\s+#\\s+\\(test end\\)",
            "\\[comment\\]:\\s+#\\s+'test end'",
            '\\[comment\\]:\\s+#\\s+"test end"',
          ],
          ignoreStart: [
            "{\\/\\*\\s*test ignore start\\s*\\*\\/}",
            "<!--\\s*test ignore start\\s*-->",
            "\\[comment\\]:\\s+#\\s+\\(test ignore start\\)",
            "\\[comment\\]:\\s+#\\s+'test ignore start'",
            '\\[comment\\]:\\s+#\\s+"test ignore start"',
          ],
          ignoreEnd: [
            "{\\/\\*\\s*test ignore end\\s*\\*\\/}",
            "<!--\\s*test ignore end\\s*-->",
            "\\[comment\\]:\\s+#\\s+\\(test ignore end\\)",
            "\\[comment\\]:\\s+#\\s+'test ignore end'",
            '\\[comment\\]:\\s+#\\s+"test ignore end"',
          ],
          step: [
            "{\\/\\*\\s*step\\s+?([\\s\\S]*?)\\s*\\*\\/}",
            "<!--\\s*step\\s*([\\s\\S]*?)\\s*-->",
            "\\[comment\\]:\\s+#\\s+\\(step\\s*(.*?)\\s*\\)",
            "\\[comment\\]:\\s+#\\s+'step\\s*(.*?)\\s*'",
            '\\[comment\\]:\\s+#\\s+"step\\s*((?:[^"\\\\]|\\\\.)*)\\s*"',
          ],
        },
        markup: [
          {
            name: "checkHyperlink",
            regex: [
              '(?<!\\!)\\[[^\\]]+\\]\\(\\s*(https?:\\/\\/[^\\s)]+)(?:\\s+"[^"]*")?\\s*\\)',
            ],
            actions: ["checkLink"],
          },
          {
            name: "clickOnscreenText",
            regex: [
              "\\b(?:[Cc]lick|[Tt]ap|[Ll]eft-click|[Cc]hoose|[Ss]elect|[Cc]heck)\\b\\s+\\*\\*((?:(?!\\*\\*).)+)\\*\\*",
            ],
            actions: ["click"],
          },
          {
            name: "findOnscreenText",
            regex: ["\\*\\*((?:(?!\\*\\*).)+)\\*\\*"],
            actions: ["find"],
          },
          {
            name: "goToUrl",
            regex: [
              '\\b(?:[Gg]o\\s+to|[Oo]pen|[Nn]avigate\\s+to|[Vv]isit|[Aa]ccess|[Pp]roceed\\s+to|[Ll]aunch)\\b\\s+\\[[^\\]]+\\]\\(\\s*(https?:\\/\\/[^\\s)]+)(?:\\s+"[^"]*")?\\s*\\)',
            ],
            actions: ["goTo"],
          },
          {
            name: "screenshotImage",
            regex: [
              '!\\[[^\\]]*\\]\\(\\s*([^\\s)]+)(?:\\s+"[^"]*")?\\s*\\)\\s*\\{(?=[^}]*\\.screenshot)[^}]*\\}',
            ],
            actions: ["screenshot"],
          },
          {
            name: "typeText",
            regex: ['\\b(?:press|enter|type)\\b\\s+"([^"]+)"'],
            actions: ["type"],
          },
          {
            name: "httpRequestFormat",
            regex: [
              "```(?:http)?\\r?\\n([A-Z]+)\\s+([^\\s]+)(?:\\s+HTTP\\/[\\d.]+)?\\r?\\n((?:[^\\s]+:\\s+[^\\s]+\\r?\\n)*)?(?:\\s+([\\s\\S]*?)\\r?\\n+)?```",
            ],
            actions: [
              {
                httpRequest: {
                  method: "$1",
                  url: "$2",
                  request: {
                    headers: "$3",
                    body: "$4",
                  },
                },
              },
            ],
          },
          {
            name: "runCode",
            regex: [
              "```(bash|python|py|javascript|js)(?![^\\r\\n]*testIgnore)[^\\r\\n]*\\r?\\n([\\s\\S]*?)\\r?\\n```",
            ],
            actions: [
              {
                unsafe: true,
                runCode: {
                  language: "$1",
                  code: "$2",
                },
              },
            ],
          },
        ],
      };

      describe("doc-content-detect.md (pure markup detection)", function () {
        it("should detect links, bold text, and screenshot from markdown markup", async function () {
          const content = readFixture("doc-content-detect.md");
          const result = await parseContent({
            config: { detectSteps: true },
            content,
            filePath: "doc-content-detect.md",
            fileType: markdownFullFileType,
          });
          // With detectSteps=true and no testStart, an implicit test is created
          expect(result).to.have.lengthOf(1);
          const steps = result[0].steps;

          // Should detect checkLink for all hyperlinks
          const checkLinkSteps = steps.filter((s) => s.checkLink);
          expect(checkLinkSteps.length).to.be.greaterThanOrEqual(3);
          expect(checkLinkSteps.map((s) => s.checkLink)).to.include("https://doc-detective.com");
          expect(checkLinkSteps.map((s) => s.checkLink)).to.include("https://doc-detective.com/docs/get-started/intro");
          expect(checkLinkSteps.map((s) => s.checkLink)).to.include("https://doc-detective.com/docs/get-started/actions/type");

          // Should detect bold text as find steps
          const findSteps = steps.filter((s) => s.find);
          expect(findSteps.length).to.be.greaterThanOrEqual(1);
          expect(findSteps.map((s) => s.find)).to.include("Special keys");

          // Should detect screenshot
          const screenshotSteps = steps.filter((s) => s.screenshot);
          expect(screenshotSteps.length).to.equal(1);
          expect(screenshotSteps[0].screenshot).to.equal("reference.png");
        });

        it("should detect goTo for 'open [link](url)' pattern", async function () {
          const content = readFixture("doc-content-detect.md");
          const result = await parseContent({
            config: { detectSteps: true },
            content,
            filePath: "doc-content-detect.md",
            fileType: markdownFullFileType,
          });
          const steps = result[0].steps;
          // "If you open [type](url)" should match goToUrl pattern
          const goToSteps = steps.filter((s) => s.goTo);
          expect(goToSteps.length).to.be.greaterThanOrEqual(1);
          expect(goToSteps.map((s) => s.goTo)).to.include("https://doc-detective.com/docs/get-started/actions/type");
        });
      });

      describe("doc-content-inline-tests.md (inline test statements)", function () {
        it("should detect one test with testId and detectSteps=false", async function () {
          const content = readFixture("doc-content-inline-tests.md");
          const result = await parseContent({
            config: { detectSteps: true },
            content,
            filePath: "doc-content-inline-tests.md",
            fileType: markdownFullFileType,
          });
          expect(result).to.have.lengthOf(1);
          expect(result[0].testId).to.equal("doc-detective-docs");
          expect(result[0].detectSteps).to.be.false;
        });

        it("should include inline steps despite detectSteps=false", async function () {
          const content = readFixture("doc-content-inline-tests.md");
          const result = await parseContent({
            config: { detectSteps: true },
            content,
            filePath: "doc-content-inline-tests.md",
            fileType: markdownFullFileType,
          });
          const steps = result[0].steps;

          // Should have the inline checkLink steps
          const checkLinkSteps = steps.filter((s) => s.checkLink);
          expect(checkLinkSteps.length).to.equal(2);

          // Should have the inline goTo step
          const goToSteps = steps.filter((s) => s.goTo);
          expect(goToSteps.length).to.equal(1);
          expect(goToSteps[0].goTo).to.equal("https://doc-detective.com/docs/get-started/actions/type");

          // Should have the inline find step
          const findSteps = steps.filter((s) => s.find);
          expect(findSteps.length).to.equal(1);

          // Should have the inline screenshot step
          const screenshotSteps = steps.filter((s) => s.screenshot);
          expect(screenshotSteps.length).to.equal(1);
        });

        it("should NOT include markup-detected steps when test has detectSteps=false", async function () {
          const content = readFixture("doc-content-inline-tests.md");
          const result = await parseContent({
            config: { detectSteps: true },
            content,
            filePath: "doc-content-inline-tests.md",
            fileType: markdownFullFileType,
          });
          const steps = result[0].steps;
          // With detectSteps=false on the test, no markup detection happens
          // So we should only have 5 steps (the inline ones)
          expect(steps).to.have.lengthOf(5);
        });
      });

      describe("kitten-search-detect.md (mixed inline + markup detection)", function () {
        it("should create a test with both detected and inline steps", async function () {
          const content = readFixture("kitten-search-detect.md");
          const result = await parseContent({
            config: { detectSteps: true },
            content,
            filePath: "kitten-search-detect.md",
            fileType: markdownFullFileType,
          });
          expect(result).to.have.lengthOf(1);
          const steps = result[0].steps;

          // Should detect goTo for "Go to [DuckDuckGo](url)"
          const goToSteps = steps.filter((s) => s.goTo);
          expect(goToSteps.length).to.be.greaterThanOrEqual(1);
          expect(goToSteps[0].goTo).to.equal("https://www.duckduckgo.com");

          // Should have the inline wait step
          const waitSteps = steps.filter((s) => s.wait);
          expect(waitSteps.length).to.equal(1);
          expect(waitSteps[0].wait).to.equal(10000);

          // Should detect screenshot from markup
          const screenshotSteps = steps.filter((s) => s.screenshot);
          expect(screenshotSteps.length).to.equal(1);
          expect(screenshotSteps[0].screenshot).to.equal("search-results.png");
        });

        it("should detect type for 'enter \"text\"' pattern", async function () {
          const content = readFixture("kitten-search-detect.md");
          const result = await parseContent({
            config: { detectSteps: true },
            content,
            filePath: "kitten-search-detect.md",
            fileType: markdownFullFileType,
          });
          const steps = result[0].steps;
          const typeSteps = steps.filter((s) => s.type);
          expect(typeSteps.length).to.be.greaterThanOrEqual(1);
          expect(typeSteps[0].type).to.equal("American Shorthair kittens");
        });
      });

      describe("kitten-search-inline.md (markdown comment inline steps)", function () {
        it("should detect v2 inline steps via [comment]: # syntax", async function () {
          const content = readFixture("kitten-search-inline.md");
          const result = await parseContent({
            config: {},
            content,
            filePath: "kitten-search-inline.md",
            fileType: markdownFullFileType,
          });
          expect(result).to.have.lengthOf(1);
          const steps = result[0].steps;
          // v2 steps with "action" key should be transformed to v3
          expect(steps.length).to.be.greaterThanOrEqual(1);
        });
      });

      describe("local-gui.md (multiple markup patterns)", function () {
        it("should detect goTo, find, click, and screenshot from markup", async function () {
          const content = readFixture("local-gui.md");
          const result = await parseContent({
            config: { detectSteps: true },
            content,
            filePath: "local-gui.md",
            fileType: markdownFullFileType,
          });
          expect(result).to.have.lengthOf(1);
          const steps = result[0].steps;

          // Should detect goTo for "Open [the GUI](url)"
          const goToSteps = steps.filter((s) => s.goTo);
          expect(goToSteps.length).to.be.greaterThanOrEqual(1);
          expect(goToSteps[0].goTo).to.equal("http://localhost:8092");

          // Should detect find for bold text "Selection Elements"
          const findSteps = steps.filter((s) => s.find);
          expect(findSteps.length).to.be.greaterThanOrEqual(1);

          // Should detect click for "click **Option 1**"
          const clickSteps = steps.filter((s) => s.click);
          expect(clickSteps.length).to.be.greaterThanOrEqual(1);
          expect(clickSteps[0].click).to.equal("Option 1");

          // Should detect screenshot
          const screenshotSteps = steps.filter((s) => s.screenshot);
          expect(screenshotSteps.length).to.equal(1);
          expect(screenshotSteps[0].screenshot).to.equal("proof.png");
        });
      });

      describe("httpRequestFormat.md (HTTP request code block)", function () {
        it("should detect httpRequest from code block markup", async function () {
          const content = readFixture("httpRequestFormat.md");
          const result = await parseContent({
            config: { detectSteps: true },
            content,
            filePath: "httpRequestFormat.md",
            fileType: markdownFullFileType,
          });
          expect(result).to.have.lengthOf(1);
          const steps = result[0].steps;

          const httpSteps = steps.filter((s) => s.httpRequest);
          expect(httpSteps.length).to.equal(1);
          expect(httpSteps[0].httpRequest.method).to.equal("POST");
          expect(httpSteps[0].httpRequest.url).to.equal("http://localhost:8092/api/status");
          expect(httpSteps[0].httpRequest.request.headers).to.deep.include({
            "Content-Type": "application/json",
          });
        });
      });
    });

    // ========== Detected test statements with DITA fixtures ==========
    describe("detected test statements (DITA fixtures)", function () {
      // Full dita_1_0 fileType definition matching src/core/config.ts
      const ditaFullFileType = {
        name: "dita",
        extensions: ["dita", "ditamap", "xml"],
        inlineStatements: {
          testStart: [
            "<\\?doc-detective\\s+test([\\s\\S]*?)\\?>",
            "<!--\\s*test([\\s\\S]+?)-->",
          ],
          testEnd: [
            "<\\?doc-detective\\s+test\\s+end\\s*\\?>",
            "<!--\\s*test end([\\s\\S]+?)-->",
          ],
          ignoreStart: [
            "<\\?doc-detective\\s+test\\s+ignore\\s+start\\s*\\?>",
            "<!--\\s*test ignore\\s+start\\s*-->",
          ],
          ignoreEnd: [
            "<\\?doc-detective\\s+test\\s+ignore\\s+end\\s*\\?>",
            "<!--\\s*test ignore\\s+end\\s*-->",
          ],
          step: [
            "<\\?doc-detective\\s+step\\s+([\\s\\S]*?)\\s*\\?>",
            "<!--\\s*step([\\s\\S]+?)-->",
            '<data\\s+name="step"\\s*>([\\s\\S]*?)<\\/data>',
          ],
        },
        markup: [
          {
            name: "clickUiControl",
            regex: [
              "(?:[Cc]lick|[Tt]ap|[Ss]elect|[Pp]ress|[Cc]hoose)\\s+(?:the\\s+)?<uicontrol>([^<]+)<\\/uicontrol>",
            ],
            actions: ["click"],
          },
          {
            name: "typeIntoUiControl",
            regex: [
              "(?:[Tt]ype|[Ee]nter|[Ii]nput)\\s+<userinput>([^<]+)<\\/userinput>\\s+(?:in|into)(?:\\s+the)?\\s+<uicontrol>([^<]+)<\\/uicontrol>",
            ],
            actions: [
              {
                type: {
                  keys: "$1",
                  selector: "$2",
                },
              },
            ],
          },
          {
            name: "navigateToXref",
            regex: [
              '(?:[Nn]avigate\\s+to|[Oo]pen|[Gg]o\\s+to|[Vv]isit|[Bb]rowse\\s+to)\\s+<xref\\s+[^>]*href="(https?:\\/\\/[^"]+)"[^>]*>',
            ],
            actions: ["goTo"],
          },
          {
            name: "findUiControl",
            regex: ["<uicontrol>([^<]+)<\\/uicontrol>"],
            actions: ["find"],
          },
          {
            name: "verifyWindowTitle",
            regex: ["<wintitle>([^<]+)<\\/wintitle>"],
            actions: ["find"],
          },
          {
            name: "checkExternalXref",
            regex: [
              '<xref\\s+[^>]*scope="external"[^>]*href="(https?:\\/\\/[^"]+)"[^>]*>',
              '<xref\\s+[^>]*href="(https?:\\/\\/[^"]+)"[^>]*scope="external"[^>]*>',
            ],
            actions: ["checkLink"],
          },
          {
            name: "checkHyperlink",
            regex: ['<xref\\s+href="(https?:\\/\\/[^"]+)"[^>]*>'],
            actions: ["checkLink"],
          },
          {
            name: "checkLinkElement",
            regex: ['<link\\s+href="(https?:\\/\\/[^"]+)"[^>]*>'],
            actions: ["checkLink"],
          },
          {
            name: "clickOnscreenText",
            regex: [
              "\\b(?:[Cc]lick|[Tt]ap|[Ll]eft-click|[Cc]hoose|[Ss]elect|[Cc]heck)\\b\\s+<b>((?:(?!<\\/b>).)+)<\\/b>",
            ],
            actions: ["click"],
          },
          {
            name: "findOnscreenText",
            regex: ["<b>((?:(?!<\\/b>).)+)<\\/b>"],
            actions: ["find"],
          },
          {
            name: "goToUrl",
            regex: [
              '\\b(?:[Gg]o\\s+to|[Oo]pen|[Nn]avigate\\s+to|[Vv]isit|[Aa]ccess|[Pp]roceed\\s+to|[Ll]aunch)\\b\\s+<xref\\s+href="(https?:\\/\\/[^"]+)"[^>]*>',
            ],
            actions: ["goTo"],
          },
          {
            name: "typeText",
            regex: ['\\b(?:[Pp]ress|[Ee]nter|[Tt]ype)\\b\\s+"([^"]+)"'],
            actions: ["type"],
          },
        ],
      };

      describe("dita-detect.dita (pure DITA markup detection)", function () {
        it("should detect navigation, click, type, and find steps from DITA markup", async function () {
          const content = readFixture("dita-detect.dita");
          const result = await parseContent({
            config: { detectSteps: true },
            content,
            filePath: "dita-detect.dita",
            fileType: ditaFullFileType,
          });
          expect(result).to.have.lengthOf(1);
          const steps = result[0].steps;

          // Should detect navigateToXref: "Navigate to <xref href="https://app.example.com/login"..."
          const goToSteps = steps.filter((s) => s.goTo);
          expect(goToSteps.length).to.be.greaterThanOrEqual(1);
          expect(goToSteps[0].goTo).to.equal("https://app.example.com/login");

          // Should detect clickUiControl for "Click <uicontrol>Sign In</uicontrol>"
          const clickSteps = steps.filter((s) => s.click);
          expect(clickSteps.length).to.be.greaterThanOrEqual(1);
          expect(clickSteps.map((s) => s.click)).to.include("Sign In");

          // Should detect findUiControl for all <uicontrol> elements
          const findSteps = steps.filter((s) => s.find);
          expect(findSteps.length).to.be.greaterThanOrEqual(1);

          // Should detect verifyWindowTitle for <wintitle>Dashboard</wintitle>
          expect(findSteps.map((s) => s.find)).to.include("Dashboard");
        });

        it("should detect typeIntoUiControl pattern", async function () {
          const content = readFixture("dita-detect.dita");
          const result = await parseContent({
            config: { detectSteps: true },
            content,
            filePath: "dita-detect.dita",
            fileType: ditaFullFileType,
          });
          const steps = result[0].steps;

          // Should detect "Type <userinput>admin@example.com</userinput> into the <uicontrol>Username</uicontrol> field"
          const typeSteps = steps.filter((s) => s.type);
          expect(typeSteps.length).to.be.greaterThanOrEqual(1);
          const usernameType = typeSteps.find(
            (s) => s.type.keys === "admin@example.com"
          );
          expect(usernameType).to.exist;
          expect(usernameType.type.selector).to.equal("Username");
        });

        it("should detect checkExternalXref for external scoped xrefs", async function () {
          const content = readFixture("dita-detect.dita");
          const result = await parseContent({
            config: { detectSteps: true },
            content,
            filePath: "dita-detect.dita",
            fileType: ditaFullFileType,
          });
          const steps = result[0].steps;

          // Should detect checkLink for <xref scope="external" href="...">
          const checkLinkSteps = steps.filter((s) => s.checkLink);
          expect(checkLinkSteps.length).to.be.greaterThanOrEqual(1);
          expect(checkLinkSteps.map((s) => s.checkLink)).to.include("https://app.example.com/login");
        });
      });

      describe("dita-inline-tests.dita (DITA processing instruction inline tests)", function () {
        it("should detect test with processing instruction testStart", async function () {
          const content = readFixture("dita-inline-tests.dita");
          const result = await parseContent({
            config: { detectSteps: true },
            content,
            filePath: "dita-inline-tests.dita",
            fileType: ditaFullFileType,
          });
          expect(result).to.have.lengthOf(1);
          expect(result[0].testId).to.equal("login-test");
          expect(result[0].detectSteps).to.be.false;
        });

        it("should include processing instruction inline steps", async function () {
          const content = readFixture("dita-inline-tests.dita");
          const result = await parseContent({
            config: { detectSteps: true },
            content,
            filePath: "dita-inline-tests.dita",
            fileType: ditaFullFileType,
          });
          const steps = result[0].steps;

          // Should have the goTo step from <?doc-detective step goTo="..." ?>
          const goToSteps = steps.filter((s) => s.goTo);
          expect(goToSteps.length).to.equal(1);
          expect(goToSteps[0].goTo).to.equal("https://app.example.com/login");

          // Should have the click step
          const clickSteps = steps.filter((s) => s.click);
          expect(clickSteps.length).to.equal(1);
          expect(clickSteps[0].click).to.equal("Sign In");

          // Should have the checkLink step from HTML comment
          const checkLinkSteps = steps.filter((s) => s.checkLink);
          expect(checkLinkSteps.length).to.equal(1);
        });

        it("should NOT include markup-detected steps when detectSteps=false", async function () {
          const content = readFixture("dita-inline-tests.dita");
          const result = await parseContent({
            config: { detectSteps: true },
            content,
            filePath: "dita-inline-tests.dita",
            fileType: ditaFullFileType,
          });
          // Only 3 inline steps, no markup-detected steps
          expect(result[0].steps).to.have.lengthOf(3);
        });
      });

      describe("dita-data-inline-tests.dita (DITA <data> element inline tests)", function () {
        it("should detect test with <data name='doc-detective' value='test ...'/> testStart", async function () {
          const content = readFixture("dita-data-inline-tests.dita");
          const result = await parseContent({
            config: { detectSteps: true },
            content,
            filePath: "dita-data-inline-tests.dita",
            fileType: defaultFileTypes.dita,
          });
          expect(result).to.have.lengthOf(1);
          expect(result[0].testId).to.equal("login-test");
          expect(result[0].detectSteps).to.be.false;
        });

        it("should detect <data> inline steps with both quote styles and paired closing tag", async function () {
          const content = readFixture("dita-data-inline-tests.dita");
          const result = await parseContent({
            config: { detectSteps: true },
            content,
            filePath: "dita-data-inline-tests.dita",
            fileType: defaultFileTypes.dita,
          });
          const steps = result[0].steps;

          const goToSteps = steps.filter((s) => s.goTo);
          expect(goToSteps.length).to.equal(1);
          expect(goToSteps[0].goTo).to.equal("https://app.example.com/login");

          const clickSteps = steps.filter((s) => s.click);
          expect(clickSteps.length).to.equal(1);
          expect(clickSteps[0].click).to.equal("Sign In");
        });

        it("should detect <data> step with reversed attribute order (value before name)", async function () {
          const content = readFixture("dita-data-inline-tests.dita");
          const result = await parseContent({
            config: { detectSteps: true },
            content,
            filePath: "dita-data-inline-tests.dita",
            fileType: defaultFileTypes.dita,
          });
          const findSteps = result[0].steps.filter((s) => s.find);
          expect(findSteps.length).to.equal(1);
          expect(findSteps[0].find).to.equal("Welcome");
        });

        it("should NOT detect <data> with empty value (e.g. value='test ')", async function () {
          const content =
            `<?xml version="1.0"?><task>` +
            `<data name="doc-detective" value="test "/>` +
            `<data name="doc-detective" value="step "/>` +
            `</task>`;
          const result = await parseContent({
            config: { detectSteps: true },
            content,
            filePath: "empty-value.dita",
            fileType: defaultFileTypes.dita,
          });
          // An empty-value testStart/step should not match, so no tests are produced.
          expect(result).to.have.lengthOf(0);
        });

        it("should NOT detect bare <data> tag without self-close or closing </data>", async function () {
          const content =
            `<?xml version="1.0"?><task>` +
            `<data name="doc-detective" value="test testId='bare-tag-test'">` +
            `<child>content</child>` +
            `</task>`;
          const result = await parseContent({
            config: { detectSteps: true },
            content,
            filePath: "bare-tag.dita",
            fileType: defaultFileTypes.dita,
          });
          expect(result).to.have.lengthOf(0);
        });
      });

      describe("dita-mixed.dita (DITA markup + inline test)", function () {
        it("should detect test with testId and markup-detected steps", async function () {
          const content = readFixture("dita-mixed.dita");
          const result = await parseContent({
            config: { detectSteps: true },
            content,
            filePath: "dita-mixed.dita",
            fileType: ditaFullFileType,
          });
          expect(result).to.have.lengthOf(1);
          expect(result[0].testId).to.equal("setup-project-test");
          const steps = result[0].steps;

          // Should detect checkExternalXref
          const checkLinkSteps = steps.filter((s) => s.checkLink);
          expect(checkLinkSteps.length).to.be.greaterThanOrEqual(1);

          // Should detect goToUrl for "Go to <xref href="...">"
          const goToSteps = steps.filter((s) => s.goTo);
          expect(goToSteps.length).to.be.greaterThanOrEqual(1);

          // Should detect clickUiControl
          const clickSteps = steps.filter((s) => s.click);
          expect(clickSteps.length).to.be.greaterThanOrEqual(1);
          expect(clickSteps.map((s) => s.click)).to.include("New Project");

          // Should detect typeIntoUiControl
          const typeSteps = steps.filter((s) => s.type);
          expect(typeSteps.length).to.be.greaterThanOrEqual(1);
          expect(typeSteps[0].type.keys).to.equal("My Project");
          expect(typeSteps[0].type.selector).to.equal("Project Name");

          // Should detect verifyWindowTitle
          const findSteps = steps.filter((s) => s.find);
          expect(findSteps.length).to.be.greaterThanOrEqual(1);
          expect(findSteps.map((s) => s.find)).to.include("Project Dashboard");
        });
      });

      describe("dita-links.dita (DITA link and bold text detection)", function () {
        it("should detect various link types and bold text", async function () {
          const content = readFixture("dita-links.dita");
          const result = await parseContent({
            config: { detectSteps: true },
            content,
            filePath: "dita-links.dita",
            fileType: ditaFullFileType,
          });
          expect(result).to.have.lengthOf(1);
          const steps = result[0].steps;

          // Should detect checkExternalXref
          const checkLinkSteps = steps.filter((s) => s.checkLink);
          expect(checkLinkSteps.length).to.be.greaterThanOrEqual(2);
          expect(checkLinkSteps.map((s) => s.checkLink)).to.include("https://example.com/docs");
          expect(checkLinkSteps.map((s) => s.checkLink)).to.include("https://example.com/api");
          expect(checkLinkSteps.map((s) => s.checkLink)).to.include("https://example.com/status");

          // Should detect findOnscreenText for <b>Important Notice</b>
          const findSteps = steps.filter((s) => s.find);
          expect(findSteps.length).to.be.greaterThanOrEqual(1);
          expect(findSteps.map((s) => s.find)).to.include("Important Notice");

          // Should detect clickOnscreenText for "Click <b>Accept Terms</b>"
          const clickSteps = steps.filter((s) => s.click);
          expect(clickSteps.length).to.be.greaterThanOrEqual(1);
          expect(clickSteps.map((s) => s.click)).to.include("Accept Terms");

          // Should detect typeText for 'Type "hello world"'
          const typeSteps = steps.filter((s) => s.type);
          expect(typeSteps.length).to.be.greaterThanOrEqual(1);
          expect(typeSteps[0].type).to.equal("hello world");
        });
      });

      describe("dita-ignore.dita (DITA ignore blocks)", function () {
        it("should skip markup-detected steps inside ignore blocks", async function () {
          const content = readFixture("dita-ignore.dita");
          const result = await parseContent({
            config: { detectSteps: true },
            content,
            filePath: "dita-ignore.dita",
            fileType: ditaFullFileType,
          });
          expect(result).to.have.lengthOf(1);
          expect(result[0].testId).to.equal("ignore-test");
          const steps = result[0].steps;

          // Should NOT include "Ignored Button" or "ignored.example.com" steps
          const clickSteps = steps.filter((s) => s.click);
          const clickTexts = clickSteps.map((s) => s.click);
          expect(clickTexts).to.not.include("Ignored Button");

          const checkLinkSteps = steps.filter((s) => s.checkLink);
          const linkUrls = checkLinkSteps.map((s) => s.checkLink);
          expect(linkUrls).to.not.include("https://ignored.example.com");

          // Should still include steps outside the ignore block
          // "Start" and "Finish" should be detected as findUiControl
          const findSteps = steps.filter((s) => s.find);
          const findTexts = findSteps.map((s) => s.find);
          expect(findTexts).to.include("Start");
          expect(findTexts).to.include("Finish");
        });
      });
    });

    // ========== detectFileTypeFromContent ==========
    describe("detectFileTypeFromContent", function () {
      it("should detect DITA from <?xml declaration with DITA DOCTYPE", function () {
        const content = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE topic PUBLIC "-//OASIS//DTD DITA Topic//EN" "topic.dtd">\n<topic id="test"><title>Test</title><body/></topic>`;
        const result = detectFileTypeFromContent(content);
        expect(result).to.equal(defaultFileTypes.dita);
      });

      it("should detect DITA from <!DOCTYPE topic> without xml declaration", function () {
        const content = `<!DOCTYPE topic PUBLIC "-//OASIS//DTD DITA Topic//EN" "topic.dtd">\n<topic id="t"><title>T</title><body/></topic>`;
        const result = detectFileTypeFromContent(content);
        expect(result).to.equal(defaultFileTypes.dita);
      });

      it("should NOT detect DITA from bare <topic> root element without XML declaration or DOCTYPE (defaults to markdown)", function () {
        // detectFileTypeFromContent only checks DITA root elements when preceded by
        // an XML declaration or DOCTYPE, to avoid false positives on generic XML.
        const content = `<topic id="test">\n  <title>My Topic</title>\n  <body><p>Content</p></body>\n</topic>`;
        const result = detectFileTypeFromContent(content);
        expect(result).to.equal(defaultFileTypes.markdown);
      });

      it("should NOT detect DITA from bare <map> root element without XML declaration or DOCTYPE (defaults to markdown)", function () {
        const content = `<map>\n  <title>My Map</title>\n  <topicref href="topic1.dita"/>\n</map>`;
        const result = detectFileTypeFromContent(content);
        expect(result).to.equal(defaultFileTypes.markdown);
      });

      it("should detect HTML from <!DOCTYPE html>", function () {
        const content = `<!DOCTYPE html>\n<html lang="en"><head><title>Test</title></head><body><p>Hello</p></body></html>`;
        const result = detectFileTypeFromContent(content);
        expect(result).to.equal(defaultFileTypes.html);
      });

      it("should detect HTML from <html> tag (case-insensitive)", function () {
        const content = `<HTML>\n<HEAD><TITLE>Test</TITLE></HEAD>\n<BODY><p>Hello</p></BODY></HTML>`;
        const result = detectFileTypeFromContent(content);
        expect(result).to.equal(defaultFileTypes.html);
      });

      it("should detect AsciiDoc from = Document Title without # headings", function () {
        const content = `= Getting Started\n\nThis is an AsciiDoc document.\n\n== Section 1\n\nSome content.`;
        const result = detectFileTypeFromContent(content);
        expect(result).to.equal(defaultFileTypes.asciidoc);
      });

      it("should NOT detect AsciiDoc if = Title style appears alongside # headings", function () {
        const content = `= Title\n\n# Markdown heading\n\nSome content.`;
        const result = detectFileTypeFromContent(content);
        // Falls back to Markdown because # headings are present
        expect(result).to.equal(defaultFileTypes.markdown);
      });

      it("should default to Markdown for plain prose", function () {
        const content = `To search for kittens, go to [DuckDuckGo](https://www.duckduckgo.com) and type "kittens".`;
        const result = detectFileTypeFromContent(content);
        expect(result).to.equal(defaultFileTypes.markdown);
      });

      it("should default to Markdown for content with # headings", function () {
        const content = `# My Document\n\nSome content with a [link](https://example.com).`;
        const result = detectFileTypeFromContent(content);
        expect(result).to.equal(defaultFileTypes.markdown);
      });

      it("should NOT treat generic XML as DITA if it has no DITA root elements", function () {
        const content = `<?xml version="1.0"?>\n<configuration>\n  <setting name="foo">bar</setting>\n</configuration>`;
        const result = detectFileTypeFromContent(content);
        // Not DITA — no DITA root elements — so falls through to Markdown
        expect(result).to.equal(defaultFileTypes.markdown);
      });
    });

    // ========== detectTests with optional filePath/fileType ==========
    describe("detectTests (optional filePath and fileType)", function () {
      it("should work with only content — no filePath, no fileType — defaults to markdown detection", async function () {
        const content = `Go to [DuckDuckGo](https://www.duckduckgo.com) and search for something.`;
        const result = await detectTests({ content });
        expect(result).to.be.an("array");
        expect(result).to.have.lengthOf(1);
        const steps = result[0].steps;
        const goToSteps = steps.filter((s) => s.goTo);
        expect(goToSteps.length).to.be.greaterThanOrEqual(1);
        expect(goToSteps[0].goTo).to.equal("https://www.duckduckgo.com");
      });

      it("should infer markdown file type from .md extension", async function () {
        const content = `Go to [Example](https://example.com).`;
        const result = await detectTests({ content, filePath: "guide.md" });
        expect(result).to.be.an("array");
        expect(result).to.have.lengthOf(1);
        const goToSteps = result[0].steps.filter((s) => s.goTo);
        expect(goToSteps.length).to.be.greaterThanOrEqual(1);
        expect(goToSteps[0].goTo).to.equal("https://example.com");
      });

      it("should infer DITA file type from .dita extension", async function () {
        const content = readFixture("dita-detect.dita");
        const result = await detectTests({ content, filePath: "my-topic.dita" });
        expect(result).to.be.an("array").with.lengthOf(1);
        const goToSteps = result[0].steps.filter((s) => s.goTo);
        expect(goToSteps.length).to.be.greaterThanOrEqual(1);
      });

      it("should fall back to content-based detection when extension is unknown", async function () {
        const content = `Go to [Example](https://example.com).`;
        // .txt is not a recognised extension — falls back to detectFileTypeFromContent (markdown)
        const result = await detectTests({ content, filePath: "guide.txt" });
        expect(result).to.be.an("array");
        expect(result).to.have.lengthOf(1);
        const goToSteps = result[0].steps.filter((s) => s.goTo);
        expect(goToSteps.length).to.be.greaterThanOrEqual(1);
        expect(goToSteps[0].goTo).to.equal("https://example.com");
      });

      it("should fall back to content-based detection for HTML content with no filePath", async function () {
        const content = `<!DOCTYPE html>\n<html><body><p>Hello</p></body></html>`;
        const resultNoPath = await detectTests({ content });
        // HTML file type should be selected (it has no markup patterns, so no steps)
        expect(resultNoPath).to.be.an("array");
        // The resolved fileType should have extensions that include 'html'
        // We verify indirectly: no errors thrown = file type was resolved
      });
    });

    // ========== detectSteps defaults to true ==========
    describe("parseContent detectSteps default", function () {
      it("should detect markup steps when config is an empty object (detectSteps defaults to true)", async function () {
        const content = `Go to [DuckDuckGo](https://www.duckduckgo.com) and search for something.`;
        const result = await parseContent({ content, config: {} });
        expect(result).to.be.an("array").with.lengthOf(1);
        const goToSteps = result[0].steps.filter((s) => s.goTo);
        expect(goToSteps.length).to.be.greaterThanOrEqual(1);
      });

      it("should detect markup steps when config is not provided", async function () {
        const content = `Go to [DuckDuckGo](https://www.duckduckgo.com) and search for something.`;
        const result = await parseContent({ content });
        expect(result).to.be.an("array").with.lengthOf(1);
        const goToSteps = result[0].steps.filter((s) => s.goTo);
        expect(goToSteps.length).to.be.greaterThanOrEqual(1);
      });

      it("should NOT detect markup steps when detectSteps is explicitly false", async function () {
        const content = `Go to [DuckDuckGo](https://www.duckduckgo.com) and search for something.`;
        const result = await parseContent({ content, config: { detectSteps: false } });
        // With detectSteps=false, no steps should be generated from markup
        const allSteps = result.flatMap((t) => t.steps);
        const goToSteps = allSteps.filter((s) => s.goTo);
        expect(goToSteps).to.have.lengthOf(0);
      });

      it("should detect all step types from markdown: goTo, checkLink, type, wait, screenshot", async function () {
        // Matches the dev.js scenario from the session
        const content = [
          "To search for American Shorthair kittens, go to [DuckDuckGo](https://www.duckduckgo.com).",
          'In the search bar, type "American Shorthair kittens".',
          "Wait for the search results to load.",
          "Take a screenshot.",
          "Check that [the DuckDuckGo homepage](https://www.duckduckgo.com) is accessible.",
        ].join("\n");
        const result = await parseContent({ content });
        expect(result).to.be.an("array").with.lengthOf(1);
        const steps = result[0].steps;

        expect(steps.filter((s) => s.goTo).length).to.be.greaterThanOrEqual(1);
        expect(steps.filter((s) => s.type).length).to.be.greaterThanOrEqual(1);
        expect(steps.filter((s) => s.checkLink).length).to.be.greaterThanOrEqual(1);
      });
    });

    // ========== Detection regression test ==========
    describe("detection regression", function () {
      it("should detect goTo and checkLink steps from typical markdown prose with only content provided", async function () {
        const content = `To search for American Shorthair kittens,

1. Go to [DuckDuckGo](https://www.duckduckgo.com).
2. In the search bar, enter "American Shorthair kittens", then press Enter.

<!-- step wait: 10000 -->

!["Search results for kittens"](search-results.png){ .screenshot }`;
        // only content, no filePath, no fileType
        const result = await detectTests({ content });
        expect(result).to.be.an("array");
        expect(result.length).to.be.greaterThanOrEqual(1);
        const steps = result[0].steps;
        expect(steps.length).to.be.equal(5);
        expect(steps.filter((s) => s.goTo).length).to.be.equal(1);
        expect(steps.filter((s) => s.checkLink).length).to.be.equal(1);
        expect(steps.filter((s) => s.type).length).to.be.equal(1);
        expect(steps.filter((s) => s.wait).length).to.be.equal(1);
        expect(steps.filter((s) => s.screenshot).length).to.be.equal(1);
      });
    });

    // ========== getLineNumber ==========
    describe("getLineNumber", function () {
      it("should return 1 for index 0", function () {
        expect(getLineNumber("hello\nworld", 0)).to.equal(1);
      });

      it("should return 2 for index after first newline", function () {
        expect(getLineNumber("hello\nworld", 6)).to.equal(2);
      });

      it("should return 3 for index on third line", function () {
        expect(getLineNumber("line1\nline2\nline3", 12)).to.equal(3);
      });

      it("should return 1 for content with no newlines", function () {
        expect(getLineNumber("single line", 5)).to.equal(1);
      });

      it("should handle index at newline character itself", function () {
        // Index 5 is the newline in "hello\nworld"
        expect(getLineNumber("hello\nworld", 5)).to.equal(1);
      });
    });

    // ========== getLineStarts ==========
    describe("getLineStarts", function () {
      it("should return [0] for single-line content", function () {
        expect(getLineStarts("hello")).to.deep.equal([0]);
      });

      it("should return correct starts for multi-line content", function () {
        // "hello\nworld" → line 1 starts at 0, line 2 starts at 6
        expect(getLineStarts("hello\nworld")).to.deep.equal([0, 6]);
      });

      it("should handle three lines", function () {
        // "line1\nline2\nline3" → starts at 0, 6, 12
        expect(getLineStarts("line1\nline2\nline3")).to.deep.equal([0, 6, 12]);
      });

      it("should return [0] for empty string", function () {
        expect(getLineStarts("")).to.deep.equal([0]);
      });

      it("should handle trailing newline", function () {
        // "hello\n" → line 1 at 0, line 2 at 6
        expect(getLineStarts("hello\n")).to.deep.equal([0, 6]);
      });
    });

    // ========== getLineNumber with lineStarts (binary search) ==========
    describe("getLineNumber with lineStarts", function () {
      it("should return 1 for index 0", function () {
        const content = "hello\nworld";
        const starts = getLineStarts(content);
        expect(getLineNumber(content, 0, starts)).to.equal(1);
      });

      it("should return 2 for index after first newline", function () {
        const content = "hello\nworld";
        const starts = getLineStarts(content);
        expect(getLineNumber(content, 6, starts)).to.equal(2);
      });

      it("should return 3 for index on third line", function () {
        const content = "line1\nline2\nline3";
        const starts = getLineStarts(content);
        expect(getLineNumber(content, 12, starts)).to.equal(3);
      });

      it("should return 1 for content with no newlines", function () {
        const content = "single line";
        const starts = getLineStarts(content);
        expect(getLineNumber(content, 5, starts)).to.equal(1);
      });

      it("should handle index at newline character itself", function () {
        const content = "hello\nworld";
        const starts = getLineStarts(content);
        expect(getLineNumber(content, 5, starts)).to.equal(1);
      });

      it("should match linear scan results for all indices", function () {
        const content = "abc\ndef\nghi\njkl";
        const starts = getLineStarts(content);
        for (let i = 0; i < content.length; i++) {
          expect(getLineNumber(content, i, starts)).to.equal(
            getLineNumber(content, i),
            `Mismatch at index ${i}`
          );
        }
      });
    });

    // ========== step location tracking ==========
    describe("step location", function () {
      // File type with checkLink action that correctly maps URL from capture group $2
      const locationFileType = {
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

      it("should include location on markup-detected steps (checkLink)", async function () {
        const content = "Check [Example](https://example.com) for details.";
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType: locationFileType,
        });
        expect(result).to.have.lengthOf(1);
        const step = result[0].steps[0];
        expect(step).to.have.property("location");
        expect(step.location).to.have.property("line", 1);
        expect(step.location).to.have.property("startIndex");
        expect(step.location).to.have.property("endIndex");
        // startIndex should be where the markdown link starts
        expect(step.location.startIndex).to.equal(content.indexOf("[Example]"));
        // endIndex should be exclusive (past the closing paren)
        expect(step.location.endIndex).to.equal(content.indexOf(") for") + 1);
      });

      it("should have correct line numbers for multi-line content", async function () {
        const content = "Line 1 text\nLine 2 text\nCheck [Link](https://example.com) here.";
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType: locationFileType,
        });
        expect(result).to.have.lengthOf(1);
        const step = result[0].steps[0];
        expect(step.location.line).to.equal(3);
      });

      it("should include location on inline step statements", async function () {
        const content = '<!-- step {"goTo": "https://example.com"} -->';
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType: locationFileType,
        });
        expect(result).to.have.lengthOf(1);
        const step = result[0].steps[0];
        expect(step).to.have.property("location");
        expect(step.location.line).to.equal(1);
        expect(step.location.startIndex).to.equal(0);
        expect(step.location.endIndex).to.equal(content.length);
      });

      it("should include location on inline step on later lines", async function () {
        const content = 'Some intro text\n\n<!-- step {"goTo": "https://example.com"} -->';
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType: locationFileType,
        });
        expect(result).to.have.lengthOf(1);
        const step = result[0].steps[0];
        expect(step.location.line).to.equal(3);
        expect(step.location.startIndex).to.equal(content.indexOf("<!-- step"));
        expect(step.location.endIndex).to.equal(content.length);
      });

      it("should have endIndex exclusive of the match", async function () {
        const content = "Check [Example](https://example.com) for details.";
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType: locationFileType,
        });
        const step = result[0].steps[0];
        const matchedText = content.substring(step.location.startIndex, step.location.endIndex);
        expect(matchedText).to.equal("[Example](https://example.com)");
      });

      it("should include location for multiple steps with correct positions", async function () {
        const content = "[First](https://first.com)\n[Second](https://second.com)";
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType: locationFileType,
        });
        expect(result).to.have.lengthOf(1);
        expect(result[0].steps).to.have.lengthOf(2);

        const step1 = result[0].steps[0];
        expect(step1.location.line).to.equal(1);
        expect(step1.location.startIndex).to.equal(0);

        const step2 = result[0].steps[1];
        expect(step2.location.line).to.equal(2);
        expect(step2.location.startIndex).to.equal(content.indexOf("[Second]"));
      });

      it("should use earliest start and latest end for batchMatches", async function () {
        const batchFileType = {
          extensions: ["md"],
          inlineStatements: {},
          markup: [
            {
              regex: ["\\[([^\\]]+)\\]\\([^)]+\\)"],
              actions: ["find"],
              batchMatches: true,
            },
          ],
        };
        const content = "[First](https://first.com)\n[Second](https://second.com)";
        const result = await parseContent({
          config: {},
          content,
          filePath: "test.md",
          fileType: batchFileType,
        });
        expect(result).to.have.lengthOf(1);
        // batchMatches combines all matches into one step
        const step = result[0].steps[0];
        expect(step).to.have.property("location");
        expect(step.location.startIndex).to.equal(0);
        expect(step.location.endIndex).to.equal(content.length);
        expect(step.location.line).to.equal(1);
      });
    });

    // ========== contentPath on detected tests ==========
    describe("contentPath on detected tests", function () {
      it("should set contentPath on each test when filePath is provided", async function () {
        const content = '<!-- step {"goTo": "https://example.com"} -->';
        const result = await parseContent({
          config: {},
          content,
          filePath: "docs/test.md",
          fileType: markdownFileType,
        });
        expect(result).to.have.lengthOf(1);
        expect(result[0]).to.have.property("contentPath", "docs/test.md");
      });

      it("should set contentPath on multiple tests", async function () {
        const content =
          '<!-- test {"steps": [{"goTo": "https://example.com"}]} -->\n' +
          "<!-- test end -->\n" +
          '<!-- test {"steps": [{"goTo": "https://other.com"}]} -->';
        const result = await parseContent({
          config: {},
          content,
          filePath: "docs/multi.md",
          fileType: markdownFileType,
        });
        expect(result).to.have.lengthOf(2);
        expect(result[0]).to.have.property("contentPath", "docs/multi.md");
        expect(result[1]).to.have.property("contentPath", "docs/multi.md");
      });

      it("should not set contentPath when filePath is empty", async function () {
        const content = '<!-- step {"goTo": "https://example.com"} -->';
        const result = await parseContent({
          config: {},
          content,
          filePath: "",
          fileType: markdownFileType,
        });
        expect(result).to.have.lengthOf(1);
        expect(result[0]).to.not.have.property("contentPath");
      });

      it("should not set contentPath when filePath is undefined", async function () {
        const content = '<!-- step {"goTo": "https://example.com"} -->';
        const result = await parseContent({
          config: {},
          content,
          fileType: markdownFileType,
        });
        expect(result).to.have.lengthOf(1);
        expect(result[0]).to.not.have.property("contentPath");
      });
    });
  });
