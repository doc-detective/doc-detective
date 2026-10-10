// EXPERIMENT (exp/windows-stalls): an idle process that logs its own
// event-loop blocks >= 2s. It does no work, so a block here means the whole
// machine (or the scheduler) paused, not the mocha process alone.
import fs from "node:fs";

const out = process.argv[2] || "sidecar.jsonl";
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const ms = now - last - 100;
  if (ms >= 2000) fs.appendFileSync(out, JSON.stringify({ start: new Date(last).toISOString(), ms }) + "\n");
  last = now;
}, 100);
