import { validate } from "../../common/src/validate.js";
import { spawnCommand, log } from "../utils.js";
import { runShell } from "./runShell.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export { runCode };

// Create a temporary script file
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

// Run gather, compile, and run code. When `step.runCode.background` is set (an
// object with a `name` and optional `waitUntil`), the script is started as a
// long-running process via runShell and the temp script
// is kept on disk (deletion deferred to teardown) so the interpreter can keep
// reading it.
async function runCode({
  config,
  step,
  processRegistry,
}: {
  config: any;
  step: any;
  processRegistry?: Map<string, any>;
}) {
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

  // When the script is started in the background it is still being read by the
  // interpreter after runShell returns, so its temp file must outlive this
  // call. Teardown (closeSurface / run-end sweep) deletes it instead.
  let deferTempCleanup = false;

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

    // Prepare shell command using the resolved command.
    // BUG #1 FIX: previously only {command,args} were forwarded, so the
    // runCode-level exitCodes/stdio/maxVariation/overwrite/path/timeout/
    // workingDirectory options were silently DROPPED (e.g. `exitCodes:[1]` had
    // no effect and the step FAILed on a non-zero exit). Forward every option
    // runShell honors so they actually take effect. `directory` (runCode-only)
    // is resolved into the single `path` runShell expects.
    const runShellOptions: any = {
      command,
      args: [scriptPath, ...step.runCode.args],
      exitCodes: step.runCode.exitCodes,
      workingDirectory: step.runCode.workingDirectory,
      maxVariation: step.runCode.maxVariation,
      overwrite: step.runCode.overwrite,
      timeout: step.runCode.timeout,
    };
    if (typeof step.runCode.stdio !== "undefined")
      runShellOptions.stdio = step.runCode.stdio;
    if (typeof step.runCode.path !== "undefined") {
      runShellOptions.path = step.runCode.directory
        ? path.join(step.runCode.directory, step.runCode.path)
        : step.runCode.path;
    }
    // Forward the background object (name + waitUntil) so runShell starts and
    // registers the process.
    if (step.runCode.background) {
      runShellOptions.background = step.runCode.background;
    }
    const shellStep: any = { runShell: runShellOptions };

    // Execute script using runShell
    const shellResult = await runShell({
      config: config,
      step: shellStep,
      processRegistry,
    });

    // Copy results, including the articulated assertion records so runCode
    // reports the same implicit assertions runShell produces.
    result.status = shellResult.status;
    result.description = shellResult.description;
    result.outputs = {...result.outputs, ...shellResult.outputs};
    if (typeof shellResult.assertions !== "undefined")
      result.assertions = shellResult.assertions;

    // On a successful background start, keep the temp script and hand its path
    // to the registry entry so teardown removes it after the process is killed.
    if (step.runCode.background && shellResult.status === "PASS") {
      deferTempCleanup = true;
      const entry = processRegistry?.get(step.runCode.background.name);
      if (entry) entry.tempPath = scriptPath;
    }
  } catch (error: any) {
    result.status = "FAIL";
    result.description = error.message;
  } finally {
    // Clean up temporary script file unless a background process still needs it.
    if (!deferTempCleanup) {
      try {
        fs.unlinkSync(scriptPath!);
        log(config, "debug", `Removed temporary script: ${scriptPath}`);
      } catch (error: any) {
        log(config, "warning", `Failed to remove temporary script: ${scriptPath}`);
      }
    }
  }

  return result;
}
