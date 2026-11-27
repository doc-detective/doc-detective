// Compare a run with an earlier one (ADR 01233). A unit is one test in one
// context, keyed by spec ID, test ID, and context ID. Exact IDs only.
import fs from "node:fs";
import path from "node:path";
import { log } from "./utils.js";

const PREFIX = "Couldn't compare with an earlier run:";

// A report's lists can have holes (ADR 01092).
const present = (list: any): any[] => (Array.isArray(list) ? list.filter(Boolean) : []);

// Every key in a report, mapped to whether any visit of it failed.
function failedKeys(report: any): Map<string, boolean> {
  const keys = new Map<string, boolean>();
  for (const spec of present(report?.specs)) {
    for (const test of present(spec.tests)) {
      for (const context of present(test.contexts)) {
        const key = JSON.stringify([spec.specId, test.testId, context.contextId]);
        keys.set(key, keys.get(key) || context.result === "FAIL");
      }
    }
  }
  return keys;
}

// Stamp `failureStatus` on each context and `comparison` on the report.
export function compareRuns(report: any, previous: any, previousPath: string) {
  const before = failedKeys(previous);
  const now = failedKeys(report);
  const summary = { new: 0, existing: 0, fixed: 0 };
  for (const spec of present(report.specs)) {
    for (const test of present(spec.tests)) {
      for (const context of present(test.contexts)) {
        const key = JSON.stringify([spec.specId, test.testId, context.contextId]);
        let status: "new" | "existing" | "fixed" | undefined;
        if (context.result === "FAIL") status = before.get(key) ? "existing" : "new";
        // A key that failed in another visit this run isn't fixed.
        else if (context.result === "PASS" && before.get(key) && !now.get(key)) status = "fixed";
        if (!status) continue;
        context.failureStatus = status;
        summary[status]++;
      }
    }
  }
  report.comparison = {
    previous: {
      runId: previous.runId,
      startedAt: previous.startedAt,
      docDetectiveVersion: previous.environment?.docDetectiveVersion,
      path: previousPath,
    },
    summary,
  };
  return report;
}

const major = (version: any) => String(version).split(".")[0];

// The earlier run's results `config.compareTo` names, or why there are none.
export function loadPreviousResults(
  config: any,
  runId: string,
  currentVersion?: string
): { previous: any; path: string } | { reason: string } {
  if (config.compareTo === false) return { reason: `${PREFIX} \`compareTo\` is \`false\`.` };
  const target = config.compareTo ?? "previous";
  let file: string;
  if (target === "previous") {
    const runsDir = path.resolve(config.outputDir ?? ".", ".doc-detective", "runs");
    const names = fs.existsSync(runsDir) ? fs.readdirSync(runsDir).sort().reverse() : [];
    const name = names.find(
      (entry) => entry !== runId && fs.existsSync(path.join(runsDir, entry, "testResults.json"))
    );
    if (!name) return { reason: `${PREFIX} no earlier run in \`${runsDir}\`.` };
    file = path.join(runsDir, name, "testResults.json");
  } else {
    file = path.resolve(target);
    if (!fs.existsSync(file)) return { reason: `${PREFIX} \`${file}\` doesn't exist.` };
    if (fs.statSync(file).isDirectory()) {
      const inside = path.join(file, "testResults.json");
      if (!fs.existsSync(inside)) return { reason: `${PREFIX} \`${file}\` has no \`testResults.json\`.` };
      file = inside;
    }
  }
  let previous: any;
  try {
    previous = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { reason: `${PREFIX} \`${file}\` isn't valid JSON.` };
  }
  if (!Array.isArray(previous?.specs)) {
    return { reason: `${PREFIX} \`${file}\` has no \`specs\` list, so it isn't Doc Detective results.` };
  }
  const version = previous.environment?.docDetectiveVersion;
  if (currentVersion && (!version || major(version) !== major(currentVersion))) {
    return {
      reason: `${PREFIX} \`${file}\` is from Doc Detective ${version || "an unknown version"}, and test IDs match only within version ${major(currentVersion)}.`,
    };
  }
  return { previous, path: file };
}

// The run-time step: compare when `compareTo` allows it, and say how it went.
// An unset `compareTo` is the quiet default, so its misses log at debug.
export function compareWithEarlierRun(config: any, report: any) {
  if (config.compareTo === false) return report;
  const loaded = loadPreviousResults(config, report.runId, report.environment?.docDetectiveVersion);
  if ("reason" in loaded) {
    log(config, config.compareTo === undefined ? "debug" : "warning", loaded.reason);
    return report;
  }
  compareRuns(report, loaded.previous, loaded.path);
  const { summary } = report.comparison;
  log(
    config,
    "info",
    `Compared with run \`${loaded.previous.runId ?? loaded.path}\`: ${summary.new} new, ${summary.existing} already failing, ${summary.fixed} fixed.`
  );
  return report;
}
