import { validate } from "../../common/src/validate.js";
import { switchToSurface } from "./browserSurface.js";
import {
  log,
  calculateFractionalDifference,
  serializeBrowserResult,
  matchesExpectedOutput,
} from "../utils.js";
import {
  buildConditionContext,
  evaluateImplicitAssertions,
} from "../routing.js";
import type { ImplicitAssertionSpec } from "../routing.js";
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

  // Multi-surface Phase 3/4: focus the session + window/tab the script runs
  // in. A cross-session reference resolves to that session's driver.
  if (step.runBrowserScript.surface !== undefined) {
    const switched = await switchToSurface(driver, step.runBrowserScript.surface);
    if (!switched.ok) {
      result.status = "FAIL";
      result.description = switched.message;
      return result;
    }
    driver = switched.driver ?? driver;
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

  // Unified assertion model: implicit verifications are `$$` runtime
  // EXPRESSIONS evaluated by the shared engine. Script EXECUTION errors (no
  // driver/`execute`, throw/timeout, invalid step, fs error) are handled above
  // / below as FAIL with NO assertion records. Here we (1) compute any derived
  // inputs the expressions reference and EXPOSE them as outputs, (2) build the
  // ordered list of APPLICABLE specs, then (3) hand them to the shared engine.
  //
  // Applicable set: output match (only when `output` is set); saved-file
  // variation (only when `path` is set AND an existing file is being compared
  // against). With neither, there are zero applicable specs and the roll-up of
  // an empty record list is PASS. File write/overwrite SIDE EFFECTS are
  // preserved exactly and run unconditionally whenever `path` is set,
  // independent of the assertion model.
  const specs: ImplicitAssertionSpec[] = [];
  const descriptions: string[] = [];

  // (a) Expected output match — APPLICABLE only when `output` is set. The
  // existing substring / regex match (`matchesExpectedOutput`) is computed here
  // and EXPOSED as a boolean output so the spec is a simple equality and
  // `$$outputs.outputMatches` is referenceable downstream.
  if (step.runBrowserScript.output) {
    const outputMatches = matchesExpectedOutput(
      serialized,
      step.runBrowserScript.output
    );
    result.outputs.outputMatches = outputMatches;
    specs.push({
      statement: `$$outputs.outputMatches == true`,
      severity: "fail",
    });
    descriptions.push(
      outputMatches
        ? `Found expected output (${step.runBrowserScript.output}) in the script's return value.`
        : `Couldn't find expected output (${step.runBrowserScript.output}) in the script's return value.`
    );
  }

  // (b) Saved-file variation ≤ maxVariation — APPLICABLE only when `path` is set
  // AND an existing file is being compared against. File-write / overwrite SIDE
  // EFFECTS are preserved exactly and run unconditionally whenever `path` is
  // set; the assertion is gated on there being a prior file (the "file didn't
  // exist yet → write, NO variation assertion" path emits no variation spec).
  // When applicable, the computed `fractionalDiff` is EXPOSED as
  // `outputs.variation` and the spec is `$$outputs.variation <= maxVariation`
  // at WARNING severity, referenceable downstream. A filesystem error (bad
  // path, permissions, full disk, file removed mid-run) is an EXECUTION error,
  // not an assertion: FAIL with NO records.
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
        // Doesn't exist, save output to file. No prior content to compare
        // against, so there is NO variation assertion in this branch.
        fs.writeFileSync(filePath, serialized);
      } else {
        const existingFile = fs.readFileSync(filePath, "utf8");
        const fractionalDiff = calculateFractionalDifference(
          existingFile,
          serialized
        );
        log(config, "debug", `Fractional difference: ${fractionalDiff}`);

        // Expose the computed variation as an output the expression references.
        result.outputs.variation = fractionalDiff;
        specs.push({
          statement: `$$outputs.variation <= ${step.runBrowserScript.maxVariation}`,
          severity: "warning",
        });

        // File side effects (write/overwrite) are unchanged from prior behavior.
        if (fractionalDiff > step.runBrowserScript.maxVariation) {
          if (
            step.runBrowserScript.overwrite == "aboveVariation" ||
            step.runBrowserScript.overwrite == "true"
          ) {
            fs.writeFileSync(filePath, serialized);
            descriptions.push(`Saved output to file.`);
          } else {
            descriptions.push(`Didn't overwrite the existing file.`);
          }
          descriptions.push(
            `The difference between the existing output and the new output (${fractionalDiff.toFixed(
              2
            )}) is greater than the max accepted variation (${
              step.runBrowserScript.maxVariation
            }).`
          );
        } else {
          // Within variation: only "true" forces a rewrite; otherwise the
          // existing file is left as-is.
          if (step.runBrowserScript.overwrite == "true") {
            fs.writeFileSync(filePath, serialized);
            descriptions.push(`Saved output to file.`);
          }
        }
      }
    } catch (error: any) {
      result.status = "FAIL";
      result.description = `Couldn't persist script output at ${step.runBrowserScript.path}: ${error.message}`;
      return result;
    }
  }

  // Evaluate the applicable specs through the shared engine. Zero applicable
  // specs (neither `output` nor a compared file) roll up to PASS.
  const ctx = buildConditionContext({ outputs: result.outputs });
  const { assertions, status } = await evaluateImplicitAssertions(specs, ctx);
  result.assertions = assertions;
  result.status = status;
  if (descriptions.length > 0) {
    result.description = `${result.description} ${descriptions.join(" ")}`;
  }

  return result;
}
