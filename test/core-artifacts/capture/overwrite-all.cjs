// Run-wide `overwriteScreenshots` (ADR 01222), run by
// screenshot-overwrite-all.spec.json in this directory.
//
//   node test/core-artifacts/capture/overwrite-all.cjs <case>
//
// The key is run-level config, so a spec can't set it. Each case writes a
// reference and a spec to .tmp/overwrite-all/<case>/, outside
// test/core-artifacts/ so they never run as fixtures themselves. It then runs
// the real CLI there with the config and flags the case names, and checks the
// screenshot step's status and whether the reference changed. Exits 1 on any
// mismatch. The spec browses the 8092 test server in headless Chrome.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const spec = (overwrite, viewport, maxVariation) => ({
  specId: "overwrite-all",
  tests: [
    {
      runOn: [{ platforms: ["windows", "mac", "linux"], browsers: { name: "chrome", headless: true, ...(viewport && { viewport }) } }],
      steps: [{ goTo: "http://localhost:8092" }, { stepId: "shot", screenshot: { path: "ref.png", overwrite, ...(maxVariation !== undefined && { maxVariation }) } }],
    },
  ],
});

const cases = {
  // Config `false` beats the step's `true`: the reference stays as it was.
  "config-false-keeps-reference": {
    spec: spec("true"),
    config: { overwriteScreenshots: "false" },
    args: [],
    shot: "SKIPPED",
    changed: false,
  },
  // The bare flag means `true` and beats both the config and the step's `false`.
  "flag-true-replaces-reference": {
    spec: spec("false"),
    config: { overwriteScreenshots: "false" },
    args: ["--overwrite-screenshots"],
    shot: "PASS",
    changed: true,
  },
  // Config `aboveVariation` beats the step's `false`. The viewport is pinned to
  // the reference's size so they compare. The page is mostly white, so a tight
  // maxVariation makes the blank reference count as drift: warn and replace.
  "config-above-variation-replaces-drifted": {
    spec: spec("false", { width: 800, height: 600 }, 0.001),
    size: "800x600",
    config: { overwriteScreenshots: "aboveVariation" },
    args: [],
    shot: "WARNING",
    changed: true,
  },
};

const name = process.argv[2];
const c = cases[name];
if (!c) {
  console.error(`Unknown case "${name}". Cases: ${Object.keys(cases).join(", ")}`);
  process.exit(2);
}
const root = path.resolve(__dirname, "../../..");
const dir = path.join(root, ".tmp", "overwrite-all", name);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "case.spec.json"), JSON.stringify(c.spec, null, 2));
fs.writeFileSync(path.join(dir, "dd.json"), JSON.stringify(c.config));
const reference = path.join(dir, "ref.png");
const made = spawnSync(process.execPath, [path.join(__dirname, "make-reference.cjs"), reference, c.size ?? "40x30"]);
if (made.status !== 0) {
  console.error(`Couldn't write the reference: ${made.stderr}`);
  process.exit(1);
}
const before = fs.readFileSync(reference);

// A temp folder of its own keeps this nested run from clearing the fixture
// job's in-progress files (cleanTemp).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ddow-"));
const env = {
  ...process.env,
  TMPDIR: tmp,
  TEMP: tmp,
  TMP: tmp,
  DOC_DETECTIVE_CONFIG: JSON.stringify({ telemetry: { send: false }, autoUpdate: false }),
  DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1",
};
delete env.DOC_DETECTIVE;
const run = spawnSync(
  process.execPath,
  [
    path.join(root, "bin", "doc-detective.js"),
    "-c", "dd.json",
    "-i", "case.spec.json",
    "-o", "results.json",
    "--no-auto-screenshot",
    "--no-auto-record",
    ...c.args,
  ],
  { cwd: dir, env, encoding: "utf8", timeout: 280_000 }
);
try {
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
} catch {}

const failures = [];
if (run.error) failures.push(`the run finished (${run.error.message})`);
let shot;
try {
  const report = JSON.parse(fs.readFileSync(path.join(dir, "results.json"), "utf8"));
  shot = report.specs
    .flatMap((s) => s.tests.flatMap((t) => t.contexts.flatMap((x) => x.steps ?? [])))
    .find((s) => s.stepId === "shot");
} catch (error) {
  failures.push(`results.json is readable (${error.message})`);
}
if (shot?.result !== c.shot) failures.push(`the screenshot step is ${c.shot} (got ${shot?.result}: ${shot?.resultDescription})`);
const changed = !fs.readFileSync(reference).equals(before);
if (changed !== c.changed) failures.push(`the reference ${c.changed ? "changed" : "is unchanged"}`);
if (failures.length) {
  console.error(`Case ${name} failed: ${failures.join("; ")}.`);
  console.error(`stderr: ${run.stderr}`);
  process.exit(1);
}
console.log(`Case ${name}: passed.`);
