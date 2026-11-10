// Config and environment precedence permutations (ADR 01165), run by
// config-precedence.spec.json in this directory. Also path permutations
// (ADR 01192), run by path-rule.spec.json, and output-mode permutations
// (ADR 01191), run by output-modes.spec.json.
//
//   node test/core-artifacts/cli/precedence.cjs <case>
//
// Each case sets up .tmp/fixture-precedence/<case>/, outside
// test/core-artifacts/ so its files never run as fixtures themselves. It then
// runs the real CLI there with the environment the case names, and checks the
// exit code, stderr, stdout, and files. Exits 1 on any mismatch.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// A spec that passes only when GREETING is what EXPECT says.
const greetingSpec = {
  tests: [{ steps: [{ runShell: "node -e \"process.exit(process.env.GREETING===process.env.EXPECT?0:7)\"" }] }],
};
const passSpec = { tests: [{ steps: [{ runShell: "echo hi" }] }] };
const legacy = (config) => JSON.stringify({ config });

const cases = {
  "dotenv-fills-unset": {
    files: { ".env": "GREETING=dotenv\n", "env.spec.json": greetingSpec },
    env: { EXPECT: "dotenv" },
    unset: ["GREETING"],
    args: ["-i", "env.spec.json"],
  },
  "shell-beats-dotenv": {
    files: { ".env": "GREETING=dotenv\n", "env.spec.json": greetingSpec },
    env: { GREETING: "shell", EXPECT: "shell" },
    args: ["-i", "env.spec.json"],
  },
  "config-loadvariables-fills-unset": {
    files: { "vars.env": "GREETING=vars\n", "dd.json": { loadVariables: "vars.env" }, "env.spec.json": greetingSpec },
    env: { EXPECT: "vars" },
    unset: ["GREETING"],
    args: ["-c", "dd.json", "-i", "env.spec.json"],
  },
  "shell-beats-config-loadvariables": {
    files: { "vars.env": "GREETING=vars\n", "dd.json": { loadVariables: "vars.env" }, "env.spec.json": greetingSpec },
    env: { GREETING: "shell", EXPECT: "shell" },
    args: ["-c", "dd.json", "-i", "env.spec.json"],
    stderrExcludes: "injected env",
  },
  "legacy-env-below-flags": {
    files: { "pass.spec.json": passSpec },
    env: { DOC_DETECTIVE: legacy({ logLevel: "silent" }) },
    args: ["-i", "pass.spec.json", "-l", "info"],
    stderr: ['`DOC_DETECTIVE` is deprecated. Move its "config" object to `DOC_DETECTIVE_CONFIG`.', "Running test specs"],
  },
  "legacy-env-below-doc-detective-config": {
    files: { "pass.spec.json": passSpec },
    env: {
      DOC_DETECTIVE: legacy({ logLevel: "silent" }),
      DOC_DETECTIVE_CONFIG: JSON.stringify({ logLevel: "info", telemetry: { send: false } }),
    },
    args: ["-i", "pass.spec.json"],
    stderr: ["Running test specs"],
  },
  "legacy-container-allows-nothing": {
    files: { "unsafe.spec.json": { tests: [{ steps: [{ runShell: "echo hi", unsafe: true }] }] } },
    env: { DOC_DETECTIVE: JSON.stringify({ container: "docdetective/docdetective:linux" }) },
    args: ["-i", "unsafe.spec.json"],
    exit: 2,
  },
  "cache-dir-flag-beats-env": {
    files: {},
    env: { DOC_DETECTIVE_CACHE_DIR: "env-cache" },
    args: ["install", "status", "--json", "--cache-dir", "flag-cache"],
    exists: ["flag-cache"],
    missing: ["env-cache"],
  },
  "config-output-beside-config": {
    files: { "pass.spec.json": passSpec, "sub/dd.json": { output: "results.json" } },
    env: {},
    args: ["-c", "sub/dd.json", "-i", "pass.spec.json"],
    exists: ["sub/results.json"],
    missing: ["results.json"],
  },
  // One path rule (ADR 01192), run by path-rule.spec.json. Each config sets
  // a relative path, and a wrong base finds no file, so the run exits 2.
  "project-config-input-beside-config": {
    files: { "sub/pass.spec.json": passSpec, "sub/dd.json": { input: "pass.spec.json" } },
    env: {},
    args: ["-c", "sub/dd.json"],
  },
  "project-config-cwd-base-input": {
    files: { "pass.spec.json": passSpec, "sub/dd.json": { input: "pass.spec.json", relativePathBase: "cwd" } },
    env: {},
    args: ["-c", "sub/dd.json"],
  },
  "user-config-input-beside-user-config": {
    files: {
      "xdg/doc-detective/config.json": { input: "pass.spec.json" },
      "xdg/doc-detective/pass.spec.json": passSpec,
      "proj/dd.json": {},
    },
    env: { XDG_CONFIG_HOME: "xdg" },
    args: ["-c", "proj/dd.json"],
  },
  "env-config-input-against-cwd": {
    files: { "pass.spec.json": passSpec, "proj/dd.json": {} },
    env: {
      DOC_DETECTIVE_CONFIG: JSON.stringify({ input: "pass.spec.json", telemetry: { send: false }, autoUpdate: false }),
    },
    args: ["-c", "proj/dd.json"],
  },
  "legacy-env-input-against-cwd": {
    files: { "pass.spec.json": passSpec, "proj/dd.json": {} },
    env: { DOC_DETECTIVE: legacy({ input: "pass.spec.json" }) },
    args: ["-c", "proj/dd.json"],
  },
  "flag-input-against-cwd": {
    files: { "pass.spec.json": passSpec, "proj/dd.json": {} },
    env: {},
    args: ["-c", "proj/dd.json", "-i", "pass.spec.json"],
  },
  "config-token-file-beside-config": {
    files: {
      "pass.spec.json": passSpec,
      "sub/token.txt": "t0ken",
      "sub/dd.json": { integrations: { heretto: [{ name: "h", organizationId: "o", username: "u", apiTokenFile: "token.txt" }] } },
    },
    env: {},
    args: ["-c", "sub/dd.json", "-i", "pass.spec.json"],
  },
  // Output modes compose or refuse (ADR 01191), run by output-modes.spec.json.
  "json-plain-refused": {
    files: { "pass.spec.json": passSpec },
    env: {},
    args: ["-i", "pass.spec.json", "--json", "--plain"],
    exit: 2,
    stderr: ["Error: set `--json` or `--plain`, not both."],
  },
  "stdout-output-plain-refused": {
    files: { "pass.spec.json": passSpec },
    env: {},
    args: ["-i", "pass.spec.json", "-o", "-", "--plain"],
    exit: 2,
    stderr: ["Error: set `--output -` or `--plain`, not both."],
  },
  "config-stdout-output-plain-refused": {
    files: { "pass.spec.json": passSpec, "dd.json": { output: "-" } },
    env: {},
    args: ["-c", "dd.json", "-i", "pass.spec.json", "--plain"],
    exit: 2,
    stderr: ["Error: set `--output -` or `--plain`, not both."],
  },
  "dry-run-plain-refused": {
    files: { "pass.spec.json": passSpec },
    env: {},
    args: ["-i", "pass.spec.json", "--dry-run", "--plain"],
    exit: 2,
    stderr: ["Error: set `--dry-run` or `--plain`, not both."],
  },
  "config-dry-run-plain-refused": {
    files: { "pass.spec.json": passSpec, "dd.json": { dryRun: true } },
    env: {},
    args: ["-c", "dd.json", "-i", "pass.spec.json", "--plain"],
    exit: 2,
    stderr: ["Error: set `--dry-run` or `--plain`, not both."],
  },
  "no-dry-run-plain-beats-config": {
    files: { "pass.spec.json": passSpec, "dd.json": { dryRun: true } },
    env: {},
    args: ["-c", "dd.json", "-i", "pass.spec.json", "--no-dry-run", "--plain"],
    stdout: ["PASS\t"],
  },
  "plain-with-output-file": {
    files: { "pass.spec.json": passSpec },
    env: {},
    args: ["-i", "pass.spec.json", "--plain", "-o", "results.json"],
    stdout: ["PASS\t"],
    exists: ["results.json"],
  },
  "dry-run-writes-output": {
    files: { "pass.spec.json": passSpec },
    env: {},
    args: ["-i", "pass.spec.json", "--dry-run", "-o", "plan.json"],
    stdout: ['"specs"'],
    exists: ["plan.json"],
  },
  "config-stdout-output": {
    files: { "pass.spec.json": passSpec, "dd.json": { output: "-" } },
    env: {},
    args: ["-c", "dd.json", "-i", "pass.spec.json"],
    stdout: ['"summary"'],
    missing: ["-"],
  },
  "stdout-output-beats-config-file": {
    files: { "pass.spec.json": passSpec, "dd.json": { output: "results.json" } },
    env: {},
    args: ["-c", "dd.json", "-i", "pass.spec.json", "-o", "-"],
    stdout: ['"summary"'],
    missing: ["results.json"],
  },
  "output-file-beats-config-stdout": {
    files: { "pass.spec.json": passSpec, "dd.json": { output: "-" } },
    env: {},
    args: ["-c", "dd.json", "-i", "pass.spec.json", "-o", "results.json"],
    stdout: ["1 of 1 test passed"],
    exists: ["results.json"],
  },
};

const name = process.argv[2];
const c = cases[name];
if (!c) {
  console.error(`Unknown case "${name}". Cases: ${Object.keys(cases).join(", ")}`);
  process.exit(2);
}
const root = path.resolve(__dirname, "../../..");
const dir = path.join(root, ".tmp", "fixture-precedence", name);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
for (const [file, content] of Object.entries(c.files)) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), typeof content === "string" ? content : JSON.stringify(content));
}

const env = {
  ...process.env,
  DOC_DETECTIVE_CONFIG: JSON.stringify({ telemetry: { send: false }, autoUpdate: false }),
  // Keeps the update check off even when a case's own DOC_DETECTIVE_CONFIG
  // replaces the one above and leaves autoUpdate out.
  DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1",
  ...c.env,
};
for (const key of [...(c.unset ?? []), "DOC_DETECTIVE_DEBUG", "DEBUG"]) delete env[key];
if (!("DOC_DETECTIVE" in c.env)) delete env.DOC_DETECTIVE;
if (!("DOC_DETECTIVE_CACHE_DIR" in c.env)) delete env.DOC_DETECTIVE_CACHE_DIR;

const run = spawnSync(process.execPath, [path.join(root, "bin", "doc-detective.js"), ...c.args], {
  cwd: dir,
  env,
  encoding: "utf8",
  timeout: 120_000,
});
const fail = (message) => {
  console.error(`Case ${name}: ${message}`);
  console.error(`stderr: ${run.stderr}`);
  process.exit(1);
};
if (run.error) fail(`didn't finish: ${run.error.message}`);
if (run.status !== (c.exit ?? 0)) fail(`exited ${run.status}, expected ${c.exit ?? 0}.`);
for (const text of c.stderr ?? []) if (!run.stderr.includes(text)) fail(`stderr doesn't include ${JSON.stringify(text)}.`);
for (const text of c.stdout ?? []) if (!run.stdout.includes(text)) fail(`stdout doesn't include ${JSON.stringify(text)}.`);
if (c.stderrExcludes && run.stderr.includes(c.stderrExcludes)) fail(`stderr includes ${JSON.stringify(c.stderrExcludes)}.`);
for (const file of c.exists ?? []) if (!fs.existsSync(path.join(dir, file))) fail(`${file} doesn't exist.`);
for (const file of c.missing ?? []) if (fs.existsSync(path.join(dir, file))) fail(`${file} exists.`);
console.log(`Case ${name}: passed.`);
