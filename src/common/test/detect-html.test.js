import { expect } from "chai";
import { parseHtml, resolveBackend } from "../dist/detect/index.js";
import { detectTests } from "../dist/detectTests.js";
import { defaultFileTypes } from "../dist/fileTypes.js";

const first = (nodes, kind) => nodes.find((n) => n.kind === kind);
const all = (nodes, kind) => nodes.filter((n) => n.kind === kind);

describe("detect: html backend", function () {
  it("emits comment nodes with exact offsets", function () {
    const html = '<p>Before</p>\n<!-- test {"testId": "t"} -->\n<p>After</p>\n';
    const nodes = parseHtml(html);
    const c = first(nodes, "comment");
    expect(c).to.exist;
    expect(c.content).to.equal('test {"testId": "t"}');
    expect(html.slice(c.startIndex, c.endIndex)).to.equal(
      '<!-- test {"testId": "t"} -->'
    );
  });

  it("emits element nodes with raw attribute names", function () {
    const html = '<button data-testid="save" disabled>Save</button>\n';
    const nodes = parseHtml(html);
    const el = nodes.find((n) => n.kind === "element" && n.tag === "button");
    expect(el).to.exist;
    expect(el.attributes).to.deep.equal({ "data-testid": "save", disabled: true });
    expect(el.content).to.equal("Save");
  });

  it("maps anchors to link nodes and images to image nodes", function () {
    const html =
      '<p>Go to <a href="https://app.example.com/signup" class="cta">the signup page</a>.</p>\n' +
      '<img src="signup.png" class="screenshot" alt="Signup form" />\n';
    const nodes = parseHtml(html);
    const link = first(nodes, "link");
    expect(link.url).to.equal("https://app.example.com/signup");
    expect(link.text).to.equal("the signup page");
    expect(link.attributes.class).to.equal("cta");
    const img = first(nodes, "image");
    expect(img.src).to.equal("signup.png");
    expect(img.alt).to.equal("Signup form");
    expect(img.attributes.class).to.equal("screenshot");
  });

  it("maps strong/b and em/i to strong and emphasis nodes", function () {
    const html = "<p>Click <strong>Create</strong> or <b>Cancel</b>, <em>maybe</em> <i>later</i>.</p>\n";
    const nodes = parseHtml(html);
    expect(all(nodes, "strong").map((n) => n.text)).to.deep.equal([
      "Create",
      "Cancel",
    ]);
    expect(all(nodes, "emphasis").map((n) => n.text)).to.deep.equal([
      "maybe",
      "later",
    ]);
  });

  it("maps pre>code with a language- class to codeBlock nodes", function () {
    const html =
      '<pre><code class="language-bash">curl https://x.com/health</code></pre>\n' +
      "<pre><code>no language</code></pre>\n";
    const nodes = parseHtml(html);
    const blocks = all(nodes, "codeBlock");
    expect(blocks).to.have.length(2);
    expect(blocks[0].language).to.equal("bash");
    expect(blocks[0].content).to.equal("curl https://x.com/health");
    expect(blocks[1].language).to.equal("");
  });

  it("emits text runs with raw source slices, skipping script/style", function () {
    const html =
      '<p>Type "kittens" here.</p><script>var x = "Press \\"Enter\\"";</script>\n';
    const nodes = parseHtml(html);
    const texts = all(nodes, "text").map((n) => n.text);
    expect(texts).to.include('Type "kittens" here.');
    expect(texts.join(" ")).to.not.include("var x");
  });

  it("provides preceding context for verb patterns", function () {
    const html = "<p>Go to <a href=\"https://x.com\">docs</a> and click <strong>Run</strong>.</p>\n";
    const nodes = parseHtml(html);
    const strong = first(nodes, "strong");
    expect(strong.precedingText).to.match(/click $/);
  });

  it("does not emit comments found inside code or script content", function () {
    const html = "<pre><code>&lt;!-- test --&gt;</code></pre>\n";
    const nodes = parseHtml(html);
    expect(all(nodes, "comment")).to.have.length(0);
  });

  it("parses full documents whose body holds comments directly", function () {
    // Regression: an authored <body> is emitted as an element and text-
    // flattened; comment children must not break the flattening.
    const html =
      "<!DOCTYPE html>\n<html>\n<body>\n<!-- test {\"testId\": \"t\"} -->\n<p>x</p>\n</body>\n</html>\n";
    const nodes = parseHtml(html);
    const c = first(nodes, "comment");
    expect(c.content).to.equal('test {"testId": "t"}');
    const body = nodes.find((n) => n.kind === "element" && n.tag === "body");
    expect(body.content).to.include("x");
  });

  it("resolves html extensions to the html backend", function () {
    for (const ext of ["html", "htm", "xhtml"]) {
      expect(resolveBackend(ext), ext).to.be.a("function");
    }
    expect(resolveBackend("weird", { name: "html", extensions: [] })).to.be.a(
      "function"
    );
  });
});

describe("html built-in fileType", function () {
  it("uses comment containers and broadened extensions", function () {
    expect(defaultFileTypes.html.inlineStatements.in).to.deep.equal(["comment"]);
    expect(defaultFileTypes.html.extensions).to.deep.equal([
      "html",
      "htm",
      "xhtml",
    ]);
  });

  it("detects inline statements end-to-end, matching the legacy regex engine", async function () {
    const content = [
      '<!-- test {"testId": "signup"} -->',
      '<p>Go to <a href="https://app.example.com/signup">the signup page</a>.</p>',
      '<!-- step {"find": "Welcome"} -->',
      "<!-- test ignore start -->",
      '<!-- step {"wait": 1} -->',
      "<!-- test ignore end -->",
      '<!-- step {"wait": 2} -->',
      "<!-- test end -->",
      "",
    ].join("\n");
    const current = await detectTests({
      content,
      filePath: "doc.html",
      fileType: defaultFileTypes.html,
    });
    // Legacy regex html fileType (pre-migration) for parity comparison.
    const legacy = await detectTests({
      content,
      filePath: "doc.html",
      fileType: {
        name: "html-legacy",
        extensions: ["html"],
        inlineStatements: {
          testStart: ["<!--\\s*test\\s+?([\\s\\S]*?)\\s*-->"],
          testEnd: ["<!--\\s*test end\\s*([\\s\\S]*?)\\s*-->"],
          ignoreStart: ["<!--\\s*test ignore start\\s*-->"],
          ignoreEnd: ["<!--\\s*test ignore end\\s*-->"],
          step: ["<!--\\s*step\\s+?([\\s\\S]*?)\\s*-->"],
        },
        markup: [],
      },
    });
    expect(current).to.have.length(1);
    expect(current[0].steps.map((s) => s.find ?? s.wait)).to.deep.equal([
      "Welcome",
      2,
    ]);
    // Same steps as the legacy engine (testIds differ only via fileType name).
    expect(current[0].steps).to.deep.equal(legacy[0].steps);
  });

  it("supports custom element selectors in html files", async function () {
    const content = [
      '<!-- test {"testId": "rich", "detectSteps": true} -->',
      '<p>Click <strong>Create account</strong>.</p>',
      '<button data-testid="save">Save</button>',
      '<pre><code class="language-bash">echo hi</code></pre>',
      "<!-- test end -->",
      "",
    ].join("\n");
    const tests = await detectTests({
      content,
      filePath: "doc.html",
      fileType: {
        name: "html-rich",
        extensions: ["html"],
        inlineStatements: { in: ["comment"] },
        markup: [
          {
            name: "clickOnscreenText",
            strong: { precededBy: "\\b[Cc]lick\\s*$" },
            captures: ["text"],
            actions: ["click"],
          },
          {
            name: "clickTestIdElement",
            element: { tag: "button", attributes: { "data-testid": true } },
            captures: ["attributes.data-testid"],
            actions: ["click"],
          },
          {
            name: "runCode",
            codeBlock: { language: ["bash"] },
            captures: ["language", "content"],
            actions: [{ unsafe: true, runCode: { language: "$1", code: "$2" } }],
          },
        ],
      },
    });
    expect(tests).to.have.length(1);
    expect(tests[0].steps.map((s) => s.click ?? s.runCode?.code)).to.deep.equal([
      "Create account",
      "save",
      "echo hi",
    ]);
  });
});
