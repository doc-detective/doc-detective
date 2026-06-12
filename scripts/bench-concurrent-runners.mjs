// Benchmark concurrent runners on a clean CI runner. Two workloads:
//   A. I/O-bound ceiling: pure `wait` steps (zero CPU/contention) — the
//      theoretical upper bound on speedup.
//   B. Realistic browser workload: N independent Chrome contexts each loading
//      a local page. Driver/browser startup + page load is the real cost
//      users parallelize. Fully local (no external network, no flaky deps).
import http from "node:http";
import { runSpecs } from "../dist/core/tests.js";
import { getEnvironment } from "../dist/core/config.js";

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const env = getEnvironment();
const baseConfig = () => ({
  logLevel: "silent",
  telemetry: { send: false },
  hints: { enabled: false },
  environment: env,
});

function buildResolved(contexts, runners) {
  const perTest = 4;
  const specs = [];
  for (let i = 0; i < contexts.length; i += perTest) {
    const slice = contexts.slice(i, i + perTest);
    specs.push({
      specId: `spec-${i / perTest}`,
      tests: [{ testId: `test-${i / perTest}`, contexts: slice }],
    });
  }
  const config = { ...baseConfig(), concurrentRunners: runners };
  return { config, specs };
}

async function bench(label, makeContexts, runnerList, iters) {
  console.log(`\n=== ${label} ===`);
  const med = {};
  for (const runners of runnerList) {
    const times = [];
    let summary;
    for (let i = 0; i < iters; i++) {
      const rt = buildResolved(makeContexts(), runners);
      const start = Date.now();
      try {
        summary = (await runSpecs({ resolvedTests: rt })).summary;
      } catch (e) {
        console.log(`  runners=${runners} iter=${i} ERROR: ${e.message}`);
      }
      times.push(Date.now() - start);
    }
    med[runners] = median(times);
    const sp = (med[runnerList[0]] / med[runners]).toFixed(2);
    console.log(
      `  runners=${runners}: median ${med[runners]}ms [${times.join(", ")}]  ` +
        `speedup ${sp}x` +
        (summary ? `  (ctx P${summary.contexts.pass}/F${summary.contexts.fail})` : "")
    );
  }
  return med;
}

const WAIT_N = 8;
const waitCtx = () =>
  Array.from({ length: WAIT_N }, (_, i) => ({
    contextId: `w-${i}`,
    steps: [{ stepId: `w-${i}-s`, wait: 500 }],
  }));
const aMed = await bench(
  `I/O-bound ceiling: ${WAIT_N} contexts x 500ms wait`,
  waitCtx,
  [1, 2, 4],
  3
);

const PAGE =
  "<!doctype html><html><head><title>Bench</title></head>" +
  "<body><h1>Benchmark page</h1></body></html>";
const server = http.createServer((_, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(PAGE);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;

const BROWSER_N = 12;
const browserCtx = () =>
  Array.from({ length: BROWSER_N }, (_, i) => ({
    contextId: `b-${i}`,
    browser: { name: "chrome", headless: true },
    steps: [
      { stepId: `b-${i}-go`, goTo: url },
      { stepId: `b-${i}-wait`, wait: 2000 },
    ],
  }));
const bMed = await bench(
  `Realistic browser: ${BROWSER_N} Chrome contexts (goTo + 2s work)`,
  browserCtx,
  [1, 2, 4],
  2
);
server.close();

console.log("\n=== Summary (speedup vs 1 runner) ===");
console.log(`I/O ceiling   @2: ${(aMed[1] / aMed[2]).toFixed(2)}x  @4: ${(aMed[1] / aMed[4]).toFixed(2)}x`);
console.log(`Browser       @2: ${(bMed[1] / bMed[2]).toFixed(2)}x  @4: ${(bMed[1] / bMed[4]).toFixed(2)}x`);
