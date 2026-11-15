// `doc-detective audit` permutations, run by audit.spec.json (ADR 01206).
//
//   node test/core-artifacts/audit/audit-check.cjs <case>
//
// Each case writes its documents and config to .tmp/fixture-audit/<case>/,
// outside test/core-artifacts/ so they never run as fixtures themselves. It
// runs the real CLI's `audit` and checks the exit code, then fields of the
// JSON report (dotted paths) or the text on stdout. Exits 1 on any mismatch.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const fence = (lang, body) => "```" + lang + "\n" + body + "\n```";
const sources = (report) => report.files.flatMap((f) => f.items.filter((i) => i.kind === "procedureStep").map((i) => i.source));
const states = (report, kind = "procedureStep") => report.files.flatMap((f) => f.items.filter((i) => i.kind === kind).map((i) => i.state));

const cases = {
  // Procedure tiers.
  "tier-marker": {
    files: { "doc.md": "<!-- procedure -->\n1. Release notes\n2. Bug fixes\n" },
    check: (r) => ({ sources: sources(r), lists: r.summary.lists }),
    expect: { sources: ["explicit", "explicit"], lists: { explicit: 1, tagged: 0, possible: 0 } },
  },
  "tier-mdx-steps": {
    files: { "doc.mdx": '<Steps>\n  <Step title="A">\n    Release notes\n  </Step>\n  <Step title="B">\n    More\n  </Step>\n</Steps>\n' },
    check: sources,
    expect: ["explicit", "explicit"],
  },
  "tier-dita-steps": {
    files: { "task.dita": '<task id="t"><title>T</title><taskbody><steps>\n<step><cmd>Release notes</cmd></step>\n<step><cmd>More</cmd></step>\n</steps></taskbody></task>\n' },
    check: sources,
    expect: ["explicit", "explicit"],
  },
  "tier-tagger": {
    files: { "doc.md": "1. Open a terminal.\n2. Run the tests.\n" },
    check: sources,
    expect: ["tagger", "tagger"],
  },
  "tier-opener": {
    files: { "doc.md": "1. In a terminal, run `npm test`.\n2. Check the output.\n" },
    check: sources,
    expect: ["tagger", "tagger"],
  },
  "tier-possible": {
    files: { "doc.md": "1. Release notes\n2. Bug fixes\n" },
    check: (r) => ({ sources: sources(r), possible: r.summary.possibleProcedureSteps.total, headline: r.summary.procedureSteps.total }),
    expect: { sources: ["possible", "possible"], possible: 2, headline: 0 },
  },
  "tier-non-english": {
    files: { "doc.md": "1. Ouvrez un terminal.\n2. Lancez les tests.\n" },
    check: sources,
    expect: ["possible", "possible"],
  },

  // Formats with ordinary lists.
  "format-html": {
    files: { "doc.html": "<html><body><ol>\n<li>Click <b>Save</b>.</li>\n<li>Close the dialog.</li>\n</ol></body></html>\n" },
    check: (r) => ({ sources: sources(r), states: states(r) }),
    expect: { sources: ["tagger", "tagger"], states: ["hasStep", "untested"] },
  },
  "format-asciidoc": {
    files: { "doc.adoc": "= Guide\n\n. Open a terminal.\n.. Find the folder.\n. Run the tests.\n" },
    check: (r) => r.files[0].items.filter((i) => i.kind === "procedureStep").map((i) => [i.source, i.line]),
    expect: [["tagger", 3], ["tagger", 5]],
  },
  "format-dita-marker": {
    files: { "topic.dita": '<topic id="t"><title>T</title><body><?doc-detective procedure?>\n<ol><li>Release notes</li></ol></body></topic>\n' },
    check: sources,
    expect: ["explicit"],
  },

  // Code blocks.
  "code-location": {
    config: { allowUnsafeSteps: true },
    files: { "doc.md": fence("bash", "echo hi") + "\n" },
    check: (r) => states(r, "codeBlock"),
    expect: ["hasStep"],
  },
  "code-following-step": {
    config: { detectSteps: false },
    files: { "doc.md": fence("bash", "echo hi") + '\n<!-- step {"runShell":"echo hi"} -->\n' },
    check: (r) => states(r, "codeBlock"),
    expect: ["hasStep"],
  },
  "code-stepid-spec": {
    config: { detectSteps: false },
    files: {
      "doc.md": fence("bash {#install}", "npm i") + "\n",
      "install.spec.json": JSON.stringify({ tests: [{ steps: [{ stepId: "install", runShell: "echo ok" }] }] }),
    },
    check: (r) => ({ states: states(r, "codeBlock"), pages: r.summary.pages.total }),
    expect: { states: ["hasStep"], pages: 1 },
  },
  "code-procedure-tag": {
    config: { detectSteps: false },
    files: { "doc.md": "Run this:\n\n" + fence("bash {.procedure}", "npm test") + "\n" },
    check: (r) => r.files[0].items.map((i) => [i.kind, i.source ?? null, i.state]),
    expect: [["procedureStep", "explicit", "untested"], ["codeBlock", null, "untested"]],
  },
  "code-test-ignore": {
    files: { "doc.md": fence("bash testIgnore", "rm -rf /tmp/x") + "\n" },
    check: (r) => states(r, "codeBlock"),
    expect: ["ignored"],
  },
  "code-not-runnable": {
    files: { "doc.md": fence("json", "{}") + "\n" + fence("python", "print(1)") + "\n" },
    check: (r) => r.summary.codeBlocks,
    expect: { byLanguage: { python: { total: 1, hasStep: 0, ignored: 0, skipped: 1, untested: 0 } }, notRunnable: 1 },
  },

  // Item states.
  "state-ignored": {
    files: { "doc.md": '1. Open a terminal.\n\n   <!-- test ignore start -->\n   <!-- step {"runShell":"cd x"} -->\n   <!-- test ignore end -->\n\n2. Run the tests.\n' },
    check: states,
    expect: ["ignored", "untested"],
  },
  "state-unsafe-skipped": {
    files: { "doc.md": "1. Run the tests:\n\n   " + fence("bash", "   npm test") + "\n" },
    check: states,
    expect: ["skipped"],
  },
  "state-navigation-only": {
    files: { "doc.md": "1. Go to [the site](https://example.com).\n2. Close the tab.\n" },
    check: (r) => r.summary.procedureSteps,
    expect: { total: 2, hasStep: 1, ignored: 0, skipped: 0, untested: 1, navigationOnly: 1 },
  },
  "state-nested": {
    config: { detectSteps: false },
    files: { "doc.md": '1. Open the settings:\n   1. Find the tab.\n      <!-- step {"find":"Tab"} -->\n2. Save the file.\n' },
    check: states,
    expect: ["hasStep", "untested"],
  },

  // Config.
  "detect-steps-false": {
    config: { detectSteps: false },
    files: { "doc.md": "See [the site](https://example.com).\n" },
    check: (r) => ({ links: r.summary.links, states: states(r, "link") }),
    expect: { links: { total: 1, testable: 1, hasStep: 0 }, states: ["untested"] },
  },
  "unmeasured-file-type": {
    config: { fileTypes: ["markdown", { name: "wiki", extensions: ["wiki"] }] },
    files: { "doc.wiki": "1. Open a terminal.\n" },
    check: (r) => r.summary.pages,
    expect: { total: 1, measured: 0, hasAuthoredStep: 0 },
  },

  // Output.
  "output-text": {
    text: true,
    files: { "doc.md": "1. Open a terminal.\n2. Run the tests.\n" },
    check: (stdout) => stdout.split("\n")[0],
    expect: "Procedure steps      0 of 2 have a step",
  },
  "output-quiet": {
    text: true,
    args: ["-q"],
    files: { "doc.md": "1. Open a terminal.\n" },
    check: (stdout) => stdout,
    expect: "Procedure steps      0 of 1 have a step\n",
  },
  "no-files": {
    files: {},
    exit: 2,
    stderr: "Couldn't find any files to audit in",
  },
};

const name = process.argv[2];
const c = cases[name];
if (!c) {
  console.error(`Unknown case "${name}". Cases: ${Object.keys(cases).join(", ")}`);
  process.exit(2);
}
const root = path.resolve(__dirname, "../../..");
const dir = path.join(root, ".tmp", "fixture-audit", name);
const docs = path.join(dir, "docs");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(docs, { recursive: true });
for (const [file, content] of Object.entries(c.files)) fs.writeFileSync(path.join(docs, file), content);
const cfg = path.join(dir, "config.json");
fs.writeFileSync(cfg, JSON.stringify({ telemetry: { send: false }, ...c.config }, null, 2));

const run = spawnSync(
  process.execPath,
  [path.join(root, "bin", "doc-detective.js"), "audit", docs, "--config", cfg, "--no-env-file", ...(c.text ? [] : ["--json"]), ...(c.args ?? [])],
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
if (c.check) {
  const actual = c.check(c.text ? run.stdout : JSON.parse(run.stdout));
  if (JSON.stringify(actual) !== JSON.stringify(c.expect)) {
    fail(`report differs.\nexpected: ${JSON.stringify(c.expect)}\nactual:   ${JSON.stringify(actual)}`);
  }
}
console.log(`Case ${name}: passed.`);
