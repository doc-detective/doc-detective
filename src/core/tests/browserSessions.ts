import type { ParsedSurface } from "./browserSurface.js";

// Multi-surface Phase 4 (ADR 01019): several concurrent WebDriver sessions in
// one context, keyed by surface name. This module owns the context-scoped
// session registry — the browser generalization of the run-scoped
// processRegistry. Sessions are opened by an injected launcher (goTo is the
// only step allowed to trigger it), selected by the shared `surface`
// reference, and swept at context teardown. Drivers are injected, never
// imported — the module stays webdriverio-free and unit-testable with stubs.
//
// Every registered driver carries `driver.state.sessionRegistry` back to its
// registry, so step actions reach cross-session resolution through the driver
// they already hold instead of a new parameter on every call site.

export {
  normalizeEngine,
  createSessionRegistry,
  registerSession,
  findSession,
  resolveSessionForRef,
  lookupSessionByName,
  closeSession,
  sweepSessions,
  activeDriver,
};

// context_v3 transforms edge → chrome before the runner sees it, so engine
// comparisons must treat them as the same engine or `surface: "edge"` would
// never match an edge context. (The raw engine name is still what gets
// stamped on `driver.state.engine` and stored on the session entry.)
function normalizeEngine(engine: string): string {
  const e = String(engine).toLowerCase();
  return e === "edge" ? "chrome" : e;
}

export interface BrowserSessionEntry {
  name: string;
  // Lowercased engine as launched (edge stays "edge"; normalization happens
  // at comparison time only).
  engine: string;
  driver: any;
  // Monotonic focus stamp: bumped whenever the session is activated. The
  // close fallback picks the most recently focused survivor.
  lastFocused: number;
}

export interface BrowserSessionRegistry {
  sessions: Map<string, BrowserSessionEntry>;
  // The active surface — the session surface-less steps act on. Null only
  // when every session has been closed.
  activeName: string | null;
  focusSeq: number;
  // Launcher injected by the runner (closes over the context's Appium port
  // and capability builder). Absent in driverless contexts.
  open?: (engine: string) => Promise<any>;
  // Cross-kind name collision check (e.g. background process names), so one
  // name never means two surfaces.
  isNameTaken?: (name: string) => boolean;
}

function createSessionRegistry(
  opts: {
    open?: (engine: string) => Promise<any>;
    isNameTaken?: (name: string) => boolean;
  } = {}
): BrowserSessionRegistry {
  return {
    sessions: new Map(),
    activeName: null,
    focusSeq: 0,
    ...(opts.open ? { open: opts.open } : {}),
    ...(opts.isNameTaken ? { isNameTaken: opts.isNameTaken } : {}),
  };
}

function activate(
  registry: BrowserSessionRegistry,
  entry: BrowserSessionEntry
): void {
  entry.lastFocused = ++registry.focusSeq;
  registry.activeName = entry.name;
}

// Register a live session and activate it. Throws on duplicate names — names
// must be unique per context so `surface` references stay unambiguous.
function registerSession(
  registry: BrowserSessionRegistry,
  { name, engine, driver }: { name: string; engine: string; driver: any }
): BrowserSessionEntry {
  const key = String(name).trim();
  if (registry.sessions.has(key)) {
    throw new Error(
      `A browser surface named "${key}" already exists in this context. Surface names must be unique.`
    );
  }
  driver.state = driver.state ?? {};
  driver.state.engine = String(engine).toLowerCase();
  driver.state.sessionRegistry = registry;
  const entry: BrowserSessionEntry = {
    name: key,
    engine: String(engine).toLowerCase(),
    driver,
    lastFocused: 0,
  };
  registry.sessions.set(key, entry);
  activate(registry, entry);
  return entry;
}

function lookupSessionByName(
  registry: BrowserSessionRegistry,
  name: string
): BrowserSessionEntry | undefined {
  return registry.sessions.get(String(name).trim());
}

function activeDriver(
  registry: BrowserSessionRegistry | undefined
): any | undefined {
  if (!registry?.activeName) return undefined;
  return registry.sessions.get(registry.activeName)?.driver;
}

type SessionResolution =
  | { ok: true; driver: any; name: string }
  | { ok: false; message: string };

// Match a browser surface reference against the live sessions WITHOUT side
// effects (no activation, no launch). Matching order: exact name (`name` if
// given, else the engine keyword), then — for engine-only references — a
// unique session of that engine, so `surface: "chrome"` still resolves when
// the only chrome session was opened under another name. `entry: undefined`
// means "no match" (the caller decides whether that opens, FAILs, or no-ops);
// `ok: false` is a real conflict (wrong engine for the name, or ambiguity).
function findSession(
  registry: BrowserSessionRegistry,
  ref: ParsedSurface
):
  | { ok: true; entry: BrowserSessionEntry | undefined }
  | { ok: false; message: string } {
  if (ref.kind !== "browser") {
    return { ok: false, message: "Not a browser surface reference." };
  }
  const engine = ref.engine ? normalizeEngine(ref.engine) : undefined;
  const name = String(ref.name ?? ref.engine).trim();

  const exact = registry.sessions.get(name);
  if (exact) {
    if (ref.name && engine && normalizeEngine(exact.engine) !== engine) {
      return {
        ok: false,
        message: `Browser surface "${name}" is a ${exact.engine} browser, not ${ref.engine}.`,
      };
    }
    return { ok: true, entry: exact };
  }

  if (!ref.name && engine) {
    const matches = [...registry.sessions.values()].filter(
      (s) => normalizeEngine(s.engine) === engine
    );
    if (matches.length === 1) {
      return { ok: true, entry: matches[0] };
    }
    if (matches.length > 1) {
      const names = matches.map((m) => `"${m.name}"`).join(", ");
      return {
        ok: false,
        message: `Multiple ${ref.engine} browser surfaces are open (${names}). Name the one you mean: { "browser": "${ref.engine}", "name": … }.`,
      };
    }
  }

  return { ok: true, entry: undefined };
}

// Resolve a browser surface reference to a live session (findSession's
// matching rule), then (goTo only, via allowOpen) launch one on no match. A
// step that resolves a session activates it: active = most recently opened
// or focused, across sessions.
async function resolveSessionForRef(
  registry: BrowserSessionRegistry,
  ref: ParsedSurface,
  opts: { allowOpen?: boolean } = {}
): Promise<SessionResolution> {
  if (ref.kind !== "browser") {
    return { ok: false, message: "Not a browser surface reference." };
  }
  const found = findSession(registry, ref);
  if (!found.ok) return found;
  if (found.entry) {
    activate(registry, found.entry);
    return { ok: true, driver: found.entry.driver, name: found.entry.name };
  }
  const name = String(ref.name ?? ref.engine).trim();

  // An engine-less ref (a bare-string name reinterpretation) can never open —
  // there is nothing to launch without an engine.
  if (opts.allowOpen && registry.open && ref.engine) {
    if (registry.isNameTaken?.(name)) {
      return {
        ok: false,
        message: `The surface name "${name}" is already in use by another surface (e.g. a background process). Choose a different name.`,
      };
    }
    let driver: any;
    try {
      driver = await registry.open(ref.engine);
    } catch (error: any) {
      return {
        ok: false,
        message: `Couldn't open browser surface "${name}" (${ref.engine}). ${error?.message ?? error}`,
      };
    }
    const entry = registerSession(registry, {
      name,
      engine: ref.engine,
      driver,
    });
    return { ok: true, driver: entry.driver, name: entry.name };
  }

  return {
    ok: false,
    message: `No browser surface named "${name}" is open in this context. Open it first with a goTo step (e.g. { "goTo": { "url": …, "surface": … } }).`,
  };
}

// End one session and deregister it. Idempotent: an unknown name reports
// `closed: false` (consistent with the process kind's never-fail-on-missing
// closes). A deleteSession failure still deregisters — the session is gone
// either way, and teardown must not see it again.
async function closeSession(
  registry: BrowserSessionRegistry,
  name: string
): Promise<{ ok: true; closed: boolean }> {
  const key = String(name).trim();
  const entry = registry.sessions.get(key);
  if (!entry) return { ok: true, closed: false };
  try {
    await entry.driver.deleteSession();
  } catch {
    // Already dead — deregistering is the part that matters.
  }
  registry.sessions.delete(key);
  if (registry.activeName === key) {
    const survivors = [...registry.sessions.values()].sort(
      (a, b) => b.lastFocused - a.lastFocused
    );
    registry.activeName = survivors[0]?.name ?? null;
  }
  return { ok: true, closed: true };
}

// Context-teardown sweep: end every remaining session, tolerating individual
// failures (a session the test already closed, a crashed browser). Leaves the
// registry empty so a re-entrant sweep is a no-op.
async function sweepSessions(registry: BrowserSessionRegistry): Promise<void> {
  for (const entry of registry.sessions.values()) {
    try {
      await entry.driver.deleteSession();
    } catch {
      // Best-effort — the finally block that calls this must not throw.
    }
  }
  registry.sessions.clear();
  registry.activeName = null;
}
