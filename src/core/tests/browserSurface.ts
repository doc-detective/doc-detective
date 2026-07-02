import { matchesExpectedOutput } from "../utils.js";
import { normalizeEngine, resolveSessionForRef } from "./browserSessions.js";

// Multi-surface Phase 3 (ADR 01016): windows & tabs in the active browser.
// One WebDriver session, many flat W3C handles. This module owns the
// per-session handle registry (`driver.state.surfaces`) and every selector
// resolution rule, so step actions only ever call switchToSurface /
// resolveCloseTargets. The driver is injected, never imported — the module
// stays webdriverio-free and unit-testable with a stub.
//
// Phase 4 (ADR 01019) adds the session level above this one: a browser
// surface reference picks a SESSION first (via the context's session
// registry, reached through `driver.state.sessionRegistry`), then resolves
// windows/tabs inside it with the machinery here.

// Declared before the export list so the binding exists when the list is
// evaluated (a `const` isn't hoisted like a function declaration).
const RESERVED_ENGINE_KEYWORDS = new Set([
  "chrome",
  "firefox",
  "safari",
  "webkit",
  "edge",
]);

export {
  RESERVED_ENGINE_KEYWORDS,
  parseSurfaceRef,
  reinterpretForSessions,
  ensureSurfaceState,
  syncHandles,
  seedWindowLead,
  deregisterHandle,
  registerOpenedHandle,
  resolveWindowTarget,
  switchToSurface,
  closeHandle,
  resolveCloseTargets,
};

export type ParsedSurface =
  | { kind: "none" }
  | { kind: "process"; name: string }
  | {
      kind: "browser";
      engine?: string;
      name?: string;
      window?: any;
      tab?: any;
    }
  | { kind: "unsupported" };

// Resolve a `surface` value to a target descriptor:
//   { process: "name" }        → process
//   "name" (not an engine kw)  → process (a bare string names a surface;
//                                Phase 3's only named surfaces are processes)
//   "chrome"|… (engine kw)     → browser, engine-only
//   { browser, window?, tab? } → browser with selectors
//   undefined                  → none (the step's default path)
function parseSurfaceRef(surface: any): ParsedSurface {
  if (surface === undefined || surface === null) return { kind: "none" };
  if (typeof surface === "string") {
    const name = surface.trim();
    if (RESERVED_ENGINE_KEYWORDS.has(name.toLowerCase()))
      return { kind: "browser", engine: name.toLowerCase() };
    return { kind: "process", name };
  }
  if (typeof surface === "object" && typeof surface.process === "string") {
    return { kind: "process", name: surface.process.trim() };
  }
  if (typeof surface === "object" && typeof surface.browser === "string") {
    const parsed: Extract<ParsedSurface, { kind: "browser" }> = {
      kind: "browser",
      engine: surface.browser.toLowerCase(),
      ...(surface.name !== undefined ? { name: surface.name } : {}),
      ...(surface.window !== undefined ? { window: surface.window } : {}),
      ...(surface.tab !== undefined ? { tab: surface.tab } : {}),
    };
    return parsed;
  }
  // Any other object shape (app) is a future surface kind.
  return { kind: "unsupported" };
}

// Phase 4: a bare-string surface is identity-only — the kind resolves at
// runtime. parseSurfaceRef defaults non-engine names to the process kind;
// when the context's session registry owns the name, reinterpret it as that
// browser surface. (Cross-kind name collisions are rejected at open time, so
// registry-first is unambiguous.)
function reinterpretForSessions(driver: any, ref: ParsedSurface): ParsedSurface {
  if (
    ref.kind === "process" &&
    driver?.state?.sessionRegistry?.sessions?.has(ref.name)
  ) {
    return { kind: "browser", name: ref.name };
  }
  return ref;
}

export interface WindowEntry {
  handle: string;
  // First-seen ordinal. Monotonic and never reused, so index selectors are
  // deterministic even though getWindowHandles() ordering is unspecified.
  order: number;
  // True for the seeded initial window and windows opened via goTo
  // newWindow. A lead represents both the window and its first tab.
  isWindowLead: boolean;
  // Lead handle of the window this tab was opened in (goTo newTab). Absent
  // for page-opened tabs — the W3C handle model has no parent grouping.
  parentWindow?: string;
  windowName?: string;
  tabName?: string;
  // Internal handles (the recorder tab) are excluded from every candidate
  // list: index, -1/newest, criteria, and close targeting.
  internal?: boolean;
}

export interface SurfaceState {
  windows: WindowEntry[];
  nextOrder: number;
}

function ensureSurfaceState(driver: any): SurfaceState {
  if (!driver.state) driver.state = {};
  if (!driver.state.surfaces) {
    driver.state.surfaces = { windows: [], nextOrder: 0 } as SurfaceState;
  }
  return driver.state.surfaces;
}

// Reconcile the registry with the live handle list: register unknown
// (page-opened) handles in the order the enumeration first sees them, and
// prune entries whose handle has closed. Ordinals are never reused.
async function syncHandles(driver: any): Promise<SurfaceState> {
  const state = ensureSurfaceState(driver);
  const live: string[] = await driver.getWindowHandles();
  const liveSet = new Set(live);
  state.windows = state.windows.filter((w) => liveSet.has(w.handle));
  const known = new Set(state.windows.map((w) => w.handle));
  for (const handle of live) {
    if (known.has(handle)) continue;
    state.windows.push({
      handle,
      order: state.nextOrder++,
      // The very first handle we ever see is the context's initial window.
      // Later unknowns are page-opened and parentless.
      isWindowLead: state.windows.length === 0,
    });
  }
  return state;
}

// Seed the currently focused content tab as an order-0 window lead if it is
// not already registered. Pure registry op (no driver enumeration), so callers
// that already hold the active handle — e.g. startRecording, which must
// register the content tab as the lead BEFORE the internal recorder tab so a
// record-first test doesn't leave the content tab non-lead — can use it
// without a `getWindowHandles` round-trip.
function seedWindowLead(driver: any, handle: string): WindowEntry {
  const state = ensureSurfaceState(driver);
  const existing = state.windows.find((w) => w.handle === handle);
  if (existing) return existing;
  const entry: WindowEntry = {
    handle,
    order: state.nextOrder++,
    isWindowLead: true,
  };
  state.windows.push(entry);
  return entry;
}

// Remove a handle from the registry. Pure registry op — used to drop a handle
// we know has closed (e.g. an aborted recorder tab) without a live
// enumeration, so it is safe to call with a minimal/stub driver.
function deregisterHandle(driver: any, handle: string): void {
  const state = ensureSurfaceState(driver);
  state.windows = state.windows.filter((w) => w.handle !== handle);
}

// Register a handle we opened ourselves (goTo newTab/newWindow, the recorder
// tab). Throws on duplicate window/tab names — names must be unique per
// context so selectors stay unambiguous.
function registerOpenedHandle(
  driver: any,
  entry: {
    handle: string;
    isWindowLead?: boolean;
    parentWindow?: string;
    windowName?: string;
    tabName?: string;
    internal?: boolean;
  }
): WindowEntry {
  const state = ensureSurfaceState(driver);
  if (
    entry.windowName &&
    state.windows.some((w) => w.windowName === entry.windowName)
  ) {
    throw new Error(
      `A window named "${entry.windowName}" already exists in this browser. Window names must be unique.`
    );
  }
  if (entry.tabName && state.windows.some((w) => w.tabName === entry.tabName)) {
    throw new Error(
      `A tab named "${entry.tabName}" already exists in this browser. Tab names must be unique.`
    );
  }
  const existing = state.windows.find((w) => w.handle === entry.handle);
  if (existing) {
    // A sync raced us to the handle — upgrade it with our metadata.
    Object.assign(existing, entry);
    return existing;
  }
  const registered: WindowEntry = {
    handle: entry.handle,
    order: state.nextOrder++,
    isWindowLead: !!entry.isWindowLead,
    ...(entry.parentWindow ? { parentWindow: entry.parentWindow } : {}),
    ...(entry.windowName ? { windowName: entry.windowName } : {}),
    ...(entry.tabName ? { tabName: entry.tabName } : {}),
    ...(entry.internal ? { internal: true } : {}),
  };
  state.windows.push(registered);
  return registered;
}

type Resolution =
  | { ok: true; handle: string; driver?: any }
  | { ok: false; message: string };

function byOrder(a: WindowEntry, b: WindowEntry): number {
  return a.order - b.order;
}

function userTabs(state: SurfaceState): WindowEntry[] {
  return state.windows.filter((w) => !w.internal).sort(byOrder);
}

async function currentHandleSafe(driver: any): Promise<string | null> {
  try {
    return await driver.getWindowHandle();
  } catch {
    return null;
  }
}

// Match one entry list against a selector (string name | integer index |
// {name,index,title,url} criteria). Criteria that need the page (title/url)
// switch to each candidate to read it; focus is restored by the caller on
// no-match. Multiple matches resolve to the first in creation order.
async function matchSelector(
  driver: any,
  candidates: WindowEntry[],
  selector: any,
  nameField: "tabName" | "windowName"
): Promise<WindowEntry | null> {
  if (typeof selector === "string") {
    return candidates.find((w) => w[nameField] === selector.trim()) ?? null;
  }
  if (typeof selector === "number") {
    const index = selector < 0 ? candidates.length + selector : selector;
    return candidates[index] ?? null;
  }
  if (selector && typeof selector === "object") {
    let pool = candidates;
    if (selector.name !== undefined) {
      pool = pool.filter((w) => w[nameField] === selector.name);
    }
    if (selector.index !== undefined) {
      const index =
        selector.index < 0 ? candidates.length + selector.index : selector.index;
      pool = pool.filter((w) => w === candidates[index]);
    }
    if (selector.title === undefined && selector.url === undefined) {
      return pool[0] ?? null;
    }
    for (const entry of pool) {
      await driver.switchToWindow(entry.handle);
      if (selector.title !== undefined) {
        const title = await driver.getTitle();
        if (!matchesExpectedOutput(title, selector.title)) continue;
      }
      if (selector.url !== undefined) {
        const url = await driver.getUrl();
        if (!matchesExpectedOutput(url, selector.url)) continue;
      }
      return entry;
    }
    return null;
  }
  return null;
}

// Single-session fallback: when no session registry exists (a driver the
// runner didn't register, or a unit-test stub), a browser reference must
// match the one live session — same engine, no name. With a registry, the
// session level resolves these instead (resolveTargetDriver below).
function checkSingleSessionTarget(
  driver: any,
  ref: Extract<ParsedSurface, { kind: "browser" }>
): string | null {
  if (ref.name) {
    return `No browser surface named "${ref.name}" is open in this context. Open it first with a goTo step (e.g. { "goTo": { "url": …, "surface": { "browser": "${ref.engine}", "name": "${ref.name}" } } }).`;
  }
  const active = driver?.state?.engine;
  if (ref.engine && active && normalizeEngine(ref.engine) !== normalizeEngine(active)) {
    return `"${ref.engine}" is not open in this context (active browser: ${active}). Open it first with a goTo step (e.g. { "goTo": { "url": …, "surface": "${ref.engine}" } }).`;
  }
  return null;
}

// Phase 4 session resolution: pick the SESSION a browser reference targets.
// Routes through the context's session registry when the driver carries one;
// falls back to the single-session engine/name check otherwise. `allowOpen`
// (goTo only) lets an unresolved reference launch a new session.
async function resolveTargetDriver(
  driver: any,
  ref: Extract<ParsedSurface, { kind: "browser" }>,
  opts: SurfaceResolveOptions = {}
): Promise<{ ok: true; driver: any } | { ok: false; message: string }> {
  const registry = driver?.state?.sessionRegistry;
  if (registry) {
    return resolveSessionForRef(registry, ref, { allowOpen: opts.allowOpen });
  }
  const missingDriver = requireDriver(driver);
  if (missingDriver) return { ok: false, message: missingDriver };
  const check = checkSingleSessionTarget(driver, ref);
  if (check) return { ok: false, message: check };
  return { ok: true, driver };
}

// Guard for steps that can run in driverless contexts (type, closeSurface):
// a browser surface without a live session is a targeting error, not a crash.
function requireDriver(driver: any): string | null {
  if (!driver || typeof driver.getWindowHandles !== "function") {
    return "No browser is running in this context to target a browser surface.";
  }
  return null;
}

// Bounded retry for surface discovery (ADR 01017): a page-opened tab
// (target=_blank / window.open) isn't created synchronously with the click
// that triggers it, and its title/url may still be loading. Rather than
// FAILing on the first attempt, resolveWindowTarget re-syncs and re-matches
// for up to `maxWaitMs`. Production call sites never override these — the
// values are internal, not an authored field; tests shrink them to keep
// negative-match assertions fast, or use small deterministic values to
// verify the bound is honored.
export interface SurfaceResolveOptions {
  maxWaitMs?: number;
  pollIntervalMs?: number;
  // goTo only: let an unresolved browser reference launch a new session
  // (Phase 4). Every other step requires the surface to already be open.
  allowOpen?: boolean;
}
const DEFAULT_MAX_WAIT_MS = 2000;
const DEFAULT_POLL_INTERVAL_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Resolve the window/tab selectors of a browser surface reference to a single
// W3C handle. A selector that doesn't match is retried — re-syncing the live
// handle list and re-evaluating title/url criteria against the current page —
// until it matches or `maxWaitMs` elapses. The first attempt never sleeps, so
// the common case (an already-focused or already-registered surface) resolves
// with no added latency; only a failed attempt triggers a wait before the
// next one. Focus may move while criteria are evaluated; it is restored on
// failure and left on the resolved handle on success (the caller switches to
// it anyway).
async function resolveWindowTarget(
  driver: any,
  ref: ParsedSurface,
  opts: SurfaceResolveOptions = {}
): Promise<Resolution> {
  if (ref.kind !== "browser") {
    return { ok: false, message: "Not a browser surface reference." };
  }
  const missingDriver = requireDriver(driver);
  if (missingDriver) return { ok: false, message: missingDriver };
  // Session-registry drivers arrive here already session-resolved (the ref
  // picked THIS driver); without a registry the ref must match this session.
  if (!driver?.state?.sessionRegistry) {
    const check = checkSingleSessionTarget(driver, ref);
    if (check) return { ok: false, message: check };
  }

  const maxWaitMs = opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = Date.now() + maxWaitMs;
  const original = await currentHandleSafe(driver);

  while (true) {
    const state = await syncHandles(driver);
    const allTabs = userTabs(state);

    // Window scope: leads only. A window selector narrows the tab search to
    // that window's lead + the tabs opened in it. Page-opened tabs have no
    // parent and are only reachable without a window selector.
    let tabScope = allTabs;
    let windowLead: WindowEntry | null = null;
    let notFoundMessage: string | null = null;

    if (ref.window !== undefined) {
      windowLead = await matchSelector(
        driver,
        allTabs.filter((w) => w.isWindowLead),
        ref.window,
        "windowName"
      );
      if (!windowLead) {
        notFoundMessage = `No window matched ${JSON.stringify(ref.window)} in the active browser.`;
      } else {
        const lead = windowLead;
        tabScope = allTabs.filter(
          (w) => w.handle === lead.handle || w.parentWindow === lead.handle
        );
      }
    }

    if (!notFoundMessage) {
      if (ref.tab === undefined) {
        // No tab selector: the window's lead (when a window was named), else
        // the current tab.
        if (windowLead) return { ok: true, handle: windowLead.handle };
        if (original) return { ok: true, handle: original };
        const fallback = allTabs[allTabs.length - 1];
        if (fallback) return { ok: true, handle: fallback.handle };
        // No tabs exist at all — not a "hasn't appeared yet" situation
        // (nothing will create one on its own), so fail without burning the
        // retry budget on a dead session.
        return { ok: false, message: "No open tabs to act on." };
      }

      const tab = await matchSelector(driver, tabScope, ref.tab, "tabName");
      if (tab) return { ok: true, handle: tab.handle };
      notFoundMessage = `No tab matched ${JSON.stringify(ref.tab)} in the active browser.`;
    }

    if (Date.now() >= deadline) {
      if (original) await driver.switchToWindow(original);
      // notFoundMessage is always set here: every branch above either returns
      // directly (a match, or the no-tabs-at-all case) or sets it before
      // falling through to this deadline check.
      return { ok: false, message: notFoundMessage! };
    }
    if (original) await driver.switchToWindow(original);
    await sleep(pollIntervalMs);
  }
}

// Resolve a raw `surface` value, pick the session it targets (Phase 4), and
// focus the resulting tab. The one-call entry point for step actions. The
// success result carries the resolved DRIVER — a cross-session reference
// resolves to a different session's driver, and the caller must act on that
// one from here on.
async function switchToSurface(
  driver: any,
  surface: any,
  opts: SurfaceResolveOptions = {}
): Promise<Resolution> {
  const ref = reinterpretForSessions(driver, parseSurfaceRef(surface));
  if (ref.kind === "none") {
    const handle = await currentHandleSafe(driver);
    return handle
      ? { ok: true, handle, driver }
      : { ok: false, message: "No open tabs to act on." };
  }
  if (ref.kind !== "browser") {
    return {
      ok: false,
      message: `Surface ${JSON.stringify(surface)} is not a browser surface.`,
    };
  }
  const session = await resolveTargetDriver(driver, ref, opts);
  if (!session.ok) return session;
  const target = session.driver;
  const missingDriver = requireDriver(target);
  if (missingDriver) return { ok: false, message: missingDriver };
  const resolved = await resolveWindowTarget(target, ref, opts);
  if (!resolved.ok) return resolved;
  const current = await currentHandleSafe(target);
  if (current !== resolved.handle) {
    await target.switchToWindow(resolved.handle);
  }
  return { ...resolved, driver: target };
}

// Close one handle, keep the registry pruned, and re-focus per the ADR rule:
// active tab closed → its parent window's lead if alive, else the newest
// remaining user tab; non-active tab closed → restore the previous focus.
// Refuses to close the last user tab — that would end the WebDriver session.
async function closeHandle(
  driver: any,
  handle: string
): Promise<{ ok: true; handle: string } | { ok: false; message: string }> {
  const state = await syncHandles(driver);
  const entry = state.windows.find((w) => w.handle === handle);
  if (!entry) {
    // Already gone — nothing to close; report where focus is.
    const current = await currentHandleSafe(driver);
    return current
      ? { ok: true, handle: current }
      : { ok: false, message: "No open tabs remain." };
  }
  const remaining = userTabs(state).filter((w) => w.handle !== handle);
  if (!entry.internal && remaining.length === 0) {
    return {
      ok: false,
      message:
        "Refusing to close the last open tab — it would end the browser session. Close the whole browser instead (e.g. { \"closeSurface\": \"chrome\" } or the surface's name).",
    };
  }

  const previous = await currentHandleSafe(driver);
  const wasActive = previous === handle;

  await driver.switchToWindow(handle);
  await driver.closeWindow();
  state.windows = state.windows.filter((w) => w.handle !== handle);

  let next: string | undefined;
  if (!wasActive && previous && previous !== handle) {
    next = previous;
  } else {
    const parent = entry.parentWindow
      ? state.windows.find((w) => w.handle === entry.parentWindow && !w.internal)
      : undefined;
    const survivors = userTabs(state);
    next = (parent ?? survivors[survivors.length - 1])?.handle;
  }
  if (!next) return { ok: false, message: "No open tabs remain." };
  await driver.switchToWindow(next);
  return { ok: true, handle: next };
}

// Resolve a closeSurface browser reference to the ordered list of handles to
// close (children before their window lead) WITHIN the given session. A
// selector that matches nothing resolves to an empty list — closing an
// absent surface is an idempotent no-op, consistent with the process kind.
// A reference without window/tab selectors means "close the whole browser",
// which is a SESSION-level close the closeSurface step performs against the
// session registry before ever calling this helper. Selector resolution is
// bounded-retried the same as any other surface reference (ADR 01017) —
// closing a tab shortly after the page that opened it appears works without
// a manual `wait` first.
async function resolveCloseTargets(
  driver: any,
  ref: ParsedSurface,
  opts: SurfaceResolveOptions = {}
): Promise<
  { ok: true; handles: string[] } | { ok: false; message: string }
> {
  if (ref.kind !== "browser") {
    return { ok: false, message: "Not a browser surface reference." };
  }
  const missingDriver = requireDriver(driver);
  if (missingDriver) return { ok: false, message: missingDriver };
  if (!driver?.state?.sessionRegistry) {
    const check = checkSingleSessionTarget(driver, ref);
    if (check) return { ok: false, message: check };
  }
  if (ref.window === undefined && ref.tab === undefined) {
    return {
      ok: false,
      message:
        "Whole-browser closes are session-level: resolve them against the session registry (closeSession), not the window/tab close helper.",
    };
  }

  if (ref.window !== undefined && ref.tab === undefined) {
    // Close a whole window: its tabs first, the lead last. Delegate the lead
    // lookup to resolveWindowTarget — with `tab` omitted it already resolves
    // to the window's lead handle — so this inherits the retry instead of
    // duplicating the loop.
    const original = await currentHandleSafe(driver);
    const resolved = await resolveWindowTarget(driver, ref, opts);
    if (!resolved.ok) return { ok: true, handles: [] };
    if (original) await driver.switchToWindow(original);
    const state = await syncHandles(driver);
    const children = userTabs(state).filter(
      (w) => w.parentWindow === resolved.handle
    );
    return {
      ok: true,
      handles: [...children.map((w) => w.handle), resolved.handle],
    };
  }

  // Tab close (optionally window-scoped). Phase 3 limit errors were returned
  // above, so a !ok here means the selector matched nothing — an idempotent
  // no-op. resolveWindowTarget already restored focus on that path; only the
  // SUCCESS path leaves focus on the matched tab and needs restoring here
  // (closeHandle re-derives focus itself).
  const original = await currentHandleSafe(driver);
  const resolved = await resolveWindowTarget(driver, ref, opts);
  if (!resolved.ok) {
    return { ok: true, handles: [] };
  }
  if (original) await driver.switchToWindow(original);
  return { ok: true, handles: [resolved.handle] };
}
