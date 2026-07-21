import { expect } from "chai";
import { parseAsciidoc, resolveBackend } from "../dist/detect/index.js";
import { detectTests } from "../dist/detectTests.js";
import { defaultFileTypes } from "../dist/fileTypes.js";

const first = (nodes, kind) => nodes.find((n) => n.kind === kind);
const all = (nodes, kind) => nodes.filter((n) => n.kind === kind);

describe("detect: asciidoc backend (line scanner)", function () {
  it("emits comment nodes for // line comments with exact offsets", function () {
    const adoc = '= Title\n\n// (test {"testId": "a"})\n\nBody.\n';
    const nodes = parseAsciidoc(adoc);
    const c = first(nodes, "comment");
    expect(c.content).to.equal('(test {"testId": "a"})');
    expect(adoc.slice(c.startIndex, c.endIndex)).to.equal(
      '// (test {"testId": "a"})'
    );
  });

  it("emits one comment node per //// block with joined content", function () {
    const adoc = "////\nline one\nline two\n////\n";
    const nodes = parseAsciidoc(adoc);
    const comments = all(nodes, "comment");
    expect(comments).to.have.length(1);
    expect(comments[0].content).to.equal("line one\nline two");
  });

  it("maps [source,lang] + ---- listings to codeBlock nodes", function () {
    const adoc = "[source,bash]\n----\ncurl https://x.com\nls\n----\n";
    const cb = first(parseAsciidoc(adoc), "codeBlock");
    expect(cb.language).to.equal("bash");
    expect(cb.content).to.equal("curl https://x.com\nls");
    expect(adoc.slice(cb.startIndex, cb.endIndex)).to.equal(
      "[source,bash]\n----\ncurl https://x.com\nls\n----"
    );
  });

  it("maps bare ---- listings to language-less codeBlocks", function () {
    const adoc = "----\nplain\n----\n";
    const cb = first(parseAsciidoc(adoc), "codeBlock");
    expect(cb.language).to.equal("");
    expect(cb.content).to.equal("plain");
  });

  it("does not treat comment-looking lines inside listings as comments", function () {
    const adoc = '----\n// (test {"testId": "x"})\n----\n';
    const nodes = parseAsciidoc(adoc);
    expect(all(nodes, "comment")).to.have.length(0);
    expect(first(nodes, "codeBlock").content).to.include("// (test");
  });

  it("maps image:: macros to image nodes with positional and named attrs", function () {
    const adoc = "image::results.png[Search results, role=screenshot]\n";
    const img = first(parseAsciidoc(adoc), "image");
    expect(img.src).to.equal("results.png");
    expect(img.alt).to.equal("Search results");
    expect(img.attributes).to.deep.equal({ role: "screenshot" });
  });

  it("emits link, strong, and emphasis nodes from prose lines", function () {
    const adoc =
      "Go to https://duckduckgo.com[DuckDuckGo] and click *Search* or _wait_.\n";
    const nodes = parseAsciidoc(adoc);
    const link = first(nodes, "link");
    expect(link.url).to.equal("https://duckduckgo.com");
    expect(link.text).to.equal("DuckDuckGo");
    expect(first(nodes, "strong").text).to.equal("Search");
    expect(first(nodes, "emphasis").text).to.equal("wait");
    expect(first(nodes, "strong").precedingText).to.match(/click $/);
  });

  it("emits text segments between inline constructs", function () {
    const adoc = 'Type "kittens" then click *Go*.\n';
    const nodes = parseAsciidoc(adoc);
    const texts = all(nodes, "text").map((n) => n.text);
    expect(texts[0]).to.include('Type "kittens" then click ');
  });

  it("handles CRLF line endings", function () {
    const adoc = '// (test {"testId": "crlf"})\r\nBody.\r\n';
    const c = first(parseAsciidoc(adoc), "comment");
    expect(c.content).to.equal('(test {"testId": "crlf"})');
    expect(adoc.slice(c.startIndex, c.endIndex)).to.equal(
      '// (test {"testId": "crlf"})'
    );
  });

  it("emits unclosed block comments and listings through end of file", function () {
    const comment = first(parseAsciidoc("////\ndangling\n"), "comment");
    expect(comment.content).to.equal("dangling");
    // The trailing newline stays: an unclosed listing runs to end of file,
    // including the final line break.
    const cb = first(parseAsciidoc("----\ndangling code\n"), "codeBlock");
    expect(cb.content).to.equal("dangling code\n");
  });

  it("treats a [source] line with no following listing as inert", function () {
    const nodes = parseAsciidoc("[source,js]\nprose line\n");
    expect(all(nodes, "codeBlock")).to.have.length(0);
    expect(first(nodes, "text").text).to.equal("prose line");
  });

  it("parses alt-only image attrlists and skips empty parts", function () {
    const img = first(parseAsciidoc("image::a.png[Only alt,]\n"), "image");
    expect(img.alt).to.equal("Only alt");
    expect(img.attributes).to.equal(undefined);
  });

  it("handles a line starting with an inline construct and overlapping matches", function () {
    const nodes = parseAsciidoc(
      "*Go* now\nsee *bold https://x.example.com[in] bold* end\n"
    );
    expect(first(nodes, "strong").text).to.equal("Go");
    // The link sits inside the strong span; the earlier (strong) match wins.
    const strongs = all(nodes, "strong").map((n) => n.text);
    expect(strongs[1]).to.equal("bold https://x.example.com[in] bold");
    expect(all(nodes, "link")).to.have.length(0);
  });

  it("resolves asciidoc extensions and the fileType name", function () {
    for (const ext of ["adoc", "asciidoc", "asc"]) {
      expect(resolveBackend(ext), ext).to.be.a("function");
    }
    expect(
      resolveBackend("weird", { name: "asciidoc", extensions: [] })
    ).to.be.a("function");
  });
});

describe("asciidoc built-in fileType", function () {
  it("uses a paren-filtered comment container", function () {
    const ft = defaultFileTypes.asciidoc;
    expect(ft.inlineStatements.in).to.deep.equal([
      {
        comment: { matches: "^\\(\\s*([\\s\\S]*?)\\s*\\)$" },
        value: "match.1",
      },
    ]);
    expect(ft.inlineStatements.testStart).to.equal(undefined);
  });

  it("detects the maximal example end-to-end", async function () {
    const content = [
      "= Search guide",
      "",
      '// (test {"testId": "adoc-search"})',
      "",
      "Go to https://duckduckgo.com[DuckDuckGo] and click *Search*.",
      "",
      '// (step {"screenshot": true})',
      "",
      "[source,bash]",
      "----",
      "curl https://example.com/health",
      "----",
      "",
      "// (test ignore start)",
      "This https://example.com/broken[link] is not tested.",
      "// (test ignore end)",
      "",
      "// (test end)",
      "",
    ].join("\n");
    const tests = await detectTests({
      content,
      filePath: "doc.adoc",
      fileType: defaultFileTypes.asciidoc,
    });
    expect(tests).to.have.length(1);
    expect(tests[0].testId).to.equal("adoc-search");
    expect(tests[0].steps.map((s) => Object.keys(s).find((k) => k !== "location" && k !== "stepId"))).to.deep.equal([
      "screenshot",
    ]);
  });

  it("ignores plain comments that aren't paren statements", async function () {
    const content = [
      "// regular note",
      '// (test {"testId": "only"})',
      "// another note (with parens later)",
      '// (step {"wait": 1})',
      "// (test end)",
      "",
    ].join("\n");
    const tests = await detectTests({
      content,
      filePath: "doc.adoc",
      fileType: defaultFileTypes.asciidoc,
    });
    expect(tests).to.have.length(1);
    expect(tests[0].testId).to.equal("only");
    expect(tests[0].steps.map((s) => s.wait)).to.deep.equal([1]);
  });

  it("supports custom selector markup for asciidoc", async function () {
    const content = [
      '// (test {"testId": "rich", "detectSteps": true})',
      "",
      "Go to https://duckduckgo.com[DuckDuckGo] and click *Search*.",
      "",
      "image::results.png[Search results, role=screenshot]",
      "",
      "[source,bash]",
      "----",
      "echo hi",
      "----",
      "",
      "// (test end)",
      "",
    ].join("\n");
    const tests = await detectTests({
      content,
      filePath: "doc.adoc",
      fileType: {
        name: "asciidoc-rich",
        extensions: ["adoc"],
        inlineStatements: defaultFileTypes.asciidoc.inlineStatements,
        markup: [
          {
            name: "goToUrl",
            link: {
              url: "^https?://",
              precededBy: "\\b(?:[Gg]o\\s+to|[Oo]pen|[Vv]isit)\\s+$",
            },
            captures: ["url"],
            actions: ["goTo"],
          },
          {
            name: "clickOnscreenText",
            strong: { precededBy: "\\b(?:[Cc]lick|[Ss]elect|[Cc]hoose)\\s+$" },
            captures: ["text"],
            actions: ["click"],
          },
          {
            name: "screenshotImage",
            image: { attributes: { role: "screenshot" } },
            captures: ["src"],
            actions: ["screenshot"],
          },
          {
            name: "runCode",
            codeBlock: { language: ["bash"] },
            captures: ["language", "content"],
            actions: [{ unsafe: true, runCode: { language: "$1", code: "$2" } }],
          },
        ],
      },
      config: { detectSteps: true },
    });
    expect(tests).to.have.length(1);
    const kinds = tests[0].steps.map((s) =>
      Object.keys(s).find(
        (k) => k !== "location" && k !== "stepId" && k !== "unsafe"
      )
    );
    expect(kinds).to.deep.equal(["goTo", "click", "screenshot", "runCode"]);
    expect(tests[0].steps[0].goTo).to.equal("https://duckduckgo.com");
    expect(tests[0].steps[2].screenshot).to.equal("results.png");
    expect(tests[0].steps[3].runCode.code).to.equal("echo hi");
  });

  it("matches the legacy regex engine on statement detection", async function () {
    const content = [
      '// (test {"testId": "parity"})',
      '// (step {"wait": 3})',
      "// (test ignore start)",
      '// (step {"wait": 4})',
      "// (test ignore end)",
      "// (test end)",
      "",
    ].join("\n");
    const legacy = await detectTests({
      content,
      filePath: "doc.adoc",
      fileType: {
        name: "asciidoc",
        extensions: ["adoc"],
        inlineStatements: {
          testStart: ["\\/\\/\\s+\\(\\s*test\\s+([\\s\\S]*?)\\s*\\)"],
          testEnd: ["\\/\\/\\s+\\(\\s*test end\\s*\\)"],
          ignoreStart: ["\\/\\/\\s+\\(\\s*test ignore start\\s*\\)"],
          ignoreEnd: ["\\/\\/\\s+\\(\\s*test ignore end\\s*\\)"],
          step: ["\\/\\/\\s+\\(\\s*step\\s+([\\s\\S]*?)\\s*\\)"],
        },
        markup: [],
      },
    });
    const current = await detectTests({
      content,
      filePath: "doc.adoc",
      fileType: defaultFileTypes.asciidoc,
    });
    expect(current).to.have.length(1);
    expect(current[0].testId).to.equal("parity");
    expect(current[0].steps).to.deep.equal(legacy[0].steps);
  });
});
