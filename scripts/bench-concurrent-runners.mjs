// Measure concurrentRunners on the project's REAL spec corpus (test/artifacts)
// — the same specs the mocha E2E suite runs — with the same two test servers
// (8092/8093) the suite starts. Runs the full corpus end-to-end via runTests
// at 1/2/4 runners. No synthetic contexts.
import { createServer } from "../test/server/index.js";
import { runTests } from "../dist/index.js";

const servers = [
  createServer({
    port: 8092,
    staticDir: "./test/server/public",
    modifyResponse: (req, body) => ({ ...body, extraField: "added by server" }),
  }),
  createServer({ port: 8093, staticDir: "./test/server/public" }),
];
for (const s of servers) await s.start();

const median = (xs) => {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
};

const RUNNERS = [1, 2, 4];
const ITERS = 3;
const med = {};
console.log("=== Real suite: test/artifacts end-to-end (runTests) ===");
for (const runners of RUNNERS) {
  const times = [];
  let summary;
  for (let i = 0; i < ITERS; i++) {
    const start = Date.now();
    try {
      const r = await runTests({
        input: "test/artifacts",
        logLevel: "silent",
        telemetry: { send: false },
        hints: { enabled: false },
        concurrentRunners: runners,
      });
      summary = r.summary;
    } catch (e) {
      console.log(`  runners=${runners} iter=${i} ERROR: ${e.message}`);
    }
    times.push(Date.now() - start);
  }
  med[runners] = median(times);
  console.log(
    `  runners=${runners}: median ${med[runners]}ms [${times.join(", ")}]  ` +
      `speedup ${(med[1] / med[runners]).toFixed(2)}x` +
      (summary
        ? `  (specs P${summary.specs.pass}/F${summary.specs.fail}/W${summary.specs.warning}/S${summary.specs.skipped}` +
          ` | contexts P${summary.contexts.pass}/F${summary.contexts.fail}/S${summary.contexts.skipped})`
        : "")
  );
}
for (const s of servers) await s.stop();
console.log(
  `\nReal-suite speedup @2: ${(med[1] / med[2]).toFixed(2)}x  @4: ${(med[1] / med[4]).toFixed(2)}x`
);
