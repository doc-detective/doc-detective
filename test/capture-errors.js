import sinon from "sinon";

// Run `run` with console.error stubbed, and return its result plus the lines it
// printed. The stub is restored even when `run` throws.
export async function captureErrors(run) {
  const errors = sinon.stub(console, "error");
  try {
    const result = await run();
    return { result, lines: errors.args.map(([line]) => String(line)) };
  } finally {
    errors.restore();
  }
}
