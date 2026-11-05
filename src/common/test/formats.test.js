import { expect } from "chai";
import sinon from "sinon";
import { detectTests } from "../dist/index.js";
import { parseMarkup } from "../dist/detect/markup.js";
import { parseAsciidoc } from "../dist/detect/asciidoc.js";
import { parseMarkdown } from "../dist/detect/markdown.js";

// Runs detection on a string with one custom fileType, collecting warnings.
async function detect(content, fileType, filePath) {
  const warn = sinon.stub(console, "warn");
  try {
    const tests = await detectTests({ content, filePath, fileType, config: { detectSteps: true } });
    return { steps: tests.flatMap((t) => t.steps).map(({ location, ...s }) => s), warnings: warn.args.map((a) => a[0]) };
  } finally {
    warn.restore();
  }
}
const pick = (nodes, kind) => nodes.filter((n) => n.kind === kind);
const sourceOf = (content, n) => content.slice(n.startIndex, n.endIndex);

describe("formats", function () {
  describe("HTML", function () {
    const html = [
      "<!DOCTYPE html>",
      '<html><body><!-- test {"testId": "a"} -->',
      '<p>Go to <a href="https://x.com" title="X" class="ext">the site</a>, then click <strong>Save</strong> or <b>Keep</b>, and see <em>Results</em> or <i>more</i>.</p>',
      '<p>Type &quot;a&quot; and <code>Type "code"</code>.</p>',
      '<img src="s.png" alt="Shot" class="screenshot wide">',
      '<pre><code class="language-bash">echo &lt;hi&gt;\n&lt;!-- step {"find": "no"} --&gt;</code></pre>',
      '<pre><!-- step {"find": "no"} --><b>plain</b></pre>',
      "<script>var a = '<!-- test -->';</script>",
      '<button data-x="1">Go</button>',
      "</body></html>",
    ].join("\n");
    const nodes = parseMarkup(html, "html");

    it("reads comments outside code, with exact spans", function () {
      const comments = pick(nodes, "comment");
      expect(comments.map((c) => c.content)).to.deep.equal(['test {"testId": "a"}']);
      expect(sourceOf(html, comments[0])).to.equal('<!-- test {"testId": "a"} -->');
    });

    it("reads links, images, and formatting", function () {
      const link = pick(nodes, "link")[0];
      expect(link).to.include({ url: "https://x.com", title: "X", text: "the site", before: "Go to " });
      expect(link.attributes).to.deep.equal({ href: "https://x.com", title: "X", class: "ext" });
      expect(sourceOf(html, link)).to.equal('<a href="https://x.com" title="X" class="ext">the site</a>');
      expect(pick(nodes, "strong").map((n) => n.text)).to.deep.equal(["Save", "Keep"]);
      expect(pick(nodes, "emphasis").map((n) => n.text)).to.deep.equal(["Results", "more"]);
      expect(pick(nodes, "strong")[0].before).to.equal('Go to <a href="https://x.com" title="X" class="ext">the site</a>, then click ');
      expect(pick(nodes, "image")[0]).to.include({ src: "s.png", alt: "Shot" });
      expect(pick(nodes, "image")[0].attributes.class).to.equal("screenshot wide");
    });

    it("reads code blocks, with a language from the class", function () {
      const blocks = pick(nodes, "codeBlock");
      expect(blocks.map((b) => [b.language, b.meta, b.content])).to.deep.equal([
        ["bash", "", 'echo <hi>\n<!-- step {"find": "no"} -->'],
        ["", "", "plain"],
      ]);
    });

    it("reads prose as raw source, outside code and formatting", function () {
      const texts = pick(nodes, "text").map((n) => n.text);
      expect(texts).to.include("Type &quot;a&quot; and ");
      expect(texts.some((t) => t.includes("code") || t.includes("Save") || t.includes("var a"))).to.equal(false);
      for (const n of pick(nodes, "text")) expect(sourceOf(html, n)).to.equal(n.text);
    });

    it("reads other tags as elements", function () {
      const button = pick(nodes, "element").find((n) => n.tag === "button");
      expect(button).to.include({ content: "Go" });
      expect(button.attributes).to.deep.equal({ "data-x": "1" });
    });

    it("handles links without href, images without src, and code without a class", function () {
      const nodes = parseMarkup('<p><a name="top">Top</a> <img alt="A" title="T"></p><pre><code>x</code></pre>', "html");
      expect(pick(nodes, "link")).to.deep.equal([]);
      expect(pick(nodes, "element").find((n) => n.tag === "a")).to.include({ content: "Top" });
      expect(pick(nodes, "image")[0]).to.include({ src: "", alt: "A", title: "T" });
      expect(pick(nodes, "codeBlock")[0]).to.include({ language: "", content: "x" });
    });

    it("never throws on broken markup", function () {
      expect(() => parseMarkup("<p><b>unclosed <a href='x'>", "html")).not.to.throw();
      expect(pick(parseMarkup("<p><b>unclosed", "html"), "strong")[0]).to.include({ text: "unclosed" });
    });
  });

  describe("DITA", function () {
    const dita = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE task PUBLIC "-//OASIS//DTD DITA Task//EN" "task.dtd">',
      '<task id="t"><title>T</title><taskbody>',
      '<?doc-detective test {"testId": "dita"} ?>',
      '<data name="doc-detective" value=\'step {"find": "x"}\'/>',
      "<steps><step><cmd>Type <userinput>kittens</userinput> into the <uicontrol>Search</uicontrol> box, then click <b>Go</b>.</cmd></step></steps>",
      '<codeblock outputclass="language-bash">echo hi</codeblock>',
      '<p>See <xref href="https://x.com" scope="external">X</xref> and <i>this</i>.</p>',
      '<image href="s.png" outputclass="screenshot"><alt>Shot</alt></image>',
      "<!-- test end -->",
      "</taskbody></task>",
    ].join("\n");
    const nodes = parseMarkup(dita, "dita");

    it("reads comments and doc-detective processing instructions", function () {
      expect(pick(nodes, "comment").map((c) => c.content)).to.deep.equal(['test {"testId": "dita"}', "test end"]);
    });

    it("reads elements, with attributes and content", function () {
      const data = pick(nodes, "element").find((n) => n.tag === "data");
      expect(data.attributes).to.deep.equal({ name: "doc-detective", value: 'step {"find": "x"}' });
      const control = pick(nodes, "element").find((n) => n.tag === "uicontrol");
      expect(control).to.include({ content: "Search", before: "Type <userinput>kittens</userinput> into the " });
      expect(pick(nodes, "element").find((n) => n.tag === "xref").attributes).to.deep.equal({ href: "https://x.com", scope: "external" });
    });

    it("maps b, i, codeblock, and image to their kinds", function () {
      expect(pick(nodes, "strong").map((n) => n.text)).to.deep.equal(["Go"]);
      expect(pick(nodes, "emphasis").map((n) => n.text)).to.deep.equal(["this"]);
      expect(pick(nodes, "codeBlock")[0]).to.include({ language: "bash", content: "echo hi" });
      const image = pick(nodes, "image")[0];
      expect(image).to.include({ src: "s.png", alt: "Shot" });
      expect(image.attributes).to.deep.equal({ href: "s.png", outputclass: "screenshot", class: "screenshot" });
      expect(pick(nodes, "link")).to.deep.equal([]);
    });

    it("keeps tag case", function () {
      expect(pick(parseMarkup("<Topic><MyTag>x</MyTag></Topic>", "dita"), "element").map((n) => n.tag)).to.deep.equal(["Topic", "MyTag"]);
    });
  });

  describe("AsciiDoc", function () {
    const adoc = [
      "= Title",
      ":toc:",
      "",
      '// (test {"testId": "adoc"})',
      "Go to https://x.com[the site] or link:https://y.com[Y], then click *Save* and **Keep**.",
      "See _Results_ and __more__, but not `*code*` or snake_case_name.",
      "",
      "////",
      'step {"find": "block"}',
      "////",
      "",
      "[source,python,testIgnore]",
      "----",
      '// (step {"find": "no"})',
      "print(1)",
      "----",
      "",
      "....",
      "literal",
      "....",
      "",
      "[.screenshot]",
      "image::a.png[Alt A]",
      "",
      'image::b.png[Alt B, role="screenshot wide", width=100]',
      "",
      "Inline image:c.png[] here.",
      "",
      "  indented literal *not bold*",
      "",
      "Text // (step not a comment)",
      "",
      "* list item with *bold*",
    ].join("\n");
    const nodes = parseAsciidoc(adoc);

    it("reads line and block comments at the start of a line", function () {
      expect(pick(nodes, "comment").map((c) => c.content)).to.deep.equal(['(test {"testId": "adoc"})', 'step {"find": "block"}']);
    });

    it("reads links in both forms", function () {
      expect(pick(nodes, "link").map((n) => [n.url, n.text, n.before])).to.deep.equal([
        ["https://x.com", "the site", "Go to "],
        ["https://y.com", "Y", "Go to https://x.com[the site] or "],
      ]);
    });

    it("reads constrained and unconstrained formatting, but not code or words", function () {
      expect(pick(nodes, "strong").map((n) => n.text)).to.deep.equal(["Save", "Keep", "bold"]);
      expect(pick(nodes, "emphasis").map((n) => n.text)).to.deep.equal(["Results", "more"]);
    });

    it("reads listings with language and meta, and literal blocks", function () {
      expect(pick(nodes, "codeBlock").map((b) => [b.language, b.meta, b.content])).to.deep.equal([
        ["python", "testIgnore", '// (step {"find": "no"})\nprint(1)'],
        ["", "", "literal"],
      ]);
    });

    it("reads images, with roles as classes", function () {
      expect(pick(nodes, "image").map((n) => [n.src, n.alt, n.attributes?.class])).to.deep.equal([
        ["a.png", "Alt A", "screenshot"],
        ["b.png", "Alt B", "screenshot wide"],
        ["c.png", "", undefined],
      ]);
    });

    it("skips indented literal paragraphs and attribute entries", function () {
      const texts = pick(nodes, "text").map((n) => n.text);
      expect(texts.some((t) => t.includes("indented") || t.includes(":toc:"))).to.equal(false);
      expect(texts).to.include("Text // (step not a comment)");
      for (const n of pick(nodes, "text")) expect(sourceOf(adoc, n)).to.equal(n.text);
    });

    it("handles IDs, bare source lines, passthrough blocks, long literal paragraphs, and empty link text", function () {
      const nodes = parseAsciidoc([
        "[#intro.screenshot]",
        "image::a.png[A]",
        "",
        "[source]",
        "----",
        "x",
        "----",
        "",
        "++++",
        '<!-- step {"find": "no"} -->',
        "++++",
        "",
        "  literal one",
        "  literal two *no*",
        "",
        "See https://x.com[].",
      ].join("\n"));
      expect(pick(nodes, "image")[0].attributes).to.deep.equal({ id: "intro", class: "screenshot" });
      expect(pick(nodes, "codeBlock")[0]).to.include({ language: "", meta: "", content: "x" });
      expect(pick(nodes, "comment")).to.deep.equal([]);
      expect(pick(nodes, "strong")).to.deep.equal([]);
      expect(pick(nodes, "link")[0]).to.include({ url: "https://x.com", text: "https://x.com" });
    });

    it("handles CRLF and unclosed blocks", function () {
      const crlf = parseAsciidoc("// (step {})\r\n----\r\nopen");
      expect(pick(crlf, "comment")[0]).to.include({ content: "(step {})", endIndex: 12 });
      expect(pick(crlf, "codeBlock")[0]).to.include({ content: "open" });
      expect(pick(parseAsciidoc("////\nnever closed"), "comment")[0]).to.include({ content: "never closed" });
    });
  });

  describe("HTML inside Markdown", function () {
    it("reads inline HTML tags as their kinds, and keeps Markdown's prose", function () {
      const md = 'Go to <a href="https://x.com">the site</a> and press <kbd>Enter</kbd>. <code>Type "x"</code>\n';
      const nodes = parseMarkdown(md);
      expect(pick(nodes, "link")[0]).to.include({ url: "https://x.com", text: "the site", before: "Go to " });
      expect(pick(nodes, "element").map((n) => n.tag)).to.deep.equal(["kbd"]);
      expect(pick(nodes, "text").map((n) => n.text).join("|")).to.include('Type "x"');
    });

    it("reads block HTML, including its prose", function () {
      const md = 'Intro.\n\n<div class="note">\n<p>Click <b>Save</b>.</p>\n<!-- step {"find": "a"} -->\n</div>\n';
      const nodes = parseMarkdown(md);
      expect(pick(nodes, "strong")[0]).to.include({ text: "Save", before: "Click " });
      expect(pick(nodes, "comment").map((n) => n.content)).to.deep.equal(['step {"find": "a"}']);
      expect(pick(nodes, "element").map((n) => n.tag)).to.deep.equal(["div", "p"]);
      expect(pick(nodes, "text").map((n) => n.text)).to.include("Click ");
    });

    it("maps lowercase JSX tags in .mdx to HTML kinds, with className as class", function () {
      const nodes = parseMarkdown('Open <a href="https://x.com">X</a> and <img src="s.png" alt="S" className="screenshot" />, then <Note className="n">keep</Note> <strong>Bold</strong> <em>It</em> <a name="top">no link</a> <img />.\n', true);
      expect(pick(nodes, "link")).to.have.lengthOf(1);
      expect(pick(nodes, "link")[0]).to.include({ url: "https://x.com", text: "X" });
      expect(pick(nodes, "image").map((n) => [n.src, n.alt])).to.deep.equal([["s.png", "S"], ["", ""]]);
      expect(pick(nodes, "image")[0].attributes.class).to.equal("screenshot");
      expect(pick(nodes, "strong").map((n) => n.text)).to.deep.equal(["Bold"]);
      expect(pick(nodes, "emphasis").map((n) => n.text)).to.deep.equal(["It"]);
      // Components keep className. A lowercase tag with no HTML kind, or an <a> with no href, is an element.
      expect(pick(nodes, "element").map((n) => [n.tag, n.attributes])).to.deep.equal([["Note", { className: "n" }], ["a", { name: "top" }]]);
    });
  });

  describe("detection", function () {
    it("parses each format by extension", async function () {
      const fileType = (extensions) => ({ name: "docs", extensions, inlineStatements: { in: ["comment"] }, markup: [{ strong: {}, actions: ["find"] }] });
      const cases = [
        ["doc.html", ["html"], '<!-- step {"goTo": "https://h.com"} -->\n<p><b>a</b></p>'],
        ["doc.dita", ["dita"], '<topic><body><?doc-detective step {"goTo": "https://d.com"} ?><p><b>a</b></p></body></topic>'],
        ["doc.adoc", ["adoc"], '// step {"goTo": "https://a.com"}\n\n*a*'],
      ];
      for (const [file, exts, content] of cases) {
        const { steps, warnings } = await detect(content, fileType(exts), file);
        expect(steps, file).to.have.lengthOf(2);
        expect(steps[1], file).to.deep.equal({ find: "a" });
        expect(warnings, file).to.deep.equal([]);
      }
    });

    it("parses by extends when the extension isn't known", async function () {
      const fileType = { name: "x", extends: "dita", extensions: ["xmlx"], markup: [{ element: "uicontrol", actions: ["click"] }] };
      expect((await detect("<p><uicontrol>Go</uicontrol></p>", fileType, "doc.xmlx")).steps).to.deep.equal([{ click: "Go" }]);
    });
  });
});
