// Contract tests for `audit`'s guidance templates (ADR 01213). Each built-in
// template is read back through the real detection path and coverage
// calculation, so the guidance can't drift from what `audit` accepts.
import assert from "node:assert/strict";
import path from "node:path";
import { computeCoverage } from "../dist/audit/coverage.js";
import { SYNTAXES, syntaxFor, buildGuidance, keySyntaxes } from "../dist/audit/guidance.js";
import { detectTests } from "../dist/common/src/detectTests.js";
import { defaultFileTypes } from "../dist/common/src/fileTypes.js";

const root = path.resolve("/docs");
const fileTypeFor = (file) => structuredClone(Object.values(defaultFileTypes).find((ft) => ft.extensions.includes(path.extname(file).slice(1))));

async function audit(content, file, fileType = fileTypeFor(file)) {
  const filePath = path.join(root, file);
  const tests = await detectTests({ content, filePath, fileType, config: { detectSteps: true } });
  const index = { stepIds: new Map(), linkTargets: new Map(), screenshotFiles: new Map() };
  return computeCoverage({ content, fileType, filePath, steps: tests.flatMap((t) => t.steps), tests, index });
}

// How each syntax writes a page, a two-item list (with a statement inside the
// first item), and a bash code block from its `ignoreCodeBlock` opener.
const pages = {
  markdown: { file: "page.md", page: (b) => b, list: (a, b, mid = "") => `1. ${a}\n${mid && `   ${mid}\n`}2. ${b}\n`, block: (open) => `${open}\nnpm test\n\`\`\`\n` },
  mdx: { file: "page.mdx", page: (b) => b, list: (a, b, mid = "") => `1. ${a}\n${mid && `   ${mid}\n`}2. ${b}\n`, block: (open) => `${open}\nnpm test\n\`\`\`\n` },
  asciidoc: { file: "page.adoc", page: (b) => b, list: (a, b, mid = "") => `. ${a}\n${mid && `+\n${mid}\n`}. ${b}\n`, block: (open) => `${open}\n----\nnpm test\n----\n` },
  html: { file: "page.html", page: (b) => `<html><body>\n${b}\n</body></html>\n`, list: (a, b, mid = "") => `<ol>\n<li>${a} ${mid}</li>\n<li>${b}</li>\n</ol>`, block: (open) => `${open}npm test</code></pre>` },
  dita: { file: "page.dita", page: (b) => `<topic id="t"><title>T</title><body>\n${b}\n</body></topic>\n`, list: (a, b, mid = "") => `<ol>\n<li>${a} ${mid}</li>\n<li>${b}</li>\n</ol>`, block: (open) => `${open}npm test</codeblock>` },
};

const procedureStates = (result) => result.items.filter((i) => i.kind === "procedureStep").map((i) => i.state);

describe("audit guidance", function () {
  it("has templates for every built-in syntax", function () {
    assert.deepEqual(Object.keys(SYNTAXES).sort(), Object.keys(pages).sort());
  });

  for (const [name, p] of Object.entries(pages)) {
    describe(name, function () {
      const t = SYNTAXES[name];

      it("is the syntax of a file in its default file type", function () {
        assert.deepEqual(syntaxFor(fileTypeFor(p.file), path.join(root, p.file)), { syntax: name, custom: false });
      });

      it("credits an item with the step template", async function () {
        const result = await audit(p.page(p.list("Open the app.", "Close it.", t.step)), p.file);
        assert.deepEqual(procedureStates(result), ["hasStep", "untested"]);
      });

      it("credits the rest of a test with the test start and end templates", async function () {
        const result = await audit(p.page(`${t.testStart}\n\n${p.list("Open the app.", "Close it.", t.step)}\n\n${t.testEnd}`), p.file);
        assert.deepEqual(procedureStates(result), ["hasStep", "inTest"]);
      });

      it("ignores a list with the ignore templates", async function () {
        const result = await audit(p.page(`${t.ignoreStart}\n\n${p.list("Open the app.", "Close it.")}\n\n${t.ignoreEnd}`), p.file);
        assert.deepEqual(procedureStates(result), ["ignored", "ignored"]);
      });

      it("ignores a code block with the ignoreCodeBlock template", async function () {
        const result = await audit(p.page(p.block(t.ignoreCodeBlock)), p.file);
        assert.deepEqual(result.items.filter((i) => i.kind === "codeBlock").map((i) => [i.language, i.state]), [["bash", "ignored"]]);
      });

      it("makes a list explicit with the procedure template", async function () {
        const result = await audit(p.page(`${t.procedure}\n${p.list("Release notes", "Bug fixes")}`), p.file);
        assert.deepEqual(result.lists, { explicit: 1, tagged: 0, possible: 0 });
      });
    });
  }

  describe("a file type that doesn't read the built-in templates", function () {
    const hugo = {
      name: "hugo",
      extensions: ["md"],
      inlineStatements: {
        testStart: ["{{<\\s*test\\s*>}}"],
        testEnd: ["{{<\\s*test end\\s*>}}"],
        ignoreStart: ["{{<\\s*test ignore start\\s*>}}"],
        ignoreEnd: ["{{<\\s*test ignore end\\s*>}}"],
        step: ["{{<\\s*step\\s+([\\s\\S]*?)\\s*>}}"],
      },
    };

    it("takes the file type's name as its syntax", function () {
      assert.deepEqual(syntaxFor(hugo, path.join(root, "page.md")), { syntax: "hugo", custom: true, fileType: "hugo" });
    });

    it("gets its own key, apart from the built-in, when it's named like one", function () {
      const named = syntaxFor({ ...hugo, name: "markdown" }, path.join(root, "page.md"));
      assert.deepEqual(named, { syntax: "markdown", custom: true, fileType: "markdown" });
      const keyed = keySyntaxes([{ syntax: "markdown", custom: false }, named]);
      assert.deepEqual(keyed.map((s) => s.syntax), ["markdown", "markdown-custom"]);
      const { syntaxes } = buildGuidance(keyed);
      assert.deepEqual(syntaxes.markdown, SYNTAXES.markdown);
      assert.equal(syntaxes["markdown-custom"].custom, true);
      assert.match(syntaxes["markdown-custom"].note, /the `markdown` file type's/);
    });

    it("gets a key no other file type in the run has", function () {
      const custom = (name) => ({ syntax: name, custom: true, fileType: name });
      const keyed = keySyntaxes([custom("markdown"), custom("markdown-custom"), custom("markdown"), { syntax: "markdown", custom: false }]);
      assert.deepEqual(keyed.map((s) => s.syntax), ["markdown-custom-2", "markdown-custom", "markdown-custom-2", "markdown"]);
      const { syntaxes } = buildGuidance(keyed);
      assert.match(syntaxes["markdown-custom-2"].note, /the `markdown` file type's/);
      assert.match(syntaxes["markdown-custom"].note, /the `markdown-custom` file type's/);
    });

    it("gets templates when it's named like an Object property", function () {
      for (const name of ["constructor", "toString", "__proto__"]) {
        const { syntaxes } = buildGuidance([syntaxFor({ ...hugo, name }, path.join(root, "page.md"))]);
        assert.deepEqual(Object.keys(syntaxes), [name]);
        assert.equal(syntaxes[name].custom, true);
      }
    });

    it("gets the bare statements and a note", function () {
      const { syntaxes } = buildGuidance([{ syntax: "hugo", custom: true }]);
      assert.deepEqual(syntaxes.hugo, {
        custom: true,
        step: 'step {"click": "Save"}',
        testStart: 'test {"testId": "my-test"}',
        testEnd: "test end",
        ignoreStart: "test ignore start",
        ignoreEnd: "test ignore end",
        procedure: "procedure",
        note: "Wrap each statement in the comment form that the `hugo` file type's `inlineStatements` define.",
      });
    });
  });

  it("builds one key per syntax, and none when nothing was audited", function () {
    const builtIn = (syntax) => ({ syntax, custom: false });
    const guidance = buildGuidance([builtIn("markdown"), builtIn("markdown"), builtIn("mdx")]);
    assert.deepEqual(Object.keys(guidance.syntaxes), ["markdown", "mdx"]);
    assert.deepEqual(guidance.syntaxes.mdx, SYNTAXES.mdx);
    assert.equal(guidance.docs, "https://docs.doc-detective.com/docs/test-docs/audit-test-coverage");
    assert.deepEqual(buildGuidance([]).syntaxes, {});
  });
});
