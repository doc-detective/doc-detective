import { validate } from "../../common/src/validate.js";
import {
  spawnCommand,
  spawnBackgroundCommand,
  waitForReady,
  log,
  calculateFractionalDifference,
} from "../utils.js";
import {
  buildConditionContext,
  evaluateImplicitAssertions,
} from "../routing.js";
import type { ImplicitAssertionSpec } from "../routing.js";
import kill from "tree-kill";
import fs from "node:fs";
import path from "node:path";

export { runShell };

// Run a shell command. When `step.runShell.background` is true, the command is
// started as a long-running process registered in `processRegistry` and the step
// returns as soon as `readyWhen` is satisfied; the process is torn down later by
// a stopProcess step or the run-end sweep.
async function runShell({
  config,
  step,
  processRegistry,
}: {
  config: any;
  step: any;
  processRegistry?: Map<string, any>;
}) {
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

  // Background mode: start the process, register it, wait until ready, and
  // return immediately. `exitCodes`, `stdio`, and output saving don't apply.
  if (step.runShell.background) {
    const name = step.runShell.name;
    if (!name) {
      result.status = "FAIL";
      result.description = "Background processes require a `name`.";
      return result;
    }
    if (processRegistry && processRegistry.has(name)) {
      result.status = "FAIL";
      result.description = `A background process named "${name}" is already running.`;
      return result;
    }

    const bgOptions: any = {};
    if (step.runShell.workingDirectory)
      bgOptions.cwd = step.runShell.workingDirectory;

    const bg = spawnBackgroundCommand(
      step.runShell.command,
      step.runShell.args,
      bgOptions
    );

    // Register before awaiting readiness so the run-end sweep can kill the
    // process even if it never becomes ready.
    const entry: any = { name, bg };
    if (processRegistry) processRegistry.set(name, entry);

    try {
      await waitForReady(bg, step.runShell.readyWhen, {
        timeoutMs: step.runShell.timeout,
      });
    } catch (error: any) {
      // Readiness failed (timeout or the process exited) — kill and deregister
      // so a half-started process doesn't leak.
      try {
        if (bg.pid) kill(bg.pid);
      } catch {
        // best-effort cleanup; the readiness error is what matters
      }
      if (processRegistry) processRegistry.delete(name);
      result.status = "FAIL";
      result.description = `Background process "${name}" failed to become ready: ${error.message}`;
      return result;
    }

    result.status = "PASS";
    result.description = `Started background process "${name}".`;
    result.outputs = {
      pid: String(bg.pid ?? ""),
      name,
      ready: "true",
    };
    return result;
  }

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

  // Unified assertion model: every implicit check is a `$$` runtime EXPRESSION
  // evaluated by the shared engine (`evaluateImplicitAssertions`). We do NOT
  // compute PASS/FAIL inline here — instead we (1) compute any derived inputs
  // the expressions reference and EXPOSE them as outputs, (2) build the ordered
  // list of APPLICABLE specs, then (3) hand them to the shared engine which
  // performs the in-order evaluation, FAIL short-circuit (later applicable
  // checks become SKIPPED), and the FAIL > WARNING > SKIPPED > PASS roll-up.
  //
  // For runShell the applicable set is: exitCode (always); stdio (only when
  // `step.runShell.stdio` is set); saved-file variation (only when
  // `step.runShell.path` is set AND there is an existing file to compare).
  // Side effects (file writes/overwrite) are preserved exactly and run
  // unconditionally whenever `path` is set, independent of the assertion model.
  const specs: ImplicitAssertionSpec[] = [];
  const descriptions: string[] = [];

  // (a) Exit code ∈ exitCodes (always applicable).
  specs.push({
    statement: `$$outputs.exitCode oneOf ${JSON.stringify(
      step.runShell.exitCodes
    )}`,
    severity: "fail",
  });
  descriptions.push(
    step.runShell.exitCodes.includes(result.outputs.exitCode)
      ? `Returned exit code ${result.outputs.exitCode}.`
      : `Returned exit code ${result.outputs.exitCode}. Expected one of ${JSON.stringify(
          step.runShell.exitCodes
        )}`
  );

  // (b) stdio substring / regex match — APPLICABLE only when `stdio` is set.
  // The existing "expected found in stdout OR stderr" semantics (substring, or
  // regex when wrapped in /.../) are computed here and EXPOSED as a new boolean
  // output, `result.outputs.stdioMatched`, so the spec is a simple equality
  // (`$$outputs.stdioMatched == true`) — no OR operator needed, and users can
  // reference `$$outputs.stdioMatched` in conditions / custom assertions.
  if (step.runShell.stdio) {
    const isRegex =
      step.runShell.stdio.startsWith("/") && step.runShell.stdio.endsWith("/");
    let stdioMatched: boolean;
    if (isRegex) {
      const regex = new RegExp(step.runShell.stdio.slice(1, -1));
      stdioMatched =
        regex.test(result.outputs.stdio.stdout) ||
        regex.test(result.outputs.stdio.stderr);
    } else {
      stdioMatched =
        result.outputs.stdio.stdout.includes(step.runShell.stdio) ||
        result.outputs.stdio.stderr.includes(step.runShell.stdio);
    }
    result.outputs.stdioMatched = stdioMatched;
    specs.push({
      statement: `$$outputs.stdioMatched == true`,
      severity: "fail",
    });
    descriptions.push(
      stdioMatched
        ? `Found expected output (${step.runShell.stdio}) in stdio.`
        : isRegex
        ? `Couldn't find expected output (${step.runShell.stdio}) in actual output (stdout or stderr).`
        : `Couldn't find expected output (${step.runShell.stdio}) in stdio (stdout or stderr).`
    );
  }

  // (c) Saved-file variation ≤ maxVariation — APPLICABLE only when `path` is
  // set AND an existing file is being compared against. The file-write /
  // overwrite side effects are preserved exactly as before and run
  // unconditionally whenever `path` is set; the assertion is gated on there
  // being a prior file (the "file didn't exist yet → write, NO variation
  // assertion" path emits no variation spec). When applicable, the computed
  // `fractionalDiff` is EXPOSED as `result.outputs.variation` and the spec is
  // `$$outputs.variation <= maxVariation` at WARNING severity. Users can also
  // reference `$$outputs.variation` in conditions / custom assertions.
  if (step.runShell.path) {
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
      // Doesn't exist, save output to file. No prior content to compare against,
      // so there is NO variation assertion in this branch.
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

      // Expose the computed variation as an output the expression references.
      result.outputs.variation = fractionalDiff;
      specs.push({
        statement: `$$outputs.variation <= ${step.runShell.maxVariation}`,
        severity: "warning",
      });

      // File side effects (write/overwrite) are unchanged from prior behavior.
      if (fractionalDiff > step.runShell.maxVariation) {
        if (step.runShell.overwrite == "aboveVariation") {
          // Overwrite file
          fs.writeFileSync(filePath, result.outputs.stdio.stdout);
          descriptions.push(`Saved output to file.`);
        }
        descriptions.push(
          `The difference between the existing output and the new output (${fractionalDiff.toFixed(
            2
          )}) is greater than the max accepted variation (${
            step.runShell.maxVariation
          }).`
        );
      } else {
        if (step.runShell.overwrite == "true") {
          // Overwrite file
          fs.writeFileSync(filePath, result.outputs.stdio.stdout);
          descriptions.push(`Saved output to file.`);
        }
        descriptions.push(
          `Saved-file variation (${fractionalDiff.toFixed(
            2
          )}) is within the max accepted variation (${step.runShell.maxVariation}).`
        );
      }
    }
  }

  // Evaluate the applicable specs through the shared engine against the current
  // step's outputs (including the derived `stdioMatched` / `variation`).
  const ctx = buildConditionContext({ outputs: result.outputs });
  const { assertions, status } = await evaluateImplicitAssertions(specs, ctx);
  result.assertions = assertions;
  result.status = status;
  result.description = descriptions.join(" ");
  return result;
}
