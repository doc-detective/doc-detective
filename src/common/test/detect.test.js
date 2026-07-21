import { expect } from "chai";
import {
  parseMarkdown,
  parseAttributeList,
  resolveBackend,
  parseStatementText,
  getSelectorDefinition,
  matchSelector,
  resolveFieldPath,
  resolveCaptures,
  selectorContainerStatements,
  selectorMarkupStatements,
} from "../dist/detect/index.js";
import { detectTests } from "../dist/detectTests.js";

// Helper: find the first node of a kind.
const first = (nodes, kind) => nodes.find((n) => n.kind === kind);
const all = (nodes, kind) => nodes.filter((n) => n.kind === kind);

describe("detect: markdown backend", function () {
  describe("comments", function () {
    it("emits a comment node for an HTML comment with exact offsets", function () {
      const md = 'Before\n\n<!-- test {"testId": "t"} -->\n\nAfter\n';
      const nodes = parseMarkdown(md);
      const c = first(nodes, "comment");
      expect(c).to.exist;
      expect(c.content).to.equal('test {"testId": "t"}');
      expect(md.slice(c.startIndex, c.endIndex)).to.equal(
        '<!-- test {"testId": "t"} -->'
      );
    });

    it("emits one comment node per comment when a single html block holds several", function () {
      const md = "<!-- one -->\n<!-- two -->\n";
      const nodes = parseMarkdown(md);
      const comments = all(nodes, "comment");
      expect(comments.map((c) => c.content)).to.deep.equal(["one", "two"]);
    });

    it("emits comment nodes for inline HTML comments inside a paragraph", function () {
      const md = "Some text <!-- step {\"wait\": 1} --> more text.\n";
      const nodes = parseMarkdown(md);
      const c = first(nodes, "comment");
      expect(c).to.exist;
      expect(c.content).to.equal('step {"wait": 1}');
    });

    it("normalizes [comment]: # definitions into comment nodes (all quote forms)", function () {
      const md = [
        '[comment]: # (step {"screenshot": true})',
        "[comment]: # 'step {\"find\": \"Results\"}'",
        '[comment]: # "step {\\"click\\": \\"Next\\"}"',
        "",
      ].join("\n");
      const nodes = parseMarkdown(md);
      const comments = all(nodes, "comment");
      expect(comments).to.have.length(3);
      expect(comments[0].content).to.equal('step {"screenshot": true}');
      expect(comments[1].content).to.equal('step {"find": "Results"}');
      expect(comments[2].content).to.equal('step {"click": "Next"}');
    });

    it("ignores definitions that aren't [comment] and html that isn't a comment", function () {
      const md = "[ref]: https://example.com\n\n<div>hi</div>\n";
      const nodes = parseMarkdown(md);
      expect(all(nodes, "comment")).to.have.length(0);
    });

    it("does not emit comment nodes for comment text inside code fences", function () {
      const md = "```\n<!-- test -->\n```\n";
      const nodes = parseMarkdown(md);
      expect(all(nodes, "comment")).to.have.length(0);
      expect(first(nodes, "codeBlock").content).to.equal("<!-- test -->");
    });
  });

  describe("code blocks", function () {
    it("captures language, meta, and content", function () {
      const md = "```js testIgnore\nconsole.log(1);\n```\n";
      const nodes = parseMarkdown(md);
      const cb = first(nodes, "codeBlock");
      expect(cb.language).to.equal("js");
      expect(cb.meta).to.equal("testIgnore");
      expect(cb.content).to.equal("console.log(1);");
    });

    it("uses empty-string language for bare fences", function () {
      const md = "```\nGET https://example.com\n```\n";
      const cb = first(parseMarkdown(md), "codeBlock");
      expect(cb.language).to.equal("");
      expect(cb.meta).to.equal("");
    });

    it("parses attribute lists in the fence meta", function () {
      const md = '```bash {.no-test #main data-x="1"}\nls\n```\n';
      const cb = first(parseMarkdown(md), "codeBlock");
      expect(cb.attributes).to.deep.equal({
        class: "no-test",
        id: "main",
        "data-x": "1",
      });
    });
  });

  describe("links, images, and emphasis", function () {
    it("captures link url, title, and text", function () {
      const md = 'See the [API reference](https://example.com/api "docs").\n';
      const link = first(parseMarkdown(md), "link");
      expect(link.url).to.equal("https://example.com/api");
      expect(link.title).to.equal("docs");
      expect(link.text).to.equal("API reference");
    });

    it("does not emit a link node for an image", function () {
      const md = "![alt text](image.png)\n";
      const nodes = parseMarkdown(md);
      expect(all(nodes, "link")).to.have.length(0);
      const img = first(nodes, "image");
      expect(img.src).to.equal("image.png");
      expect(img.alt).to.equal("alt text");
    });

    it("captures strong and emphasis text", function () {
      const md = "Click **Search** or _maybe_ not.\n";
      const nodes = parseMarkdown(md);
      expect(first(nodes, "strong").text).to.equal("Search");
      expect(first(nodes, "emphasis").text).to.equal("maybe");
    });

    it("captures nested formatting in link text", function () {
      const md = "[**bold** link](https://example.com)\n";
      const link = first(parseMarkdown(md), "link");
      expect(link.text).to.equal("bold link");
    });
  });

  describe("attribute lists (IALs)", function () {
    it("parses a Kramdown-style IAL after an image", function () {
      const md = '![Search results](results.png){: #results .screenshot width="800" }\n';
      const img = first(parseMarkdown(md), "image");
      expect(img.attributes).to.deep.equal({
        id: "results",
        class: "screenshot",
        width: "800",
      });
      expect(md.slice(img.startIndex, img.endIndex)).to.equal(
        '![Search results](results.png){: #results .screenshot width="800" }'
      );
    });

    it("parses a Pandoc-style IAL and joins multiple classes", function () {
      const md = "![x](a.png){.screenshot .wide}\n";
      const img = first(parseMarkdown(md), "image");
      expect(img.attributes).to.deep.equal({ class: "screenshot wide" });
    });

    it("parses an IAL after a link", function () {
      const md = "[text](https://example.com){: .external}\n";
      const link = first(parseMarkdown(md), "link");
      expect(link.attributes).to.deep.equal({ class: "external" });
    });

    it("supports single-quoted and unquoted IAL values", function () {
      const md = "![x](a.png){: key='v 1' plain=simple}\n";
      const img = first(parseMarkdown(md), "image");
      expect(img.attributes).to.deep.equal({ key: "v 1", plain: "simple" });
    });

    it("leaves attributes unset when no IAL follows", function () {
      const md = "![x](a.png) plain text {not an ial\n";
      const img = first(parseMarkdown(md), "image");
      expect(img.attributes).to.equal(undefined);
    });

    it("ignores an empty or unrecognized IAL", function () {
      const md = "![x](a.png){}\n";
      const img = first(parseMarkdown(md), "image");
      expect(img.attributes).to.equal(undefined);
    });
  });

  describe("text runs and context", function () {
    it("emits text nodes with raw source slices", function () {
      const md = 'Type "kittens" in the box. Press "Enter".\n';
      const t = first(parseMarkdown(md), "text");
      expect(t.text).to.equal('Type "kittens" in the box. Press "Enter".');
    });

    it("provides precedingText and followingText for inline nodes", function () {
      const md = "Go to [Google](https://www.google.com) and click **Search**.\n";
      const nodes = parseMarkdown(md);
      const link = first(nodes, "link");
      const strong = first(nodes, "strong");
      expect(link.precedingText).to.equal("Go to ");
      expect(strong.precedingText).to.match(/click $/);
      expect(strong.followingText).to.equal(".");
    });

    it("returns nodes sorted by startIndex", function () {
      const md = "<!-- a -->\n\nText **bold** [l](https://x.com)\n\n```\nc\n```\n";
      const nodes = parseMarkdown(md);
      const starts = nodes.map((n) => n.startIndex);
      expect([...starts].sort((a, b) => a - b)).to.deep.equal(starts);
    });
  });
});

describe("detect: backend resolution", function () {
  it("resolves markdown extensions to the markdown backend", function () {
    for (const ext of ["md", "markdown", "mdown", "mkd", "mkdn", "mdx"]) {
      expect(resolveBackend(ext), ext).to.be.a("function");
    }
  });

  it("returns null for unmapped extensions", function () {
    expect(resolveBackend("adoc")).to.equal(null);
    expect(resolveBackend("")).to.equal(null);
  });

  it("falls back to the fileType name when the extension is unmapped", function () {
    expect(resolveBackend("weird", { name: "markdown", extensions: [] })).to.be.a(
      "function"
    );
    expect(resolveBackend("weird", { name: "asciidoc", extensions: [] })).to.equal(
      null
    );
  });
});

describe("detect: statement grammar", function () {
  it("parses each statement keyword", function () {
    expect(parseStatementText("test ignore start")).to.deep.equal({
      type: "ignoreStart",
      payload: "",
    });
    expect(parseStatementText("test ignore end")).to.deep.equal({
      type: "ignoreEnd",
      payload: "",
    });
    expect(parseStatementText("test end")).to.deep.equal({
      type: "testEnd",
      payload: "",
    });
    expect(parseStatementText('test {"testId": "t"}')).to.deep.equal({
      type: "testStart",
      payload: '{"testId": "t"}',
    });
    expect(parseStatementText('test start {"testId": "t"}')).to.deep.equal({
      type: "testStart",
      payload: '{"testId": "t"}',
    });
    expect(parseStatementText('step {"wait": 1}')).to.deep.equal({
      type: "step",
      payload: '{"wait": 1}',
    });
  });

  it("returns null for non-statements", function () {
    expect(parseStatementText("nothing here")).to.equal(null);
    expect(parseStatementText("")).to.equal(null);
    expect(parseStatementText("Test {}")).to.equal(null); // case-sensitive
  });

  it("treats keyword-adjacent text the way the legacy regexes did", function () {
    // "testing" parses as test + payload "ing" (dropped later by parseObject),
    // matching the legacy `test\s*(...)` regex behavior.
    expect(parseStatementText("testing")).to.deep.equal({
      type: "testStart",
      payload: "ing",
    });
  });
});

describe("detect: selector definitions", function () {
  it("identifies a selector definition and normalizes shorthands", function () {
    expect(getSelectorDefinition({ codeBlock: "bash" })).to.deep.equal({
      kind: "codeBlock",
      options: { language: "bash" },
    });
    expect(getSelectorDefinition({ element: "uicontrol" })).to.deep.equal({
      kind: "element",
      options: { tag: "uicontrol" },
    });
    expect(getSelectorDefinition({ strong: {} })).to.deep.equal({
      kind: "strong",
      options: {},
    });
  });

  it("returns null for regex definitions and non-selector objects", function () {
    expect(getSelectorDefinition({ regex: ["x"], actions: ["find"] })).to.equal(
      null
    );
    expect(getSelectorDefinition({ name: "x", actions: ["find"] })).to.equal(null);
  });
});

describe("detect: selector matching", function () {
  const ctxFor = (content) => {
    const nodes = parseMarkdown(content);
    return { content, nodes };
  };

  it("matches codeBlock by language list and excludes by meta", function () {
    const content = "```bash\nls\n```\n\n```js testIgnore\nx\n```\n\n```ruby\ny\n```\n";
    const ctx = ctxFor(content);
    const blocks = all(ctx.nodes, "codeBlock");
    const opts = { language: ["bash", "js"], metaExcludes: "testIgnore" };
    expect(matchSelector(blocks[0], "codeBlock", opts, ctx)).to.have.length(1);
    expect(matchSelector(blocks[1], "codeBlock", opts, ctx)).to.have.length(0);
    expect(matchSelector(blocks[2], "codeBlock", opts, ctx)).to.have.length(0);
  });

  it("matches bare fences via empty-string language and metaMatches", function () {
    const content = "```\nGET https://x.com\n```\n\n```x marked\nz\n```\n";
    const ctx = ctxFor(content);
    const blocks = all(ctx.nodes, "codeBlock");
    expect(
      matchSelector(blocks[0], "codeBlock", { language: "" }, ctx)
    ).to.have.length(1);
    expect(
      matchSelector(blocks[1], "codeBlock", { metaMatches: "marked" }, ctx)
    ).to.have.length(1);
    expect(
      matchSelector(blocks[1], "codeBlock", { language: "" , metaMatches: "other" }, ctx)
    ).to.have.length(0);
  });

  it("captures contentMatches groups", function () {
    const content = "```http\nPOST https://api.example.com/v1\n```\n";
    const ctx = ctxFor(content);
    const cb = first(ctx.nodes, "codeBlock");
    const results = matchSelector(
      cb,
      "codeBlock",
      { contentMatches: "^([A-Z]+)\\s+(\\S+)" },
      ctx
    );
    expect(results).to.have.length(1);
    expect(results[0].groups[1]).to.equal("POST");
    expect(results[0].groups[2]).to.equal("https://api.example.com/v1");
  });

  it("rejects on contentExcludes and non-matching contentMatches", function () {
    const content = "```bash\nsecret\n```\n";
    const ctx = ctxFor(content);
    const cb = first(ctx.nodes, "codeBlock");
    expect(
      matchSelector(cb, "codeBlock", { contentExcludes: "secret" }, ctx)
    ).to.have.length(0);
    expect(
      matchSelector(cb, "codeBlock", { contentMatches: "^ZZZ" }, ctx)
    ).to.have.length(0);
  });

  it("matches link url/text and applies precededBy with span extension", function () {
    const content = "Go to [Google](https://www.google.com) now.\n";
    const ctx = ctxFor(content);
    const link = first(ctx.nodes, "link");
    const miss = matchSelector(link, "link", { url: "^ftp://" }, ctx);
    expect(miss).to.have.length(0);
    const results = matchSelector(
      link,
      "link",
      { url: "^https?://", precededBy: "\\b[Gg]o\\s+to\\s*$" },
      ctx
    );
    expect(results).to.have.length(1);
    // Span extends back over the matched verb, mirroring the legacy regex span.
    expect(content.slice(results[0].startIndex, results[0].endIndex)).to.equal(
      "Go to [Google](https://www.google.com)"
    );
  });

  it("fails precededBy when the context text doesn't match", function () {
    const content = "See [Google](https://www.google.com).\n";
    const ctx = ctxFor(content);
    const link = first(ctx.nodes, "link");
    expect(
      matchSelector(link, "link", { precededBy: "\\bGo to\\s*$" }, ctx)
    ).to.have.length(0);
  });

  it("matches text selectors once per occurrence with source-mapped spans", function () {
    const content = 'Type "kittens" in the box. Press "Enter".\n';
    const ctx = ctxFor(content);
    const t = first(ctx.nodes, "text");
    const results = matchSelector(
      t,
      "text",
      { matches: '\\b(?:[Pp]ress|[Ee]nter|[Tt]ype)\\b\\s+"([^"]+)"' },
      ctx
    );
    expect(results).to.have.length(2);
    expect(results[0].groups[1]).to.equal("kittens");
    expect(results[1].groups[1]).to.equal("Enter");
    expect(content.slice(results[1].startIndex, results[1].endIndex)).to.equal(
      'Press "Enter"'
    );
  });

  it("applies text excludes", function () {
    const content = 'Press "Enter" testIgnore\n';
    const ctx = ctxFor(content);
    const t = first(ctx.nodes, "text");
    expect(
      matchSelector(t, "text", { matches: 'Press "([^"]+)"', excludes: "testIgnore" }, ctx)
    ).to.have.length(0);
  });

  it("matches image attributes with regex, exact-ish, and exists matchers", function () {
    const content = '![x](a.png){: .screenshot path="shots/a.png"}\n';
    const ctx = ctxFor(content);
    const img = first(ctx.nodes, "image");
    expect(
      matchSelector(img, "image", { attributes: { class: "screenshot", path: true } }, ctx)
    ).to.have.length(1);
    expect(
      matchSelector(img, "image", { attributes: { missing: true } }, ctx)
    ).to.have.length(0);
    expect(
      matchSelector(img, "image", { attributes: { class: "^banner$" } }, ctx)
    ).to.have.length(0);
  });

  it("rejects attribute matchers when the node has no attributes", function () {
    const content = "![x](a.png)\n";
    const ctx = ctxFor(content);
    const img = first(ctx.nodes, "image");
    expect(
      matchSelector(img, "image", { attributes: { class: "screenshot" } }, ctx)
    ).to.have.length(0);
  });

  it("matches src/alt regexes on images", function () {
    const content = "![Search results](results.png)\n";
    const ctx = ctxFor(content);
    const img = first(ctx.nodes, "image");
    expect(
      matchSelector(img, "image", { src: "\\.png$", alt: "Search" }, ctx)
    ).to.have.length(1);
    expect(matchSelector(img, "image", { src: "\\.jpg$" }, ctx)).to.have.length(0);
    expect(matchSelector(img, "image", { alt: "^Nope" }, ctx)).to.have.length(0);
  });

  it("matches strong text with followedBy string context", function () {
    const content = "**Save** now\n";
    const ctx = ctxFor(content);
    const strong = first(ctx.nodes, "strong");
    const results = matchSelector(strong, "strong", { text: "^Save$", followedBy: "^ now" }, ctx);
    expect(results).to.have.length(1);
    expect(
      matchSelector(strong, "strong", { followedBy: "^ later" }, ctx)
    ).to.have.length(0);
    expect(
      matchSelector(strong, "strong", { text: "^Other$" }, ctx)
    ).to.have.length(0);
  });

  it("chains followedBy.then to the next non-text node in the block", function () {
    const content = "Type **kittens** into **Search** field\n";
    const ctx = ctxFor(content);
    const [a] = all(ctx.nodes, "strong");
    const results = matchSelector(
      a,
      "strong",
      {
        precededBy: "\\bType\\s*$",
        followedBy: { text: "^\\s+into\\s+$", then: { strong: { text: "^Search$" } } },
      },
      ctx
    );
    expect(results).to.have.length(1);
    expect(results[0].then.node.text).to.equal("Search");
    // Span covers through the chained node.
    expect(content.slice(results[0].startIndex, results[0].endIndex)).to.equal(
      "Type **kittens** into **Search**"
    );
  });

  it("fails then-chaining when between-text or the chained selector doesn't match", function () {
    const content = "Type **kittens** into **Search** field\n";
    const ctx = ctxFor(content);
    const [a] = all(ctx.nodes, "strong");
    expect(
      matchSelector(
        a,
        "strong",
        { followedBy: { text: "^\\s+from\\s+$", then: { strong: {} } } },
        ctx
      )
    ).to.have.length(0);
    expect(
      matchSelector(
        a,
        "strong",
        { followedBy: { then: { strong: { text: "^Other$" } } } },
        ctx
      )
    ).to.have.length(0);
  });

  it("fails then-chaining when there is no following node in the block", function () {
    const content = "just **bold**\n";
    const ctx = ctxFor(content);
    const strong = first(ctx.nodes, "strong");
    expect(
      matchSelector(strong, "strong", { followedBy: { then: { strong: {} } } }, ctx)
    ).to.have.length(0);
  });

  it("matches synthetic element nodes by tag, attributes, and content", function () {
    const node = {
      kind: "element",
      startIndex: 0,
      endIndex: 30,
      tag: "uicontrol",
      content: "Search",
      attributes: { outputclass: "button" },
      precedingText: "Click the ",
      followingText: " field",
      blockId: 1,
    };
    const ctx = { content: 'Click the <uicontrol outputclass="button">Search</uicontrol> field', nodes: [node] };
    expect(
      matchSelector(node, "element", { tag: "uicontrol" }, ctx)
    ).to.have.length(1);
    expect(
      matchSelector(node, "element", { tag: ["xref", "uicontrol"] }, ctx)
    ).to.have.length(1);
    expect(matchSelector(node, "element", { tag: "xref" }, ctx)).to.have.length(0);
    expect(
      matchSelector(node, "element", { contentMatches: "^(Search)$" }, ctx)[0].groups[1]
    ).to.equal("Search");
    expect(
      matchSelector(node, "element", { contentExcludes: "Search" }, ctx)
    ).to.have.length(0);
    expect(
      matchSelector(node, "element", { attributes: { outputclass: "button" } }, ctx)
    ).to.have.length(1);
  });

  it("matches comment nodes with matches/excludes filters", function () {
    const content = "<!-- special note -->\n";
    const ctx = ctxFor(content);
    const c = first(ctx.nodes, "comment");
    expect(matchSelector(c, "comment", {}, ctx)).to.have.length(1);
    expect(
      matchSelector(c, "comment", { matches: "^special" }, ctx)
    ).to.have.length(1);
    expect(
      matchSelector(c, "comment", { matches: "^other" }, ctx)
    ).to.have.length(0);
    expect(
      matchSelector(c, "comment", { excludes: "note" }, ctx)
    ).to.have.length(0);
  });

  it("returns no match for a kind mismatch", function () {
    const content = "**bold**\n";
    const ctx = ctxFor(content);
    const strong = first(ctx.nodes, "strong");
    expect(matchSelector(strong, "emphasis", {}, ctx)).to.have.length(0);
  });
});

describe("detect: capture resolution", function () {
  const ctxFor = (content) => ({ content, nodes: parseMarkdown(content) });

  it("resolves field paths, attributes, match groups, and then fields", function () {
    const content = "Type **kittens** into **Search** field\n";
    const ctx = ctxFor(content);
    const [a] = all(ctx.nodes, "strong");
    const [match] = matchSelector(
      a,
      "strong",
      { followedBy: { then: { strong: {} } } },
      ctx
    );
    expect(
      resolveCaptures(["text", "then.text"], "strong", match)
    ).to.deep.equal(["kittens", "Search"]);
  });

  it("resolves codeBlock fields and match.<n> paths", function () {
    const content = "```http\nPOST https://x.com\nbody\n```\n";
    const ctx = ctxFor(content);
    const cb = first(ctx.nodes, "codeBlock");
    const [match] = matchSelector(
      cb,
      "codeBlock",
      { contentMatches: "^([A-Z]+)\\s+(\\S+)" },
      ctx
    );
    // Missing match groups stay undefined (RegExpMatchArray-hole parity) so
    // replaceNumericVariables drops action fields referencing them.
    expect(
      resolveCaptures(["language", "match.1", "match.2", "match.9"], "codeBlock", match)
    ).to.deep.equal(["http", "POST", "https://x.com", undefined]);
  });

  it("resolves attributes.<name> paths and missing fields to empty strings", function () {
    const content = '![x](a.png){: .screenshot path="shots/a.png"}\n';
    const ctx = ctxFor(content);
    const img = first(ctx.nodes, "image");
    const [match] = matchSelector(img, "image", {}, ctx);
    expect(
      resolveCaptures(
        ["src", "attributes.path", "attributes.class", "attributes.nope", "url"],
        "image",
        match
      )
    ).to.deep.equal(["a.png", "shots/a.png", "screenshot", "", ""]);
  });

  it("applies per-kind default captures when none are given", function () {
    const content = "```bash\nls\n```\n\n[t](https://x.com)\n";
    const ctx = ctxFor(content);
    const cb = first(ctx.nodes, "codeBlock");
    const link = first(ctx.nodes, "link");
    const [cbMatch] = matchSelector(cb, "codeBlock", {}, ctx);
    const [linkMatch] = matchSelector(link, "link", {}, ctx);
    expect(resolveCaptures(undefined, "codeBlock", cbMatch)).to.deep.equal([
      "bash",
      "ls",
    ]);
    expect(resolveCaptures(undefined, "link", linkMatch)).to.deep.equal([
      "t",
      "https://x.com",
    ]);
  });
});

describe("detect: end-to-end through detectTests", function () {
  const mdFileType = (overrides) => ({
    name: "custom-md",
    extensions: ["md"],
    ...overrides,
  });

  it("detects inline statements from comment containers", async function () {
    const content = [
      '<!-- test {"testId": "flow", "detectSteps": false} -->',
      "",
      'Some text. <!-- step {"wait": 1000} -->',
      "",
      "<!-- test end -->",
      "",
    ].join("\n");
    const tests = await detectTests({
      content,
      filePath: "doc.md",
      fileType: mdFileType({ inlineStatements: { in: ["comment"] } }),
    });
    expect(tests).to.have.length(1);
    expect(tests[0].testId).to.equal("flow");
    expect(tests[0].steps).to.have.length(1);
    expect(tests[0].steps[0].wait).to.equal(1000);
    expect(tests[0].steps[0].location.line).to.equal(3);
  });

  it("honors ignore ranges from comment containers", async function () {
    const content = [
      '<!-- test {"testId": "ignores"} -->',
      "<!-- test ignore start -->",
      '<!-- step {"wait": 5} -->',
      "<!-- test ignore end -->",
      '<!-- step {"wait": 7} -->',
      "<!-- test end -->",
      "",
    ].join("\n");
    const tests = await detectTests({
      content,
      filePath: "doc.md",
      fileType: mdFileType({ inlineStatements: { in: ["comment"] } }),
    });
    expect(tests).to.have.length(1);
    expect(tests[0].steps.map((s) => s.wait)).to.deep.equal([7]);
  });

  it("does not detect statements inside code fences via containers", async function () {
    const content = [
      '<!-- test {"testId": "fences"} -->',
      "",
      "```",
      '<!-- step {"wait": 5} -->',
      "```",
      "",
      '<!-- step {"wait": 7} -->',
      "<!-- test end -->",
      "",
    ].join("\n");
    const tests = await detectTests({
      content,
      filePath: "doc.md",
      fileType: mdFileType({ inlineStatements: { in: ["comment"] } }),
    });
    expect(tests[0].steps.map((s) => s.wait)).to.deep.equal([7]);
  });

  it("filters containers with matches and reads value field paths", async function () {
    const content = [
      '<!-- dd: test {"testId": "scoped"} -->',
      '<!-- dd: step {"wait": 3} -->',
      '<!-- step {"wait": 4} -->',
      "<!-- dd: test end -->",
      "",
    ].join("\n");
    const tests = await detectTests({
      content,
      filePath: "doc.md",
      fileType: mdFileType({
        inlineStatements: {
          in: [{ comment: { matches: "^dd: ([\\s\\S]*)$" }, value: "match.1" }],
        },
      }),
    });
    expect(tests).to.have.length(1);
    expect(tests[0].testId).to.equal("scoped");
    expect(tests[0].steps.map((s) => s.wait)).to.deep.equal([3]);
  });

  it("detects selector markup steps with captures feeding actions", async function () {
    const content = [
      '<!-- test {"testId": "markup"} -->',
      "",
      "Go to [Google](https://www.google.com) and click **Search**.",
      "",
      "```bash",
      "echo hi",
      "```",
      "",
      "<!-- test end -->",
      "",
    ].join("\n");
    const tests = await detectTests({
      content,
      filePath: "doc.md",
      fileType: mdFileType({
        inlineStatements: { in: ["comment"] },
        markup: [
          {
            name: "goToUrl",
            link: { url: "^https?://", precededBy: "\\b[Gg]o\\s+to\\s*$" },
            captures: ["url"],
            actions: ["goTo"],
          },
          {
            name: "clickOnscreenText",
            strong: { precededBy: "\\b[Cc]lick\\s*$" },
            captures: ["text"],
            actions: ["click"],
          },
          {
            name: "runCode",
            codeBlock: { language: ["bash"] },
            captures: ["language", "content"],
            actions: [
              { unsafe: true, runCode: { language: "$1", code: "$2" } },
            ],
          },
        ],
      }),
    });
    expect(tests).to.have.length(1);
    const steps = tests[0].steps;
    expect(steps).to.have.length(3);
    expect(steps[0].goTo).to.equal("https://www.google.com");
    expect(steps[1].click).to.equal("Search");
    expect(steps[2].runCode.language).to.equal("bash");
    expect(steps[2].runCode.code).to.equal("echo hi");
  });

  it("supports mixed regex and selector markup in one fileType", async function () {
    const content = [
      '<!-- test {"testId": "mixed"} -->',
      "",
      "Check [docs](https://example.com/docs) and **Bold**.",
      "",
      "<!-- test end -->",
      "",
    ].join("\n");
    const tests = await detectTests({
      content,
      filePath: "doc.md",
      fileType: mdFileType({
        inlineStatements: { in: ["comment"] },
        markup: [
          {
            name: "regexHyperlink",
            regex: ['\\[[^\\]]+\\]\\(\\s*(https?://[^\\s)]+)\\s*\\)'],
            actions: ["checkLink"],
          },
          {
            name: "selectorBold",
            strong: {},
            captures: ["text"],
            actions: ["find"],
          },
        ],
      }),
    });
    const steps = tests[0].steps;
    expect(steps).to.have.length(2);
    expect(steps[0].checkLink).to.equal("https://example.com/docs");
    expect(steps[1].find).to.equal("Bold");
  });

  it("combines batchMatches selector results into one step", async function () {
    const content = [
      '<!-- test {"testId": "batch", "detectSteps": true} -->',
      "",
      "**one**",
      "",
      "**two**",
      "",
      "<!-- test end -->",
      "",
    ].join("\n");
    const tests = await detectTests({
      content,
      filePath: "doc.md",
      fileType: mdFileType({
        inlineStatements: { in: ["comment"] },
        markup: [
          {
            name: "batchBold",
            strong: {},
            captures: ["text"],
            batchMatches: true,
            actions: ["find"],
          },
        ],
      }),
    });
    expect(tests[0].steps).to.have.length(1);
    expect(tests[0].steps[0].find).to.equal("one\ntwo");
  });

  it("respects detectSteps: false for selector markup", async function () {
    const content = "**bold**\n";
    const tests = await detectTests({
      content,
      filePath: "doc.md",
      config: { detectSteps: false },
      fileType: mdFileType({
        markup: [{ name: "b", strong: {}, captures: ["text"], actions: ["find"] }],
      }),
    });
    expect(tests).to.have.length(0);
  });

  it("degrades gracefully when no backend exists for the extension", async function () {
    const content =
      '**bold** <!-- test {"testId": "x"} --> <!-- step {"wait": 2} -->\n';
    const tests = await detectTests({
      content,
      filePath: "doc.weird",
      fileType: {
        name: "weird",
        extensions: ["weird"],
        inlineStatements: {
          in: ["comment"],
          testStart: ["<!--\\s*test\\s+([\\s\\S]*?)\\s*-->"],
          step: ["<!--\\s*step\\s*([\\s\\S]*?)\\s*-->"],
        },
        markup: [{ name: "b", strong: {}, captures: ["text"], actions: ["find"] }],
      },
    });
    // Regex statements still work; selector markup and containers contribute
    // nothing without a backend.
    expect(tests).to.have.length(1);
    expect(tests[0].testId).to.equal("x");
    expect(tests[0].steps.map((s) => s.wait)).to.deep.equal([2]);
  });

  it("covers structural edges: headings, tables, blockquotes, lists, and nested emphasis", async function () {
    const md = [
      "# Click **Run**",
      "",
      "> Quoted [link](https://q.example.com) here.",
      "",
      "- item with **bold**",
      "",
      "| a | b |",
      "| - | - |",
      "| [cell](https://c.example.com) | ~~struck **deep**~~ |",
      "",
      "**[wrapped](https://w.example.com)**",
      "",
    ].join("\n");
    const nodes = parseMarkdown(md);
    const links = nodes.filter((n) => n.kind === "link").map((n) => n.url);
    expect(links).to.include("https://q.example.com");
    expect(links).to.include("https://c.example.com");
    expect(links).to.include("https://w.example.com");
    const strongs = nodes.filter((n) => n.kind === "strong").map((n) => n.text);
    expect(strongs).to.include("Run");
    expect(strongs).to.include("bold");
    expect(strongs).to.include("deep");
    // Text inside links/emphasis is not a standalone text run.
    const texts = nodes.filter((n) => n.kind === "text").map((n) => n.text);
    expect(texts).to.not.include("wrapped");
  });

  it("skips selector definitions whose kind never matches without disturbing others", async function () {
    const content = [
      '<!-- test {"testId": "sparse"} -->',
      "",
      "**bold**",
      "",
      "<!-- test end -->",
      "",
    ].join("\n");
    const tests = await detectTests({
      content,
      filePath: "doc.md",
      fileType: mdFileType({
        inlineStatements: { in: ["comment"] },
        markup: [
          { name: "imgs", image: {}, captures: ["src"], actions: ["screenshot"] },
          { name: "bold", strong: {}, captures: ["text"], actions: ["find"] },
        ],
      }),
    });
    expect(tests[0].steps).to.have.length(1);
    expect(tests[0].steps[0].find).to.equal("bold");
  });
});

describe("detect: coverage edges", function () {
  const ctxFor = (content) => ({ content, nodes: parseMarkdown(content) });

  it("treats invalid regex patterns as non-matching everywhere", function () {
    const content = "Go to [x](https://a.com) and **b**\n\n```bash\nls\n```\n";
    const ctx = ctxFor(content);
    const link = ctx.nodes.find((n) => n.kind === "link");
    const strong = ctx.nodes.find((n) => n.kind === "strong");
    const cb = ctx.nodes.find((n) => n.kind === "codeBlock");
    const text = ctx.nodes.find((n) => n.kind === "text");
    const comment = parseMarkdown("<!-- c -->\n").find((n) => n.kind === "comment");
    expect(matchSelector(link, "link", { url: "(" }, ctx)).to.have.length(0);
    expect(matchSelector(link, "link", { precededBy: "(" }, ctx)).to.have.length(0);
    expect(matchSelector(strong, "strong", { followedBy: "(" }, ctx)).to.have.length(0);
    expect(matchSelector(cb, "codeBlock", { contentMatches: "(" }, ctx)).to.have.length(0);
    expect(matchSelector(text, "text", { matches: "(" }, ctx)).to.have.length(0);
    expect(
      matchSelector(comment, "comment", { matches: "(" }, { content: "", nodes: [comment] })
    ).to.have.length(0);
    // Cache hit for an already-compiled invalid pattern.
    expect(matchSelector(link, "link", { url: "(" }, ctx)).to.have.length(0);
  });

  it("normalizes non-object, non-string selector kind values", function () {
    expect(getSelectorDefinition({ codeBlock: 5 })).to.deep.equal({
      kind: "codeBlock",
      options: { language: "5" },
    });
    expect(getSelectorDefinition({ strong: "x" })).to.deep.equal({
      kind: "strong",
      options: {},
    });
  });

  it("matches bare-boolean attributes with string matchers", function () {
    const node = {
      kind: "element",
      startIndex: 0,
      endIndex: 10,
      tag: "input",
      attributes: { checked: true },
      precedingText: "",
      followingText: "",
      blockId: 1,
    };
    const ctx = { content: "", nodes: [node] };
    expect(
      matchSelector(node, "element", { attributes: { checked: true } }, ctx)
    ).to.have.length(1);
    expect(
      matchSelector(node, "element", { attributes: { checked: "true" } }, ctx)
    ).to.have.length(1);
  });

  it("resolves then paths without a chained node and null fields to empty strings", function () {
    const node = {
      kind: "link",
      startIndex: 0,
      endIndex: 5,
      url: null,
      precedingText: "",
      followingText: "",
      blockId: 1,
    };
    const match = { node, startIndex: 0, endIndex: 5, groups: null, then: null };
    expect(resolveFieldPath("then.text", match)).to.equal("");
    expect(resolveFieldPath("url", match)).to.equal("");
    expect(resolveFieldPath("attributes.x", match)).to.equal("");
  });

  it("stringifies boolean attribute values in captures", function () {
    const node = {
      kind: "element",
      startIndex: 0,
      endIndex: 3,
      tag: "x",
      attributes: { flag: true },
      precedingText: "",
      followingText: "",
      blockId: 1,
    };
    const match = { node, startIndex: 0, endIndex: 3, groups: null, then: null };
    expect(resolveFieldPath("attributes.flag", match)).to.equal("true");
  });

  it("rejects then-chaining with an invalid then selector", function () {
    const content = "**a** and **b**\n";
    const ctx = ctxFor(content);
    const [a] = ctx.nodes.filter((n) => n.kind === "strong");
    expect(
      matchSelector(a, "strong", { followedBy: { then: {} } }, ctx)
    ).to.have.length(0);
  });

  it("parses statement payload after test end and rejects unknown containers", function () {
    expect(parseStatementText("test end trailing note")).to.deep.equal({
      type: "testEnd",
      payload: "trailing note",
    });
    const statements = selectorContainerStatements({
      containers: ["bogus", { value: "content" }],
      nodes: parseMarkdown("<!-- test -->\n"),
      content: "<!-- test -->\n",
      getLine: () => 1,
    });
    expect(statements).to.have.length(0);
  });

  it("falls back to the raw slice for batch matches without a first capture", function () {
    const content = "<!-- one -->\n\n<!-- two -->\n";
    const nodes = parseMarkdown(content);
    const statements = selectorMarkupStatements({
      markup: [
        {
          name: "batchComments",
          comment: {},
          captures: ["match.1"],
          batchMatches: true,
          actions: ["find"],
        },
      ],
      nodes,
      content,
      getLine: () => 1,
    });
    expect(statements).to.have.length(1);
    expect(statements[0][1]).to.equal("<!-- one -->\n<!-- two -->");
  });

  it("parses IAL bare tokens and rejects empty attribute lists", function () {
    expect(parseAttributeList(": data-live foo")).to.deep.equal({
      "data-live": true,
      foo: true,
    });
    expect(parseAttributeList("   ")).to.equal(null);
  });

  it("ignores unparseable fence-meta braces", function () {
    const cb = parseMarkdown("```js {   }\nx\n```\n").find(
      (n) => n.kind === "codeBlock"
    );
    expect(cb.attributes).to.equal(undefined);
  });

  it("applies image context options", function () {
    const content = "See ![shot](a.png) here\n";
    const ctx = ctxFor(content);
    const img = ctx.nodes.find((n) => n.kind === "image");
    expect(
      matchSelector(img, "image", { precededBy: "See\\s+$" }, ctx)
    ).to.have.length(1);
    expect(
      matchSelector(img, "image", { followedBy: "^ here" }, ctx)
    ).to.have.length(1);
  });

  it("matches emphasis nodes as their own kind", function () {
    const content = "_soft_\n";
    const ctx = ctxFor(content);
    const em = ctx.nodes.find((n) => n.kind === "emphasis");
    const results = matchSelector(em, "emphasis", { text: "^soft$" }, ctx);
    expect(results).to.have.length(1);
    expect(resolveCaptures(undefined, "emphasis", results[0])).to.deep.equal([
      "soft",
    ]);
  });

  it("rejects codeBlocks on metaMatches misses and attribute mismatches", function () {
    const content = "```bash {.live}\nls\n```\n";
    const ctx = ctxFor(content);
    const cb = ctx.nodes.find((n) => n.kind === "codeBlock");
    expect(
      matchSelector(cb, "codeBlock", { metaMatches: "zzz" }, ctx)
    ).to.have.length(0);
    expect(
      matchSelector(cb, "codeBlock", { attributes: { class: "^zzz$" } }, ctx)
    ).to.have.length(0);
  });

  it("rejects links and elements on attribute mismatches", function () {
    const content = "[t](https://x.com){: .a}\n";
    const ctx = ctxFor(content);
    const link = ctx.nodes.find((n) => n.kind === "link");
    expect(
      matchSelector(link, "link", { attributes: { class: "^zzz$" } }, ctx)
    ).to.have.length(0);
    const el = {
      kind: "element",
      startIndex: 0,
      endIndex: 5,
      tag: "x",
      attributes: { a: "b" },
      precedingText: "",
      followingText: "",
      blockId: 1,
    };
    expect(
      matchSelector(el, "element", { attributes: { a: "^z$" } }, { content: "", nodes: [el] })
    ).to.have.length(0);
  });

  it("keeps autolinks invisible to link selectors", function () {
    const nodes = parseMarkdown(
      "Visit https://example.com and <https://other.example.com>\n"
    );
    expect(nodes.filter((n) => n.kind === "link")).to.have.length(0);
  });

  it("captures image titles and empty alt text", function () {
    const img = parseMarkdown('![](a.png "cap")\n').find(
      (n) => n.kind === "image"
    );
    expect(img.title).to.equal("cap");
    expect(img.alt).to.equal("");
  });

  it("normalizes a payload-less [comment] definition to empty content", function () {
    const comment = parseMarkdown("[comment]: #\n").find(
      (n) => n.kind === "comment"
    );
    expect(comment).to.exist;
    expect(comment.content).to.equal("");
  });

  it("yields empty link text for image-only link children", function () {
    const link = parseMarkdown("[![i](s.png)](https://u.example.com)\n").find(
      (n) => n.kind === "link"
    );
    expect(link.text).to.equal("");
  });

  it("returns null for undefined statement text", function () {
    expect(parseStatementText(undefined)).to.equal(null);
  });

  it("reads container statements from node content when no value path is set", function () {
    const content = "<!-- dd step {\"wait\": 9} -->\n";
    const statements = selectorContainerStatements({
      containers: [{ comment: { matches: "^dd " } }],
      nodes: parseMarkdown(content),
      content,
      getLine: () => 1,
    });
    // Content still starts with "dd ", not a statement keyword — filtered
    // containers without a value path read the node's own content.
    expect(statements).to.have.length(0);
  });

  it("reads container statement text from text nodes and skips kinds with neither", function () {
    const content = "test end\n\n![x](a.png)\n";
    const nodes = parseMarkdown(content);
    const fromText = selectorContainerStatements({
      containers: [{ text: {} }],
      nodes,
      content,
      getLine: () => 1,
    });
    expect(fromText).to.have.length(1);
    expect(fromText[0].type).to.equal("testEnd");
    const fromImage = selectorContainerStatements({
      containers: [{ image: {} }],
      nodes,
      content,
      getLine: () => 1,
    });
    expect(fromImage).to.have.length(0);
  });

  it("filters links by display text", function () {
    const content = "[the docs](https://example.com/docs)\n";
    const ctx = ctxFor(content);
    const link = ctx.nodes.find((n) => n.kind === "link");
    expect(
      matchSelector(link, "link", { text: "docs" }, ctx)
    ).to.have.length(1);
    expect(
      matchSelector(link, "link", { text: "^other$" }, ctx)
    ).to.have.length(0);
  });

  it("skips regex definitions passed directly to selectorMarkupStatements", function () {
    const content = "**bold**\n";
    const statements = selectorMarkupStatements({
      markup: [
        { name: "regexDef", regex: ["x"], actions: ["find"] },
        { name: "sel", strong: {}, captures: ["text"], actions: ["find"] },
      ],
      nodes: parseMarkdown(content),
      content,
      getLine: () => 1,
    });
    expect(statements).to.have.length(1);
    expect(statements[0].markup.name).to.equal("sel");
  });

  it("sorts selector steps at their start when the first capture is missing", function () {
    const content = "**bold**\n";
    const nodes = parseMarkdown(content);
    const statements = selectorMarkupStatements({
      markup: [
        { name: "m", strong: {}, captures: ["match.5"], actions: ["find"] },
      ],
      nodes,
      content,
      getLine: () => 1,
    });
    expect(statements).to.have.length(1);
    expect(statements[0].sortIndex).to.equal(statements[0]._startIndex);
    expect(statements[0][1]).to.equal(undefined);
  });
});
