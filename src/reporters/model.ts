import fs from "node:fs";
import path from "node:path";

// Never import src/utils.ts here: it imports this file.
import { log } from "../core/utils.js";

export { verdict } from "../cliOutput.js";
export { nonPassItems, existingFile, mediaPath, environmentLine, writeReport };

const NON_PASS = ["FAIL", "WARNING", "SKIPPED"];

// A report's lists have holes: `contexts` is pre-allocated and filled as contexts
// finish (ADR 01092). Each node comes with its 1-based position, for fallback IDs.
function present(list: any): [any, number][] {
  return (Array.isArray(list) ? list : []).map((node: any, index: number): [any, number] => [node, index + 1]).filter(([node]) => node);
}

// A stored evidence path as an absolute path, or `undefined` when the file isn't
// there. A relative path resolves against the run folder.
function existingFile(file: any, runDir: any): string | undefined {
  if (typeof file !== "string" || !file) return undefined;
  const absolute = path.resolve(typeof runDir === "string" ? runDir : "", file);
  return fs.existsSync(absolute) ? absolute : undefined;
}

// Everything that wasn't a PASS, FAIL then WARNING then SKIPPED, in report order.
// The rules are in ADR 01180. `owner` is the node a reporter groups an item under:
// its context, or the test or spec when there's no context to be under.
function nonPassItems(results: any): any[] {
  const runDir = results?.runDir;
  const existing = (file: any) => existingFile(file, runDir);
  const makeItem = (owner: any, node: any, ids: string[], description?: string) => {
    const item: any = { status: node.result, idPath: ids.join(" › "), reason: node.resultDescription ?? "", skippedAfter: 0, owner };
    if (description) item.description = description;
    if (node.resultHint) item.hint = node.resultHint;
    if (node.resultCode) item.code = node.resultCode;
    return item;
  };
  const items: any[] = [];
  for (const [spec, specNumber] of present(results?.specs)) {
    const specId = spec.specId || `spec ${specNumber}`;
    const tests = present(spec.tests);
    if (tests.length === 0 && NON_PASS.includes(spec.result)) items.push(makeItem(spec, spec, [specId], spec.description));
    for (const [test, testNumber] of tests) {
      const testId = test.testId || `test ${testNumber}`;
      const contexts = present(test.contexts);
      if (contexts.length === 0 && NON_PASS.includes(test.result)) {
        items.push(makeItem(test, test, [specId, testId], test.description));
      }
      for (const [context, contextNumber] of contexts) {
        const ids = [specId, testId, context.contextId || `context ${contextNumber}`];
        const own: any[] = [];
        // The last FAIL item, which the SKIPPED steps after it fold into.
        let failed: any = null;
        const recording = context.autoRecording;
        if (recording && NON_PASS.includes(recording.result)) {
          own.push(makeItem(context, recording, [...ids, "autoRecording"]));
          if (recording.result === "FAIL") failed = own[0];
        }
        for (const [step, stepNumber] of present(context.steps)) {
          if (!NON_PASS.includes(step.result)) continue;
          if (step.result === "SKIPPED" && failed) {
            failed.skippedAfter++;
            continue;
          }
          const item = makeItem(context, step, [...ids, step.stepId || `step ${stepNumber}`], step.description);
          // autoScreenshot is the field's name until R-1 renames it.
          const screenshot = [step.autoScreenshotPath, step.autoScreenshot, step.outputs?.screenshotPath].map(existing).find(Boolean);
          if (screenshot) item.screenshot = screenshot;
          own.push(item);
          if (step.result === "FAIL") failed = item;
        }
        // Rule 4: the context gets its own item only when nothing above already
        // carries its result. A failed step or a failed recording sets the
        // context's result, so it already explains it. A context that's FAIL
        // with only a WARNING step still needs a FAIL item, so match the
        // result, not just any non-PASS item.
        if (NON_PASS.includes(context.result) && !own.some((item) => item.status === context.result)) {
          own.push(makeItem(context, context, ids, test.description));
        }
        const video = own.length > 0 ? existing(recording?.recordingPath) : undefined;
        for (const item of own) {
          if (video) item.recording = video;
          if (item.skippedAfter > 0) {
            item.skippedNote = `${item.skippedAfter} more ${item.skippedAfter === 1 ? "step" : "steps"} skipped after the failure.`;
          }
        }
        items.push(...own);
      }
    }
  }
  return NON_PASS.flatMap((status) => items.filter((item) => item.status === status));
}

// A stored path as seen from `fromDir`, with forward slashes. A relative path
// resolves against `runDir` first, and a path with no relative form (another
// Windows drive) stays absolute.
function mediaPath(file: string, runDir: any, fromDir: string): string {
  const absolute = path.resolve(typeof runDir === "string" ? runDir : "", file);
  const relative = path.relative(fromDir, absolute);
  return (path.isAbsolute(relative) ? absolute : relative).split(path.sep).join("/");
}

// The run's environment on one line, or null when the report has none. A missing
// field is left out.
function environmentLine(results: any): string | null {
  const env = results?.environment;
  if (!env) return null;
  const host = `${[env.platform, env.osRelease].filter(Boolean).join(" ")}${env.arch ? ` (${env.arch})` : ""}`;
  const parts = [
    env.docDetectiveVersion && `Doc Detective ${env.docDetectiveVersion}`,
    env.nodeVersion && `Node.js ${env.nodeVersion}`,
    host,
    results.startedAt && `Started ${results.startedAt}`,
    typeof results.durationMs === "number" && `Took ${(results.durationMs / 1000).toFixed(1)} s`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

const WRITE_CAUSES: Record<string, string> = {
  EACCES: "permission denied",
  EPERM: "permission denied",
  ENOSPC: "the disk is full",
  EROFS: "the file system is read-only",
  ENOTDIR: "a folder in that path is a file",
  EISDIR: "that path is a folder",
};

// Build a report file, write it, and announce it on stderr, through log() so the
// log level and masking apply. Reporters run under Promise.all, so this never
// throws, including when the report can't be built: a rejection would skip the
// CLI's exit-code gate (ADR 01092). A render failure and a write failure log
// different errors. Returns the path, or null after logging the error. Never
// print "results at ": GitHub Action tags up to v1.4.1 split stdout on it.
function writeReport(kind: string, file: string, render: () => string, config: any = {}): string | null {
  // "Results" and "Run …" read lowercase mid-sentence; the others are names.
  const noun = kind.replace(/^R(?=esults$|un )/, "r");
  const message = (error: any) => String(error?.message ?? error).replace(/\.$/, "");
  let text: string;
  try {
    text = render();
  } catch (error: any) {
    void log(config, "error", `Couldn't build the ${noun}: ${message(error)}.`);
    return null;
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    void log(config, "info", `${kind}: ${file}`);
    return file;
  } catch (error: any) {
    void log(config, "error", `Couldn't write the ${noun} to ${file}: ${WRITE_CAUSES[error?.code] ?? message(error)}.`);
    return null;
  }
}
