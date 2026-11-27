import fs from "node:fs";
import path from "node:path";

import { stepActions } from "../common/src/stepActions.js";
import { reportOutputDir } from "../core/utils.js";
import { existingFile, present, writeReport } from "./model.js";

export { cucumberReporter, buildCucumberJson };

// WARNING is `passed`: Cucumber has no warning state, and a warning must not
// fail the run in Xray or Allure. Its text goes to the step's `output` instead
// (ADR 01228).
const STATUS: Record<string, string> = { PASS: "passed", FAIL: "failed", SKIPPED: "skipped", WARNING: "passed" };

// `goTo: https://example.com`: the action key and its main value.
function actionSummary(step: any): string | undefined {
  const action = stepActions.find((key) => key in step);
  if (!action) return undefined;
  const value = step[action];
  const main =
    value && typeof value === "object"
      ? Object.values(value).find((v) => typeof v === "string" || typeof v === "number")
      : value;
  return main === undefined || main === null || typeof main === "boolean" ? action : `${action}: ${main}`;
}

// Turn the results object into Cucumber JSON: an array of features, one per
// spec, with a scenario per test × context and a step per step.
function buildCucumberJson(results: any): any[] {
  const runDir = results?.runDir;
  return present(results?.specs).map(([spec, specNumber]) => {
    const specId = spec.specId || `spec ${specNumber}`;
    const elements: any[] = [];
    for (const [test, testNumber] of present(spec.tests)) {
      const testId = test.testId || `test ${testNumber}`;
      for (const [context, contextNumber] of present(test.contexts)) {
        const where = [context.browser?.name, context.platform].filter(Boolean).join("/");
        const steps = present(context.steps).map(([step, stepNumber]) => {
          const result: any = {
            status: STATUS[step.result] ?? "undefined",
            duration: Math.round((typeof step.durationMs === "number" && step.durationMs > 0 ? step.durationMs : 0) * 1e6),
          };
          const out: any = {
            keyword: "* ",
            name: step.description || actionSummary(step) || step.stepId || `step ${stepNumber}`,
            result,
          };
          if (step.result === "FAIL") {
            result.error_message = [step.resultDescription, step.resultHint].filter(Boolean).join("\n");
          }
          if (step.result === "WARNING" && step.resultDescription) out.output = [step.resultDescription];
          const shot = [step.autoScreenshotPath, step.outputs?.screenshotPath]
            .map((file) => existingFile(file, runDir))
            .find(Boolean);
          // ponytail: inline base64 makes a big file on a screenshot-heavy run.
          // Add an opt-out (or a path-only mode) when someone hits that.
          if (shot) out.embeddings = [{ mime_type: "image/png", data: fs.readFileSync(shot).toString("base64") }];
          return out;
        });
        const recording = existingFile(context.autoRecording?.recordingPath, runDir);
        if (recording && steps.length > 0) {
          const last = steps[steps.length - 1];
          last.embeddings = [...(last.embeddings ?? []), { mime_type: "text/plain", data: recording }];
        }
        elements.push({
          type: "scenario",
          keyword: "Scenario",
          id: `${testId};${context.contextId || `context ${contextNumber}`}`,
          name: `${test.description || testId}${where ? ` (${where})` : ""}`,
          steps,
        });
      }
    }
    return {
      uri: spec.contentPath || specId,
      id: specId,
      keyword: "Feature",
      name: spec.description || specId,
      elements,
    };
  });
}

async function cucumberReporter(
  config: any = {},
  outputPath: any,
  results: any,
  options: any = {}
): Promise<string | null> {
  // A fixed name, like junit.xml, so a CI artifact path stays stable.
  const outputFile = path.resolve(reportOutputDir(outputPath), "cucumber.json");
  return writeReport("Cucumber report", outputFile, () => JSON.stringify(buildCucumberJson(results), null, 2), config);
}
