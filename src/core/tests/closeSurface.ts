import { validate } from "../../common/src/validate.js";
import { log } from "../utils.js";
import kill from "tree-kill";
import fs from "node:fs";

export { closeSurface, resolveSurfaceNames };

// Normalize a closeSurface reference into a flat list of process names. The
// schema accepts a single surface (string | { process }) or an array of those.
// Phase 1 only the process kind resolves to a name; the bare-string form names
// a surface whose kind is resolved at runtime (here: a process).
function resolveSurfaceNames(ref: any): string[] {
  const items = Array.isArray(ref) ? ref : [ref];
  const names: string[] = [];
  for (const item of items) {
    if (typeof item === "string") {
      const name = item.trim();
      if (name) names.push(name);
    } else if (item && typeof item === "object" && typeof item.process === "string") {
      const name = item.process.trim();
      if (name) names.push(name);
    }
  }
  return names;
}

// Close one or more surfaces (Phase 1: background processes). For each named
// process: tree-kill it, remove any deferred temp script, and deregister it.
// Idempotent — closing a surface that is not open is a PASS no-op. Replaces the
// former `stopProcess` step (clean rename).
async function closeSurface({
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
    description: "Closed surface.",
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

  const names = resolveSurfaceNames(step.closeSurface);

  const closed: string[] = [];
  const absent: string[] = [];
  for (const name of names) {
    const entry = processRegistry?.get(name);
    if (!entry) {
      // Idempotent: closing an absent surface is a no-op (still PASS).
      absent.push(name);
      continue;
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

    log(config, "debug", `Closed surface "${name}".`);
    closed.push(name);
  }

  const parts: string[] = [];
  if (closed.length)
    parts.push(`Closed surface${closed.length > 1 ? "s" : ""} ${closed.map((n) => `"${n}"`).join(", ")}.`);
  if (absent.length)
    parts.push(
      `Surface${absent.length > 1 ? "s" : ""} ${absent
        .map((n) => `"${n}"`)
        .join(", ")} not open; nothing to close.`
    );
  result.status = "PASS";
  result.description = parts.join(" ") || "No surfaces to close.";
  result.outputs = { closed: closed.join(","), absent: absent.join(",") };
  return result;
}
