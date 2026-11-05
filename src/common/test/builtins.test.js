import { expect } from "chai";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { detectTests } from "../dist/index.js";
import { defaultFileTypes } from "../dist/fileTypes.js";
import { validate } from "../dist/validate.js";
import { REGEX_FILE_TYPES } from "./fixtures/regex-fileTypes.js";

const BUILT_INS = ["markdown", "asciidoc", "html", "dita"];
const INTENTS = ["goTo", "checkLink", "click", "find", "screenshot", "type", "httpRequest", "runCode"];
const KINDS = ["comment", "codeBlock", "link", "image", "strong", "emphasis", "text", "element"];
const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

const actionNames = (def) => def.actions.map((a) => (typeof a === "string" ? a : Object.keys(a).find((k) => k !== "unsafe")));
const steps = async (content, fileType, filePath) => {
  const tests = await detectTests({ content, filePath, fileType, config: { detectSteps: true } });
  // v2 steps get random stepIds.
  return tests.map((t) => t.steps.map(({ location, stepId, ...s }) => s));
};

describe("built-in fileTypes", function () {
  for (const name of BUILT_INS) {
    describe(name, function () {
      const fileType = defaultFileTypes[name];

      it("detects every intent", function () {
        expect([...new Set(fileType.markup.flatMap(actionNames))].sort()).to.deep.equal([...INTENTS].sort());
      });

      it("uses selectors, not regex alone", function () {
        for (const def of fileType.markup) expect(KINDS.some((k) => k in def), def.name).to.equal(true);
        expect(Object.keys(fileType.inlineStatements)).to.deep.equal(["in"]);
      });

      it("is a valid custom fileType", function () {
        const result = validate({ schemaKey: "config_v3", object: { fileTypes: [structuredClone(fileType)] } });
        expect(result.valid, result.errors).to.equal(true);
      });
    });
  }

  it("shares one definition list across Markdown, AsciiDoc, and HTML", function () {
    expect(defaultFileTypes.asciidoc.markup).to.deep.equal(defaultFileTypes.markdown.markup);
    expect(defaultFileTypes.html.markup).to.deep.equal(defaultFileTypes.markdown.markup);
  });

  describe("code samples hold no tests", function () {
    const step = (s) => `{"runShell": "echo ${s}"}`;
    const cases = {
      "doc.md": `<!-- step ${step("prose")} -->\n\n\`\`\`md\n<!-- step ${step("fenced")} -->\n**fenced**\n\`\`\`\n`,
      "doc.html": `<!-- step ${step("prose")} -->\n<pre><!-- step ${step("fenced")} --><b>fenced</b></pre>\n`,
      "doc.dita": `<topic><body><!-- step ${step("prose")} --><codeblock><!-- step ${step("fenced")} --></codeblock></body></topic>`,
      "doc.adoc": `// (step ${step("prose")})\n\n----\n// (step ${step("fenced")})\n*fenced*\n----\n`,
    };
    for (const [file, content] of Object.entries(cases)) {
      it(file, async function () {
        expect(await steps(content, undefined, file)).to.deep.equal([[{ runShell: "echo prose" }]]);
      });
    }
  });

  it("opens a test with `test start`, and not with a comment that starts with `testing`", async function () {
    const content = '<!-- testing notes: x -->\n\n<!-- test start {"testId": "a"} -->\n\n<!-- step {"find": "b"} -->\n';
    const tests = await detectTests({ content, filePath: "doc.md", config: {} });
    expect(tests.map((t) => [t.testId, t.steps.map(({ location, ...s }) => s)])).to.deep.equal([["a", [{ find: "b" }]]]);
  });

  it("detects the same steps in every format", async function () {
    const docs = {
      "doc.md": 'Go to [the site](https://example.com), click **Search**, and type "kittens".\n\n![Results](results.png){.screenshot}\n',
      "doc.html": '<p>Go to <a href="https://example.com">the site</a>, click <strong>Search</strong>, and type "kittens".</p>\n<img src="results.png" class="screenshot">\n',
      "doc.adoc": 'Go to https://example.com[the site], click *Search*, and type "kittens".\n\n[.screenshot]\nimage::results.png[Results]\n',
      "doc.dita": '<topic><body><p>Go to <xref href="https://example.com" scope="external">the site</xref>, click <b>Search</b>, and type "kittens".</p><image href="results.png" outputclass="screenshot"/></body></topic>',
    };
    const expected = [{ goTo: "https://example.com" }, { checkLink: "https://example.com" }, { click: "Search" }, { find: "Search" }, { type: "kittens" }, { screenshot: "results.png" }];
    for (const [file, content] of Object.entries(docs)) {
      expect(await steps(content, undefined, file), file).to.deep.equal([expected]);
    }
  });

  it("detects code blocks in every format", async function () {
    const docs = {
      "doc.md": "```bash\necho hi\n```\n\n```http\nGET https://example.com/a HTTP/1.1\n```\n",
      "doc.html": '<pre><code class="language-bash">echo hi</code></pre>\n<pre><code class="language-http">GET https://example.com/a HTTP/1.1</code></pre>\n',
      "doc.adoc": "[source,bash]\n----\necho hi\n----\n\n[source,http]\n----\nGET https://example.com/a HTTP/1.1\n----\n",
      "doc.dita": '<topic><body><codeblock outputclass="language-bash">echo hi</codeblock><codeblock outputclass="language-http">GET https://example.com/a HTTP/1.1</codeblock></body></topic>',
    };
    for (const [file, content] of Object.entries(docs)) {
      const [[run, http]] = await steps(content, undefined, file);
      expect(run, file).to.deep.equal({ unsafe: true, runCode: { language: "bash", code: "echo hi" } });
      expect(http.httpRequest, file).to.deep.include({ method: "GET", url: "https://example.com/a" });
    }
  });

  // Each fixture detects the same steps as the frozen regex tables, except
  // the differences listed here, each on purpose.
  describe("parity with the regex tables", function () {
    // The regex tables matched an external <xref> with two goTo rules and two
    // checkLink rules. Each is one rule now, so the copies go, in order.
    const dropsDuplicateXrefSteps = (before, after) => {
      const b = before.flat().map((s) => JSON.stringify(s));
      const a = after.flat().map((s) => JSON.stringify(s));
      const removed = [];
      let j = 0;
      for (const step of b) {
        if (step === a[j]) j++;
        else removed.push(step);
      }
      expect(j, "after keeps the regex order").to.equal(a.length);
      expect(removed).to.not.be.empty;
      for (const step of removed) {
        expect(Object.keys(JSON.parse(step))[0]).to.be.oneOf(["goTo", "checkLink"]);
        expect(a).to.include(step);
      }
    };
    const INTENDED = {
      "dita-detect.dita": dropsDuplicateXrefSteps,
      "dita-links.dita": dropsDuplicateXrefSteps,
      "dita-mixed.dita": dropsDuplicateXrefSteps,
    };
    for (const file of readdirSync(fixtures).filter((f) => /\.(md|dita|adoc|html)$/.test(f))) {
      it(file, async function () {
        const content = readFileSync(join(fixtures, file), "utf8");
        const ext = file.split(".").pop();
        const name = { md: "markdown", dita: "dita", adoc: "asciidoc", html: "html" }[ext];
        const before = await steps(content, REGEX_FILE_TYPES[name], file);
        const after = await steps(content, defaultFileTypes[name], file);
        if (INTENDED[file]) INTENDED[file](before, after);
        else expect(after).to.deep.equal(before);
      });
    }
  });
});
