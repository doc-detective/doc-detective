// Golden tests for `audit`'s coverage calculation (ADR 01207). Steps come from
// the real detection path, so these tests exercise what `audit` sees.
import assert from "node:assert/strict";
import path from "node:path";
import { computeCoverage, canonicalUrl } from "../dist/audit/coverage.js";
import { detectTests } from "../dist/common/src/detectTests.js";
import { defaultFileTypes } from "../dist/common/src/fileTypes.js";

const emptyIndex = () => ({ stepIds: new Map(), linkTargets: new Map(), screenshotFiles: new Map() });
const root = path.resolve("/docs");

async function audit(content, { file = "page.md", fileType, config = {}, index = emptyIndex() } = {}) {
  const filePath = path.join(root, file);
  const ext = path.extname(file).slice(1);
  fileType ??= structuredClone(Object.values(defaultFileTypes).find((ft) => ft.extensions.includes(ext)));
  const tests = await detectTests({ content, filePath, fileType, config: { detectSteps: true, ...config } });
  const steps = tests.flatMap((test) => test.steps);
  return computeCoverage({
    content,
    fileType,
    filePath,
    steps,
    index,
    origin: config.origin,
    allowUnsafe: config.allowUnsafeSteps ?? false,
  });
}

const procedureSteps = (result) => result.items.filter((item) => item.kind === "procedureStep");
const states = (items) => items.map((item) => item.state);

const tutorial = [
  "# Create your first test",
  "",
  "1.  In a terminal, navigate to the folder where you plan to create your test:",
  "",
  "    {/* test ignore start */}",
  '    {/* step {"runShell":{"command":"cd /path/to/project"}} */}',
  "    {/* test ignore end */}",
  "",
  "2.  Create a new test file named `homepage-check.spec.json`:",
  "",
  '    {/* step {"runShell":{"command":"touch homepage-check.spec.json"}} */}',
  "",
  "3.  Open the file in your text editor and paste the following code:",
  "",
  "4.  Save the file. {/* test end */}",
  "",
  "5.  In your terminal, enter the following command to run the test:",
  "",
  "    {/* test ignore start */}",
  '    {/* step {"runShell":{"command":"npx doc-detective --input homepage-check.spec.json"}} */}',
  "    {/* test ignore end */}",
  "",
].join("\n");

describe("audit coverage", function () {
  describe("procedures", function () {
    it("matches the design doc's tutorial page", async function () {
      const result = await audit(tutorial, { file: "first-test.mdx" });
      const items = procedureSteps(result);
      assert.deepEqual(states(items), ["ignored", "hasStep", "untested", "untested", "ignored"]);
      assert.deepEqual(items.map((item) => item.line), [3, 9, 13, 15, 17]);
      assert.ok(items.every((item) => item.source === "tagger"));
      assert.match(items[2].text, /^Open the file/);
      assert.deepEqual(result.lists, { explicit: 0, tagged: 1, possible: 0 });
    });

    it("gives the same result with CRLF line endings", async function () {
      const result = await audit(tutorial.replace(/\n/g, "\r\n"), { file: "first-test.mdx" });
      assert.deepEqual(states(procedureSteps(result)), ["ignored", "hasStep", "untested", "untested", "ignored"]);
    });

    it("counts a list when at least half its items read as instructions", async function () {
      const result = await audit("1. Release notes\n2. Open the app.\n");
      assert.deepEqual(procedureSteps(result).map((item) => item.source), ["tagger", "tagger"]);
    });

    it("keeps a list where fewer than half the items read as instructions in possible procedures", async function () {
      const result = await audit("1. Open the app.\n2. Release notes\n3. Bug fixes\n");
      assert.deepEqual(procedureSteps(result).map((item) => item.source), ["possible", "possible", "possible"]);
    });

    it("puts a list the tagger rejects in possible procedures", async function () {
      const result = await audit("1. Release notes\n2. Bug fixes\n");
      assert.deepEqual(procedureSteps(result).map((item) => item.source), ["possible", "possible"]);
      assert.deepEqual(result.lists, { explicit: 0, tagged: 0, possible: 1 });
    });

    it("counts a list after a `procedure` marker as explicit", async function () {
      const result = await audit("<!-- procedure -->\n1. Release notes\n2. Bug fixes\n");
      assert.deepEqual(procedureSteps(result).map((item) => item.source), ["explicit", "explicit"]);
    });

    it("ignores a marker separated from the list by prose", async function () {
      const result = await audit("<!-- procedure -->\n\nSome prose.\n\n1. Release notes\n");
      assert.equal(procedureSteps(result)[0].source, "possible");
    });

    it("ignores unordered lists", async function () {
      const result = await audit("- Click **Save**\n- Click **Close**\n");
      assert.equal(procedureSteps(result).length, 0);
    });

    it("counts only top-level items, crediting the parent for a nested step", async function () {
      const content = [
        "1. Open the settings:",
        "   1. Find the **Advanced** tab.",
        '      <!-- step {"find":"Advanced"} -->',
        "2. Save the file.",
        "",
      ].join("\n");
      const result = await audit(content, { config: { detectSteps: false } });
      assert.deepEqual(states(procedureSteps(result)), ["hasStep", "untested"]);
    });

    it("doesn't read a `1.` inside a fence as an item", async function () {
      const result = await audit("```text\n1. Click this\n2. Click that\n```\n");
      assert.equal(procedureSteps(result).length, 0);
    });

    it("credits the item a step sits in, up to the next item", async function () {
      const content = ["1. Open the app.", "", '   <!-- step {"find":"App"} -->', "", "2. Close the app.", ""].join("\n");
      const result = await audit(content, { config: { detectSteps: false } });
      assert.deepEqual(states(procedureSteps(result)), ["hasStep", "untested"]);
    });

    it("credits only the item where a batch step starts", async function () {
      const fileType = structuredClone(defaultFileTypes.markdown);
      fileType.markup = [{ name: "batchFind", strong: {}, captures: ["text"], batchMatches: true, actions: ["find"] }];
      const result = await audit("1. Find **One**.\n2. Find **Two**.\n", { fileType });
      assert.deepEqual(states(procedureSteps(result)), ["hasStep", "untested"]);
    });

    it("reads a list inside a blockquote", async function () {
      const result = await audit("> 1. Open the app.\n> 2. Close it.\n");
      assert.equal(procedureSteps(result)[0].source, "tagger");
    });

    it("reads a list inside an MDX component other than Steps as an ordinary list", async function () {
      const result = await audit("<Note>\n\n1. Release notes\n2. Bug fixes\n\n</Note>\n", { file: "page.mdx" });
      assert.equal(procedureSteps(result)[0].source, "possible");
    });

    it("counts each Step in MDX Steps as an explicit item", async function () {
      const content = ["<Steps>", "  <Step title=\"One\">", "    Release notes", "  </Step>", "  <Step title=\"Two\">", "    More", "  </Step>", "</Steps>", ""].join("\n");
      const result = await audit(content, { file: "page.mdx" });
      assert.deepEqual(procedureSteps(result).map((item) => item.source), ["explicit", "explicit"]);
      assert.deepEqual(result.lists, { explicit: 1, tagged: 0, possible: 0 });
    });

    it("reads a Step's title as its text", async function () {
      const content = ["<Steps>", "  <Step title=\"Install the CLI\">", "    Run the installer.", "  </Step>", "</Steps>", ""].join("\n");
      const result = await audit(content, { file: "page.mdx" });
      assert.equal(procedureSteps(result)[0].text, "Install the CLI");
    });

    it("marks an item navigation-only when only goTo or checkLink cover it", async function () {
      const result = await audit("1. Go to [the site](https://example.com).\n2. Close it.\n");
      const [first] = procedureSteps(result);
      assert.equal(first.state, "hasStep");
      assert.equal(first.navigationOnly, true);
    });

    it("doesn't count steps that check nothing", async function () {
      const result = await audit('1. Open the app. <!-- step {"wait":500} -->\n', { config: { detectSteps: false } });
      assert.equal(procedureSteps(result)[0].state, "untested");
    });
  });

  describe("code blocks", function () {
    it("credits a block an authored step directly follows", async function () {
      const content = '```bash\nnpm test\n```\n<!-- step {"runShell":"npm test"} -->\n';
      const result = await audit(content, { config: { detectSteps: false } });
      const [block] = result.items.filter((item) => item.kind === "codeBlock");
      assert.equal(block.state, "hasStep");
    });

    it("credits a block whose id matches an authored stepId", async function () {
      const index = emptyIndex();
      index.stepIds.set("install", [{ runShell: "npm i" }]);
      const result = await audit("```bash {#install}\nnpm i\n```\n", { config: { detectSteps: false }, index });
      assert.equal(result.items.find((item) => item.kind === "codeBlock").state, "hasStep");
    });

    it("applies the unsafe and non-checking rules to a step matched by id", async function () {
      const content = "```bash {#install}\nnpm i\n```\n";
      const unsafe = emptyIndex();
      unsafe.stepIds.set("install", [{ runShell: "npm i", unsafe: true }]);
      const blocked = await audit(content, { config: { detectSteps: false }, index: unsafe });
      assert.equal(blocked.items.find((item) => item.kind === "codeBlock").state, "skipped");
      const allowed = await audit(content, { config: { detectSteps: false, allowUnsafeSteps: true }, index: unsafe });
      assert.equal(allowed.items.find((item) => item.kind === "codeBlock").state, "hasStep");
      const waits = emptyIndex();
      waits.stepIds.set("install", [{ wait: 500 }]);
      const waited = await audit(content, { config: { detectSteps: false }, index: waits });
      assert.equal(waited.items.find((item) => item.kind === "codeBlock").state, "untested");
    });

    it("reports a detected but unsafe block as skipped, unless unsafe steps are allowed", async function () {
      const blocked = await audit("```bash\nnpm test\n```\n");
      assert.equal(blocked.items.find((item) => item.kind === "codeBlock").state, "skipped");
      const allowed = await audit("```bash\nnpm test\n```\n", { config: { allowUnsafeSteps: true } });
      assert.equal(allowed.items.find((item) => item.kind === "codeBlock").state, "hasStep");
    });

    it("counts other languages as not runnable", async function () {
      const result = await audit("```json\n{}\n```\n");
      assert.equal(result.items.filter((item) => item.kind === "codeBlock").length, 0);
      assert.equal(result.notRunnable, 1);
    });

    it("marks a testIgnore block ignored", async function () {
      const result = await audit("```bash testIgnore\nrm -rf /\n```\n");
      assert.equal(result.items.find((item) => item.kind === "codeBlock").state, "ignored");
    });

    it("counts a block tagged procedure as an explicit procedure step", async function () {
      const result = await audit("Run this:\n\n```bash {.procedure}\nnpm test\n```\n", { config: { detectSteps: false } });
      const [step] = procedureSteps(result);
      assert.equal(step.source, "explicit");
      assert.equal(step.state, "untested");
    });
  });

  describe("links", function () {
    it("credits an absolute link its detected checkLink covers", async function () {
      const result = await audit("See [the site](https://example.com/a).\n");
      const [link] = result.items.filter((item) => item.kind === "link");
      assert.equal(link.state, "hasStep");
      assert.equal(result.linksTotal, 1);
    });

    it("leaves a relative link untestable without origin", async function () {
      const result = await audit("See [setup](/guide).\n");
      assert.equal(result.items.filter((item) => item.kind === "link").length, 0);
      assert.equal(result.linksTotal, 1);
    });

    it("matches a relative link to a spec target through origin, ignoring fragments and trailing slashes", async function () {
      const index = emptyIndex();
      index.linkTargets.set(canonicalUrl("/guide/", "https://docs.example"), [{ goTo: "/guide/" }]);
      const result = await audit("See [setup](/guide#install).\n", { config: { origin: "https://docs.example" }, index });
      assert.equal(result.items.find((item) => item.kind === "link").state, "hasStep");
    });

    it("applies the unsafe rule to a spec's link target", async function () {
      const index = emptyIndex();
      index.linkTargets.set("https://example.com/a", [{ checkLink: "https://example.com/a", unsafe: true }]);
      const content = "See [the site](https://example.com/a).\n";
      const blocked = await audit(content, { config: { detectSteps: false }, index });
      assert.equal(blocked.items.find((item) => item.kind === "link").state, "skipped");
      const allowed = await audit(content, { config: { detectSteps: false, allowUnsafeSteps: true }, index });
      assert.equal(allowed.items.find((item) => item.kind === "link").state, "hasStep");
    });

    it("keeps counting links with detectSteps off, as untested", async function () {
      const result = await audit("See [the site](https://example.com/a).\n", { config: { detectSteps: false } });
      assert.equal(result.items.find((item) => item.kind === "link").state, "untested");
    });
  });

  describe("images", function () {
    it("credits a screenshot image its detected step covers", async function () {
      const result = await audit("![Home](home.png){.screenshot}\n");
      assert.equal(result.items.find((item) => item.kind === "image").state, "hasStep");
    });

    it("credits an image a spec screenshot writes to", async function () {
      const index = emptyIndex();
      index.screenshotFiles.set(path.join(root, "img", "home.png"), [{ screenshot: "img/home.png" }]);
      const result = await audit("![Home](img/home.png)\n", { index });
      assert.equal(result.items.find((item) => item.kind === "image").state, "hasStep");
    });

    it("applies the unsafe rule to a spec's screenshot", async function () {
      const index = emptyIndex();
      index.screenshotFiles.set(path.join(root, "img", "home.png"), [{ screenshot: "img/home.png", unsafe: true }]);
      const blocked = await audit("![Home](img/home.png)\n", { index });
      assert.equal(blocked.items.find((item) => item.kind === "image").state, "skipped");
      const allowed = await audit("![Home](img/home.png)\n", { config: { allowUnsafeSteps: true }, index });
      assert.equal(allowed.items.find((item) => item.kind === "image").state, "hasStep");
    });

    it("leaves other images untested", async function () {
      const result = await audit("![Home](img/home.png)\n");
      assert.equal(result.items.find((item) => item.kind === "image").state, "untested");
    });
  });

  describe("pages", function () {
    it("reports whether the page has an authored step", async function () {
      assert.equal((await audit('Text. <!-- step {"find":"Text"} -->\n')).hasAuthoredStep, true);
      assert.equal((await audit("See [the site](https://example.com).\n")).hasAuthoredStep, false);
    });

    it("reports a file type with no list parser as not measured", async function () {
      const fileType = { name: "notes", extensions: ["txt"], inlineStatements: {} };
      const result = await audit("1. Open the app.\n", { file: "notes.txt", fileType });
      assert.equal(result.measured, false);
      assert.equal(procedureSteps(result).length, 0);
    });
  });

  describe("HTML", function () {
    it("reads ordered lists through the tagger, top-level items only", async function () {
      const content = "<ol>\n  <li>Click <b>Save</b>.\n    <ol><li>Wait.</li></ol>\n  </li>\n  <li>Close it.</li>\n</ol>\n<ul><li>Click this</li></ul>\n";
      const result = await audit(content, { file: "page.html" });
      const items = procedureSteps(result);
      assert.deepEqual(items.map((item) => [item.source, item.line]), [["tagger", 2], ["tagger", 5]]);
      assert.equal(items[0].state, "hasStep");
      assert.match(items[0].text, /^Click \*\*Save\*\*\./);
    });

    it("reads only an item's first block as its text", async function () {
      const result = await audit("<ol><li><p>Open the app.</p><p>More detail here.</p></li></ol>\n", { file: "page.html" });
      assert.equal(procedureSteps(result)[0].text, "Open the app.");
    });

    it("counts a list after a procedure comment as explicit", async function () {
      const result = await audit("<!-- procedure -->\n<ol><li>Release notes</li></ol>\n", { file: "page.html" });
      assert.equal(procedureSteps(result)[0].source, "explicit");
    });

    it("reads id and class tags on a code block", async function () {
      const index = emptyIndex();
      index.stepIds.set("install", [{ runShell: "npm i" }]);
      const content = '<p>Run this:</p>\n<pre id="install" class="procedure"><code class="language-bash">npm i</code></pre>\n';
      const result = await audit(content, { file: "page.html", config: { detectSteps: false }, index });
      assert.deepEqual(result.items.map((item) => [item.kind, item.state]), [["procedureStep", "hasStep"], ["codeBlock", "hasStep"]]);
    });

    it("lets a custom codeBlock selector match on attributes", async function () {
      const fileType = structuredClone(defaultFileTypes.html);
      fileType.markup = [{ name: "tagged", codeBlock: { attributes: { class: "runme" } }, captures: ["content"], actions: ["runShell"] }];
      const tests = await detectTests({ content: '<pre class="runme">echo hi</pre>\n', filePath: "a.html", fileType, config: { detectSteps: true } });
      assert.deepEqual(tests[0].steps.map(({ location, ...step }) => step), [{ runShell: "echo hi" }]);
    });

    it("keeps detecting runCode and httpRequest blocks", async function () {
      const content = '<pre><code class="language-bash">npm test</code></pre>\n<pre><code class="language-http">GET https://example.com</code></pre>\n';
      const tests = await detectTests({ content, filePath: "a.html", fileType: structuredClone(defaultFileTypes.html), config: { detectSteps: true } });
      assert.deepEqual(tests[0].steps.map((step) => Object.keys(step).filter((k) => k !== "location").sort()), [["runCode", "unsafe"], ["httpRequest"]]);
    });
  });

  describe("DITA", function () {
    it("counts steps as an explicit procedure, reading each cmd", async function () {
      const content = '<task id="t"><taskbody><steps>\n<step><cmd>Release notes</cmd></step>\n<step><cmd>Click <uicontrol>Save</uicontrol>.</cmd><substeps><substep><cmd>Wait.</cmd></substep></substeps></step>\n</steps></taskbody></task>\n';
      const result = await audit(content, { file: "task.dita" });
      const items = procedureSteps(result);
      assert.deepEqual(items.map((item) => [item.source, item.line]), [["explicit", 2], ["explicit", 3]]);
      assert.equal(items[1].state, "hasStep");
      assert.deepEqual(result.lists, { explicit: 1, tagged: 0, possible: 0 });
    });

    it("reads a step's text from its cmd only", async function () {
      const content = '<task id="t"><taskbody><steps><step><cmd>Open the app.</cmd><info>This takes a while.</info></step></steps></taskbody></task>\n';
      const result = await audit(content, { file: "task.dita" });
      assert.equal(procedureSteps(result)[0].text, "Open the app.");
    });

    it("reads an ol after a processing-instruction marker as explicit", async function () {
      const content = '<topic id="t"><body><?doc-detective procedure?>\n<ol><li>Release notes</li></ol></body></topic>\n';
      const result = await audit(content, { file: "topic.dita" });
      assert.equal(procedureSteps(result)[0].source, "explicit");
    });

    it("reads id on a codeblock", async function () {
      const index = emptyIndex();
      index.stepIds.set("install", [{ runShell: "npm i" }]);
      const content = '<topic id="t"><body><codeblock id="install" outputclass="language-bash">npm i</codeblock></body></topic>\n';
      const result = await audit(content, { file: "topic.dita", config: { detectSteps: false }, index });
      assert.equal(result.items.find((item) => item.kind === "codeBlock").state, "hasStep");
    });
  });

  describe("AsciiDoc", function () {
    it("reads dot and number lists through the tagger, top-level items only", async function () {
      const content = ["= Title", "", ". Open the app.", ".. Find the menu.", ". Close it.", "", "1. Release notes", "2. Bug fixes", ""].join("\n");
      const result = await audit(content, { file: "page.adoc" });
      assert.deepEqual(procedureSteps(result).map((item) => [item.source, item.line]), [["tagger", 3], ["tagger", 5], ["possible", 7], ["possible", 8]]);
    });

    it("keeps an attached block in its item and skips items inside listings", async function () {
      const content = [". Run the command:", "+", "----", ". not an item", "----", ". Close it.", ""].join("\n");
      const result = await audit(content, { file: "page.adoc" });
      assert.deepEqual(procedureSteps(result).map((item) => item.line), [1, 6]);
    });

    it("keeps an attached source block with an attribute line in its item", async function () {
      const content = [". Run this:", "+", "[source,bash]", "----", "npm test", "----", '// (step {"goTo":"https://example.com"})', ". Close it.", ""].join("\n");
      const result = await audit(content, { file: "page.adoc", config: { detectSteps: false } });
      assert.deepEqual(procedureSteps(result).map((item) => [item.line, item.state]), [[1, "hasStep"], [8, "untested"]]);
      assert.deepEqual(result.lists, { explicit: 0, tagged: 1, possible: 0 });
    });

    it("keeps a list open across a comment block, crediting the item above", async function () {
      const content = [". Open the app.", "////", '(step {"goTo":"https://example.com"})', "////", ". Close it.", ""].join("\n");
      const result = await audit(content, { file: "page.adoc", config: { detectSteps: false } });
      assert.deepEqual(procedureSteps(result).map((item) => [item.line, item.state]), [[1, "hasStep"], [5, "untested"]]);
      assert.deepEqual(result.lists, { explicit: 0, tagged: 1, possible: 0 });
    });

    it("credits the last item for a step comment right after it", async function () {
      const content = [". Open the app.", '// (step {"goTo":"https://example.com"})', ""].join("\n");
      const result = await audit(content, { file: "page.adoc", config: { detectSteps: false } });
      assert.equal(procedureSteps(result)[0].state, "hasStep");
    });

    it("continues an item through a wrapped line, and ends the list at a paragraph after a blank line", async function () {
      const content = [". Open the app", "and sign in.", "", "A paragraph.", "", ". Release notes", ""].join("\n");
      const result = await audit(content, { file: "page.adoc" });
      assert.deepEqual(procedureSteps(result).map((item) => [item.source, item.line]), [["tagger", 1], ["possible", 6]]);
      assert.deepEqual(result.lists, { explicit: 0, tagged: 1, possible: 1 });
    });

    it("counts a list after a procedure comment as explicit", async function () {
      const result = await audit("// (procedure)\n. Release notes\n", { file: "page.adoc" });
      assert.equal(procedureSteps(result)[0].source, "explicit");
    });

    it("reads id and role tags on a source block", async function () {
      const index = emptyIndex();
      index.stepIds.set("install", [{ runShell: "npm i" }]);
      const content = "Run this:\n\n[source#install.procedure,bash]\n----\nnpm i\n----\n";
      const result = await audit(content, { file: "page.adoc", config: { detectSteps: false }, index });
      assert.deepEqual(result.items.map((item) => [item.kind, item.state]), [["procedureStep", "hasStep"], ["codeBlock", "hasStep"]]);
    });
  });

  describe("canonicalUrl", function () {
    it("drops fragments and trailing slashes, and resolves against origin", function () {
      assert.equal(canonicalUrl("https://a.example/x/#y"), "https://a.example/x");
      assert.equal(canonicalUrl("/x", "https://a.example"), "https://a.example/x");
      assert.equal(canonicalUrl("/x"), null);
      assert.equal(canonicalUrl("mailto:a@b.co"), null);
    });
  });
});
