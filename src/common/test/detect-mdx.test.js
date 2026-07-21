import { expect } from "chai";
import { parseMdx, resolveBackend } from "../dist/detect/index.js";
import { detectTests } from "../dist/detectTests.js";
import { defaultFileTypes } from "../dist/fileTypes.js";
import { validate } from "../dist/validate.js";

const first = (nodes, kind) => nodes.find((n) => n.kind === kind);
const all = (nodes, kind) => nodes.filter((n) => n.kind === kind);

describe("detect: mdx backend", function () {
  describe("expression comments", function () {
    it("normalizes flow expression comments into comment nodes", function () {
      const mdx = '{/* test {"testId": "t"} */}\n\nBody text.\n';
      const nodes = parseMdx(mdx);
      const c = first(nodes, "comment");
      expect(c).to.exist;
      expect(c.content).to.equal('test {"testId": "t"}');
      expect(mdx.slice(c.startIndex, c.endIndex)).to.equal(
        '{/* test {"testId": "t"} */}'
      );
    });

    it("normalizes inline expression comments into comment nodes", function () {
      const mdx = 'Some text {/* step {"wait": 1} */} more.\n';
      const c = first(parseMdx(mdx), "comment");
      expect(c).to.exist;
      expect(c.content).to.equal('step {"wait": 1}');
    });

    it("ignores non-comment expressions, imports, and exports", function () {
      const mdx = [
        'import { X } from "y";',
        "",
        "export const region = 1;",
        "",
        "Count: {1 + 2}",
        "",
      ].join("\n");
      const nodes = parseMdx(mdx);
      expect(all(nodes, "comment")).to.have.length(0);
      expect(all(nodes, "element")).to.have.length(0);
    });
  });

  describe("JSX elements", function () {
    it("emits element nodes for flow JSX components with attributes", function () {
      const mdx = '<Button label="Save" disabled count={2} />\n';
      const el = first(parseMdx(mdx), "element");
      expect(el).to.exist;
      expect(el.tag).to.equal("Button");
      expect(el.attributes).to.deep.equal({
        label: "Save",
        disabled: true,
        count: "2",
      });
    });

    it("emits element nodes for inline JSX with text content", function () {
      const mdx = "Press <Kbd>Enter</Kbd> to search.\n";
      const el = first(parseMdx(mdx), "element");
      expect(el.tag).to.equal("Kbd");
      expect(el.content).to.equal("Enter");
    });

    it("skips spread attributes while keeping static ones", function () {
      const mdx = '<Button {...props} label="x" />\n';
      const el = first(parseMdx(mdx), "element");
      expect(el.attributes).to.deep.equal({ label: "x" });
    });

    it("skips nameless fragments but walks their children", function () {
      const mdx = "<>\n**bold**\n</>\n";
      const nodes = parseMdx(mdx);
      expect(all(nodes, "element")).to.have.length(0);
      expect(first(nodes, "strong").text).to.equal("bold");
    });

    it("walks markdown content nested inside JSX containers", function () {
      const mdx = '<Wrap>\n\n[docs](https://example.com/docs)\n\n</Wrap>\n';
      const link = first(parseMdx(mdx), "link");
      expect(link).to.exist;
      expect(link.url).to.equal("https://example.com/docs");
    });
  });

  describe("markdown constructs in MDX", function () {
    it("still emits links, strong, code blocks, and IAL image attributes", function () {
      const mdx = [
        "Click **Run** then open [console](https://console.example.com).",
        "",
        "![shot](a.png){: .screenshot }",
        "",
        "```bash",
        "ls",
        "```",
        "",
      ].join("\n");
      const nodes = parseMdx(mdx);
      expect(first(nodes, "strong").text).to.equal("Run");
      expect(first(nodes, "link").url).to.equal("https://console.example.com");
      expect(first(nodes, "image").attributes).to.deep.equal({
        class: "screenshot",
      });
      expect(first(nodes, "codeBlock").language).to.equal("bash");
    });
  });

  describe("MDX strictness", function () {
    it("throws on HTML comments (invalid MDX syntax)", function () {
      expect(() => parseMdx("<!-- test -->\n")).to.throw();
    });
  });

  describe("backend resolution", function () {
    it("resolves .mdx to the mdx backend (expression comments parse)", function () {
      const backend = resolveBackend("mdx");
      const nodes = backend("{/* test */}\n");
      expect(first(nodes, "comment").content).to.equal("test");
    });

    it("resolves via the mdx fileType name for unmapped extensions", function () {
      const backend = resolveBackend("weird", { name: "mdx", extensions: [] });
      expect(backend).to.be.a("function");
    });
  });
});

describe("mdx built-in fileType", function () {
  it("exists with its own extension, split from markdown", function () {
    expect(defaultFileTypes.mdx).to.exist;
    expect(defaultFileTypes.mdx.extensions).to.deep.equal(["mdx"]);
    expect(defaultFileTypes.markdown.extensions).to.not.include("mdx");
    // Same selector markup as markdown.
    expect(defaultFileTypes.mdx.markup).to.deep.equal(
      defaultFileTypes.markdown.markup
    );
    expect(defaultFileTypes.mdx.inlineStatements.in).to.deep.equal(["comment"]);
  });

  it("validates as a predefined fileTypes string in config_v3", function () {
    const result = validate({
      schemaKey: "config_v3",
      object: { fileTypes: ["markdown", "mdx"] },
    });
    expect(result.valid, result.errors).to.be.true;
  });

  it("validates as an extends target in config_v3", function () {
    const result = validate({
      schemaKey: "config_v3",
      object: {
        fileTypes: [{ extends: "mdx", extensions: ["mdx2"] }],
      },
    });
    expect(result.valid, result.errors).to.be.true;
  });

  it("appears in the config_v3 fileTypes default", function () {
    const result = validate({ schemaKey: "config_v3", object: {} });
    expect(result.valid, result.errors).to.be.true;
    expect(result.object.fileTypes).to.include("mdx");
  });

  it("detects statements and markup end-to-end in an .mdx file", async function () {
    const content = [
      '{/* test {"testId": "mdx-flow"} */}',
      "",
      'import { Callout } from "@site/components";',
      "",
      "Click **Run**, then go to [the console](https://console.example.com).",
      "",
      '{/* step {"wait": 100} */}',
      "",
      "{/* test ignore start */}",
      "[Broken](https://example.com/broken)",
      "{/* test ignore end */}",
      "",
      "{/* test end */}",
      "",
    ].join("\n");
    const tests = await detectTests({
      content,
      filePath: "doc.mdx",
      fileType: defaultFileTypes.mdx,
      config: { detectSteps: true },
    });
    expect(tests).to.have.length(1);
    expect(tests[0].testId).to.equal("mdx-flow");
    const kinds = tests[0].steps.map((s) => Object.keys(s).find((k) => k !== "location" && k !== "stepId"));
    // click+find and goTo+checkLink pairs both fire on the same constructs,
    // matching the legacy markdown engine's behavior.
    expect(kinds).to.deep.equal(["click", "find", "goTo", "checkLink", "wait"]);
    expect(tests[0].steps[2].goTo).to.equal("https://console.example.com");
  });

  it("detects JSX elements via custom element selectors in .mdx", async function () {
    const content = [
      '{/* test {"testId": "jsx"} */}',
      "",
      '<Button label="Save" />',
      "",
      "{/* test end */}",
      "",
    ].join("\n");
    const tests = await detectTests({
      content,
      filePath: "doc.mdx",
      fileType: {
        name: "mdx-custom",
        extensions: ["mdx"],
        inlineStatements: { in: ["comment"] },
        markup: [
          {
            name: "clickNamedButton",
            element: { tag: "Button", attributes: { label: true } },
            captures: ["attributes.label"],
            actions: ["click"],
          },
        ],
      },
      config: { detectSteps: true },
    });
    expect(tests).to.have.length(1);
    expect(tests[0].steps).to.have.length(1);
    expect(tests[0].steps[0].click).to.equal("Save");
  });

  it("degrades an .mdx file containing HTML comments to no detection (documented divergence)", async function () {
    const content = '<!-- test {"testId": "old"} -->\n\nText.\n';
    const tests = await detectTests({
      content,
      filePath: "doc.mdx",
      fileType: defaultFileTypes.mdx,
    });
    expect(tests).to.deep.equal([]);
  });
});
