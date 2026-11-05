import { expect } from "chai";
import sinon from "sinon";
import { detectTests } from "../dist/index.js";
import { validate } from "../dist/validate.js";
import { parseMarkdown, parseAttributeList } from "../dist/detect/markdown.js";
import { parseStatementText, collectStatements } from "../dist/detect/selectors.js";

// Validates a config holding one custom fileType.
const check = (fileType) =>
  validate({ schemaKey: "config_v3", object: { fileTypes: [fileType] } });
const md = (extra) => ({ name: "docs", extensions: ["md"], ...extra });

// Runs detection on a string with one custom fileType, collecting warnings.
async function detect(content, fileType, { filePath = "doc.md", config = {} } = {}) {
  const warn = sinon.stub(console, "warn");
  try {
    const tests = await detectTests({ content, filePath, fileType, config: { detectSteps: true, ...config } });
    return { tests, steps: tests.flatMap((t) => t.steps), warnings: warn.args.map((a) => a[0]) };
  } finally {
    warn.restore();
  }
}
const strip = (steps) => steps.map(({ location, ...rest }) => rest);

describe("selectors", function () {
  describe("schema", function () {
    const valid = {
      "a kind alone": md({ markup: [{ codeBlock: "bash", actions: ["runShell"] }] }),
      "a kind with regex": md({ markup: [{ text: {}, regex: "v(\\d+)", actions: ["find"] }] }),
      "regex alone": md({ markup: [{ regex: ["x"], actions: ["find"] }] }),
      "the element shorthand": md({ markup: [{ element: "uicontrol", actions: ["click"] }] }),
      "every option": md({
        markup: [
          { codeBlock: { language: ["bash", ""], metaExcludes: "skip", excludes: "rm" }, captures: ["content"], actions: ["runShell"] },
          { link: { url: "^https", attributes: { class: "x", id: true }, precededBy: "Open\\s+$", excludes: "old" }, captures: ["url", "precededBy.1", "title", "text"], actions: ["goTo"] },
          { image: { src: "\\.png$", attributes: { class: "shot" } }, captures: ["src", "alt", "attributes.class"], actions: ["screenshot"] },
          { strong: { precededBy: "x$" }, actions: ["click"] },
          { emphasis: {}, actions: ["find"] },
          { comment: { excludes: "draft" }, actions: ["find"] },
          { element: { tag: ["Button"], attributes: { label: true }, precededBy: "x$" }, captures: ["attributes.label", "tag", "content"], actions: ["click"] },
          { text: { excludes: "no" }, regex: ["a(b)"], captures: ["match.1", "text"], batchMatches: true, actions: ["find"] },
        ],
      }),
      "statement containers": md({
        inlineStatements: {
          in: ["comment", { comment: { excludes: "draft" }, regex: "^dd:\\s*(.*)$" }, { element: { tag: ["meta"] }, value: "attributes.content" }],
          testStart: "x",
        },
      }),
      "extends dita": { extends: "dita" },
      "a step template with placeholders in typed fields": md({ markup: [{ regex: "(GET) (\\S+)", actions: [{ httpRequest: { method: "$1", url: "$2" } }] }] }),
    };
    for (const [name, fileType] of Object.entries(valid)) {
      it(`accepts ${name}`, function () {
        const result = check(fileType);
        expect(result.valid, result.errors).to.be.true;
      });
    }

    it("keeps an attribute's true as true when validation coerces types", function () {
      const result = validate({ schemaKey: "config_v3", object: { fileTypes: [md({ markup: [{ image: { attributes: { path: true, alt: "x" } }, actions: ["find"] }] })] } });
      expect(result.object.fileTypes[0].markup[0].image.attributes).to.deep.equal({ path: true, alt: "x" });
    });

    const invalid = {
      "two kinds": [md({ markup: [{ link: {}, image: {}, actions: ["find"] }] }), "must match exactly one schema in oneOf"],
      "neither regex nor a kind": [md({ markup: [{ actions: ["find"] }] }), "must match exactly one schema in oneOf"],
      "captures without a kind": [md({ markup: [{ regex: "a", captures: ["url"], actions: ["find"] }] }), "must match exactly one schema in oneOf"],
      "an unknown definition key": [md({ markup: [{ codeBlok: "bash", actions: ["find"] }] }), '"additionalProperty":"codeBlok"'],
      "an unknown option": [md({ markup: [{ link: { urll: "a" }, actions: ["find"] }] }), '"additionalProperty":"urll"'],
      "an option another kind owns": [md({ markup: [{ strong: { url: "a" }, actions: ["find"] }] }), '"additionalProperty":"url"'],
      "a pattern that doesn't compile": [md({ markup: [{ link: { url: "(" }, actions: ["find"] }] }), 'must match format "regex"'],
      "a capture field that doesn't exist": [md({ markup: [{ link: {}, captures: ["href"], actions: ["find"] }] }), "captures/0 must match pattern"],
      "a container with two kinds": [md({ inlineStatements: { in: [{ comment: {}, text: {} }] } }), "must match exactly one schema in oneOf"],
      "an unknown fileType key": [md({ markups: [] }), '"additionalProperty":"markups"'],
      "an unknown extends": [{ extends: "nope" }, "must be equal to one of the allowed values"],
      "an unknown action name": [md({ markup: [{ regex: "x", actions: ["$1"] }] }), "must be equal to one of the allowed values"],
      "markup on an executable fileType": [{ extensions: ["sh"], runShell: { command: "sh $1" }, markup: [] }, '"additionalProperty":"markup"'],
    };
    for (const [name, [fileType, message]] of Object.entries(invalid)) {
      it(`rejects ${name}`, function () {
        const result = check(fileType);
        expect(result.valid).to.be.false;
        expect(result.errors).to.include(message);
      });
    }
  });

  describe("statement text", function () {
    it("parses each keyword", function () {
      expect(parseStatementText('test {"testId": "a"}')).to.deep.equal({ type: "testStart", payload: '{"testId": "a"}' });
      expect(parseStatementText("test start")).to.deep.equal({ type: "testStart", payload: "" });
      expect(parseStatementText(" test end ")).to.deep.equal({ type: "testEnd", payload: "" });
      expect(parseStatementText("test ignore start")).to.deep.equal({ type: "ignoreStart", payload: "" });
      expect(parseStatementText("test ignore end")).to.deep.equal({ type: "ignoreEnd", payload: "" });
      expect(parseStatementText('step {"find": "x"}')).to.deep.equal({ type: "step", payload: '{"find": "x"}' });
    });

    it("needs the keyword to end at a word boundary", function () {
      expect(parseStatementText("testing notes: x")).to.equal(null);
      expect(parseStatementText("steps to follow")).to.equal(null);
      expect(parseStatementText("a test")).to.equal(null);
      expect(parseStatementText(undefined)).to.equal(null);
    });
  });

  describe("attribute lists", function () {
    it("reads classes, an id, and named values", function () {
      expect(parseAttributeList(': .a .b #c d="e" f=\'g\' h=i j')).to.deep.equal({ class: "a b", id: "c", d: "e", f: "g", h: "i", j: true });
    });

    it("returns null when nothing parses", function () {
      expect(parseAttributeList("  ")).to.equal(null);
    });
  });

  describe("Markdown parsing", function () {
    const kinds = (nodes) => nodes.map((n) => n.kind);

    it("reads HTML, reference-style, and expression comments", function () {
      const content = [
        "<!-- test {\"testId\": \"a\"} -->",
        "",
        "Text <!-- step {\"find\": \"x\"} --> more.",
        "",
        '[comment]: # (step {"find": "y"})',
        "",
        '{/* step {"find": "z"} */}',
        "",
        '[comment]: # (step {"runShell": "echo (x)"})',
      ].join("\n");
      const comments = parseMarkdown(content).filter((n) => n.kind === "comment");
      expect(comments.map((c) => c.content)).to.deep.equal([
        'test {"testId": "a"}',
        'step {"find": "x"}',
        'step {"find": "y"}',
        'step {"find": "z"}',
        'step {"runShell": "echo (x)"}',
      ]);
      expect(content.slice(comments[0].startIndex, comments[0].endIndex)).to.equal('<!-- test {"testId": "a"} -->');
    });

    it("reads quoted [comment]: # forms that aren't valid definitions", function () {
      const content = `[comment]: # "step {"find": "a"}"\n\n[comment]: # 'step {"runShell": "echo 'x'"}'\n\n[comment]: #\n`;
      expect(parseMarkdown(content).map((n) => n.content)).to.deep.equal(['step {"find": "a"}', `step {"runShell": "echo 'x'"}`, ""]);
    });

    it("keeps reference links as prose, and reads image titles", function () {
      const nodes = parseMarkdown('See [r][d], ![i][d], [![a](b "T")](c).\n\n[d]: /u\n');
      expect(nodes.filter((n) => n.kind === "text").map((n) => n.text)).to.deep.equal(["See [r][d], ![i][d], ", "."]);
      expect(nodes.find((n) => n.kind === "link")).to.include({ text: "", url: "c" });
      expect(nodes.find((n) => n.kind === "image")).to.include({ title: "T" });
    });

    it("keeps comment syntax out of the surrounding text", function () {
      const nodes = parseMarkdown('Before {/* step {"type": "x"} */} after.');
      expect(nodes.filter((n) => n.kind === "text").map((n) => n.text)).to.deep.equal(["Before ", " after."]);
    });

    it("finds nothing inside code", function () {
      const nodes = parseMarkdown('```md\n<!-- test -->\n**bold**\n```\n\nSee `<!-- step -->` and `**x**`.');
      expect(kinds(nodes)).to.deep.equal(["codeBlock", "text", "text", "text"]);
    });

    it("reads a fence's language, meta, content, and attributes", function () {
      const [fence] = parseMarkdown('```bash testIgnore {.a key="b"}\necho hi\n```');
      expect(fence).to.include({ kind: "codeBlock", language: "bash", meta: 'testIgnore {.a key="b"}', content: "echo hi" });
      expect(fence.attributes).to.deep.equal({ class: "a", key: "b" });
      expect(parseMarkdown("```\nx\n```")[0]).to.include({ language: "", meta: "" });
    });

    it("skips indented code", function () {
      expect(parseMarkdown("Text.\n\n    GET /x\n")).to.have.lengthOf(1);
    });

    it("finds fences inside list items", function () {
      const nodes = parseMarkdown("1. Run:\n\n   ```bash\n   echo hi\n   ```\n");
      expect(nodes.find((n) => n.kind === "codeBlock")).to.include({ content: "echo hi" });
    });

    it("reads links, images, strong, and emphasis", function () {
      const nodes = parseMarkdown('Go to [the **site**](https://a.com "T") and ![Alt](i.png){.screenshot}, then *see* __this__.');
      const link = nodes.find((n) => n.kind === "link");
      expect(link).to.include({ text: "the site", url: "https://a.com", title: "T", before: "Go to " });
      expect(nodes.find((n) => n.kind === "image")).to.include({ src: "i.png", alt: "Alt" });
      expect(nodes.find((n) => n.kind === "image").attributes).to.deep.equal({ class: "screenshot" });
      expect(nodes.filter((n) => n.kind === "strong").map((n) => n.text)).to.deep.equal(["site", "this"]);
      expect(nodes.find((n) => n.kind === "emphasis")).to.include({ text: "see" });
    });

    it("gives strong text as it renders", function () {
      expect(parseMarkdown("**`x`**").find((n) => n.kind === "strong")).to.include({ text: "x" });
    });

    it("leaves autolinks in the text", function () {
      const nodes = parseMarkdown('Enter "<a@b.co>" and https://x.com.');
      expect(kinds(nodes)).to.deep.equal(["text"]);
      expect(nodes[0].text).to.equal('Enter "<a@b.co>" and https://x.com.');
    });

    it("gives each text run its raw source", function () {
      const content = 'Type "a"\nand [x](y) then type "b".';
      const texts = parseMarkdown(content).filter((n) => n.kind === "text");
      expect(texts.map((n) => content.slice(n.startIndex, n.endIndex))).to.deep.equal(texts.map((n) => n.text));
      expect(texts.map((n) => n.text)).to.deep.equal(['Type "a"\nand ', ' then type "b".']);
    });

    it("measures before from the start of the block", function () {
      const nodes = parseMarkdown("# Title\n\nFirst [a](b) and [c](d).");
      expect(nodes.filter((n) => n.kind === "link").map((n) => n.before)).to.deep.equal(["First ", "First [a](b) and "]);
    });
  });

  describe("MDX parsing", function () {
    it("reads expression comments and components", function () {
      const nodes = parseMarkdown('{/* test {"testId": "a"} */}\n\n<Tabs>\n  <Tab label="One" open>\n    Click **Go**.\n  </Tab>\n</Tabs>\n', true);
      expect(nodes.find((n) => n.kind === "comment")).to.include({ content: 'test {"testId": "a"}' });
      const tab = nodes.find((n) => n.tag === "Tab");
      expect(tab).to.include({ kind: "element", content: "Click Go." });
      expect(tab.attributes).to.deep.equal({ label: "One", open: true });
      expect(nodes.find((n) => n.kind === "strong")).to.include({ text: "Go" });
    });

    it("reads inline components and expressions", function () {
      const nodes = parseMarkdown('Press <Kbd>Enter</Kbd> {/* step {"find": "a"} */} {1 + 1}.\n\n<>\n  <Button {...props} count={2} label="Go" />\n</>\n', true);
      expect(nodes.filter((n) => n.kind === "comment").map((n) => n.content)).to.deep.equal(['step {"find": "a"}']);
      expect(nodes.filter((n) => n.kind === "element").map((n) => [n.tag, n.content, n.attributes])).to.deep.equal([
        ["Kbd", "Enter", undefined],
        ["Button", "", { count: "2", label: "Go" }],
      ]);
    });

    it("throws on invalid MDX", function () {
      expect(() => parseMarkdown("<Tab>\n\nunclosed", true)).to.throw();
    });
  });

  describe("detection", function () {
    it("reads statements from comment containers", async function () {
      const content = '<!-- test {"testId": "t"} -->\n\n<!-- step {"find": "a"} -->\n\n<!-- testing notes: x -->\n\n```md\n<!-- step {"find": "no"} -->\n```\n\n<!-- test end -->\n';
      const { tests, steps } = await detect(content, md({ inlineStatements: { in: ["comment"] } }));
      expect(tests.map((t) => t.testId)).to.deep.equal(["t"]);
      expect(strip(steps)).to.deep.equal([{ find: "a" }]);
    });

    it("honors ignore statements from containers", async function () {
      const content = '<!-- test ignore start -->\n\n**a**\n\n<!-- test ignore end -->\n\n**b**\n';
      const { steps } = await detect(content, md({ inlineStatements: { in: ["comment"] }, markup: [{ strong: {}, actions: ["find"] }] }));
      expect(strip(steps)).to.deep.equal([{ find: "b" }]);
    });

    it("reads container text with a regex", async function () {
      const content = '<!-- dd: step {"find": "a"} -->\n\n<!-- step {"find": "no"} -->\n\n<!-- draft dd: step {"find": "no"} -->\n';
      const fileType = md({ inlineStatements: { in: [{ comment: { excludes: "draft" }, regex: "^dd:\\s*(.*)$" }] } });
      expect(strip((await detect(content, fileType)).steps)).to.deep.equal([{ find: "a" }]);
    });

    it("reads container text from a field", async function () {
      const content = '<Meta name="dd" content=\'step {"find": "a"}\' />\n';
      const fileType = { name: "docs", extensions: ["mdx"], inlineStatements: { in: [{ element: { tag: ["Meta"], attributes: { name: "^dd$" } }, value: "attributes.content" }] } };
      expect(strip((await detect(content, fileType, { filePath: "doc.mdx" })).steps)).to.deep.equal([{ find: "a" }]);
    });

    it("uses a node's main text when there are no captures", async function () {
      const content = "Click **Save**. ![Chart](c.png)\n\n```bash\necho hi\n```\n";
      const fileType = md({ markup: [{ strong: {}, actions: ["find"] }, { image: {}, actions: ["find"] }, { codeBlock: "bash", actions: ["runShell"] }] });
      expect(strip((await detect(content, fileType)).steps)).to.deep.equal([{ find: "Save" }, { find: "Chart" }, { runShell: "echo hi" }]);
    });

    it("maps captures to $1, $2, and so on", async function () {
      const content = 'Open [Docs](https://d.com "Home"). See [x](https://x.com).\n';
      const fileType = md({ markup: [{ link: { precededBy: "([Oo]pen)\\s+$" }, captures: ["url", "precededBy.1", "title", "alt", "attributes.none"], actions: [{ goTo: { url: "$1" } }, { find: "$2 $3$4$5" }] }] });
      expect(strip((await detect(content, fileType)).steps)).to.deep.equal([{ goTo: { url: "https://d.com" } }, { find: "Open Home" }]);
    });

    it("keeps document order when the first capture comes from outside the node", async function () {
      const content = "Open the long sentence here [a](https://x.com) **b**\n";
      const fileType = md({ markup: [{ link: { precededBy: "(.*)$" }, captures: ["precededBy.1"], actions: ["find"] }, { strong: {}, actions: ["click"] }] });
      expect(strip((await detect(content, fileType)).steps)).to.deep.equal([{ find: "Open the long sentence here " }, { click: "b" }]);
    });

    it("treats a pattern that doesn't compile as matching nothing", async function () {
      const fileType = md({ markup: [{ link: { url: "(" }, actions: ["find"] }, { link: { precededBy: "(" }, actions: ["find"] }, { link: {}, regex: "(", actions: ["find"] }, { actions: ["find"] }] });
      expect((await detect("[a](b)\n", fileType)).steps).to.deep.equal([]);
    });

    it("reads containers whose field is empty or whose regex has no group", async function () {
      const content = '<!-- step {"find": "a"} -->\n';
      const fileType = md({ inlineStatements: { in: [{ comment: {}, value: "precededBy.1" }, { comment: {}, regex: "^step\\b.*" }] } });
      expect(strip((await detect(content, fileType)).steps)).to.deep.equal([{ find: "a" }]);
    });

    it("applies every option", async function () {
      const content = [
        "See [old](https://old.com), [new](https://new.com), and [rel](/x).",
        "",
        "```bash skip",
        "no",
        "```",
        "",
        "```bash",
        "rm -rf /",
        "```",
        "",
        "```sh",
        "no",
        "```",
        "",
        "```",
        "yes",
        "```",
        "",
        "![a](a.png){.shot} ![b](b.jpg){.shot} ![c](c.png) ![d](d.png){.shot path=\"p.png\"}",
      ].join("\n");
      const fileType = md({
        markup: [
          { link: { url: "^https://", excludes: "old" }, captures: ["url"], actions: ["checkLink"] },
          { codeBlock: { language: ["bash", ""], metaExcludes: "skip", excludes: "rm -rf" }, actions: ["runShell"] },
          { image: { src: "\\.png$", attributes: { class: "(^|\\s)shot$" } }, captures: ["src"], actions: ["screenshot"] },
          { image: { attributes: { path: true } }, captures: ["attributes.path"], actions: ["find"] },
        ],
      });
      expect(strip((await detect(content, fileType)).steps)).to.deep.equal([
        { checkLink: "https://new.com" },
        { runShell: "yes" },
        { screenshot: "a.png" },
        { screenshot: "d.png" },
        { find: "p.png" },
      ]);
    });

    it("runs a kind's regex inside each node, once per occurrence", async function () {
      const content = 'Type "a" and type "b".\n\n`Type "no"`\n\n```\nType "no"\n```\n\n**Type "c"**\n';
      const fileType = md({ markup: [{ text: {}, regex: '\\b[Tt]ype\\s+"([^"]+)"', actions: ["type"] }] });
      const { steps } = await detect(content, fileType);
      expect(strip(steps)).to.deep.equal([{ type: "a" }, { type: "b" }]);
      expect(content.slice(steps[1].location.startIndex, steps[1].location.endIndex)).to.equal('type "b"');
    });

    it("combines regex groups and fields", async function () {
      const content = "![Figure 2: A](a.png)\n";
      const fileType = md({ markup: [{ image: {}, regex: "^Figure (\\d+)", captures: ["src", "match.1", "match.5"], actions: [{ screenshot: { path: "$1", directory: "$2" } }, { find: "$3" }] }] });
      expect(strip((await detect(content, fileType)).steps)).to.deep.equal([{ screenshot: { path: "a.png", directory: "2" } }]);
    });

    it("keeps regex definitions matching raw text, beside selectors", async function () {
      const content = "**a**\n\n```\n**b**\n```\n";
      const fileType = md({ markup: [{ regex: ["\\*\\*(\\w+)\\*\\*"], actions: ["find"] }, { strong: {}, actions: ["click"] }] });
      expect(strip((await detect(content, fileType)).steps)).to.deep.equal([{ find: "a" }, { click: "a" }, { find: "b" }]);
    });

    it("batches selector matches", async function () {
      const content = "```bash\na\n```\n\n```bash\nb\n```\n";
      const fileType = md({ markup: [{ codeBlock: "bash", batchMatches: true, actions: ["runShell"] }] });
      expect(strip((await detect(content, fileType)).steps)).to.deep.equal([{ runShell: "a\nb" }]);
    });

    it("leaves selector markup off without step detection", async function () {
      const fileType = md({ markup: [{ strong: {}, actions: ["find"] }] });
      expect((await detect("**a**\n", fileType, { config: { detectSteps: false } })).steps).to.deep.equal([]);
    });

    it("drops a statement both a regex and a container find", async function () {
      const content = '<!-- step {"find": "a"} -->\n';
      const fileType = md({ inlineStatements: { in: ["comment"], step: ["<!--\\s*step\\s*([\\s\\S]*?)\\s*-->"] } });
      expect(strip((await detect(content, fileType)).steps)).to.deep.equal([{ find: "a" }]);
    });

    it("parses .md files that extend markdown under another extension", async function () {
      const fileType = { name: "guide", extends: "markdown", extensions: ["txt"], markup: [{ strong: {}, actions: ["find"] }] };
      expect(strip((await detect("**a**\n", fileType, { filePath: "doc.txt" })).steps)).to.deep.equal([{ find: "a" }]);
    });

    it("parses .mdx as MDX, and falls back to Markdown with a warning", async function () {
      const fileType = { name: "docs", extensions: ["mdx"], markup: [{ element: "Button", captures: ["attributes.label"], actions: ["click"] }, { strong: {}, actions: ["find"] }] };
      const ok = await detect('<Button label="Go" />\n\n<Other label="No" />\n\n**a**\n', fileType, { filePath: "doc.mdx" });
      expect(strip(ok.steps)).to.deep.equal([{ click: "Go" }, { find: "a" }]);
      expect(ok.warnings).to.deep.equal([]);
      const bad = await detect("<Tab>\n\n**a**\n", fileType, { filePath: "doc.mdx" });
      expect(strip(bad.steps)).to.deep.equal([{ find: "a" }]);
      expect(bad.warnings).to.have.lengthOf(1);
      expect(bad.warnings[0]).to.match(/^doc\.mdx: couldn't parse as MDX \(.+\)\. Parsed as Markdown, so content inside JSX components isn't detected\.$/);
    });

    it("warns when no parser handles the file, and still runs regex definitions", async function () {
      const fileType = { name: "wiki", extensions: ["wiki"], markup: [{ regex: ["'''(\\w+)'''"], actions: ["find"] }, { strong: {}, actions: ["click"] }] };
      const { steps, warnings } = await detect("'''a'''\n", fileType, { filePath: "doc.wiki" });
      expect(strip(steps)).to.deep.equal([{ find: "a" }]);
      expect(warnings).to.deep.equal([
        'doc.wiki: "wiki" uses selectors, but no parser handles .wiki. Set "extends" to a built-in, or use regex definitions.',
      ]);
    });

    it("names an unnamed fileType in the warning", async function () {
      const { warnings } = await detect("**a**\n", { extensions: ["wiki"], markup: [{ strong: {}, actions: ["find"] }] }, { filePath: "doc.wiki" });
      expect(warnings).to.deep.equal(['doc.wiki: A fileType uses selectors, but no parser handles .wiki. Set "extends" to a built-in, or use regex definitions.']);
    });

    it("picks a parser by name when the file has no extension", async function () {
      const fileType = { name: "markdown", extensions: ["md"], markup: [{ strong: {}, actions: ["find"] }] };
      expect(strip((await detect("**a**\n", fileType, { filePath: "" })).steps)).to.deep.equal([{ find: "a" }]);
    });

    it("parses nothing when a fileType has no selectors", function () {
      const statements = collectStatements({ content: "**a**", fileType: md({ markup: [{ regex: ["\\*\\*(a)\\*\\*"], actions: ["find"] }] }), filePath: "x.unknown", detectSteps: true, warn: () => { throw new Error("warned"); } });
      expect(statements.map((s) => s.type)).to.deep.equal(["detectedStep"]);
    });
  });
});
