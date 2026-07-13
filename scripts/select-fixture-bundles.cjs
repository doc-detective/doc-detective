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

// One entry per fixture bundle, in matrix order. `dirs` are the fixture group
// directories under test/core-artifacts/; the CI-only attributes (timeout,
// android, prebootIos) travel with each bundle into the matrix.
const BUNDLES = [
  { name: "nav-capture", dirs: ["navigation", "capture"] },
  { name: "interactions", dirs: ["interactions"] },
  { name: "web-plumbing", dirs: ["routing", "http", "guards"] },
  { name: "proc-sessions", dirs: ["process", "sessions"] },
  { name: "recording", dirs: ["recording"] },
  { name: "apps", dirs: ["apps"], timeout: 30 },
  { name: "android-skip", dirs: ["apps-android", "mobile-web-android"], android: true },
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
  const entry = {
    name: b.name,
    input: b.dirs.map((d) => `test/core-artifacts/${d}`).join(","),
  };
  if (b.timeout) entry.timeout = b.timeout;
  if (b.android) entry.android = true;
  if (b.prebootIos) entry.prebootIos = true;
  return entry;
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
  return BUNDLES.filter((b) => keep === null || keep.has(b.name)).map(toMatrixEntry);
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

function main() {
  const matrixMode = process.argv.includes("--matrix");
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (d) => (input += d));
  process.stdin.on("end", () => {
    const files = input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    // --matrix: single-line JSON array for a workflow matrix. Default: comma
    // names, for humans and any name-only consumer.
    process.stdout.write(
      (matrixMode ? JSON.stringify(selectMatrix(files)) : selectBundles(files)) + "\n"
    );
  });
}

if (require.main === module) {
  main();
}

module.exports = { selectBundles, selectMatrix, toMatrixEntry, BUNDLES };
