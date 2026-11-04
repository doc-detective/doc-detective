import { EventEmitter } from "node:events";

// Run progress for whoever is displaying it. Emits "context" as each test
// context finishes, so the CLI can show progress without the runner printing.
export const runProgress = new EventEmitter();

export function noteContextDone(specId: unknown, testId: unknown, contextReport: any) {
  runProgress.emit("context", {
    specId,
    testId,
    result: contextReport?.result,
    platform: contextReport?.platform,
    browser: contextReport?.browser,
  });
}
