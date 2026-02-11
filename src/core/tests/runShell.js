const { validate } = require("doc-detective-common");
const {
  spawnCommand,
  log,
  calculateFractionalDifference,
} = require("../utils");
const fs = require("fs");
const path = require("path");

exports.runShell = runShell;

// Run a shell command.
async function runShell({ config, step }) {
  // Promisify and execute command
  const result = {
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
  const options = {};
  if (step.runShell.workingDirectory)
    options.cwd = step.runShell.workingDirectory;
  const commandPromise = spawnCommand(
    step.runShell.command,
    step.runShell.args,
    options
  );
  let timeoutId;
  const timeoutPromise = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Command timed out after ${timeout} milliseconds`));
    }, timeout);
  });

  try {
    // Wait for command to finish or timeout
    const commandResult = await Promise.race([commandPromise, timeoutPromise]);
    clearTimeout(timeoutId);
    result.outputs.stdio.stdout = commandResult.stdout.replace(/\r$/, "");
    result.outputs.stdio.stderr = commandResult.stderr.replace(/\r$/, "");
    result.outputs.exitCode = commandResult.exitCode;
  } catch (error) {
    result.status = "FAIL";
    result.description = error.message;
    return result;
  }

  // Evaluate exit code
  if (!step.runShell.exitCodes.includes(result.outputs.exitCode)) {
    result.status = "FAIL";
    result.description = `Returned exit code ${
      result.outputs.exitCode
    }. Expected one of ${JSON.stringify(step.runShell.exitCodes)}`;
  }

  // Evaluate stdout and stderr
  // If step.runShell.stdio starts and ends with `/`, treat it as a regex
  if (step.runShell.stdio) {
    if (
      step.runShell.stdio.startsWith("/") &&
      step.runShell.stdio.endsWith("/")
    ) {
      const regex = new RegExp(step.runShell.stdio.slice(1, -1));
      if (
        !regex.test(result.outputs.stdio.stdout) &&
        !regex.test(result.outputs.stdio.stderr)
      ) {
        result.status = "FAIL";
        result.description = `Couldn't find expected output (${step.runShell.stdio}) in actual output (stdout or stderr).`;
      }
    } else {
      if (
        !result.outputs.stdio.stdout.includes(step.runShell.stdio) &&
        !result.outputs.stdio.stderr.includes(step.runShell.stdio)
      ) {
        result.status = "FAIL";
        result.description = `Couldn't find expected output (${step.runShell.stdio}) in stdio (stdout or stderr).`;
      }
    }
  }

  // Check if command output is saved to a file
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
      // Doesn't exist, save output to file
      fs.writeFileSync(filePath, result.outputs.stdio.stdout);
    } else {
      if (step.runShell.overwrite == "false") {
        // File already exists
        result.description =
          result.description + ` Didn't save output. File already exists.`;
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
          result.description += ` Saved output to file.`;
        }
        result.status = "WARNING";
        result.description =
          result.description +
          ` The difference between the existing output and the new output (${fractionalDiff.toFixed(
            2
          )}) is greater than the max accepted variation (${
            step.runShell.maxVariation
          }).`;
        return result;
      }

      if (step.runShell.overwrite == "true") {
        // Overwrite file
        fs.writeFileSync(filePath, result.outputs.stdio.stdout);
        result.description += ` Saved output to file.`;
      }
    }
  }

  return result;
}
