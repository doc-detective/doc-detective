#!/usr/bin/env node
// Selects which fixture bundles the PR gate must run for a change set (see
// .github/workflows/npm-test.yaml and ADR 01049). Deliberately conservative:
// the ONLY narrowing case is a change set confined entirely to fixture GROUP
// directories — then only the bundles owning the touched groups run. Anything
// else (product code, scripts, workflows, shared fixture infra like env /
// config.groups.json / the mocha-owned ordering+output dirs, or an empty
// list) returns "all", so a mapping gap can never silently skip coverage.
//
// Zero runtime dependencies on purpose: the CI `changes` job runs this
// straight from a checkout, before any npm install. The bundle map below is
// kept in lockstep with .github/workflows/fixtures.yml by a drift-guard
// assertion in test/select-fixture-bundles.test.js — edit them together.

// One entry per fixtures.yml matrix bundle, in matrix order.
const BUNDLES = [
  { name: "nav-capture", dirs: ["navigation", "capture"] },
  { name: "interactions", dirs: ["interactions"] },
  { name: "web-plumbing", dirs: ["routing", "http", "guards"] },
  { name: "proc-sessions", dirs: ["process", "sessions"] },
  { name: "recording", dirs: ["recording"] },
  { name: "apps", dirs: ["apps"] },
  { name: "android-skip", dirs: ["apps-android", "mobile-web-android"] },
  { name: "apps-ios", dirs: ["apps-ios"] },
  { name: "mobile-web-ios", dirs: ["mobile-web-ios"] },
];

const GROUP_TO_BUNDLE = new Map();
for (const bundle of BUNDLES)
  for (const dir of bundle.dirs) GROUP_TO_BUNDLE.set(dir, bundle.name);

/**
 * @param {string[]} changedFiles - repo-relative paths (either separator)
 * @returns {string} "all", or a comma-joined subset of bundle names in
 *   fixtures.yml matrix order
 */
function selectBundles(changedFiles) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) return "all";
  const touched = new Set();
  for (const raw of changedFiles) {
    const file = String(raw).replace(/\\/g, "/");
    const match = file.match(/^test\/core-artifacts\/([^/]+)\//);
    const bundle = match && GROUP_TO_BUNDLE.get(match[1]);
    if (!bundle) return "all"; // outside a known group dir → run everything
    touched.add(bundle);
  }
  return BUNDLES.filter((b) => touched.has(b.name))
    .map((b) => b.name)
    .join(",");
}

function main() {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (d) => (input += d));
  process.stdin.on("end", () => {
    const files = input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    process.stdout.write(selectBundles(files) + "\n");
  });
}

if (require.main === module) {
  main();
}

module.exports = { selectBundles, BUNDLES };
