// Environment variable values masked in every output (ADR 01178), run by
// masking.spec.json in this directory.
//
//   node test/core-artifacts/cli/masking.cjs <case>
//
// Each case sets up .tmp/fixture-masking/<case>/, outside test/core-artifacts/
// so its files never run as fixtures themselves. It runs the real CLI there at
// `-l debug` with `-o results.json`, then checks that each listed value is
// absent from stdout, stderr, and the results file, and that each listed text
// is present in the results file. A case with `runs` runs the CLI that many
// times and checks the last run; `saved` names files a step saved and the
// content each must hold. Exits 1 on any mismatch.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const spec = (steps, extra = {}) => ({ ...extra, tests: [{ steps }] });
const nodePrint = (expression) => ({ runShell: `node -e "console.log(${expression})"` });
const REF = "ref-value-7319";
const DOTENV = "dotenv-value-4821";
const TOKEN = "token-value-5531";
const ENCODED = "p@ss word/12";
// Six characters: too short for a base64 needle, so only Basic decoding masks it.
const PASSWORD = "hunt3r";

const echoAll = spec([
  { runShell: { command: "echo $DD_FIXTURE_REF", stdio: "$DD_FIXTURE_REF" } },
  nodePrint("process.env.DD_FIXTURE_DOTENV"),
  nodePrint("process.env.DD_FIXTURE_TOKEN"),
]);
const allEnv = { DD_FIXTURE_REF: REF, DD_FIXTURE_TOKEN: TOKEN };
const allFiles = { ".env": `DD_FIXTURE_DOTENV=${DOTENV}\n`, "mask.spec.json": echoAll };
const config = (extra) => JSON.stringify({ telemetry: { send: false }, autoUpdate: false, ...extra });

const cases = {
  "referenced-value": {
    files: { "mask.spec.json": spec([{ runShell: { command: "echo $DD_FIXTURE_REF", stdio: "$DD_FIXTURE_REF" } }]) },
    env: { DD_FIXTURE_REF: REF },
    hidden: [REF],
    shown: ['"command": "echo ***DD_FIXTURE_REF***"', '"stdout": "***DD_FIXTURE_REF***"'],
  },
  "dotenv-value-unreferenced": {
    files: { ".env": `DD_FIXTURE_DOTENV=${DOTENV}\n`, "mask.spec.json": spec([nodePrint("process.env.DD_FIXTURE_DOTENV")]) },
    env: {},
    hidden: [DOTENV],
    shown: ['"stdout": "***DD_FIXTURE_DOTENV***"'],
  },
  "secret-name-unreferenced": {
    files: { "mask.spec.json": spec([nodePrint("process.env.DD_FIXTURE_TOKEN")]) },
    env: { DD_FIXTURE_TOKEN: TOKEN },
    hidden: [TOKEN],
    shown: ['"stdout": "***DD_FIXTURE_TOKEN***"'],
  },
  "http-header-echo": {
    // The 8092 test server echoes the Authorization header as x-echo-authorization,
    // which reaches the report as an httpRequest response header.
    files: {
      "mask.spec.json": spec([
        {
          httpRequest: {
            url: "http://localhost:8092/api/headers",
            request: { headers: { Authorization: "Bearer $DD_FIXTURE_HEADER_TOKEN" } },
          },
        },
      ]),
    },
    env: { DD_FIXTURE_HEADER_TOKEN: "header-token-9753" },
    hidden: ["header-token-9753"],
    shown: ['"x-echo-authorization": "Bearer ***DD_FIXTURE_HEADER_TOKEN***"'],
  },
  "public-config-exact": {
    files: allFiles,
    env: { ...allEnv, DOC_DETECTIVE_CONFIG: config({ publicVariables: ["DD_FIXTURE_REF"] }) },
    hidden: [DOTENV, TOKEN],
    shown: [REF],
  },
  "public-config-wildcard": {
    files: allFiles,
    env: { ...allEnv, DOC_DETECTIVE_CONFIG: config({ publicVariables: ["DD_*"] }) },
    hidden: [],
    shown: [REF, DOTENV, TOKEN],
  },
  "public-config-star": {
    files: allFiles,
    env: { ...allEnv, DOC_DETECTIVE_CONFIG: config({ publicVariables: ["*"] }) },
    hidden: [],
    shown: [REF, DOTENV, TOKEN],
  },
  "public-spec": {
    files: { ...allFiles, "mask.spec.json": { ...echoAll, publicVariables: ["DD_FIXTURE_DOTENV"] } },
    env: allEnv,
    hidden: [REF, TOKEN],
    shown: [DOTENV],
  },
  "public-test-across-specs": {
    files: {
      ...allFiles,
      "a.spec.json": { tests: [{ publicVariables: ["DD_FIXTURE_TOKEN"], steps: [{ runShell: "echo a" }] }] },
    },
    env: allEnv,
    args: ["-i", "a.spec.json,mask.spec.json"],
    hidden: [REF, DOTENV],
    shown: [TOKEN],
  },
  "short-value-not-masked": {
    files: { "mask.spec.json": spec([nodePrint("'short:' + process.env.DD_FIXTURE_SHORT_TOKEN")]) },
    env: { DD_FIXTURE_SHORT_TOKEN: "abc" },
    hidden: ["***DD_FIXTURE_SHORT_TOKEN***"],
    shown: ['"stdout": "short:abc"'],
  },
  "encoded-forms": {
    files: {
      "mask.spec.json": spec([
        nodePrint("encodeURIComponent(process.env.DD_FIXTURE_ENC_TOKEN)"),
        nodePrint("Buffer.from('x' + process.env.DD_FIXTURE_ENC_TOKEN + 'y').toString('base64')"),
      ]),
    },
    env: { DD_FIXTURE_ENC_TOKEN: ENCODED },
    hidden: [ENCODED, encodeURIComponent(ENCODED), Buffer.from(`x${ENCODED}y`).toString("base64")],
    shown: ['"stdout": "***DD_FIXTURE_ENC_TOKEN***"'],
  },
  "path-save-and-compare": {
    // The first run saves masked output; the second compares masked against
    // masked, so maxVariation 0 still passes.
    files: {
      "mask.spec.json": spec([
        { runShell: { command: "echo saved $DD_FIXTURE_REF", path: "saved.txt", maxVariation: 0, overwrite: "false" } },
      ]),
    },
    env: { DD_FIXTURE_REF: REF },
    runs: 2,
    hidden: [REF, '"result": "WARNING"'],
    shown: ['"variation": 0'],
    saved: { "saved.txt": "saved ***DD_FIXTURE_REF***" },
  },
  "basic-auth-echo": {
    // The 8092 test server echoes the Authorization header as x-echo-authorization.
    files: {
      "mask.spec.json": spec([
        {
          runShell:
            "node -e \"fetch('http://localhost:8092/api/basic',{headers:{Authorization:'Basic '+Buffer.from('admin:'+process.env.DD_FIXTURE_PASSWORD).toString('base64')}}).then(r=>console.log(r.headers.get('x-echo-authorization')))\"",
        },
      ]),
    },
    env: { DD_FIXTURE_PASSWORD: PASSWORD },
    hidden: [Buffer.from(`admin:${PASSWORD}`).toString("base64"), PASSWORD],
    shown: ['"stdout": "Basic ***DD_FIXTURE_PASSWORD***"'],
  },
};

const name = process.argv[2];
const c = cases[name];
if (!c) {
  console.error(`Unknown case "${name}". Cases: ${Object.keys(cases).join(", ")}`);
  process.exit(2);
}
const root = path.resolve(__dirname, "../../..");
const dir = path.join(root, ".tmp", "fixture-masking", name);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
for (const [file, content] of Object.entries(c.files)) {
  fs.writeFileSync(path.join(dir, file), typeof content === "string" ? content : JSON.stringify(content));
}

const env = {
  ...process.env,
  DOC_DETECTIVE_CONFIG: config({}),
  DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1",
  ...c.env,
};
for (const key of ["DOC_DETECTIVE_DEBUG", "DEBUG", "DOC_DETECTIVE"]) delete env[key];

const args = [...(c.args ?? ["-i", "mask.spec.json"]), "-l", "debug", "-o", "results.json"];
let run;
for (let i = 0; i < (c.runs ?? 1); i++) {
  run = spawnSync(process.execPath, [path.join(root, "bin", "doc-detective.js"), ...args], {
    cwd: dir,
    env,
    encoding: "utf8",
    timeout: 120_000,
  });
  // An earlier run that failed is checked below, not overwritten.
  if (run.error || run.status !== 0) break;
}
const fail = (message) => {
  console.error(`Case ${name}: ${message}`);
  console.error(`stderr: ${run.stderr}`);
  process.exit(1);
};
if (run.error) fail(`didn't finish: ${run.error.message}`);
if (run.status !== 0) fail(`exited ${run.status}, expected 0.`);
const results = fs.readFileSync(path.join(dir, "results.json"), "utf8");
const outputs = { stdout: run.stdout, stderr: run.stderr, "results.json": results };
for (const value of c.hidden) {
  for (const [where, text] of Object.entries(outputs)) {
    if (text.includes(value)) fail(`${where} includes ${JSON.stringify(value)}.`);
  }
}
for (const text of c.shown) if (!results.includes(text)) fail(`results.json doesn't include ${JSON.stringify(text)}.`);
for (const [file, expected] of Object.entries(c.saved ?? {})) {
  const content = fs.readFileSync(path.join(dir, file), "utf8");
  if (content.trim() !== expected) fail(`${file} holds ${JSON.stringify(content)}, expected ${JSON.stringify(expected)}.`);
}
console.log(`Case ${name}: passed.`);
