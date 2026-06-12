// DIAGNOSTIC mode: trigger the concurrent-Chrome startup crash quickly and let
// the env-gated Appium logs (DOC_DETECTIVE_APPIUM_LOG=1) reveal the real
// ChromeDriver error. 6 browser contexts at 4 runners, one iteration.
import http from "node:http";
import { runSpecs } from "../dist/core/tests.js";
import { getEnvironment } from "../dist/core/config.js";

const env = getEnvironment();
const PAGE =
  "<!doctype html><html><head><title>Bench</title></head>" +
  "<body><h1>Benchmark page</h1></body></html>";
const server = http.createServer((_, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(PAGE);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;

const N = 6;
const resolvedTests = {
  config: {
    logLevel: "silent",
    telemetry: { send: false },
    hints: { enabled: false },
    environment: env,
    concurrentRunners: 4,
  },
  specs: [
    {
      specId: "diag",
      tests: [
        {
          testId: "diag-test",
          contexts: Array.from({ length: N }, (_, i) => ({
            contextId: `b-${i}`,
            browser: { name: "chrome", headless: true },
            steps: [{ stepId: `b-${i}-s`, goTo: url }],
          })),
        },
      ],
    },
  ],
};

const report = await runSpecs({ resolvedTests });
server.close();
console.log(`\n=== DIAG result: contexts ${JSON.stringify(report.summary.contexts)} ===`);
for (const c of report.specs[0].tests[0].contexts) {
  console.log(`  ${c.contextId}: ${c.result} ${c.resultDescription || ""}`);
}
