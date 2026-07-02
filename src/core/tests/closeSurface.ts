import { validate } from "../../common/src/validate.js";
import { log } from "../utils.js";
import {
  parseSurfaceRef,
  resolveCloseTargets,
  closeHandle,
  syncHandles,
} from "./browserSurface.js";
import kill from "tree-kill";
import fs from "node:fs";

export { closeSurface, resolveSurfaceNames };

// Normalize a closeSurface reference into a flat list of process names. The
// bare-string form names a surface whose kind is resolved at runtime; only
// non-engine strings and { process } objects resolve to process names —
// browser references are handled separately by the browser branch below.
function resolveSurfaceNames(ref: any): string[] {
  const items = Array.isArray(ref) ? ref : [ref];
  const names: string[] = [];
  for (const item of items) {
    const parsed = parseSurfaceRef(item);
    if (parsed.kind === "process" && parsed.name) names.push(parsed.name);
  }
  return names;
}

// Close one or more surfaces: background processes, or browser windows/tabs
// (multi-surface Phase 3). For each named process: tree-kill it, remove any
// deferred temp script, and deregister it. For a browser reference: close the
// selected tab, or a whole window (its tabs, then its lead). Idempotent —
// closing a surface that is not open is a PASS no-op. Replaces the former
// `stopProcess` step (clean rename).
async function closeSurface({
  config,
  step,
  driver,
  processRegistry,
}: {
  config: any;
  step: any;
  driver?: any;
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

  const items = Array.isArray(step.closeSurface)
    ? step.closeSurface
    : [step.closeSurface];

  const closed: string[] = [];
  const absent: string[] = [];
  for (const item of items) {
    const ref = parseSurfaceRef(item);

    if (ref.kind === "browser") {
      // Browser windows/tabs (Phase 3). A reference without window/tab
      // selectors means "the whole browser" — a later-phase operation that
      // resolveCloseTargets rejects with guidance.
      if (!driver) {
        result.status = "FAIL";
        result.description = `No browser is running in this context to close ${JSON.stringify(item)}.`;
        return result;
      }
      const targets = await resolveCloseTargets(driver, ref);
      if (!targets.ok) {
        result.status = "FAIL";
        result.description = targets.message;
        return result;
      }
      // A ref with BOTH window and tab closes the selected TAB (the window
      // only scopes the search — see resolveCloseTargets), so label by what
      // actually closes: tab whenever a tab selector is present.
      const closesTab = item.tab !== undefined;
      const label =
        typeof item === "string"
          ? item
          : `${ref.engine} ${closesTab ? "tab" : "window"} ${JSON.stringify(closesTab ? item.tab : item.window)}`;
      if (!targets.handles.length) {
        // Idempotent: nothing matched the selector — a no-op, still PASS.
        absent.push(label);
        continue;
      }
      // Batch-level last-tab preflight: a window close resolves to several
      // handles (its tabs, then the lead). Refuse the whole batch upfront if it
      // would leave zero user tabs, so we never close some tabs and then FAIL
      // on the last one with the session already mutated.
      const state = await syncHandles(driver);
      const closing = new Set(targets.handles);
      const survivors = state.windows.filter(
        (w) => !w.internal && !closing.has(w.handle)
      );
      if (survivors.length === 0) {
        result.status = "FAIL";
        result.description =
          "Refusing to close the last open tab — it would end the browser session. Close the whole browser with the run's teardown instead.";
        return result;
      }
      for (const handle of targets.handles) {
        const closedResult = await closeHandle(driver, handle);
        if (!closedResult.ok) {
          result.status = "FAIL";
          result.description = closedResult.message;
          return result;
        }
      }
      log(config, "debug", `Closed ${label}.`);
      closed.push(label);
      continue;
    }

    if (ref.kind !== "process" || !ref.name) continue;
    const name = ref.name;
    const entry = processRegistry?.get(name);
    if (!entry) {
      // Idempotent: closing an absent surface is a no-op (still PASS).
      absent.push(name);
      continue;
    }

    // Remove from the registry first so the run-end sweep doesn't double-kill.
    processRegistry?.delete(name);

    // Terminate the process. PTY-backed handles own their own termination via
    // `kill()`; pipe-backed ones tree-kill the spawned shell plus its children.
    if (entry.bg?.kill) {
      await entry.bg.kill();
    } else if (entry.bg?.pid) {
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
  result.outputs = {
    closed,
    absent,
    closedCount: closed.length,
    absentCount: absent.length,
  };
  return result;
}
