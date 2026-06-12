// Benchmark concurrent runners against the repo's full test/artifacts spec
// corpus. Measures two things:
//   1. Execution-only: resolve once, then run runSpecs at N runners (isolates
//      the parallelized portion from fixed detect/resolve overhead).
//   2. End-to-end: full runTests (detect + resolve + execute) at 1 vs 4.
import { runTests, detectAndResolveTests } from "../dist/index.js";
import { runSpecs } from "../dist/core/tests.js";
import { getEnvironment } from "../dist/core/config.js";

const INPUT = "test/artifacts";
const RUNNERS = [1, 2, 4];
const ITERS = 3;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

const baseConfig = {
  input: INPUT,
  logLevel: "silent",
  telemetry: { send: false },
  hints: { enabled: false },
};

// Resolve once so the execution-only numbers exclude detect/resolve cost.
const resolved = await detectAndResolveTests({ config: { ...baseConfig } });
if (!resolved?.config?.environment) {
  resolved.config = { ...resolved.config, environment: getEnvironment() };
}
const contexts = resolved.specs.flatMap((s) =>
  s.tests.flatMap((t) => t.contexts)
);
console.log(
  `Workload: ${resolved.specs.length} specs, ` +
    `${resolved.specs.flatMap((s) => s.tests).length} tests, ` +
    `${contexts.length} contexts\n`
);

console.log("=== Execution only (runSpecs on pre-resolved tests) ===");
const execMedian = {};
for (const runners of RUNNERS) {
  const times = [];
  let summary;
  for (let i = 0; i < ITERS; i++) {
    const rt = structuredClone(resolved);
    rt.config.concurrentRunners = runners;
    const start = Date.now();
    try {
      const report = await runSpecs({ resolvedTests: rt });
      summary = report.summary;
    } catch (e) {
      console.log(`  runners=${runners} iter=${i} ERROR: ${e.message}`);
    }
    times.push(Date.now() - start);
  }
  execMedian[runners] = median(times);
  const sp = (execMedian[1] / execMedian[runners]).toFixed(2);
  console.log(
    `  runners=${runners}: median ${execMedian[runners]}ms ` +
      `[${times.join(", ")}]  speedup ${sp}x` +
      (summary ? `  (specs P${summary.specs.pass}/F${summary.specs.fail}/W${summary.specs.warning})` : "")
  );
}

console.log("\n=== End-to-end (runTests: detect + resolve + execute) ===");
const e2eMedian = {};
for (const runners of [1, 4]) {
  const times = [];
  for (let i = 0; i < ITERS; i++) {
    const start = Date.now();
    try {
      await runTests({ ...baseConfig, concurrentRunners: runners });
    } catch (e) {
      console.log(`  runners=${runners} iter=${i} ERROR: ${e.message}`);
    }
    times.push(Date.now() - start);
  }
  e2eMedian[runners] = median(times);
  const sp = (e2eMedian[1] / e2eMedian[runners]).toFixed(2);
  console.log(
    `  runners=${runners}: median ${e2eMedian[runners]}ms ` +
      `[${times.join(", ")}]  speedup ${sp}x`
  );
}

console.log("\n=== Summary ===");
console.log(`Execution-only speedup @4 runners: ${(execMedian[1] / execMedian[4]).toFixed(2)}x`);
console.log(`End-to-end speedup @4 runners:     ${(e2eMedian[1] / e2eMedian[4]).toFixed(2)}x`);
