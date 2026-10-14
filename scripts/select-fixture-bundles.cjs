#!/usr/bin/env node
// Computes the fixture matrix the PR gate should run for a change set (see
// .github/workflows/fixtures.yml and ADR 01055). This is the SINGLE SOURCE OF
// TRUTH for the bundle definitions — fixtures.yml builds its matrix from this
// script's `--matrix` output via fromJSON, so there is no second copy to drift.
//
// Deliberately conservative: the ONLY narrowing case is a change set confined
// entirely to fixture GROUP directories — then only the bundles owning the
// touched groups run. Anything else (product code, scripts, workflows, shared
// fixture infra like env / config.groups.json / the mocha-owned ordering+output
// dirs, or an empty list) selects ALL bundles, so a mapping gap can never
// silently skip coverage.
//
// Zero runtime dependencies on purpose: the CI `select` job runs this straight
// from a checkout, before any npm install.

const fs = require("fs");
const path = require("path");

// One entry per fixture bundle, in matrix order. `dirs` are the fixture group
// directories under test/core-artifacts/; the CI-only attributes (timeout,
// android, prebootIos) travel with each bundle into the matrix.
const BUNDLES = [
  { name: "nav-capture", dirs: ["navigation", "capture"] },
  { name: "interactions", dirs: ["interactions"] },
  // `reporters` is shell-only (it spawns a nested CLI run), so it needs no
  // browser or device and rides along with the other fast, headless groups.
  { name: "web-plumbing", dirs: ["routing", "http", "guards", "reporters"] },
  { name: "proc-sessions", dirs: ["process", "sessions"] },
  { name: "recording", dirs: ["recording"] },
  // Spec-file shard (ADR 01126). Recordings serialize on one display mutex
  // inside a run, so the group's only parallelism is a second runner. This
  // job takes the listed specs; "recording" takes every OTHER entry in the
  // dir, read from disk at matrix time, so a new spec lands there with no
  // edit here. The split balances CI timings (~250 s per job on Windows and
  // macOS; recording-permutations alone is ~165 s). A shard owns no dir, so
  // the one-bundle-per-dir guard and dir-based narrowing are unchanged, and
  // selectMatrix runs it whenever its owner runs.
  {
    name: "recording-2",
    dirs: [],
    shardOf: "recording",
    specs: [
      "above-variation.spec.json",
      "annotate-timeout.spec.json",
      "recording-permutations.spec.json",
      "stale-headless.spec.json",
    ],
  },
  { name: "apps", dirs: ["apps"], timeout: 30 },
  { name: "android-skip", dirs: ["apps-android", "mobile-web-android"], android: true },
  // prebootIos is load-bearing beyond the simulator pre-boot: fixtures.yml
  // gates its "Prebuild WebDriverAgent" (install ios) step on it, AND the
  // workflow runs the doc-detective action with `ios: 'false'` (the action's
  // own WDA cache is retired in favor of the managed prebuild). A new
  // iOS-flavored bundle added WITHOUT prebootIos gets neither — every run
  // would pay the ~10-minute in-session WDA compile and likely blow the
  // default 20-minute timeout.
  { name: "apps-ios", dirs: ["apps-ios"], timeout: 55, prebootIos: true },
  { name: "mobile-web-ios", dirs: ["mobile-web-ios"], timeout: 55, prebootIos: true },
];

const GROUP_TO_BUNDLE = new Map();
for (const bundle of BUNDLES)
  for (const dir of bundle.dirs) GROUP_TO_BUNDLE.set(dir, bundle.name);

// The matrix object fixtures.yml consumes: `input` is the comma-joined
// --input value (the action passes it verbatim to `--input`, which splits on
// commas); the optional CI attributes are included only when set.
function toMatrixEntry(b) {
  const entry = { name: b.name, input: inputPaths(b).join(",") };
  if (b.timeout) entry.timeout = b.timeout;
  if (b.android) entry.android = true;
  if (b.prebootIos) entry.prebootIos = true;
  return entry;
}

// A bundle's --input paths: its group dirs, except that a dir with shards is
// listed entry by entry minus the specs its shards claim, and a shard lists
// its claimed specs inside its owner's dir.
//
// Listing entries keeps discovery equivalent to passing the dir: doc-detective
// runs explicit files through the same isValidSourceFile filter (extension +
// spec validation) as files it finds in a dir, and a subdirectory entry stays
// a dir input, discovered recursively as before. Two exceptions mirror what
// dir discovery skips or should: anything under node_modules, and dotfiles and
// dot-dirs (.DS_Store, a local run's .doc-detective/ reports).
/**
 * The entry names of a group dir a sharded owner forwards as inputs.
 * @param {string} groupPath - absolute path of the group dir
 * @param {Set<string>} claimed - spec names its shards take
 * @returns {string[]}
 */
function listedEntries(groupPath, claimed) {
  return fs
    .readdirSync(groupPath)
    .filter((name) => !name.startsWith(".") && name !== "node_modules" && !claimed.has(name))
    .sort();
}

function inputPaths(b) {
  const at = (dir, name) => `test/core-artifacts/${dir}/${name}`;
  if (b.shardOf) {
    const dir = BUNDLES.find((o) => o.name === b.shardOf).dirs[0];
    return b.specs.map((s) => at(dir, s));
  }
  const claimed = new Set(
    BUNDLES.filter((s) => s.shardOf === b.name).flatMap((s) => s.specs)
  );
  if (claimed.size === 0) return b.dirs.map((d) => `test/core-artifacts/${d}`);
  return b.dirs.flatMap((d) =>
    listedEntries(path.join(__dirname, "..", "test", "core-artifacts", d), claimed).map(
      (name) => at(d, name)
    )
  );
}

/**
 * Bundle NAMES to run for a change set: "all", or a comma-joined subset in
 * matrix order. (Kept for readability/tests; selectMatrix drives CI.)
 * @param {string[]} changedFiles
 * @returns {string}
 */
function selectBundles(changedFiles) {
  const names = selectedNames(changedFiles);
  return names === null ? "all" : names.join(",");
}

/**
 * The matrix (array of bundle objects) to run for a change set. Not narrowable
 * → every bundle. Never empty.
 * @param {string[]} changedFiles
 * @returns {object[]}
 */
function selectMatrix(changedFiles) {
  const names = selectedNames(changedFiles);
  const keep = names === null ? null : new Set(names);
  return BUNDLES.filter(
    (b) => keep === null || keep.has(b.name) || keep.has(b.shardOf)
  ).map(toMatrixEntry);
}

// Returns the selected bundle names in matrix order, or null meaning "not
// narrowable → all bundles". Null (not an empty array) is the all-signal so an
// empty change set and a fully-confined-but-unmatched set stay distinct.
function selectedNames(changedFiles) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) return null;
  const touched = new Set();
  for (const raw of changedFiles) {
    const file = String(raw).replace(/\\/g, "/");
    const match = file.match(/^test\/core-artifacts\/([^/]+)\//);
    const bundle = match && GROUP_TO_BUNDLE.get(match[1]);
    if (!bundle) return null; // outside a known group dir → run everything
    touched.add(bundle);
  }
  return BUNDLES.filter((b) => touched.has(b.name)).map((b) => b.name);
}

// Groups whose fixtures exercise android surfaces; changes there always keep
// the heavy KVM legs on.
const ANDROID_GROUPS = new Set(["apps-android", "mobile-web-android"]);

// A file is "android-safe" when it demonstrably cannot change what the KVM
// legs (fixtures-android-reuse/-managed/-action) execute: fixture specs of
// NON-android groups, files consumed only by the mocha suite (test/<name>.
// test.js — the fixture jobs never load them), and prose (docs/, adrs/, *.md).
// Everything else — product code, scripts, workflows, package manifests, the
// test servers (hit from INSIDE the emulator via 10.0.2.2), shared fixture
// infra — is android-relevant.
function isAndroidSafe(file) {
  const groupMatch = file.match(/^test\/core-artifacts\/([^/]+)\//);
  if (groupMatch)
    return GROUP_TO_BUNDLE.has(groupMatch[1]) && !ANDROID_GROUPS.has(groupMatch[1]);
  if (/^test\/[^/]+\.test\.js$/.test(file)) return true;
  if (/^(docs|adrs)\//.test(file)) return true;
  if (/\.md$/i.test(file)) return true;
  return false;
}

/**
 * Whether the heavy android KVM legs must run for this change set. Fail-safe:
 * empty/unknown sets are relevant (the legs run).
 * @param {string[]} changedFiles
 * @returns {boolean}
 */
function androidLegsRelevant(changedFiles) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) return true;
  return !changedFiles.every((raw) =>
    isAndroidSafe(String(raw).replace(/\\/g, "/"))
  );
}

function main() {
  const mode = process.argv.includes("--matrix")
    ? "matrix"
    : process.argv.includes("--android-legs")
    ? "android"
    : "names";
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (d) => (input += d));
  process.stdin.on("end", () => {
    const files = input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    // --matrix: single-line JSON array for a workflow matrix.
    // --android-legs: "true"/"false" for the KVM-leg `if:` guards.
    // Default: comma names, for humans and any name-only consumer.
    const out =
      mode === "matrix"
        ? JSON.stringify(selectMatrix(files))
        : mode === "android"
        ? String(androidLegsRelevant(files))
        : selectBundles(files);
    process.stdout.write(out + "\n");
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  listedEntries,
  selectBundles,
  selectMatrix,
  androidLegsRelevant,
  toMatrixEntry,
  BUNDLES,
};
