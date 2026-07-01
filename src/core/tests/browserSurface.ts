import { matchesExpectedOutput } from "../utils.js";

export {
  RESERVED_ENGINE_KEYWORDS,
  parseSurfaceRef,
  ensureSurfaceState,
  syncHandles,
  registerOpenedHandle,
  resolveWindowTarget,
  switchToSurface,
  closeHandle,
  resolveCloseTargets,
};

// Multi-surface Phase 3 (ADR 01016): windows & tabs in the active browser.
// One WebDriver session, many flat W3C handles. This module owns the
// per-context handle registry (`driver.state.surfaces`) and every selector
// resolution rule, so step actions only ever call switchToSurface /
// resolveCloseTargets. The driver is injected, never imported — the module
// stays webdriverio-free and unit-testable with a stub.

const RESERVED_ENGINE_KEYWORDS = new Set([
  "chrome",
  "firefox",
  "safari",
  "webkit",
  "edge",
]);

// context_v3 transforms edge → chrome before the runner sees it, so the
// engine check must treat them as the same engine or `surface: "edge"`
// would never match an edge context.
function normalizeEngine(engine: string): string {
  const e = engine.toLowerCase();
  return e === "edge" ? "chrome" : e;
}

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
    const parsed: ParsedSurface = {
      kind: "browser",
      engine: surface.browser.toLowerCase(),
    };
    if (surface.name !== undefined) (parsed as any).name = surface.name;
    if (surface.window !== undefined) (parsed as any).window = surface.window;
    if (surface.tab !== undefined) (parsed as any).tab = surface.tab;
    return parsed;
  }
  // Any other object shape (app) is a future surface kind.
  return { kind: "unsupported" };
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
  | { ok: true; handle: string }
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

// Phase 3 gate: the surface must be (or omit) the context's active engine and
// must not name a browser — both are multi-browser (Phase 4+) features. The
// name check runs first because it is categorical (never supported in this
// phase), so its message doesn't vary with which engine happens to be active.
function checkPhase3Limits(
  driver: any,
  ref: Extract<ParsedSurface, { kind: "browser" }>
): string | null {
  if (ref.name) {
    return `Named browser surfaces ("${ref.name}") land in a later phase. Omit "name" to target the active browser.`;
  }
  const active = driver?.state?.engine;
  if (ref.engine && active && normalizeEngine(ref.engine) !== normalizeEngine(active)) {
    return `"${ref.engine}" is not the active browser for this context (${active}). Targeting a different browser lands in a later phase.`;
  }
  return null;
}

// Guard for steps that can run in driverless contexts (type, closeSurface):
// a browser surface without a live session is a targeting error, not a crash.
function requireDriver(driver: any): string | null {
  if (!driver || typeof driver.getWindowHandles !== "function") {
    return "No browser is running in this context to target a browser surface.";
  }
  return null;
}

// Resolve the window/tab selectors of a browser surface reference to a single
// W3C handle. Focus may move while criteria are evaluated; it is restored on
// failure and left on the resolved handle on success (the caller switches to
// it anyway).
async function resolveWindowTarget(
  driver: any,
  ref: ParsedSurface
): Promise<Resolution> {
  if (ref.kind !== "browser") {
    return { ok: false, message: "Not a browser surface reference." };
  }
  const missingDriver = requireDriver(driver);
  if (missingDriver) return { ok: false, message: missingDriver };
  const limit = checkPhase3Limits(driver, ref);
  if (limit) return { ok: false, message: limit };

  const state = await syncHandles(driver);
  const original = await currentHandleSafe(driver);
  const allTabs = userTabs(state);

  // Window scope: leads only. A window selector narrows the tab search to
  // that window's lead + the tabs opened in it. Page-opened tabs have no
  // parent and are only reachable without a window selector.
  let tabScope = allTabs;
  let windowLead: WindowEntry | null = null;
  if (ref.window !== undefined) {
    const leads = allTabs.filter((w) => w.isWindowLead);
    windowLead = await matchSelector(driver, leads, ref.window, "windowName");
    if (!windowLead) {
      if (original) await driver.switchToWindow(original);
      return {
        ok: false,
        message: `No window matched ${JSON.stringify(ref.window)} in the active browser.`,
      };
    }
    const lead = windowLead;
    tabScope = allTabs.filter(
      (w) => w.handle === lead.handle || w.parentWindow === lead.handle
    );
  }

  if (ref.tab === undefined) {
    // No tab selector: the window's lead (when a window was named), else the
    // current tab.
    if (windowLead) return { ok: true, handle: windowLead.handle };
    if (original) return { ok: true, handle: original };
    const fallback = allTabs[allTabs.length - 1];
    return fallback
      ? { ok: true, handle: fallback.handle }
      : { ok: false, message: "No open tabs to act on." };
  }

  const tab = await matchSelector(driver, tabScope, ref.tab, "tabName");
  if (!tab) {
    if (original) await driver.switchToWindow(original);
    return {
      ok: false,
      message: `No tab matched ${JSON.stringify(ref.tab)} in the active browser.`,
    };
  }
  return { ok: true, handle: tab.handle };
}

// Resolve a raw `surface` value and focus the resulting tab. The one-call
// entry point for step actions.
async function switchToSurface(driver: any, surface: any): Promise<Resolution> {
  const ref = parseSurfaceRef(surface);
  if (ref.kind === "browser") {
    const missingDriver = requireDriver(driver);
    if (missingDriver) return { ok: false, message: missingDriver };
  }
  if (ref.kind === "none") {
    const handle = await currentHandleSafe(driver);
    return handle
      ? { ok: true, handle }
      : { ok: false, message: "No open tabs to act on." };
  }
  if (ref.kind !== "browser") {
    return {
      ok: false,
      message: `Surface ${JSON.stringify(surface)} is not a browser surface.`,
    };
  }
  const resolved = await resolveWindowTarget(driver, ref);
  if (!resolved.ok) return resolved;
  const current = await currentHandleSafe(driver);
  if (current !== resolved.handle) {
    await driver.switchToWindow(resolved.handle);
  }
  return resolved;
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
        "Refusing to close the last open tab — it would end the browser session. Close the whole browser with the run's teardown instead.",
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
// close (children before their window lead). A selector that matches nothing
// resolves to an empty list — closing an absent surface is an idempotent
// no-op, consistent with the process kind. A reference without window/tab
// selectors means "close the whole browser", which is a multi-browser
// (later-phase) operation.
async function resolveCloseTargets(
  driver: any,
  ref: ParsedSurface
): Promise<
  { ok: true; handles: string[] } | { ok: false; message: string }
> {
  if (ref.kind !== "browser") {
    return { ok: false, message: "Not a browser surface reference." };
  }
  const missingDriver = requireDriver(driver);
  if (missingDriver) return { ok: false, message: missingDriver };
  const limit = checkPhase3Limits(driver, ref);
  if (limit) return { ok: false, message: limit };
  if (ref.window === undefined && ref.tab === undefined) {
    return {
      ok: false,
      message:
        "Closing a whole browser surface lands in a later phase. Close a specific tab or window instead: { \"browser\": \"…\", \"tab\": … } or { \"browser\": \"…\", \"window\": … }.",
    };
  }

  const state = await syncHandles(driver);
  const original = await currentHandleSafe(driver);
  const allTabs = userTabs(state);

  if (ref.window !== undefined && ref.tab === undefined) {
    // Close a whole window: its tabs first, the lead last.
    const leads = allTabs.filter((w) => w.isWindowLead);
    const lead = await matchSelector(driver, leads, ref.window, "windowName");
    if (original) await driver.switchToWindow(original);
    if (!lead) return { ok: true, handles: [] };
    const children = allTabs.filter((w) => w.parentWindow === lead.handle);
    return {
      ok: true,
      handles: [...children.map((w) => w.handle), lead.handle],
    };
  }

  // Tab close (optionally window-scoped).
  const resolved = await resolveWindowTarget(driver, ref);
  if (!resolved.ok) {
    // Distinguish "matched nothing" (idempotent no-op) from Phase 3 limit
    // errors, which were already returned above.
    if (original) await driver.switchToWindow(original);
    return { ok: true, handles: [] };
  }
  if (original) await driver.switchToWindow(original);
  return { ok: true, handles: [resolved.handle] };
}
