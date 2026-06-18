import { validate } from "../../common/src/validate.js";
import {
  spawnCommand,
  log,
  calculateFractionalDifference,
  rollUpResults,
} from "../utils.js";
import fs from "node:fs";
import path from "node:path";

export { runShell };

// One articulated assertion record. The runner emits these for each verification
// check; the step result is the roll-up of their `result` fields. See
// docs/design/dynamic-routing-roadmap.md ("Assertions") for the locked shape.
interface AssertionRecord {
  statement: string;
  source: "implicit" | "custom";
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
  expected?: any;
  actual?: any;
  description?: string;
}

// Run a shell command.
async function runShell({ config, step }: { config: any; step: any }) {
  // Promisify and execute command
  const result: any = {
    status: "PASS",
    description: "Executed command.",
    outputs: {
      exitCode: "",
      stdio: {
        stdout: "",
        stderr: "",
      },
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
  if (typeof step.runShell === "string") {
    step.runShell = { command: step.runShell };
  }
  // Set default values
  step.runShell = {
    ...step.runShell,
    exitCodes: step.runShell.exitCodes || [0],
    args: step.runShell.args || [],
    workingDirectory: step.runShell.workingDirectory || ".",
    maxVariation: step.runShell.maxVariation || 0,
    overwrite: step.runShell.overwrite || "aboveVariation",
    timeout: step.runShell.timeout || 60000,
  };

  // Execute command
  const timeout = step.runShell.timeout;
  const options: any = {};
  if (step.runShell.workingDirectory)
    options.cwd = step.runShell.workingDirectory;
  const commandPromise = spawnCommand(
    step.runShell.command,
    step.runShell.args,
    options
  );
  let timeoutId;
  const timeoutPromise = new Promise<any>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Command timed out after ${timeout} milliseconds`));
    }, timeout);
  });

  try {
    // Wait for command to finish or timeout
    const commandResult: any = await Promise.race([commandPromise, timeoutPromise]);
    clearTimeout(timeoutId);
    result.outputs.stdio.stdout = commandResult.stdout.replace(/\r$/, "");
    result.outputs.stdio.stderr = commandResult.stderr.replace(/\r$/, "");
    result.outputs.exitCode = commandResult.exitCode;
  } catch (error: any) {
    result.status = "FAIL";
    result.description = error.message;
    return result;
  }

  // Build implicit assertion records in order, with short-circuit: stop
  // *evaluating* checks once an assertion FAILs (its successors' inputs may not
  // be meaningful), but still REPORT the full applicable checklist:
  //   - An assertion that is applicable but not reached (because an earlier one
  //     FAILed) is emitted with `result: "SKIPPED"`, carrying its `statement`,
  //     `source: "implicit"`, and `expected` where known. `actual`/`description`
  //     are omitted because it was never evaluated.
  //   - An assertion that is not applicable (its feature isn't configured) is
  //     omitted entirely — no SKIPPED record.
  // For runShell the applicable set is: exitCode (always); stdio (only when
  // `step.runShell.stdio` is set); saved-file variation (only when
  // `step.runShell.path` is set). The step result is the roll-up of the
  // emitted assertions (FAIL > WARNING > all-SKIPPED > PASS). Side effects
  // (file writes/overwrite) are preserved exactly as before; only the
  // result-precedence is corrected (a late maxVariation WARNING no longer
  // clobbers an earlier FAIL).
  const assertions: AssertionRecord[] = [];
  const descriptions: string[] = [];

  // (a) Exit code ∈ exitCodes.
  const exitCodePass = step.runShell.exitCodes.includes(result.outputs.exitCode);
  const exitCodeDescription = exitCodePass
    ? `Returned exit code ${result.outputs.exitCode}.`
    : `Returned exit code ${result.outputs.exitCode}. Expected one of ${JSON.stringify(
        step.runShell.exitCodes
      )}`;
  assertions.push({
    statement: `exitCode in ${JSON.stringify(step.runShell.exitCodes)}`,
    source: "implicit",
    result: exitCodePass ? "PASS" : "FAIL",
    expected: step.runShell.exitCodes,
    actual: result.outputs.exitCode,
    description: exitCodeDescription,
  });
  descriptions.push(exitCodeDescription);

  // (b) stdio substring / regex match — APPLICABLE only when `stdio` is set.
  // If applicable but a prior assertion already FAILed, report it as SKIPPED
  // (not reached) rather than evaluating it. If not applicable, emit nothing.
  if (step.runShell.stdio) {
    const isRegex =
      step.runShell.stdio.startsWith("/") && step.runShell.stdio.endsWith("/");
    const stdioStatement = isRegex
      ? `stdio matches ${step.runShell.stdio}`
      : `stdio contains ${JSON.stringify(step.runShell.stdio)}`;
    if (assertions.some((a) => a.result === "FAIL")) {
      // Applicable but not reached: emit a SKIPPED record. `actual`/`description`
      // are omitted because the check was never evaluated.
      assertions.push({
        statement: stdioStatement,
        source: "implicit",
        result: "SKIPPED",
        expected: step.runShell.stdio,
      });
    } else {
      let stdioPass: boolean;
      if (isRegex) {
        const regex = new RegExp(step.runShell.stdio.slice(1, -1));
        stdioPass =
          regex.test(result.outputs.stdio.stdout) ||
          regex.test(result.outputs.stdio.stderr);
      } else {
        stdioPass =
          result.outputs.stdio.stdout.includes(step.runShell.stdio) ||
          result.outputs.stdio.stderr.includes(step.runShell.stdio);
      }
      const stdioDescription = stdioPass
        ? `Found expected output (${step.runShell.stdio}) in stdio.`
        : isRegex
        ? `Couldn't find expected output (${step.runShell.stdio}) in actual output (stdout or stderr).`
        : `Couldn't find expected output (${step.runShell.stdio}) in stdio (stdout or stderr).`;
      assertions.push({
        statement: stdioStatement,
        source: "implicit",
        result: stdioPass ? "PASS" : "FAIL",
        expected: step.runShell.stdio,
        description: stdioDescription,
      });
      descriptions.push(stdioDescription);
    }
  }

  // (c) Saved-file variation ≤ maxVariation — APPLICABLE only when `path` is
  // set. The file-write/overwrite side effects are preserved exactly as before
  // and run unconditionally whenever `path` is set; only the *assertion record*
  // honors short-circuit. What changed: when a prior assertion has FAILed, the
  // (applicable) variation check is no longer evaluated — it is reported as a
  // single SKIPPED record (not reached) carrying `expected: maxVariation`. When
  // not short-circuited, an exceeded variation produces a WARNING record and a
  // within-tolerance variation a PASS record, both rolled up.
  if (step.runShell.path) {
    const shortCircuited = assertions.some((a) => a.result === "FAIL");
    const variationStatement = `saved-file variation <= ${step.runShell.maxVariation}`;
    if (shortCircuited) {
      assertions.push({
        statement: variationStatement,
        source: "implicit",
        result: "SKIPPED",
        expected: step.runShell.maxVariation,
      });
    }
    const dir = path.dirname(step.runShell.path);
    // If `dir` doesn't exist, create it
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Set filePath
    let filePath = step.runShell.path;
    log(config, "debug", `Saving stdio to file: ${filePath}`);

    // Check if file already exists
    if (!fs.existsSync(filePath)) {
      // Doesn't exist, save output to file
      fs.writeFileSync(filePath, result.outputs.stdio.stdout);
    } else {
      if (step.runShell.overwrite == "false") {
        // File already exists
        descriptions.push(`Didn't save output. File already exists.`);
      }

      // Read existing file
      const existingFile = fs.readFileSync(filePath, "utf8");

      // Calculate fractional diff between existing file content and command output content, not length
      const fractionalDiff = calculateFractionalDifference(
        existingFile,
        result.outputs.stdio.stdout
      );
      log(config, "debug", `Fractional difference: ${fractionalDiff}`);

      if (fractionalDiff > step.runShell.maxVariation) {
        if (step.runShell.overwrite == "aboveVariation") {
          // Overwrite file
          fs.writeFileSync(filePath, result.outputs.stdio.stdout);
          descriptions.push(`Saved output to file.`);
        }
        const variationDescription = `The difference between the existing output and the new output (${fractionalDiff.toFixed(
          2
        )}) is greater than the max accepted variation (${
          step.runShell.maxVariation
        }).`;
        // Short-circuit: omit the variation assertion if a prior assertion
        // already FAILed (the verdict is already decided). The file side
        // effects above still ran, preserving prior behavior.
        if (!shortCircuited) {
          assertions.push({
            statement: `saved-file variation <= ${step.runShell.maxVariation}`,
            source: "implicit",
            result: "WARNING",
            expected: step.runShell.maxVariation,
            actual: fractionalDiff,
            description: variationDescription,
          });
          descriptions.push(variationDescription);
        }
      } else {
        if (step.runShell.overwrite == "true") {
          // Overwrite file
          fs.writeFileSync(filePath, result.outputs.stdio.stdout);
          descriptions.push(`Saved output to file.`);
        }
        if (!shortCircuited) {
          assertions.push({
            statement: `saved-file variation <= ${step.runShell.maxVariation}`,
            source: "implicit",
            result: "PASS",
            expected: step.runShell.maxVariation,
            actual: fractionalDiff,
            description: `Saved-file variation (${fractionalDiff.toFixed(
              2
            )}) is within the max accepted variation (${step.runShell.maxVariation}).`,
          });
        }
      }
    }
  }

  result.assertions = assertions;
  result.status = rollUpResults(assertions);
  result.description = descriptions.join(" ");
  return result;
}
