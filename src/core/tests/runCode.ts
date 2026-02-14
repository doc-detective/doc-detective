import { validate } from "doc-detective-common";
import { spawnCommand, log } from "../utils.js";
import { runShell } from "./runShell.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export { runCode };

/**
 * Create a temporary script file containing the provided source code and return its path.
 *
 * @param code - The source code to write into the temporary file.
 * @param language - The language hint used to choose a file extension (e.g., "python"/"py" -> .py, "javascript"/"js"/"node" -> .js, "bash" -> .sh). Unknown values produce no extension.
 * @returns The full filesystem path to the created temporary script file.
 * @throws Error - If writing the temporary file fails.
 */
function createTempScript(code: string, language: string) {
  let extension;
  switch (language) {
    case "python":
    case "py":
      extension = ".py";
      break;
    case "javascript":
    case "js":
    case "node":
      extension = ".js";
      break;
    case "bash":
      extension = ".sh";
      break;
    default:
      extension = "";
  }
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `doc-detective-${Date.now()}${extension}`);
  try {
    fs.writeFileSync(tmpFile, code);
  } catch (error: any) {
    throw new Error(`Failed to create temporary script: ${error.message}`);
  }
  return tmpFile;
}

/**
 * Validate, prepare, execute, and clean up a code execution step, returning a unified execution result.
 *
 * Creates a temporary script from `step.runCode.code`, resolves or validates the execution command for the
 * specified language, verifies the command is available, executes the script via an internal shell step,
 * and removes the temporary script file on completion.
 *
 * @param step - Step definition containing `runCode` configuration. Expected `runCode` fields:
 *   - `code` (string): source to write to the temporary script.
 *   - `language` (string): language identifier used to infer a command or file extension.
 *   - `command` (optional string): explicit command to execute the script (inferred from `language` if omitted).
 *   - `args` (optional string[]): additional arguments passed to the command.
 *   - `exitCodes` (optional number[]): allowed exit codes (defaults to `[0]`).
 *   - `workingDirectory`, `maxVariation`, `overwrite`, `timeout` (optional): execution-related options (defaults applied).
 * @returns An object with the execution outcome:
 *   - `status`: `"PASS"` or `"FAIL"`.
 *   - `description`: human-readable description of the outcome.
 *   - `outputs`: map of outputs produced during execution.
 */
async function runCode({ config, step }: { config: any; step: any }) {
  const result: any = {
    status: "PASS",
    description: "Executed code.",
    outputs: {},
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
  // Set default values
  step.runCode = {
    ...step.runCode,
    exitCodes: step.runCode.exitCodes || [0],
    args: step.runCode.args || [],
    workingDirectory: step.runCode.workingDirectory || ".",
    maxVariation: step.runCode.maxVariation || 0,
    overwrite: step.runCode.overwrite || "aboveVariation",
    timeout: step.runCode.timeout || 60000,
  };

  // Create temporary script file
  let scriptPath;
  try {
    scriptPath = createTempScript(step.runCode.code, step.runCode.language);
  } catch (error: any) {
    result.status = "FAIL";
    result.description = error.message;
    return result;
  }
  log(config, "debug", `Created temporary script at: ${scriptPath}`);

  try {
    if (!step.runCode.command) {
      const lang = step.runCode.language.toLowerCase();
      switch (lang) {
        case "python":
        case "py":
          step.runCode.command = "python";
          break;
        case "javascript":
        case "js":
        case "node":
          step.runCode.command = "node";
          break;
        case "bash":
        default:
          step.runCode.command = "bash";
          break;
      }
    }
    const command = step.runCode.command;
    // Make sure the command is available
    const commandExists = await spawnCommand(command, ["--version"]);
    if (commandExists.exitCode !== 0) {
      result.status = "FAIL";
      result.description = `Command ${command} is unavailable. Make sure it's installed and in your PATH.`;
      return result;
    }

    // if Windows and command is bash
    if (os.platform() === "win32" && command === "bash") {
      result.status = "FAIL";
      result.description = `runCode currently doesn't support bash on Windows. Use a different command, a different language, or a runShell step.`;
      return result;
    }

    // Prepare shell command using the resolved command
    const shellStep: any = {
      runShell: {
        command,
        args: [scriptPath, ...step.runCode.args],
      },
    };
    delete shellStep.runCode;

    // Execute script using runShell
    const shellResult = await runShell({ config: config, step: shellStep });

    // Copy results
    result.status = shellResult.status;
    result.description = shellResult.description;
    result.outputs = {...result.outputs, ...shellResult.outputs};
  } catch (error: any) {
    result.status = "FAIL";
    result.description = error.message;
  } finally {
    // Clean up temporary script file
    try {
      fs.unlinkSync(scriptPath!);
      log(config, "debug", `Removed temporary script: ${scriptPath}`);
    } catch (error: any) {
      log(config, "warn", `Failed to remove temporary script: ${scriptPath}`);
    }
  }

  return result;
}