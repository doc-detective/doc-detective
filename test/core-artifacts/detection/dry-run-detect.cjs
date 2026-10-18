// Detection permutation check, run by detection-permutations.spec.json.
//
//   node test/core-artifacts/detection/dry-run-detect.cjs <case>
//
// fileTypes are config-level, so each case writes its document and config to
// .tmp/fixture-detection/<case>/ (outside test/core-artifacts/, so the
// documents are never picked up as fixtures themselves), runs the real CLI
// with --dry-run, and compares the detected steps per test with the case's
// expectation. Exits non-zero on any mismatch.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const shell = (s) => ({ runShell: `echo ${s}` });
const step = (s) => JSON.stringify(shell(s));

// Selector definitions shared by the opt-in custom fileType cases.
const markdownSelectors = {
  name: "markdown-selectors",
  extensions: ["md"],
  inlineStatements: { in: ["comment"] },
  markup: [
    {
      name: "goToLink",
      link: { url: "^https?://", precededBy: "\\b[Gg]o to\\s+$" },
      captures: ["url"],
      actions: ["goTo"],
    },
    {
      name: "screenshotByClass",
      image: { attributes: { class: "(?:^|\\s)screenshot(?:\\s|$)", path: true } },
      captures: ["attributes.path"],
      actions: ["screenshot"],
    },
    {
      name: "findBold",
      strong: {},
      captures: ["text"],
      actions: ["find"],
    },
    {
      name: "clickItalic",
      emphasis: { precededBy: "\\b[Cc]lick\\s+$" },
      captures: ["text"],
      actions: ["click"],
    },
    {
      name: "typeQuoted",
      text: { matches: '\\b[Tt]ype\\s+"([^"]+)"' },
      captures: ["match.1"],
      actions: ["type"],
    },
    {
      name: "runBash",
      codeBlock: { language: "bash", metaExcludes: "testIgnore" },
      captures: ["content"],
      actions: [{ runShell: "$1" }],
    },
  ],
};

const cases = {
  // --- Built-ins keep their legacy detection (ADR 01139) ---
  "builtin-md-code-fence": {
    file: "doc.md",
    content: `<!-- step ${step("prose")} -->\n\n\`\`\`md\n<!-- step ${step("fenced")} -->\n\`\`\`\n`,
    expect: [[shell("prose"), shell("fenced")]],
  },
  "builtin-md-lazy-definition": {
    file: "doc.md",
    content: `Go to the page.\n[comment]: # (step ${step("lazy")})\n`,
    expect: [[shell("lazy")]],
  },
  "builtin-md-expression-comments": {
    file: "doc.md",
    content: `Inline {/* step ${step("inline")} */} comment.\n\n{/* step ${step("flow")} */}\n`,
    expect: [[shell("inline"), shell("flow")]],
  },
  "builtin-md-screenshot-class": {
    file: "doc.md",
    config: { detectSteps: true },
    content: "![a](a.png){: .screenshot}\n\n![b](b.png){: .no-screenshot}\n",
    expect: [[{ screenshot: "a.png" }]],
  },
  "builtin-md-type-text-lowercase": {
    file: "doc.md",
    config: { detectSteps: true },
    content: 'Type "Upper" in the box, then type "lower" in the other.\n',
    expect: [[{ type: "lower" }]],
  },
  "builtin-mdx-default-config": {
    file: "doc.mdx",
    content: `<!-- step ${step("html")} -->\n\n{/* step ${step("expression")} */}\n\n[comment]: # (step ${step("definition")})\n`,
    expect: [[shell("html"), shell("expression"), shell("definition")]],
  },
  "builtin-mdx-explicit-markdown": {
    file: "doc.mdx",
    config: { fileTypes: ["markdown"] },
    content: `<!-- step ${step("html")} -->\n\n{/* step ${step("expression")} */}\n`,
    expect: [[shell("html"), shell("expression")]],
  },
  "builtin-html-pre-comment": {
    file: "doc.html",
    content: `<p>Hi</p>\n<pre><!-- step ${step("pre")} --></pre>\n`,
    expect: [[shell("pre")]],
  },
  "builtin-asciidoc-listing": {
    file: "doc.adoc",
    content: `// (step ${step("comment")})\n\n----\n// (step ${step("listing")})\n----\n`,
    expect: [[shell("comment"), shell("listing")]],
  },
  "legacy-config-extra-markup-key": {
    file: "doc.md",
    config: {
      detectSteps: true,
      fileTypes: [
        {
          extends: "markdown",
          markup: [
            {
              name: "magic",
              regex: ["MAGIC (\\w+)"],
              actions: [{ runShell: "echo $1" }],
              description: "An unknown key every release has accepted.",
            },
          ],
        },
      ],
    },
    content: "Say MAGIC word.\n",
    expect: [[shell("word")]],
  },

  // --- Opt-in mdx built-in ---
  "optin-mdx": {
    file: "doc.mdx",
    config: { detectSteps: true, fileTypes: ["mdx", "markdown"] },
    content: [
      'import X from "./x";',
      "",
      `<!-- step ${step("html")} -->`,
      "",
      `{/* step ${step("expression")} */}`,
      "",
      "```md",
      `<!-- step ${step("fenced")} -->`,
      "```",
      "",
      "<X>",
      "  Click **Save** now.",
      "</X>",
      "",
      "![a](a.png){: .screenshot}",
      "",
      "![b](b.png){: .no-screenshot}",
      "",
    ].join("\n"),
    expect: [
      [shell("html"), shell("expression"), { click: "Save" }, { find: "Save" }, { screenshot: "a.png" }],
    ],
  },
  "optin-container-regex-dedupe": {
    file: "doc.mdx",
    config: {
      fileTypes: [
        {
          extends: "mdx",
          inlineStatements: { step: ["<!--\\s*step\\s*([\\s\\S]*?)\\s*-->"] },
        },
      ],
    },
    content: `<!-- step ${step("once")} -->\n`,
    expect: [[shell("once")]],
  },
  "optin-parse-failure-falls-back-to-regex": {
    file: "doc.mdx",
    config: {
      fileTypes: [
        {
          extends: "mdx",
          inlineStatements: { step: ["<!--\\s*step\\s*([\\s\\S]*?)\\s*-->"] },
        },
      ],
    },
    content: `Text <div\n\n<!-- step ${step("regex")} -->\n\n{/* step ${step("container")} */}\n`,
    expect: [[shell("regex")]],
  },

  // --- Opt-in selector custom fileTypes ---
  "selector-markdown-kinds": {
    file: "doc.md",
    config: { detectSteps: true, fileTypes: [markdownSelectors] },
    content: [
      `<!-- step ${step("statement")} -->`,
      "",
      "Go to [Example](https://example.com).",
      "",
      '![shot](a.png){: .screenshot path="shots/a.png"}',
      "",
      '![other](b.png){: .no-screenshot path="shots/b.png"}',
      "",
      "Look for **Ready**, then click _Continue_.",
      "",
      'Type "hello" in the box.',
      "",
      "```bash",
      "echo bash-block",
      "```",
      "",
      "```bash testIgnore",
      "echo ignored-block",
      "```",
      "",
    ].join("\n"),
    expect: [
      [
        shell("statement"),
        { goTo: "https://example.com" },
        { screenshot: "shots/a.png" },
        { find: "Ready" },
        { click: "Continue" },
        { type: "hello" },
        { runShell: "echo bash-block" },
      ],
    ],
  },
  "selector-detect-steps-false": {
    file: "doc.md",
    config: { detectSteps: false, fileTypes: [markdownSelectors] },
    content: `<!-- step ${step("statement")} -->\n\nLook for **Ready**.\n`,
    expect: [[shell("statement")]],
  },
  "selector-extends-builtin": {
    file: "doc.md",
    config: {
      detectSteps: true,
      fileTypes: [
        {
          extends: "markdown",
          markup: [{ name: "findItalic", emphasis: {}, captures: ["text"], actions: ["find"] }],
        },
      ],
    },
    content: "Click **Save**, then wait for _Saved_.\n",
    expect: [[{ click: "Save" }, { find: "Save" }, { find: "Saved" }]],
  },
  "selector-html-element": {
    file: "doc.html",
    config: {
      detectSteps: true,
      fileTypes: [
        {
          name: "html-selectors",
          extensions: ["html"],
          inlineStatements: { in: ["comment"] },
          markup: [
            {
              name: "clickTestButton",
              element: { tag: "button", attributes: { "data-test": true } },
              captures: ["content"],
              actions: ["click"],
            },
          ],
        },
      ],
    },
    content: [
      "<!DOCTYPE html>",
      "<html><body>",
      `<!-- step ${step("comment")} -->`,
      '<button data-test="save">Save</button>',
      "<button>Untracked</button>",
      `<pre><!-- step ${step("pre")} --></pre>`,
      "<script>var s = '<!-- step {\"wait\": 1} -->';</script>",
      "</body></html>",
      "",
    ].join("\n"),
    // Selector mode keeps code regions inert: the <pre> comment and the
    // script string don't surface (the regex built-in would detect both).
    expect: [[shell("comment"), { click: "Save" }]],
  },
  "selector-dita-chain": {
    file: "doc.dita",
    config: {
      detectSteps: true,
      fileTypes: [
        {
          name: "dita-selectors",
          extensions: ["dita"],
          inlineStatements: {
            in: [
              "comment",
              {
                element: { tag: "data", attributes: { name: "^doc-detective$" } },
                value: "attributes.value",
              },
            ],
          },
          markup: [
            {
              name: "typeIntoUiControl",
              element: {
                tag: "userinput",
                precededBy: "\\b[Tt]ype\\s+$",
                followedBy: {
                  text: "^\\s+into\\s+the\\s+$",
                  then: { element: { tag: "uicontrol" } },
                },
              },
              captures: ["content", "then.content"],
              actions: [{ type: { keys: "$1", selector: "$2" } }],
            },
          ],
        },
      ],
    },
    content: [
      '<?xml version="1.0"?>',
      '<topic id="t"><title>Chain &reg;</title><body>',
      `<p><data name="doc-detective" value='step ${step("data")}'/></p>`,
      `<p><data name="doc-detective-notes" value='step ${step("notes")}'/></p>`,
      "<p>Type <userinput>abc</userinput> into the <uicontrol>Name</uicontrol>.</p>",
      "</body></topic>",
      "",
    ].join("\n"),
    expect: [[shell("data"), { type: { keys: "abc", selector: "Name" } }]],
  },
  "selector-asciidoc": {
    file: "doc.adoc",
    config: {
      detectSteps: true,
      fileTypes: [
        {
          name: "asciidoc-selectors",
          extensions: ["adoc"],
          inlineStatements: {
            in: [{ comment: { matches: "^\\(\\s*([\\s\\S]*?)\\s*\\)$" }, value: "match.1" }],
          },
          markup: [
            {
              name: "checkLinks",
              link: { url: "^https?://" },
              captures: ["url"],
              actions: ["checkLink"],
            },
            {
              name: "runBash",
              codeBlock: "bash",
              captures: ["content"],
              actions: [{ runShell: "$1" }],
            },
          ],
        },
      ],
    },
    content: [
      "// a plain comment",
      `// (step ${step("comment")})`,
      "",
      "See https://example.com[the site].",
      "",
      "[source,bash]",
      "----",
      `// (step ${step("listing")})`,
      "----",
      "",
    ].join("\n"),
    expect: [
      [
        shell("comment"),
        { checkLink: "https://example.com" },
        { runShell: `// (step ${step("listing")})` },
      ],
    ],
  },
};

const name = process.argv[2];
const c = cases[name];
if (!c) {
  console.error(`Unknown case "${name}". Cases: ${Object.keys(cases).join(", ")}`);
  process.exit(2);
}
const root = path.resolve(__dirname, "../../..");
const dir = path.join(root, ".tmp", "fixture-detection", name);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const doc = path.join(dir, c.file);
const cfg = path.join(dir, "config.json");
fs.writeFileSync(doc, c.content);
fs.writeFileSync(cfg, JSON.stringify({ telemetry: { send: false }, ...c.config }, null, 2));

const out = execFileSync(
  process.execPath,
  [path.join(root, "bin", "doc-detective.js"), "runTests", "--input", doc, "--config", cfg, "--dry-run"],
  { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
);
const resolved = JSON.parse(out);
// The runner resolves screenshot paths against the document; compare them
// relative to the case directory, with forward slashes.
const strip = (s) => {
  const { location, stepId, description, ...rest } = s;
  if (typeof rest.screenshot === "string" && path.isAbsolute(rest.screenshot)) {
    rest.screenshot = path.relative(dir, rest.screenshot).split(path.sep).join("/");
  }
  return rest;
};
const actual = (resolved.specs[0]?.tests ?? []).map((t) => t.contexts[0].steps.map(strip));
if (JSON.stringify(actual) !== JSON.stringify(c.expect)) {
  console.error(`Case ${name}: detected steps differ.`);
  console.error(`expected: ${JSON.stringify(c.expect)}`);
  console.error(`actual:   ${JSON.stringify(actual)}`);
  process.exit(1);
}
console.log(`Case ${name}: ${actual.flat().length} step(s) detected as expected.`);
