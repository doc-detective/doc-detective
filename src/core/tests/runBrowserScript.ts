import { validate } from "../../common/src/validate.js";
import {
  log,
  calculateFractionalDifference,
  serializeBrowserResult,
  matchesExpectedOutput,
} from "../utils.js";
import fs from "node:fs";
import path from "node:path";

export { runBrowserScript };

// Execute arbitrary JavaScript in the browser page context via the WebDriver
// `executeScript` endpoint. The script's return value is captured into
// `outputs.result`; non-string values are serialized for the optional
// `output` assertion and `path` snapshot. Mirrors the runShell/runCode shape.
async function runBrowserScript({
  config,
  step,
  driver,
}: {
  config: any;
  step: any;
  driver: any;
}) {
  const result: any = {
    status: "PASS",
    description: "Executed browser script.",
    outputs: {
      result: undefined,
    },
  };

  // Validate step object
  const isValidStep = validate({ schemaKey: "step_v3", object: step });
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = `Invalid step definition: ${isValidStep.errors}`;
    return result;
  }
  // Accept coerced and defaulted values
  step = isValidStep.object;
  // Resolve to object
  if (typeof step.runBrowserScript === "string") {
    step.runBrowserScript = { script: step.runBrowserScript };
  }
  // Set default values
  step.runBrowserScript = {
    ...step.runBrowserScript,
    args: step.runBrowserScript.args || [],
    maxVariation: step.runBrowserScript.maxVariation || 0,
    overwrite: step.runBrowserScript.overwrite || "aboveVariation",
    timeout: step.runBrowserScript.timeout || 60000,
  };

  // A browser script is meaningless without a live page.
  if (!driver || typeof driver.execute !== "function") {
    result.status = "FAIL";
    result.description =
      "No browser available. runBrowserScript requires a browser context.";
    return result;
  }

  // Execute script in the page, racing against a timeout.
  const timeout = step.runBrowserScript.timeout;
  // WebdriverIO accepts a string script body run via executeScript; args are
  // exposed to the script via the `arguments` object.
  const scriptPromise = driver.execute(
    step.runBrowserScript.script,
    ...step.runBrowserScript.args
  );
  // If the timeout wins the race, `scriptPromise` is left without a consumer.
  // Attach a no-op catch so a later rejection (JS error, closed session) is
  // handled instead of surfacing as an unhandled promise rejection. This extra
  // handler doesn't affect the race: a pre-timeout rejection still propagates
  // to `Promise.race` and is reported as a FAIL below.
  scriptPromise.catch(() => {});
  let timeoutId: any;
  const timeoutPromise = new Promise<any>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Script timed out after ${timeout} milliseconds`));
    }, timeout);
  });

  let returnValue: unknown;
  try {
    returnValue = await Promise.race([scriptPromise, timeoutPromise]);
    clearTimeout(timeoutId);
  } catch (error: any) {
    clearTimeout(timeoutId);
    result.status = "FAIL";
    result.description = `Script execution failed: ${error.message}`;
    return result;
  }

  result.outputs.result = returnValue;
  const serialized = serializeBrowserResult(returnValue);

  // Evaluate expected output (substring or /regex/) against the serialized value.
  if (step.runBrowserScript.output) {
    if (!matchesExpectedOutput(serialized, step.runBrowserScript.output)) {
      result.status = "FAIL";
      result.description = `Couldn't find expected output (${step.runBrowserScript.output}) in the script's return value.`;
      return result;
    }
  }

  // Check if the return value is saved to a file. Wrap the filesystem work so a
  // permissions error, bad path, full disk, or a file deleted mid-run returns a
  // deterministic FAIL instead of throwing out of the runner.
  if (step.runBrowserScript.path) {
    try {
      const dir = path.dirname(step.runBrowserScript.path);
      // If `dir` doesn't exist, create it
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const filePath = step.runBrowserScript.path;
      log(config, "debug", `Saving script result to file: ${filePath}`);

      if (!fs.existsSync(filePath)) {
        // Doesn't exist, save output to file
        fs.writeFileSync(filePath, serialized);
      } else {
        const existingFile = fs.readFileSync(filePath, "utf8");
        const fractionalDiff = calculateFractionalDifference(
          existingFile,
          serialized
        );
        log(config, "debug", `Fractional difference: ${fractionalDiff}`);

        if (fractionalDiff > step.runBrowserScript.maxVariation) {
          if (
            step.runBrowserScript.overwrite == "aboveVariation" ||
            step.runBrowserScript.overwrite == "true"
          ) {
            fs.writeFileSync(filePath, serialized);
            result.description += ` Saved output to file.`;
          } else {
            result.description += ` Didn't overwrite the existing file.`;
          }
          result.status = "WARNING";
          result.description += ` The difference between the existing output and the new output (${fractionalDiff.toFixed(
            2
          )}) is greater than the max accepted variation (${
            step.runBrowserScript.maxVariation
          }).`;
          return result;
        }

        // Within variation: only "true" forces a rewrite; otherwise the
        // existing file is left as-is and the step passes without a note.
        if (step.runBrowserScript.overwrite == "true") {
          fs.writeFileSync(filePath, serialized);
          result.description += ` Saved output to file.`;
        }
      }
    } catch (error: any) {
      result.status = "FAIL";
      result.description = `Couldn't persist script output at ${step.runBrowserScript.path}: ${error.message}`;
      return result;
    }
  }

  return result;
}
