import { expect } from "chai";
import sinon from "sinon";
import { detectTests } from "../dist/index.js";
import { defaultFileTypes, gherkinMarkup } from "../dist/fileTypes.js";
import { parseGherkin } from "../dist/detect/gherkin.js";
import { collectStatements } from "../dist/detect/selectors.js";
import { validate } from "../dist/validate.js";

const FILE = "/abs/login.feature";

// Detects a .feature string with the built-in fileType, collecting warnings.
async function detect(content, config = {}) {
  const warn = sinon.stub(console, "warn");
  try {
    const tests = await detectTests({ content, filePath: FILE, config: { detectSteps: true, ...config } });
    const clean = tests.map(({ location, contentPath, steps, ...t }) => ({ ...t, steps: steps.map(({ location, ...s }) => s) }));
    return { tests: clean, raw: tests, warnings: warn.args.map((a) => a[0]) };
  } finally {
    warn.restore();
  }
}

describe("gherkin", function () {
  describe("fileType", function () {
    it("is a built-in for .feature files with comment statements and the gherkin markup", function () {
      const ft = defaultFileTypes.gherkin;
      expect(ft).to.equal(defaultFileTypes.gherkin_1_0);
      expect(ft).to.include({ name: "gherkin" });
      expect(ft.extensions).to.deep.equal(["feature"]);
      expect(ft.inlineStatements).to.deep.equal({ in: ["comment"] });
      expect(ft.markup).to.deep.equal(gherkinMarkup);
      for (const def of gherkinMarkup) expect(def.element, def.name).to.deep.equal({ tag: ["step"] });
      const result = validate({ schemaKey: "config_v3", object: { fileTypes: [structuredClone(ft)] } });
      expect(result.valid, result.errors).to.equal(true);
    });
  });

  describe("parseGherkin", function () {
    const feature = [
      "# a plain comment",
      "Feature: Login",
      "  Some description.",
      "",
      "  Background:",
      '    Given I go to "http://localhost:8092"',
      "",
      "  Scenario: One",
      "    When I run:",
      '      """bash',
      "      echo hi",
      '      """',
      "    # step {\"wait\": 1}",
      "",
    ].join("\n");

    it("wraps each scenario in test comments and replays the Background inside it", function () {
      const nodes = parseGherkin(feature, FILE);
      const ordered = [...nodes].filter((n) => n.sortIndex !== undefined).sort((a, b) => a.sortIndex - b.sortIndex);
      expect(ordered.map((n) => n.content)).to.deep.equal([
        'test {"testId":"One","description":"One"}',
        'I go to "http://localhost:8092"',
        "I run:",
        'step {"wait": 1}',
        "test end",
      ]);
      const scenarioAt = feature.indexOf("Scenario: One");
      for (const n of ordered) expect(n.sortIndex).to.be.within(scenarioAt, scenarioAt + 1);
      // Statements keep their real source spans.
      const goTo = ordered[1];
      expect(feature.slice(goTo.startIndex, goTo.endIndex)).to.equal('Given I go to "http://localhost:8092"');
      expect(goTo).to.include({ kind: "element", tag: "step" });
      expect(goTo.attributes).to.deep.equal({ keyword: "Given" });
      expect(ordered[2].attributes).to.deep.equal({ keyword: "When", docString: "echo hi", mediaType: "bash" });
      expect(feature.slice(ordered[0].startIndex, ordered[0].endIndex)).to.equal("Scenario: One");
      // A comment outside any scenario keeps its source position.
      const plain = nodes.find((n) => n.content === "a plain comment");
      expect(plain).to.include({ kind: "comment", startIndex: 0 });
      expect(plain.sortIndex).to.equal(undefined);
      // A `# test` comment that isn't a JSON object stays a comment.
      expect(parseGherkin("# test {nope}\n")).to.deep.equal([{ kind: "comment", startIndex: 0, endIndex: 13, content: "test {nope}", before: "" }]);
    });

    it("sets an unmatched warning naming the file and line", function () {
      const step = parseGherkin(feature, FILE).find((n) => n.content === "I run:");
      expect(step.unmatched).to.equal("Couldn't map step `When I run:` in `/abs/login.feature:9` to an action. Add a `step` statement or a `markup` entry.");
    });

    it("emits nothing for an Outline with no Examples, warning through the given callback", function () {
      expect(parseGherkin("Feature: F\n  Scenario Outline: X\n")).to.deep.equal([]);
      const warnings = [];
      parseGherkin("Feature: F\n  Scenario Outline: X\n", FILE, (m) => warnings.push(m));
      expect(warnings).to.deep.equal(["Couldn't expand `Scenario Outline: X` in `/abs/login.feature:2`: it has no `Examples`."]);
    });

    it("reads backtick doc strings and strips their indent", function () {
      const nodes = parseGherkin("Feature: F\n  Scenario: S\n    * I run:\n      ```\n        indented\n      text\n      ```\n");
      expect(nodes.find((n) => n.kind === "element").attributes).to.deep.equal({ keyword: "*", docString: "  indented\ntext", mediaType: "" });
    });
  });

  describe("detection", function () {
    it("replays the Background in every scenario, in order, with real line numbers", async function () {
      const { tests, raw } = await detect(
        [
          "Feature: Search",
          "  Background:",
          '    Given I go to "http://localhost:8092"',
          "  Scenario: First",
          '    When I click "Go"',
          "  Scenario: Second",
          '    Then I should see "Results"',
        ].join("\n")
      );
      expect(tests).to.deep.equal([
        { testId: "First", description: "First", steps: [{ goTo: "http://localhost:8092" }, { click: "Go" }] },
        { testId: "Second", description: "Second", steps: [{ goTo: "http://localhost:8092" }, { find: "Results" }] },
      ]);
      expect(raw[1].steps[0].location.line).to.equal(3);
      expect(raw[1].location.line).to.equal(6);
      expect(raw[0].contentPath).to.equal(FILE);
    });

    it("maps every phrase in the vocabulary", async function () {
      const { tests, warnings } = await detect(
        [
          "Feature: Phrases",
          "  Scenario: All",
          '    Given I go to "http://localhost:8092"',
          '    And I open "http://localhost:8092/index.html"',
          '    When I click "Submit"',
          '    Then I see "Hello"',
          '    And I should see "Hello"',
          '    And I should not see "Goodbye"',
          '    When I type "abc"',
          '    And I type "abc" into "#input"',
          '    And I press "Page Down"',
          '    And I hover over "Submit"',
          '    And I scroll to "Footer"',
          '    And I drag "#a" to "#b"',
          "    And I swipe up",
          '    Then the link "https://example.com" works',
          '    And I take a screenshot "shot.png"',
          '    And I take a screenshot of "#hero" as "hero.png"',
          '    And I start recording "rec.mp4"',
          "    And I stop recording",
          '    And I save the session as "state.json"',
          '    And I restore the session "state.json"',
          '    And I run "echo hi"',
          '    And I run the command "echo hi"',
          '    And I run the script "./x.sh"',
          "    And I run:",
          '      """bash',
          "      echo hi",
          '      """',
          "    And I wait 1.5 seconds",
          "    And I wait 200 milliseconds",
          '    And the variables in ".env"',
          '    When I send a GET request to "http://localhost:8092/api"',
          "    Then the response status should be 404",
          '    When I send a POST request to "http://localhost:8092/api" with:',
          '      """json',
          '      {"a": 1}',
          '      """',
          "    Then the response status is 201",
          '    Given the API "GET /users" returns "users.json"',
          '    And the API "**/items" returns:',
          '      """',
          "      [1]",
          '      """',
        ].join("\n")
      );
      expect(warnings).to.deep.equal([]);
      expect(tests[0].steps).to.deep.equal([
        { goTo: "http://localhost:8092" },
        { goTo: "http://localhost:8092/index.html" },
        { click: "Submit" },
        { find: "Hello" },
        { find: "Hello" },
        { runBrowserScript: { script: "return !document.body.innerText.includes(arguments[0])", args: ["Goodbye"], output: "true" } },
        { type: "abc" },
        { type: { keys: "abc", selector: "#input" } },
        { type: "$PAGE_DOWN$" },
        { find: { elementText: "Submit", moveTo: true } },
        { find: { elementText: "Footer", moveTo: true } },
        { dragAndDrop: { source: "#a", target: "#b" } },
        { swipe: "up" },
        { checkLink: "https://example.com" },
        { screenshot: "shot.png" },
        { screenshot: { path: "hero.png", crop: "#hero" } },
        { record: "rec.mp4" },
        { stopRecord: true },
        { saveState: "state.json" },
        { loadState: "state.json" },
        { runShell: "echo hi" },
        { runShell: "echo hi" },
        { runShell: "./x.sh" },
        { unsafe: true, runCode: { language: "bash", code: "echo hi" } },
        { wait: "1500" },
        { wait: "200" },
        { loadVariables: ".env" },
        { httpRequest: { method: "GET", url: "http://localhost:8092/api", statusCodes: "404" } },
        { httpRequest: { method: "POST", url: "http://localhost:8092/api", statusCodes: "201", request: { body: { a: 1 } } } },
        { mockRequest: { method: "GET", url: "/users", response: { bodyPath: "users.json" } } },
        { mockRequest: { url: "**/items", response: { body: "[1]" } } },
      ]);
    });

    it("expands an Outline once per Examples row, across Examples blocks", async function () {
      const { tests } = await detect(
        [
          "Feature: Outlines",
          "  Scenario Outline: Visit <page>",
          '    Given I go to "http://localhost:8092/<page>"',
          '    Then I should see "<text> <nope>"',
          "    Examples:",
          "      | page       | text |",
          "      | index.html | Home |",
          "    @firefox",
          "    Scenarios:",
          "      | page  | text  |",
          "      | a.html | A \\| B |",
        ].join("\n")
      );
      expect(tests).to.deep.equal([
        {
          testId: "Visit <page> [row 1]",
          description: "Visit index.html",
          steps: [{ goTo: "http://localhost:8092/index.html" }, { find: "Home <nope>" }],
        },
        {
          testId: "Visit <page> [row 2]",
          description: "Visit a.html",
          runOn: [{ browsers: ["firefox"] }],
          steps: [{ goTo: "http://localhost:8092/a.html" }, { find: "A | B <nope>" }],
        },
      ]);
    });

    it("warns when an Outline has no Examples", async function () {
      const { tests, warnings } = await detect('Feature: F\n  Scenario Template: Lonely\n    Given I go to "http://x.test"\n');
      expect(tests).to.deep.equal([]);
      expect(warnings).to.include("Couldn't expand `Scenario Template: Lonely` in `/abs/login.feature:2`: it has no `Examples`.");
    });

    it("turns inherited tags into runOn, autoRecord, if, and testId", async function () {
      const { tests } = await detect(
        [
          "@chrome @windows # a comment after tags",
          "Feature: Tags",
          "  @mac",
          "  Rule: Rules",
          "    @firefox @chrome @headless @record @id:tagged @edge @other",
          "    Scenario: Tagged",
          '      Given I go to "http://x.test"',
          "  @skip",
          "  Rule: Skipped",
          "    Background:",
          '      Given I go to "http://rule.test"',
          "    Example: Skip",
          '      Given I go to "http://x.test"',
          "    @wip",
          "    Scenario: Wip",
          '      Given I go to "http://x.test"',
        ].join("\n")
      );
      expect(tests.map(({ steps, ...t }) => t)).to.deep.equal([
        {
          testId: "tagged",
          description: "Tagged",
          autoRecord: true,
          runOn: [{ platforms: ["windows", "mac"], browsers: [{ name: "chrome", headless: true }, { name: "firefox", headless: true }] }],
        },
        { testId: "Skip", description: "Skip", if: "false", runOn: [{ platforms: ["windows"], browsers: ["chrome"] }] },
        { testId: "Wip", description: "Wip", if: "false", runOn: [{ platforms: ["windows"], browsers: ["chrome"] }] },
      ]);
      // A Rule's Background runs after the Feature's, only in that Rule.
      expect(tests.map((t) => t.steps.length)).to.deep.equal([1, 2, 2]);
      expect(tests[1].steps[0]).to.deep.equal({ goTo: "http://rule.test" });
    });

    it("turns emulation steps into browser emulation, naming chrome when no browser is tagged", async function () {
      const { tests } = await detect(
        [
          "Feature: Emulation",
          "  Background:",
          "    Given dark mode",
          "  Scenario: Untagged",
          "    Given a 800x600 viewport",
          '    And the locale is "de-DE"',
          '    And the timezone is "Europe/Berlin"',
          '    Then I see "x"',
          "  @firefox",
          "  Scenario: Tagged",
          "    Given light mode",
          '    Then I see "x"',
        ].join("\n")
      );
      expect(tests.map((t) => t.runOn)).to.deep.equal([
        [{ browsers: [{ name: "chrome", colorScheme: "dark", viewport: { width: 800, height: 600 }, locale: "de-DE", timezone: "Europe/Berlin" }] }],
        [{ browsers: [{ name: "firefox", colorScheme: "light" }] }],
      ]);
      expect(tests.map((t) => t.steps)).to.deep.equal([[{ find: "x" }], [{ find: "x" }]]);
    });

    it("merges a # test comment above a scenario, with the user's keys winning, and drops # test end", async function () {
      const { tests } = await detect(
        [
          "Feature: Merge",
          '  # test {"testId": "custom", "runOn": [{"browsers": "webkit"}]}',
          "  @chrome",
          "  Scenario: Merged",
          '    Given I go to "http://x.test"',
          "  # test end",
          "  # test testId=other",
          "  Scenario: Plain",
          '    Given I go to "http://x.test"',
        ].join("\n")
      );
      expect(tests.map(({ steps, ...t }) => t)).to.deep.equal([
        { testId: "custom", description: "Merged", runOn: [{ browsers: "webkit" }] },
        { testId: "Plain", description: "Plain" },
      ]);
    });

    it("honors ignore blocks and # step statements inside a scenario", async function () {
      const { tests } = await detect(
        [
          "Feature: Ignore",
          "  Scenario: S",
          '    Given I go to "http://x.test"',
          "    # test ignore start",
          '    When I click "Skipped"',
          "    # test ignore end",
          '    # step {"find": "inline"}',
          '    Then I see "kept"',
        ].join("\n")
      );
      expect(tests[0].steps).to.deep.equal([{ goTo: "http://x.test" }, { find: "inline" }, { find: "kept" }]);
    });

    it("ignores an emulation step inside an ignore block", async function () {
      const { tests } = await detect(
        [
          "Feature: Ignore",
          "  Scenario: S",
          "    # test ignore start",
          "    Given dark mode",
          "    # test ignore end",
          '    Given I go to "http://x.test"',
        ].join("\n")
      );
      expect(tests[0].runOn).to.equal(undefined);
      expect(tests[0].steps).to.deep.equal([{ goTo: "http://x.test" }]);
    });

    it("doesn't fold an ignored response status into the request before it", async function () {
      const { tests } = await detect(
        [
          "Feature: Ignore",
          "  Scenario: S",
          '    When I send a GET request to "https://x.test"',
          "    # test ignore start",
          "    Then the response status should be 404",
          "    # test ignore end",
          "    And the response status should be 200",
        ].join("\n")
      );
      expect(tests[0].steps).to.have.length(1);
      expect(tests[0].steps[0].httpRequest.statusCodes).to.equal("200");
    });

    it("keeps double quotes in a fill-in selector", async function () {
      const { tests, warnings } = await detect(
        ["Feature: Quotes", "  Scenario: S", "    When I fill in:", '      | [name="email"] | ada@example.com |'].join("\n")
      );
      expect(tests[0].steps).to.deep.equal([{ type: { keys: "ada@example.com", selector: '[name="email"]' } }]);
      expect(warnings).to.deep.equal([]);
    });

    it("warns once for each step no definition maps", async function () {
      const { tests, warnings } = await detect(
        [
          "Feature: Unmatched",
          "  Background:",
          "    Given I frobnicate",
          "  Scenario: A",
          "    Then the response status should be 200",
          "  Scenario: B",
          '    Then I see "x"',
        ].join("\n")
      );
      expect(warnings).to.deep.equal([
        "Couldn't map step `Given I frobnicate` in `/abs/login.feature:3` to an action. Add a `step` statement or a `markup` entry.",
        "Couldn't map step `Then the response status should be 200` in `/abs/login.feature:5` to an action. Add a `step` statement or a `markup` entry.",
        "Couldn't convert test in /abs/login.feature to valid test. Skipping.",
      ]);
      expect(tests.map((t) => t.testId)).to.deep.equal(["B"]);
    });

    it("runs only # step statements, with no warnings, when step detection is off", async function () {
      const content = ["Feature: Off", "  Scenario: S", "    Given I frobnicate", '    # step {"find": "inline"}'].join("\n");
      const off = await detect(content, { detectSteps: false });
      expect(off.tests[0].steps).to.deep.equal([{ find: "inline" }]);
      expect(off.warnings).to.deep.equal([]);
      const testOff = await detect(['# test {"detectSteps": false}', content].join("\n"));
      expect(testOff.tests[0].steps).to.deep.equal([{ find: "inline" }]);
      expect(testOff.warnings).to.deep.equal([]);
    });

    it("rewrites data tables into one step per row", async function () {
      const { tests, raw } = await detect(
        [
          "Feature: Tables",
          "  Scenario: Form",
          "    When I fill in:",
          "      | #email | ada@example.com |",
          "      | #name  | Ada             |",
          "    Then I should see:",
          "      | Welcome |",
          '    And I see "done"',
          "      | ignored |",
          "    And I fill in:",
        ].join("\n")
      );
      expect(tests[0].steps).to.deep.equal([
        { type: { keys: "ada@example.com", selector: "#email" } },
        { type: { keys: "Ada", selector: "#name" } },
        { find: "Welcome" },
        { find: "done" },
      ]);
      expect(raw[0].steps.map((s) => s.location.line)).to.deep.equal([4, 5, 7, 8]);
    });

    it("leaves steps outside a scenario and stray Examples alone", async function () {
      const { tests } = await detect(
        [
          'Given I go to "http://x.test"',
          "| a |",
          '"""',
          '"""',
          "Examples:",
          "Feature: F",
          "  Scenario: S",
          "    | before any step |",
          '    """',
          "    no step to attach to",
          '    """',
          "    Examples:",
          '    Given I go to "http://x.test"',
        ].join("\n")
      );
      expect(tests).to.deep.equal([{ testId: "S", description: "S", steps: [{ goTo: "http://x.test" }] }]);
    });
  });

  it("sorts a node's statements at its sortIndex in collectStatements", function () {
    const statements = collectStatements({ content: "Feature: F\n  Scenario: S\n", fileType: defaultFileTypes.gherkin, filePath: FILE, warn: () => {} });
    expect(statements.map((s) => [s.type, s._line])).to.deep.equal([
      ["testStart", 2],
      ["testEnd", 2],
    ]);
  });
});
