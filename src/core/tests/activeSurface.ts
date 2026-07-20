// Uniform active-surface routing (ADR 01081). One per-context MRU tracker
// covers every surface kind — browser sessions, app surfaces, background
// processes — and one resolver classifies each surface-sensitive step's
// target. The routing rule is kind-agnostic: an explicit `surface` reference
// switches to that surface; an omitted `surface` acts on the most recently
// active one, whatever its kind. Only EXECUTION differs per kind (an element
// find on a driver vs. stdin bytes to a process), and a step whose action the
// resolved kind can't perform fails with a capability error — routing never
// silently reroutes to another kind.
//
// The module is dependency-free (registries are duck-typed), so the browser
// session registry and the app session can both import `activateSurface`
// without a cycle, and unit tests drive it with plain objects.

export {
  createActiveSurfaceTracker,
  activateSurface,
  currentSurface,
  resolveTargetSurface,
};
export type { ActiveSurfaceTracker, SurfaceHandle, SurfaceTarget };

type SurfaceKind = "browser" | "app" | "process";

interface SurfaceHandle {
  kind: SurfaceKind;
  name: string;
}

// Most-recently-used list of surface handles, head = active. Entries are
// appended by the kinds' own activation paths (browser `activate()`, app
// `startAppSurface`/`ensureAppForeground`, the startSurface process lane and
// successful process typing) and pruned lazily when their surface no longer
// resolves in its registry — closes need no tracker bookkeeping.
interface ActiveSurfaceTracker {
  mru: SurfaceHandle[];
}

// The registries a handle is checked against for liveness. All optional —
// an absent registry means no surface of that kind can be live.
interface SurfaceRegistries {
  browserRegistry?: { sessions: Map<string, any> };
  appSession?: { surfaces: Map<string, any>; activeApp?: string };
  processRegistry?: Map<string, any>;
}

// The resolver's verdict. `browser` carries the original reference (or
// undefined for "the already-active session/tab") for the browser execution
// path's own sub-resolution (switchToSurface); `app` carries the registry
// entry plus the reference's window selector; `process` carries the registry
// entry when the process is running (handlers decide how to report a missing
// one, preserving their messages).
type SurfaceTarget =
  | { kind: "app"; entry: any; window?: any }
  | { kind: "browser"; surface?: any }
  | { kind: "process"; name: string; entry?: any }
  | { kind: "error"; message: string };

const ENGINE_KEYWORDS = new Set(["chrome", "firefox", "safari", "webkit", "edge"]);

const NO_ACTIVE_SURFACE_MESSAGE =
  "No active surface to act on. Open one first with a startSurface step (or a goTo step for a browser), or target a surface explicitly with `surface`.";

function createActiveSurfaceTracker(): ActiveSurfaceTracker {
  return { mru: [] };
}

// Move-to-front activation, deduped by kind+name. Tolerates an undefined
// tracker so callers outside runContext (unit tests, embedders) need no
// guards.
function activateSurface(
  tracker: ActiveSurfaceTracker | undefined,
  handle: SurfaceHandle
): void {
  if (!tracker) return;
  tracker.mru = [
    handle,
    ...tracker.mru.filter(
      (h) => !(h.kind === handle.kind && h.name === handle.name)
    ),
  ];
}

function isLive(handle: SurfaceHandle, registries: SurfaceRegistries): boolean {
  if (handle.kind === "browser")
    return !!registries.browserRegistry?.sessions?.has(handle.name);
  if (handle.kind === "app")
    return !!registries.appSession?.surfaces?.has(handle.name);
  return !!registries.processRegistry?.has(handle.name);
}

// The active surface: the most recently activated handle whose surface is
// still open. Dead entries (closed surfaces) are pruned as they're passed
// over, so closes never have to touch the tracker.
function currentSurface(
  tracker: ActiveSurfaceTracker | undefined,
  registries: SurfaceRegistries
): SurfaceHandle | null {
  if (!tracker) return null;
  const live = tracker.mru.filter((h) => isLive(h, registries));
  tracker.mru = live;
  return live[0] ?? null;
}

// Classify a step's surface target. Explicit references resolve by shape —
// `{ app }` / `{ browser }` / `{ process }` are authoritative by key; a bare
// string is an engine keyword (browser) or a unique cross-registry name
// lookup (names are unique across kinds per context) — and a surface-less
// step resolves to the active surface. Pure classification: activation side
// effects stay in the kinds' execution paths (switchToSurface's session
// activation, ensureAppForeground, the process lanes), so a reference that
// fails to act never becomes the active surface.
function resolveTargetSurface({
  surface,
  tracker,
  driver,
  appSession,
  processRegistry,
}: {
  surface?: any;
  tracker?: ActiveSurfaceTracker;
  driver?: any;
  appSession?: SurfaceRegistries["appSession"];
  processRegistry?: Map<string, any>;
}): SurfaceTarget {
  const browserRegistry = driver?.state?.sessionRegistry;
  const registries: SurfaceRegistries = {
    browserRegistry,
    appSession,
    processRegistry,
  };

  if (surface !== undefined && surface !== null) {
    // Object forms: the key names the kind.
    if (typeof surface === "object") {
      if (typeof surface.app === "string") {
        const name = surface.app.trim();
        if (!appSession) {
          return {
            kind: "error",
            message: `The surface names an app ("${name}"), but no app session is active in this context. Open the app first with startSurface.`,
          };
        }
        const entry = appSession.surfaces.get(name);
        if (!entry) {
          return {
            kind: "error",
            message: `No app surface named "${name}" is open. Open it first with startSurface.`,
          };
        }
        return { kind: "app", entry, window: surface.window };
      }
      if (typeof surface.process === "string") {
        const name = surface.process.trim();
        return { kind: "process", name, entry: processRegistry?.get(name) };
      }
      // { browser: … } and any other object shape resolve in the browser
      // execution path (session + window/tab sub-resolution).
      return { kind: "browser", surface };
    }
    if (typeof surface === "string") {
      const name = surface.trim();
      if (ENGINE_KEYWORDS.has(name.toLowerCase())) {
        return { kind: "browser", surface };
      }
      // Bare-string identity lookup. Names are unique across kinds per
      // context (registries enforce cross-kind collisions at open time), so
      // the precedence below only decides ties left by pre-uniqueness runs:
      // app registry (authoritative for its names, matching the pre-ADR
      // handler order), then browser sessions, then processes.
      if (appSession?.surfaces?.has(name)) {
        return { kind: "app", entry: appSession.surfaces.get(name) };
      }
      if (browserRegistry?.sessions?.has(name)) {
        return { kind: "browser", surface };
      }
      if (processRegistry?.has(name)) {
        return { kind: "process", name, entry: processRegistry.get(name) };
      }
      return {
        kind: "error",
        message: `No surface named "${name}" is open in this context. Open it first with a startSurface step (or a goTo step for a browser).`,
      };
    }
  }

  // Surface-less: the active surface, whatever its kind.
  const active = currentSurface(tracker, registries);
  if (active) {
    if (active.kind === "app") {
      return { kind: "app", entry: appSession!.surfaces.get(active.name) };
    }
    if (active.kind === "process") {
      return {
        kind: "process",
        name: active.name,
        entry: processRegistry?.get(active.name),
      };
    }
    return { kind: "browser" };
  }

  // No tracker, or nothing live in it: legacy defaults so handlers invoked
  // outside runContext keep their pre-ADR behavior — a live driver means the
  // browser, an app session with an active app means that app.
  if (driver) return { kind: "browser" };
  if (appSession?.activeApp && appSession.surfaces?.has(appSession.activeApp)) {
    return { kind: "app", entry: appSession.surfaces.get(appSession.activeApp) };
  }
  return { kind: "error", message: NO_ACTIVE_SURFACE_MESSAGE };
}
