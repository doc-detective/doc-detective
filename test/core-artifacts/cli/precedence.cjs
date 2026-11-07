// Config and environment precedence permutations (ADR 01165), run by
// config-precedence.spec.json in this directory.
//
//   node test/core-artifacts/cli/precedence.cjs <case>
//
// Each case sets up .tmp/fixture-precedence/<case>/, outside
// test/core-artifacts/ so its files never run as fixtures themselves. It then
// runs the real CLI there with the environment the case names, and checks the
// exit code, stderr, and files. Exits 1 on any mismatch.
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
if (c.stderrExcludes && run.stderr.includes(c.stderrExcludes)) fail(`stderr includes ${JSON.stringify(c.stderrExcludes)}.`);
for (const file of c.exists ?? []) if (!fs.existsSync(path.join(dir, file))) fail(`${file} doesn't exist.`);
for (const file of c.missing ?? []) if (fs.existsSync(path.join(dir, file))) fail(`${file} exists.`);
console.log(`Case ${name}: passed.`);
