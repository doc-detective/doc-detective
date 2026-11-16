import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { expandIncludes, MAX_INCLUDE_DEPTH } from "../dist/core/includes.js";

const markdown = { name: "markdown", extensions: ["md", "markdown", "mdx"] };
const asciidoc = { name: "asciidoc", extensions: ["adoc"] };
const rst = { name: "rst", extensions: ["rst"] };
const fileTypes = [markdown, asciidoc, rst];

describe("expandIncludes", function () {
  let root;
  let messages;
  const write = (rel, content) => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  };
  // Expands a file written under the temp root, the way detection would.
  const expand = (rel, fileType, extra = {}) => {
    const filePath = path.join(root, rel);
    return expandIncludes({
      content: fs.readFileSync(filePath, "utf8"),
      filePath,
      fileType,
      config: { fileTypes },
      root,
      report: (level, message) => messages.push([level, message]),
      ...extra,
    });
  };
  const warnings = () => messages.filter(([level]) => level === "warning").map(([, m]) => m);
  const real = (rel) => fs.realpathSync(path.join(root, rel));

  beforeEach(function () {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dd-includes-")));
    messages = [];
  });
  afterEach(function () {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe("AsciiDoc", function () {
    it("replaces an include with the file's content, nested, and maps offsets back to each file", function () {
      write("guide.adoc", "Intro\ninclude::parts/a.adoc[]\nOutro\n");
      write("parts/a.adoc", "A1\ninclude::b.adoc[]\nA3\n");
      write("parts/b.adoc", "B1\n");
      const x = expand("guide.adoc", asciidoc);
      assert.equal(x.content, "Intro\nA1\nB1\nA3\nOutro\n");
      assert.deepEqual([...x.included].sort(), [real("parts/a.adoc"), real("parts/b.adoc")].sort());
      const b = x.content.indexOf("B1");
      assert.deepEqual(x.mapLocation({ startIndex: b, endIndex: b + 2 }), {
        file: real("parts/b.adoc"), startIndex: 0, endIndex: 2, line: 1,
      });
      const outro = x.content.indexOf("Outro");
      assert.deepEqual(x.mapLocation({ startIndex: outro, endIndex: outro + 5 }), {
        file: path.join(root, "guide.adoc"), startIndex: 30, endIndex: 35, line: 3,
      });
      assert.deepEqual(warnings(), []);
    });

    it("honors lines, tag, tags, and an attribute in the path", function () {
      write("guide.adoc", [
        ":partials: parts",
        "include::{partials}/s.adoc[lines=2..3;5..-1]",
        "include::parts/s.adoc[tag=one]",
        "include::parts/s.adoc[tags=one;two]",
        "",
      ].join("\n"));
      write("parts/s.adoc", "L1\nL2\nL3\nL4\nL5\nL6\n// tag::one[]\nONE\n// end::one[]\n// tag::two[]\nTWO\n// end::two[]\n");
      const x = expand("guide.adoc", asciidoc);
      assert.equal(x.content.split("\n").slice(1).join("\n"), [
        "L2", "L3", "L5", "L6", "// tag::one[]", "ONE", "// end::one[]", "// tag::two[]", "TWO", "// end::two[]",
        "ONE",
        "ONE", "TWO",
        "",
      ].join("\n"));
      assert.deepEqual(warnings(), []);
    });

    it("reads lines=N.. as running to the last line", function () {
      write("guide.adoc", "include::s.adoc[lines=3..]\n");
      write("s.adoc", "L1\nL2\nL3\nL4\n");
      assert.equal(expand("guide.adoc", asciidoc).content, "L3\nL4\n");
      assert.deepEqual(warnings(), []);
    });

    it("warns for a missing file, unless the include is optional", function () {
      write("guide.adoc", "include::nope.adoc[]\ninclude::gone.adoc[opts=optional]\n");
      const x = expand("guide.adoc", asciidoc);
      assert.equal(x.content, "include::nope.adoc[]\ninclude::gone.adoc[opts=optional]\n");
      assert.deepEqual(warnings(), [
        `Couldn't include \`nope.adoc\` from ${path.join(root, "guide.adoc")}:1 because ${path.join(root, "nope.adoc")} doesn't exist or can't be read.`,
      ]);
    });

    it("warns when a tag isn't found and includes nothing", function () {
      write("guide.adoc", "include::s.adoc[tag=missing]\n");
      write("s.adoc", "x\n");
      const x = expand("guide.adoc", asciidoc);
      assert.equal(x.content, "\n");
      assert.deepEqual(warnings(), [
        `Couldn't find \`missing\` in ${real("s.adoc")}, included from ${path.join(root, "guide.adoc")}:1.`,
      ]);
    });

    it("leaves an escaped include alone", function () {
      write("guide.adoc", "\\include::s.adoc[]\n");
      write("s.adoc", "x\n");
      assert.equal(expand("guide.adoc", asciidoc).content, "\\include::s.adoc[]\n");
    });
  });

  describe("Markdown", function () {
    it("resolves mdBook includes with line ranges and anchors, and skips escaped ones", function () {
      write("guide.md", [
        "{{#include s.md}}",
        "{{#include s.md:2:3}}",
        "{{#include s.md:2:}}",
        "{{#include s.md::1}}",
        "{{#include s.md:4}}",
        "{{#include a.md:part}}",
        "\\{{#include s.md}}",
        "",
      ].join("\n"));
      write("s.md", "1\n2\n3\n4\n");
      write("a.md", "x\n<!-- ANCHOR: part -->\nP\n<!-- ANCHOR_END: part -->\ny\n");
      const lines = expand("guide.md", markdown).content.split("\n");
      assert.deepEqual(lines, ["1", "2", "3", "4", "2", "3", "2", "3", "4", "1", "4", "P", "\\{{#include s.md}}", ""]);
    });

    it("resolves MkDocs snippets against the root, keeps the indent, and honors sections", function () {
      write("docs/guide.md", ["- item", "    --8<-- \"snips/s.md\"", "--8<-- \"snips/s.md:sec\"", "--8<-- 'snips/s.md:2:2'", ""].join("\n"));
      write("snips/s.md", "S1\nS2\n<!-- --8<-- [start:sec] -->\nSEC\n<!-- --8<-- [end:sec] -->\n");
      const lines = expand("docs/guide.md", markdown).content.split("\n");
      assert.deepEqual(lines.slice(0, 6), ["- item", "    S1", "    S2", "    SEC", "SEC", "S2"]);
      assert.deepEqual(warnings(), []);
    });

    it("resolves Fern <Markdown src>, but not inside a fenced code block", function () {
      write("guide.mdx", ['<Markdown src="snips/s.md" />', "```mdx", '<Markdown src="snips/s.md" />', "```", ""].join("\n"));
      write("snips/s.md", "S\n");
      assert.equal(expand("guide.mdx", markdown).content, ["S", "```mdx", '<Markdown src="snips/s.md" />', "```", ""].join("\n"));
    });

    it("resolves MDX imports: default, @site/, Mintlify /snippets, { Content }, { Content as X }, and * as X", function () {
      write("site/docusaurus.config.js", "");
      write("site/docs/_d.mdx", "D\n");
      write("site/docs/guide.mdx", [
        "import D from './_d.mdx';",
        "import S from '@site/docs/_d.mdx';",
        "import Alias from '~/components/x.mdx';",
        "",
        "<D />",
        "<S/>",
        "<Alias />",
        "",
      ].join("\n"));
      const d = expandIncludes({
        content: fs.readFileSync(path.join(root, "site/docs/guide.mdx"), "utf8"),
        filePath: path.join(root, "site/docs/guide.mdx"), fileType: markdown, config: { fileTypes }, root,
        report: (level, message) => messages.push([level, message]),
      });
      assert.deepEqual(d.content.split("\n").slice(4, 7), ["D", "D", "<Alias />"]);

      write("mint/docs.json", "{}");
      write("mint/snippets/s.mdx", "M\n");
      write("mint/guides/page.mdx", "import Snip from '/snippets/s.mdx';\n\n<Snip />\n");
      assert.equal(expand("mint/guides/page.mdx", markdown).content.split("\n")[2], "M");

      write("star/_p.md", "P\n");
      write("star/page.mdx", [
        "import { Content } from './_p.md';",
        "import { Content as Two } from './_p.md';",
        "import * as Three from './_p.md';",
        "<Content />",
        "<Two />",
        "<Three.Content />",
        "",
      ].join("\n"));
      assert.deepEqual(expand("star/page.mdx", markdown).content.split("\n").slice(3, 6), ["P", "P", "P"]);
      assert.deepEqual(warnings(), []);
    });
  });

  it("turns a Markdown partial's HTML comments into MDX comments, at the same offsets, outside code fences", function () {
    write("page.mdx", "import { Content } from './_p.md';\n<Content />\n");
    write("_p.md", '<!-- step {"find": "x"} -->\n```html\n<!-- kept -->\n```\n');
    const x = expand("page.mdx", markdown);
    const body = x.content.split("\n").slice(1).join("\n");
    assert.equal(body, '{/*  step {"find": "x"} */}\n```html\n<!-- kept -->\n```\n');
    const source = '<!-- step {"find": "x"} -->';
    const at = x.content.indexOf("{/*");
    const end = x.content.indexOf("*/}") + 3;
    assert.equal(end - at, source.length);
    assert.deepEqual(x.mapLocation({ startIndex: at, endIndex: end }), { file: real("_p.md"), startIndex: 0, endIndex: source.length, line: 1 });
  });

  it("converts a multiline HTML comment from a line-selected region into one MDX comment", function () {
    write("page.mdx", "{{#include _p.md:a}}\n");
    write("_p.md", "ANCHOR: a\n<!--\nstep {\"find\": \"x\"}\n-->\nANCHOR_END: a\n");
    assert.equal(expand("page.mdx", markdown).content, '{/* \nstep {"find": "x"}\n*/}\n');
  });

  it("doesn't close a fence on a line with an info string", function () {
    write("page.mdx", "```md\n```mdx\n<Markdown src=\"_p.md\" />\n```\n");
    write("_p.md", "P\n");
    assert.equal(expand("page.mdx", markdown).content, "```md\n```mdx\n<Markdown src=\"_p.md\" />\n```\n");
  });

  it("doesn't close a fence on a line ending in a non-breaking space", function () {
    write("page.mdx", "```md\n``` \n<Markdown src=\"_p.md\" />\n```\n");
    write("_p.md", "P\n");
    assert.equal(expand("page.mdx", markdown).content, "```md\n``` \n<Markdown src=\"_p.md\" />\n```\n");
  });

  it("reads MDX imports from the whole included file when only part of it is selected", function () {
    write("page.md", "{{#include _p.mdx:2}}\n");
    write("_p.mdx", "import Setup from './_setup.md';\n<Setup />\n");
    write("_setup.md", "SETUP\n");
    assert.equal(expand("page.md", markdown).content, "SETUP\n");
  });

  it("ignores an MDX import inside a fenced code block", function () {
    write("page.mdx", "import Setup from './_real.md';\n\n```mdx\nimport Setup from './_example.md';\n```\n\n<Setup />\n");
    write("_real.md", "REAL\n");
    write("_example.md", "EXAMPLE\n");
    assert.match(expand("page.mdx", markdown).content, /REAL/);
  });

  it("substitutes an AsciiDoc attribute set inside an earlier include", function () {
    write("guide.adoc", "include::attrs.adoc[]\ninclude::{snippet}[]\n");
    write("attrs.adoc", ":snippet: setup.adoc\n");
    write("setup.adoc", "SETUP\n");
    assert.match(expand("guide.adoc", asciidoc).content, /SETUP/);
    assert.deepEqual(warnings(), []);
  });

  describe("reStructuredText", function () {
    it("resolves includes with options, indent, and the conf.py root, and skips literal and standard includes", function () {
      write("conf.py", "");
      write("shared/s.rst", "0\n1\n2\n3\nSTART\nmid\nEND\n");
      write("docs/guide.rst", [
        ".. include:: ../shared/s.rst",
        "   :start-line: 1",
        "   :end-line: 3",
        "",
        "  .. include:: /shared/s.rst",
        "     :start-after: START",
        "     :end-before: END",
        "",
        ".. include:: ../shared/s.rst",
        "   :literal:",
        ".. include:: <isonum.txt>",
        "",
      ].join("\n"));
      const lines = expand("docs/guide.rst", rst).content.split("\n");
      assert.deepEqual(lines.slice(0, 5), ["1", "2", "", "  ", "  mid"]);
      assert.equal(lines[6], ".. include:: ../shared/s.rst");
      assert.ok(lines.includes(".. include:: <isonum.txt>"));
      assert.deepEqual(warnings(), []);
    });
  });

  it("applies rST include syntax only to the rst fileType, not to any .rst file", function () {
    write("page.rst", ".. include:: s.rst\n");
    write("s.rst", "S\n");
    assert.equal(expand("page.rst", { name: "rest", extensions: ["rst"] }).content, ".. include:: s.rst\n");
    assert.equal(expand("page.rst", { extends: "rst", extensions: ["rst"] }).content, "S\n");
  });

  it("resolves a custom fileType's includeStatements, whole file", function () {
    write("guide.txt", "x\n{% include \"s.txt\" %}\ny\n");
    write("s.txt", "S\n");
    const custom = { name: "liquid", extensions: ["txt"], includeStatements: ['\\{% include "([^"]+)" %\\}'] };
    assert.equal(expand("guide.txt", custom).content, "x\nS\ny\n");
  });

  describe("guards", function () {
    it("stops a cycle and names the chain", function () {
      write("a.md", "{{#include b.md}}\n");
      write("b.md", "{{#include a.md}}\n");
      const x = expand("a.md", markdown);
      assert.equal(x.content, "{{#include a.md}}\n");
      assert.deepEqual(warnings(), [
        `Couldn't include \`a.md\` from ${real("b.md")}:1 because it includes itself: ${real("a.md")} → ${real("b.md")} → ${real("a.md")}.`,
      ]);
    });

    it("includes the same file twice in one page without calling it a cycle", function () {
      write("a.md", "{{#include s.md}}\n{{#include s.md}}\n");
      write("s.md", "S\n");
      assert.equal(expand("a.md", markdown).content, "S\nS\n");
      assert.deepEqual(warnings(), []);
    });

    it("refuses a file outside the root", function () {
      const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dd-outside-")));
      try {
        fs.writeFileSync(path.join(outside, "s.md"), "S\n");
        const target = path.relative(root, path.join(outside, "s.md")).split(path.sep).join("/");
        write("a.md", `{{#include ${target}}}\n`);
        const x = expand("a.md", markdown);
        assert.equal(x.content, `{{#include ${target}}}\n`);
        assert.deepEqual(warnings(), [
          `Couldn't include \`${target}\` from ${path.join(root, "a.md")}:1 because ${path.join(outside, "s.md")} is outside the working directory ${root}. Run Doc Detective from a directory that contains both files.`,
        ]);
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });

    it("refuses a symlink that leads outside the root", function () {
      const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dd-outside-")));
      try {
        fs.writeFileSync(path.join(outside, "s.md"), "S\n");
        try {
          fs.symlinkSync(path.join(outside, "s.md"), path.join(root, "link.md"));
        } catch {
          this.skip(); // Symlinks need privileges on some Windows hosts.
        }
        write("a.md", "{{#include link.md}}\n");
        assert.equal(expand("a.md", markdown).content, "{{#include link.md}}\n");
        assert.match(warnings()[0], /is outside the working directory/);
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });

    it("stops past the depth limit", function () {
      for (let i = 0; i <= MAX_INCLUDE_DEPTH + 1; i++) write(`d${i}.md`, `${i}\n{{#include d${i + 1}.md}}\n`);
      write(`d${MAX_INCLUDE_DEPTH + 2}.md`, "end\n");
      expand("d0.md", markdown);
      assert.equal(warnings().length, 1);
      assert.match(warnings()[0], /because includes nest more than 64 levels deep\.$/);
    });

    it("skips a URL target", function () {
      write("guide.adoc", "include::https://user:secret@example.com/s.adoc[]\n");
      expand("guide.adoc", asciidoc);
      assert.equal(warnings().length, 1);
      assert.match(warnings()[0], /^Skipped: include `.*example\.com\/s\.adoc` from .*guide\.adoc:1\. Detection reads only local files\.$/);
      assert.doesNotMatch(warnings()[0], /secret/);
    });

    it("reads a nested file with its own fileType's syntax", function () {
      write("page.adoc", "include::s.md[]\n");
      write("s.md", "{{#include t.md}}\n");
      write("t.md", "T\n");
      assert.equal(expand("page.adoc", asciidoc).content, "T\n");
    });

    it("keeps CRLF offsets exact", function () {
      write("a.md", "x\r\n{{#include s.md}}\r\ny\r\n");
      write("s.md", "S1\r\nS2\r\n");
      const x = expand("a.md", markdown);
      assert.equal(x.content, "x\r\nS1\r\nS2\r\ny\r\n");
      const s2 = x.content.indexOf("S2");
      assert.deepEqual(x.mapLocation({ startIndex: s2, endIndex: s2 + 2 }), { file: real("s.md"), startIndex: 4, endIndex: 6, line: 2 });
    });

    it("returns the content unchanged, with an identity map, when nothing is included", function () {
      write("a.md", "plain\n");
      const x = expand("a.md", markdown);
      assert.equal(x.content, "plain\n");
      assert.equal(x.included.size, 0);
    });
  });
});

describe("detection with includes", function () {
  this.timeout(30000);
  let root;
  let cwd;
  let setConfig;
  let detectTests;
  const write = (rel, content) => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  };
  const run = async (overrides = {}) => {
    const config = await setConfig({ config: { logLevel: "silent", input: [root], detectSteps: false, ...overrides } });
    return detectTests({ config });
  };

  before(async function () {
    ({ setConfig } = await import("../dist/core/config.js"));
    ({ detectTests } = await import("../dist/core/detectTests.js"));
  });
  beforeEach(function () {
    cwd = process.cwd();
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dd-includes-detect-")));
    // Includes must stay inside the working directory.
    process.chdir(root);
    write("guide.md", [
      '<!-- test {"testId": "guide"} -->',
      '<!-- step {"runShell": "echo one"} -->',
      "{{#include _partials/setup.md}}",
      '<!-- step {"runShell": "echo three"} -->',
      "<!-- test end -->",
      "",
    ].join("\n"));
    write("_partials/setup.md", 'Setup\n<!-- step {"runShell": "echo two"} -->\n');
  });
  afterEach(function () {
    process.chdir(cwd);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("runs included steps in reading order, points their location at the partial, and doesn't run the partial alone", async function () {
    const specs = await run();
    assert.deepEqual(specs.map((s) => path.basename(s.contentPath)), ["guide.md"]);
    const [test] = specs[0].tests;
    assert.deepEqual(test.steps.map((s) => s.runShell.command ?? s.runShell), ["echo one", "echo two", "echo three"]);
    assert.equal(test.location.file, undefined);
    assert.deepEqual(test.steps[1].location, {
      line: 2, startIndex: 6, endIndex: 44, file: path.join(root, "_partials", "setup.md"),
    });
    assert.equal(test.steps[2].location.line, 4);
    assert.equal(test.steps[2].location.file, undefined);
  });

  it("leaves includes alone when resolveIncludes is false", async function () {
    const specs = await run({ resolveIncludes: false });
    assert.deepEqual(specs.map((s) => path.basename(s.contentPath)).sort(), ["guide.md", "setup.md"]);
    const guide = specs.find((s) => s.contentPath.endsWith("guide.md"));
    assert.equal(guide.tests[0].steps.length, 2);
  });

  it("still runs a partial given alone", async function () {
    const specs = await run({ input: [path.join(root, "_partials", "setup.md")] });
    assert.equal(specs.length, 1);
  });

  it("runs one file of an include cycle", async function () {
    write("a.md", '{{#include b.md}}\n<!-- step {"runShell": "echo a"} -->\n');
    write("b.md", '{{#include a.md}}\n<!-- step {"runShell": "echo b"} -->\n');
    fs.rmSync(path.join(root, "guide.md"));
    fs.rmSync(path.join(root, "_partials"), { recursive: true });
    const specs = await run();
    // Which file survives depends on input order; exactly one must run.
    assert.equal(specs.length, 1);
    assert.ok(["a.md", "b.md"].includes(path.basename(specs[0].contentPath)));
  });
});
