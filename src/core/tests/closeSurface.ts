import { validate } from "../../common/src/validate.js";
import { log } from "../utils.js";
import {
  parseSurfaceRef,
  reinterpretForSessions,
  resolveCloseTargets,
  closeHandle,
  syncHandles,
} from "./browserSurface.js";
import { findSession, closeSession } from "./browserSessions.js";
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
    // A bare string is identity-only: when a browser session owns the name,
    // it closes that browser, not a background process (Phase 4).
    const ref = reinterpretForSessions(driver, parseSurfaceRef(item));

    if (ref.kind === "browser") {
      if (!driver) {
        result.status = "FAIL";
        result.description = `No browser is running in this context to close ${JSON.stringify(item)}.`;
        return result;
      }

      const registry = driver?.state?.sessionRegistry;

      // Resolve WHICH session the reference targets (Phase 4). Conflicts
      // (wrong engine for a name, ambiguous engine) FAIL loudly; a reference
      // that matches no session is an idempotent no-op like every other
      // absent-surface close.
      let targetDriver = driver;
      let sessionName: string | undefined;
      if (registry) {
        const found = findSession(registry, ref);
        if (!found.ok) {
          result.status = "FAIL";
          result.description = found.message;
          return result;
        }
        if (!found.entry) {
          // The whole browser isn't open, so a window/tab close is an absent
          // no-op. Keep the selector detail in the label so `outputs.absent`
          // stays as informative as the session-open no-match path below.
          const base = typeof item === "string" ? item : String(ref.name ?? ref.engine);
          const detail =
            ref.tab !== undefined
              ? ` tab ${JSON.stringify(ref.tab)}`
              : ref.window !== undefined
                ? ` window ${JSON.stringify(ref.window)}`
                : "";
          absent.push(`${base}${detail}`);
          continue;
        }
        targetDriver = found.entry.driver;
        sessionName = found.entry.name;
      }

      // A reference without window/tab selectors closes the WHOLE browser
      // session (ADR 01019). Refuse while a recording is active on it — the
      // recorder tab and capture live inside the session, so deleting it
      // mid-recording would leak the recording.
      if (ref.window === undefined && ref.tab === undefined) {
        if (!registry || !sessionName) {
          result.status = "FAIL";
          result.description = `Closing the whole browser surface ${JSON.stringify(item)} requires the context's session registry, which isn't available here.`;
          return result;
        }
        if (
          Array.isArray(targetDriver?.state?.recordings) &&
          targetDriver.state.recordings.length > 0
        ) {
          result.status = "FAIL";
          result.description = `Browser surface "${sessionName}" has an active recording. Stop it (stopRecord) before closing the browser.`;
          return result;
        }
        await closeSession(registry, sessionName);
        log(config, "debug", `Closed browser surface "${sessionName}".`);
        closed.push(sessionName);
        continue;
      }

      // Window/tab close within the resolved session.
      const targets = await resolveCloseTargets(targetDriver, ref);
      if (!targets.ok) {
        result.status = "FAIL";
        result.description = targets.message;
        return result;
      }
      // A ref with BOTH window and tab closes the selected TAB (the window
      // only scopes the search — see resolveCloseTargets), so label by what
      // actually closes: tab whenever a tab selector is present.
      const closesTab = item.tab !== undefined;
      // A string browser ref (a bare engine keyword with no window/tab) is
      // rejected as a whole-browser close by resolveCloseTargets above and
      // returns before this label is built, so `item` is always an object here
      // and the string arm is defensively unreachable. The tab-vs-window
      // labeling is still asserted by the tests; c8's ternary-branch mapping
      // can't isolate the dead string arm from this covered expression, so the
      // whole label build is excluded (ADR 01017).
      /* c8 ignore start */
      const label =
        typeof item === "string"
          ? item
          : `${ref.engine} ${closesTab ? "tab" : "window"} ${JSON.stringify(closesTab ? item.tab : item.window)}`;
      /* c8 ignore stop */
      if (!targets.handles.length) {
        // Idempotent: nothing matched the selector — a no-op, still PASS.
        absent.push(label);
        continue;
      }
      // Last-tab preflight for THIS close target: a window close resolves to
      // several handles (its tabs, then the lead). Refuse this target's handles
      // upfront if closing them would leave zero user tabs, so we never close
      // some tabs and then FAIL on the last one with the session already
      // mutated. (Multi-item closeSurface is not atomic — each array entry is
      // resolved and closed in turn; this guard is per-entry.)
      const state = await syncHandles(targetDriver);
      const closing = new Set(targets.handles);
      const survivors = state.windows.filter(
        (w) => !w.internal && !closing.has(w.handle)
      );
      if (survivors.length === 0) {
        result.status = "FAIL";
        result.description = `Refusing to close the last open tab — it would end the browser session. Close the whole browser instead (e.g. { "closeSurface": ${JSON.stringify(sessionName ?? ref.engine)} }).`;
        return result;
      }
      for (const handle of targets.handles) {
        const closedResult = await closeHandle(targetDriver, handle);
        /* c8 ignore start - defensive: unreachable given the per-entry preflight
         * above. resolveCloseTargets returns distinct, still-live handles (a
         * window's children then its lead), and the survivors>0 guard above has
         * already refused this entry unless a non-closing user tab survives. So
         * in this loop closeHandle never trips its own last-tab guard (a survivor
         * always remains), never resolves entry-not-found (each distinct target
         * is still open on its turn), and always finds a `next` handle to focus
         * -- it cannot return ok:false here. No hermetic input drives this
         * branch (ADR 01017). */
        if (!closedResult.ok) {
          result.status = "FAIL";
          result.description = closedResult.message;
          return result;
        }
        /* c8 ignore stop */
      }
      log(config, "debug", `Closed ${label}.`);
      closed.push(label);
      continue;
    }

    // Every item reaching this loop passed surface_v3 validation, so it is
    // either a browser ref (handled and `continue`d above) or a process ref
    // with a non-empty name; a kind-less or nameless surface cannot pass the
    // schema, so this guard's `continue` arm is unreachable (ADR 01017).
    /* c8 ignore next */
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
  // `items` has >=1 schema-validated entry and each lands in `closed` or
  // `absent` (or returns early on a browser FAIL), so `parts` is never empty
  // and the "No surfaces to close." fallback is unreachable (ADR 01017).
  /* c8 ignore next */
  result.description = parts.join(" ") || "No surfaces to close.";
  result.outputs = {
    closed,
    absent,
    closedCount: closed.length,
    absentCount: absent.length,
  };
  return result;
}
