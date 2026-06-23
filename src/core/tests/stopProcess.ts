import { validate } from "../../common/src/validate.js";
import { log } from "../utils.js";
import kill from "tree-kill";
import fs from "node:fs";

export { stopProcess };

// Stop and deregister a background process started by a runShell/runCode step
// with `background: true`.
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

  // Normalize string shorthand to object form
  let spec = step.stopProcess;
  if (typeof spec === "string") spec = { name: spec };
  const name = spec.name;
  const ignoreMissing = spec.ignoreMissing || false;

  const entry = processRegistry?.get(name);
  if (!entry) {
    if (ignoreMissing) {
      result.status = "PASS";
      result.description = `No background process named "${name}" is running; nothing to stop.`;
      return result;
    }
    result.status = "FAIL";
    result.description = `No background process named "${name}" is running.`;
    return result;
  }

  // Remove from the registry first so the run-end sweep doesn't double-kill.
  processRegistry!.delete(name);

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
