// Detection permutations, run by the specs in this directory.
//
//   node test/core-artifacts/detection/dry-run-detect.cjs <case>
//
// fileTypes are config-level, so each case writes its document and config to
// .tmp/fixture-detection/<case>/, outside test/core-artifacts/ so the
// documents never run as fixtures themselves. It then runs the real CLI with
// --dry-run and compares the detected steps of each test, or the exit code
// and stderr of a config the CLI must reject. Exits 1 on any mismatch.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const shell = (s) => ({ runShell: `echo ${s}` });
const step = (s) => JSON.stringify(shell(s));
const fence = (lang, body) => "```" + lang + "\n" + body + "\n```";
const md = (extra) => ({ name: "docs", extensions: ["md"], inlineStatements: { in: ["comment"] }, ...extra });

const cases = {
  // Every kind Markdown produces, with both shorthands.
  "markdown-kinds": {
    file: "doc.md",
    config: {
      fileTypes: [
        md({
          markup: [
            { link: { url: "^https://", precededBy: "[Gg]o to\\s+$" }, captures: ["url"], actions: ["goTo"] },
            { image: { attributes: { class: "(^|\\s)screenshot" } }, captures: ["src"], actions: ["screenshot"] },
            { strong: { precededBy: "[Cc]lick\\s+$" }, actions: ["click"] },
            { emphasis: {}, actions: ["find"] },
            { text: {}, regex: '\\b[Tt]ype\\s+"([^"]+)"', actions: ["type"] },
            { codeBlock: "bash", actions: [{ runShell: "$1" }] },
            { codeBlock: { language: ["sh"], metaExcludes: "testIgnore" }, captures: ["content"], actions: [{ runShell: "$1" }] },
          ],
        }),
      ],
    },
    content: [
      "Go to [the site](https://example.com), then click **Search** and see *Results*.",
      "",
      'Type "kittens" into the box. `Type "code"` stays code.',
      "",
      "![Results](results.png){.screenshot}",
      "",
      fence("bash", "echo one"),
      "",
      fence("sh", "echo two"),
      "",
      fence("sh testIgnore", "echo skipped"),
      "",
      fence("md", `<!-- step ${step("fenced")} -->\n**fenced**`),
    ].join("\n"),
    expect: [[
      { goTo: "https://example.com" },
      { click: "Search" },
      { find: "Results" },
      { type: "kittens" },
      { screenshot: "results.png" },
      { runShell: "echo one" },
      { runShell: "echo two" },
    ]],
  },

  // Each container form: "comment", a container with regex, and one with a value field.
  "statement-containers": {
    file: "doc.mdx",
    config: {
      fileTypes: [
        {
          name: "docs",
          extensions: ["mdx"],
          inlineStatements: {
            in: [
              "comment",
              { comment: { excludes: "draft" }, regex: "^dd:\\s*(.*)$" },
              { element: { tag: ["Meta"], attributes: { name: "^dd$" } }, value: "attributes.content" },
            ],
          },
        },
      ],
    },
    content: [
      `{/* test {"testId": "containers"} */}`,
      "",
      `{/* step ${step("comment")} */}`,
      "",
      `{/* dd: step ${step("regex")} */}`,
      "",
      `{/* draft dd: step ${step("draft")} */}`,
      "",
      `<Meta name="dd" content='step ${step("element")}' />`,
      "",
      `{/* testing notes: not a statement */}`,
      "",
      "{/* test end */}",
    ].join("\n"),
    expect: [[shell("comment"), shell("regex"), shell("element")]],
  },

  // The three definition forms in one fileType: regex alone, a kind alone, and a kind with regex.
  "definition-forms": {
    file: "doc.md",
    config: {
      fileTypes: [
        md({
          markup: [
            { regex: ["\\bv(\\d+\\.\\d+)\\b"], actions: [{ runShell: "echo raw $1" }] },
            { strong: {}, actions: [{ runShell: "echo kind $1" }] },
            { text: {}, regex: "\\bv(\\d+\\.\\d+)\\b", actions: [{ runShell: "echo text $1" }] },
          ],
        }),
      ],
    },
    content: ["Install v1.2 and **v2.0**.", "", fence("", "v3.4")].join("\n"),
    // The regex alone also matches inside bold text and code. The kind with regex doesn't.
    expect: [[
      { runShell: "echo raw 1.2" },
      { runShell: "echo text 1.2" },
      { runShell: "echo kind v2.0" },
      { runShell: "echo raw 2.0" },
      { runShell: "echo raw 3.4" },
    ]],
  },

  // JSX components in .mdx are elements, with their attributes.
  "mdx-components": {
    file: "doc.mdx",
    config: {
      fileTypes: [
        {
          name: "docs",
          extensions: ["mdx"],
          markup: [{ element: { tag: ["Button"], attributes: { label: true } }, captures: ["attributes.label"], actions: ["click"] }],
        },
      ],
    },
    content: 'import { Button } from "./ui";\n\n<Button label="Save" />\n\n<Button />\n',
    expect: [[{ click: "Save" }]],
  },

  // Invalid MDX parses as Markdown, with a warning. Dry runs silence warnings,
  // so the cases that check one run their steps.
  "mdx-fallback": {
    file: "doc.mdx",
    run: true,
    config: { fileTypes: [{ name: "docs", extensions: ["mdx"], markup: [{ codeBlock: "bash", actions: [{ runShell: "$1" }] }] }] },
    content: "<Tab>\n\n" + fence("bash", "echo fallback") + "\n",
    expect: ["echo fallback"],
    stderr: "couldn't parse as MDX",
  },

  // No parser handles .wiki, so selectors match nothing and regex definitions still run.
  "no-parser": {
    file: "doc.wiki",
    run: true,
    config: {
      fileTypes: [
        {
          name: "wiki",
          extensions: ["wiki"],
          markup: [{ regex: ["'''(\\w+)'''"], actions: [{ runShell: "echo $1" }] }, { strong: {}, actions: ["click"] }],
        },
      ],
    },
    content: "'''regex'''\n",
    expect: ["echo regex"],
    stderr: '"wiki" uses selectors, but no parser handles .wiki.',
  },

  // A file under another extension parses as the format it extends. A selector
  // definition replaces the built-in definition with the same name.
  "extends-markdown": {
    file: "doc.txt",
    config: {
      fileTypes: [{ name: "notes", extends: "markdown", extensions: ["txt"], markup: [{ name: "findOnscreenText", strong: {}, captures: ["text"], actions: ["find"] }] }],
    },
    content: "**`Save`**\n",
    expect: [[{ find: "Save" }]],
  },

  // A regex and a container that find the same statement give one step.
  "container-and-regex": {
    file: "doc.md",
    config: { fileTypes: [md({ inlineStatements: { in: ["comment"], step: ["<!--\\s*step\\s*([\\s\\S]*?)\\s*-->"] } })] },
    content: `<!-- step ${step("once")} -->\n`,
    expect: [[shell("once")]],
  },

  // detectSteps: false turns off selector markup, but containers still read statements.
  "detect-steps-false": {
    file: "doc.md",
    config: { detectSteps: false, fileTypes: [md({ markup: [{ strong: {}, actions: ["find"] }] })] },
    content: `**Save**\n\n<!-- step ${step("statement")} -->\n`,
    expect: [[shell("statement")]],
  },

  // Every kind HTML produces. Statements and markup in <pre> and <script> stay code.
  "html-kinds": {
    file: "doc.html",
    config: {
      fileTypes: [
        {
          name: "web",
          extensions: ["html"],
          inlineStatements: { in: ["comment"] },
          markup: [
            { link: { url: "^https://", precededBy: "[Gg]o to\\s+$" }, captures: ["url"], actions: ["goTo"] },
            { strong: { precededBy: "[Cc]lick\\s+$" }, actions: ["click"] },
            { emphasis: {}, actions: ["find"] },
            { image: { attributes: { class: "(^|\\s)screenshot" } }, captures: ["src"], actions: ["screenshot"] },
            { codeBlock: "bash", actions: [{ runShell: "$1" }] },
            { element: { tag: ["button"], attributes: { "data-step": true } }, captures: ["content"], actions: ["click"] },
            { text: {}, regex: '\\b[Tt]ype\\s+&quot;([^&]+)&quot;', actions: ["type"] },
          ],
        },
      ],
    },
    content: [
      "<html><body>",
      `<!-- step ${step("comment")} -->`,
      '<p>Go to <a href="https://example.com">the site</a>, click <b>Search</b>, and see <em>Results</em>.</p>',
      "<p>Type &quot;kittens&quot;, then <button data-step>Submit</button>.</p>",
      '<img src="shot.png" class="screenshot">',
      '<pre><code class="language-bash">echo html</code></pre>',
      `<pre><!-- step ${step("pre")} --><b>not bold</b></pre>`,
      `<script>var s = '<!-- step ${step("script")} -->';</script>`,
      "</body></html>",
    ].join("\n"),
    expect: [[
      shell("comment"),
      { goTo: "https://example.com" },
      { click: "Search" },
      { find: "Results" },
      { type: "kittens" },
      { click: "Submit" },
      { screenshot: "shot.png" },
      { runShell: "echo html" },
    ]],
  },

  // DITA: elements by tag and attributes, the doc-detective processing instruction, and a <data> container.
  "dita-kinds": {
    file: "doc.dita",
    config: {
      fileTypes: [
        {
          name: "docs",
          extensions: ["dita"],
          inlineStatements: { in: ["comment", { element: { tag: ["data"], attributes: { name: "^doc-detective$" } }, value: "attributes.value" }] },
          markup: [
            { element: { tag: ["uicontrol"], precededBy: "\\b[Tt]ype\\s+<userinput>([^<]+)<\\/userinput>\\s+into\\s+the\\s+$" }, captures: ["content", "precededBy.1"], actions: [{ type: { keys: "$2", selector: "$1" } }] },
            { element: { tag: ["xref"], attributes: { scope: "external" } }, captures: ["attributes.href"], actions: ["checkLink"] },
            { strong: {}, actions: ["find"] },
            { image: { attributes: { class: "screenshot" } }, captures: ["src"], actions: ["screenshot"] },
            { codeBlock: "bash", actions: [{ runShell: "$1" }] },
          ],
        },
      ],
    },
    content: [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<task id="t"><title>T</title><taskbody>',
      `<?doc-detective step ${step("pi")} ?>`,
      `<data name="doc-detective" value='step ${step("data")}'/>`,
      "<steps><step><cmd>Type <userinput>kittens</userinput> into the <uicontrol>Search</uicontrol> box, then find <b>Results</b>.</cmd></step></steps>",
      '<p>See <xref href="https://example.com" scope="external">the site</xref>.</p>',
      '<image href="shot.png" outputclass="screenshot"><alt>Shot</alt></image>',
      '<codeblock outputclass="language-bash">echo dita</codeblock>',
      "</taskbody></task>",
    ].join("\n"),
    expect: [[
      shell("pi"),
      shell("data"),
      { type: { keys: "kittens", selector: "Search" } },
      { find: "Results" },
      { checkLink: "https://example.com" },
      { screenshot: "shot.png" },
      { runShell: "echo dita" },
    ]],
  },

  // AsciiDoc: comments, links, formatting, images with roles, and listings. Nothing from inside a listing.
  "asciidoc-kinds": {
    file: "doc.adoc",
    config: {
      fileTypes: [
        {
          name: "docs",
          extensions: ["adoc"],
          inlineStatements: { in: [{ comment: {}, regex: "^\\(\\s*([\\s\\S]*?)\\s*\\)$" }] },
          markup: [
            { link: { url: "^https://", precededBy: "[Gg]o to\\s+$" }, captures: ["url"], actions: ["goTo"] },
            { strong: { precededBy: "[Cc]lick\\s+$" }, actions: ["click"] },
            { emphasis: {}, actions: ["find"] },
            { image: { attributes: { class: "(^|\\s)screenshot" } }, captures: ["src"], actions: ["screenshot"] },
            { codeBlock: { language: ["bash"], metaExcludes: "testIgnore" }, actions: [{ runShell: "$1" }] },
          ],
        },
      ],
    },
    content: [
      "= Guide",
      "",
      `// (step ${step("comment")})`,
      "Go to https://example.com[the site], click *Search*, and see _Results_.",
      "",
      "[.screenshot]",
      "image::shot.png[Shot]",
      "",
      "[source,bash]",
      "----",
      `// (step ${step("listing")})`,
      "echo adoc",
      "----",
      "",
      "[source,bash,testIgnore]",
      "----",
      "echo skipped",
      "----",
    ].join("\n"),
    expect: [[
      shell("comment"),
      { goTo: "https://example.com" },
      { click: "Search" },
      { find: "Results" },
      { screenshot: "shot.png" },
      { runShell: `// (step ${step("listing")})\necho adoc` },
    ]],
  },

  // HTML inside Markdown reads as HTML kinds, and lowercase JSX tags in .mdx do too.
  "embedded-html": {
    file: "doc.md",
    config: {
      fileTypes: [md({ markup: [{ link: {}, captures: ["url"], actions: ["checkLink"] }, { strong: {}, actions: ["find"] }, { element: "kbd", actions: [{ runShell: "echo $1" }] }] })],
    },
    content: 'Open <a href="https://example.com">the site</a>, press <kbd>Enter</kbd>.\n\n<div>\n<p>Find <b>Results</b>.</p>\n</div>\n',
    expect: [[{ checkLink: "https://example.com" }, { runShell: "echo Enter" }, { find: "Results" }]],
  },
  "mdx-lowercase-jsx": {
    file: "doc.mdx",
    config: {
      fileTypes: [
        {
          name: "docs",
          extensions: ["mdx"],
          markup: [{ image: { attributes: { class: "screenshot" } }, captures: ["src"], actions: ["screenshot"] }, { strong: {}, actions: ["find"] }],
        },
      ],
    },
    content: 'See <strong>Results</strong>.\n\n<img src="shot.png" className="screenshot" />\n',
    expect: [[{ find: "Results" }, { screenshot: "shot.png" }]],
  },

  // Configs the CLI must reject: exit 2, and nothing runs.
  "reject-two-kinds": {
    file: "doc.md",
    config: { fileTypes: [md({ markup: [{ link: {}, image: {}, actions: ["find"] }] })] },
    content: "x\n",
    exit: 2,
    stderr: "must match exactly one schema in oneOf",
  },
  "reject-unknown-key": {
    file: "doc.md",
    config: { fileTypes: [md({ markup: [{ codeBlok: "bash", actions: ["find"] }] })] },
    content: "x\n",
    exit: 2,
    stderr: '"additionalProperty":"codeBlok"',
  },
  "reject-bad-pattern": {
    file: "doc.md",
    config: { fileTypes: [md({ markup: [{ link: { url: "(" }, actions: ["find"] }] })] },
    content: "x\n",
    exit: 2,
    stderr: 'must match format "regex"',
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
fs.writeFileSync(cfg, JSON.stringify({ telemetry: { send: false }, detectSteps: true, ...c.config }, null, 2));

const results = path.join(dir, "results.json");
const mode = c.run ? ["--output", results] : ["--dry-run", "--json"];
const run = spawnSync(
  process.execPath,
  [path.join(root, "bin", "doc-detective.js"), "run", doc, "--config", cfg, ...mode, "--no-env-file"],
  { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 120_000 }
);
const fail = (message) => {
  console.error(`Case ${name}: ${message}`);
  console.error(`stderr: ${run.stderr}`);
  process.exit(1);
};
if (run.error) fail(`didn't finish: ${run.error.message}`);
if (run.status !== (c.exit ?? 0)) fail(`exited ${run.status}, expected ${c.exit ?? 0}.`);
if (c.stderr && !run.stderr.includes(c.stderr)) fail(`stderr doesn't include ${JSON.stringify(c.stderr)}.`);
if (c.run) {
  // A run compares the commands of the steps that ran, which must all pass.
  const steps = JSON.parse(fs.readFileSync(results, "utf8")).specs.flatMap((s) => s.tests.flatMap((t) => t.contexts.flatMap((x) => x.steps)));
  const ran = steps.map((s) => (s.result === "PASS" ? s.runShell?.command ?? s.runShell : `${s.result}: ${JSON.stringify(s)}`));
  if (JSON.stringify(ran) !== JSON.stringify(c.expect)) fail(`steps differ.\nexpected: ${JSON.stringify(c.expect)}\nactual:   ${JSON.stringify(ran)}`);
} else if (c.expect) {
  // The runner resolves screenshot paths against the document.
  const strip = ({ location, stepId, description, ...rest }) => {
    if (typeof rest.screenshot === "string") rest.screenshot = path.relative(dir, rest.screenshot).split(path.sep).join("/");
    return rest;
  };
  const actual = (JSON.parse(run.stdout).specs[0]?.tests ?? []).map((t) => t.contexts[0].steps.map(strip));
  if (JSON.stringify(actual) !== JSON.stringify(c.expect)) {
    fail(`detected steps differ.\nexpected: ${JSON.stringify(c.expect)}\nactual:   ${JSON.stringify(actual)}`);
  }
}
console.log(`Case ${name}: passed.`);
