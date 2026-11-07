import sinon from "sinon";

// Run `run` with console.error stubbed, and return its result plus the lines it
// printed. The stub is restored even when `run` throws, but the rejection
// propagates and the lines are lost, so test error paths with assert.rejects.
export async function captureConsoleError(run) {
  const errors = sinon.stub(console, "error");
  try {
    const result = await run();
    // Keeps each call's first argument: diag() calls console.error(line) with one string.
    return { result, lines: errors.args.map(([line]) => String(line)) };
  } finally {
    errors.restore();
  }
}
