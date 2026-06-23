import { validate } from "../../common/src/validate.js";
import { log } from "../utils.js";
import kill from "tree-kill";
import fs from "node:fs";

export { stopProcess };

// Stop and deregister a background process started by a runShell/runCode step
// with a `background` object. The step value is the process `name` (a string).
// Stopping a process that isn't running (already stopped, or never started) is a
// no-op that still PASSes.
async function stopProcess({
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
    description: "Stopped process.",
    outputs: {},
  };

  // Validate step object
  const isValidStep = validate({ schemaKey: "step_v3", object: step });
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = `Invalid step definition: ${isValidStep.errors}`;
    return result;
  }
  step = isValidStep.object;

  // The step value is the process name.
  const name = step.stopProcess;

  const entry = processRegistry?.get(name);
  if (!entry) {
    // Missing process is never a failure — stopping something that isn't
    // running is a no-op.
    result.status = "PASS";
    result.description = `No background process named "${name}" is running; nothing to stop.`;
    return result;
  }

  // Remove from the registry first so the run-end sweep doesn't double-kill.
  processRegistry?.delete(name);

  // Tree-kill the process (the spawned shell plus its children).
  if (entry.bg?.pid) {
    await new Promise<void>((resolve) =>
      kill(entry.bg.pid, "SIGTERM", () => resolve())
    );
  }

  // Remove any deferred temp script (runCode background) now that it's dead.
  if (entry.tempPath) {
    try {
      fs.unlinkSync(entry.tempPath);
    } catch {
      // best-effort; the file may already be gone
    }
  }

  log(config, "debug", `Stopped background process "${name}".`);
  result.status = "PASS";
  result.description = `Stopped background process "${name}".`;
  result.outputs = { name, stopped: "true" };
  return result;
}
