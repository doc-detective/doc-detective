// EXPERIMENT (exp/windows-stalls): mocha root-hook plugin that logs every
// event-loop block >= 2s in the mocha process, tagged with the running test.
// Paired with sidecar.mjs (a separate process): a block both see at the same
// time is machine-wide; one only mocha sees is in-process.
import fs from "node:fs";

const INTERVAL = 100;
const THRESHOLD = 2000;
let current = "(before first test)";
let last = Date.now();
const stalls = [];

setInterval(() => {
  const now = Date.now();
  const ms = now - last - INTERVAL;
  if (ms >= THRESHOLD) {
    stalls.push({ start: new Date(last).toISOString(), ms, test: current });
    console.log(`[stall-monitor] event loop blocked ${ms}ms during: ${current}`);
  }
  last = now;
}, INTERVAL).unref();

process.on("exit", () => {
  fs.writeFileSync(process.env.STALL_OUT || "stalls.json", JSON.stringify(stalls, null, 1));
});

export const mochaHooks = {
  beforeEach() {
    current = this.currentTest.fullTitle();
  },
  afterEach() {
    current = `(after) ${this.currentTest.fullTitle()}`;
  },
};
