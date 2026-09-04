// The pass/fail rule for the container smoke test, kept separate from the
// docker plumbing so it is unit-testable without building an image
// (test/container-run-outcome.test.js).
//
// Why it isn't simply `fail === 0`: the image ships for linux/amd64 AND
// linux/arm64, and browser support differs between them. Google's Chrome for
// Testing publishes no native linux-arm64 chromedriver, so on arm64 the driver
// is unavailable and every browser-backed spec resolves to SKIPPED through the
// runner's normal context gating, while the shell / HTTP / link-checking specs
// still execute for real. Demanding "everything passed" would make the arm64
// leg permanently red for a platform gap the runner already handles correctly.
//
// But "nothing failed" alone is a gate that can go blind: an image broken badly
// enough to run nothing at all also reports `fail === 0`. So the rule carries a
// second half — at least one spec must actually have PASSED. That keeps the
// arm64 tolerance honest without weakening what the gate proves.
//
// Mirrors the shape of the fixtures gate in scripts/check-fixture-results.cjs,
// which likewise fails on FAILed specs or a run that produced nothing.

/**
 * Throw with a diagnostic message unless the run is acceptable.
 *
 * @param {unknown} results Parsed contents of the runner's results JSON.
 */
function assertRunOutcome(results) {
  const specs = results && results.summary && results.summary.specs;
  if (!specs || typeof specs !== "object") {
    throw new Error(
      "Results file has no `summary.specs` — the run produced no usable summary."
    );
  }
  const fail = Number(specs.fail) || 0;
  const pass = Number(specs.pass) || 0;
  const skipped = Number(specs.skipped) || 0;
  if (fail > 0) {
    throw new Error(
      `${fail} spec(s) failed (pass: ${pass}, skipped: ${skipped}).`
    );
  }
  if (pass === 0) {
    throw new Error(
      `no spec passed (skipped: ${skipped}). A platform without a browser is ` +
        `expected to SKIP the browser specs, but the shell/HTTP specs must ` +
        `still run — an all-skipped run means the image is not working.`
    );
  }
}

module.exports = { assertRunOutcome };
