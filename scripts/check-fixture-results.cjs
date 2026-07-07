#!/usr/bin/env node
// Gate a CI fixture job on the result of a doc-detective run.
//
// The doc-detective CLI intentionally exits 0 even when specs FAIL — the
// exit-on-fail decision historically lived in the GitHub Action layer, not the
// runner. The per-feature fixture jobs (.github/workflows/fixtures.yml) run the
// locally-built CLI directly with `--output <file>`, then invoke this script to
// turn a FAILed spec into a non-zero exit so the job (and the PR gate) fails.
//
// Policy (see the "Feature fixtures" section of CLAUDE.md): every spec must
// resolve to PASS or SKIPPED. So a FAIL fails the job; an empty run (no specs
// discovered — usually a mis-pointed --input) also fails, so a silent no-op
// can't sneak through as green.
const fs = require("node:fs");

const resultsPath = process.argv[2];
if (!resultsPath) {
  console.error("usage: check-fixture-results.cjs <output.json>");
  process.exit(2);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
} catch (err) {
  console.error(`Could not read results at ${resultsPath}: ${err.message}`);
  process.exit(2);
}

const specs = Array.isArray(data.specs) ? data.specs : [];
if (specs.length === 0) {
  console.error(
    `No specs ran — check the --input path. Results file: ${resultsPath}`
  );
  process.exit(1);
}

const failed = specs.filter((s) => s.result === "FAIL");
if (failed.length > 0) {
  console.error(`${failed.length} spec(s) FAILED:`);
  for (const s of failed) {
    console.error(`  - ${s.specId || s.id || "(unknown spec)"}`);
  }
  process.exit(1);
}

const passed = specs.filter((s) => s.result === "PASS").length;
const skipped = specs.filter((s) => s.result === "SKIPPED").length;

// Opt-in (DD_FIXTURES_REQUIRE_PASS=1): at least one spec must actually PASS.
// Legs whose fixtures are KNOWN to run on that runner (e.g. apps on Windows
// and macOS) set this so an environment regression that silently converts
// every spec to SKIPPED can't read as green — an all-SKIPPED run is only
// acceptable where skipping is the asserted behavior.
if (process.env.DD_FIXTURES_REQUIRE_PASS === "1" && passed === 0) {
  console.error(
    `All ${specs.length} spec(s) were SKIPPED but this leg requires at least one PASS (DD_FIXTURES_REQUIRE_PASS=1). A skip-everything run here means the runner environment regressed — read the skip reasons in ${resultsPath}.`
  );
  process.exit(1);
}

console.log(
  `All ${specs.length} spec(s) passed or skipped (${passed} passed, ${skipped} skipped).`
);
process.exit(0);
