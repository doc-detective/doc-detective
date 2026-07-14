// Inline warm phase (docs/design/warm-phase.md, phase B1): the pure planner
// and executor for the always-on provisioning pass that runs in runSpecs
// between test resolution and test execution. The planner derives every
// provisioning task the run will need — driver installs, browser installs,
// device boots, the managed-WDA availability check, the mobile chromedriver
// prefetch, and the folded-in driver session probe — strictly from the
// resolved sizing jobs, so a run warms only what its contexts already
// JIT-provision today. The executor runs those tasks concurrently through the
// run's resource-aware pool, best-effort: warm pre-pays work, it never gates
// work (a failed task is a warning; the per-context paths retry/fail with
// exactly today's semantics).
//
// This module is pure by design (unit-testable without drivers): the
// effectful per-task bodies live in tests.ts (buildWarmTaskRunner), and the
// predicates the planner needs are injected via WarmPlanDeps (bound to the
// real implementations by tests.ts's buildWarmPlanDeps) because they live in
// tests.ts — a direct import would create a module cycle.

import { runResourceAware, type ResourceRegistry } from "./utils.js";

export type WarmTaskKind =
  | "driver-install"
  | "browser-install"
  | "device-boot"
  | "wda-check"
  | "session-probe"
  | "chromedriver-prefetch";

export type WarmOutcome = "warmed" | "skipped" | "failed";

export type WarmTask = {
  name: string;
  kind: WarmTaskKind;
  // Consumed by runResourceAware's default accessor: tasks sharing a resource
  // name never run concurrently.
  exclusiveResources: string[];
  payload: Record<string, any>;
};

export type WarmTaskResult = {
  name: string;
  kind: WarmTaskKind;
  outcome: WarmOutcome;
  durationMs: number;
  note?: string;
};

export type WarmReport = { durationMs: number; tasks: WarmTaskResult[] };

// Warm tasks are I/O-heavy (npm installs, downloads, boot spawns), not
// display-heavy, so the ceiling is a small constant independent of
// concurrentRunners — even a fully serial test run benefits from boot ∥
// install ∥ download overlap during warm.
export const WARM_POOL_LIMIT = 4;

// Every task that mutates the shared runtime/app cache serializes on this
// tag: concurrent npm installs into the managed runtime dir are exactly the
// npm-prune hazard (src/runtime/AGENTS.md, issue #501), and concurrent
// browser installs raced before warmUpContexts serialized them.
export const RUNTIME_INSTALL_RESOURCE = "runtime-install";

/**
 * The single identity a warm device task is deduped, named, and
 * tag-serialized by. It mirrors how the acquisition planners converge on a
 * device: a NAMED descriptor always resolves to that registry name (whatever
 * its other fields say), so two same-named descriptors are one device even
 * when their osVersions differ — a second boot task would just registry-hit
 * and block a warm worker on the full boot. Unnamed (default) descriptors
 * resolve by deviceType + osVersion, so those fields distinguish devices.
 */
export function deviceIdentity(
  platform: string,
  desc:
    | { name?: string; deviceType?: string; osVersion?: string }
    | undefined
): string {
  if (desc?.name) return `${platform}:name:${desc.name}`;
  return `${platform}:default:${desc?.deviceType ?? "<any>"}:${
    desc?.osVersion ?? "<latest>"
  }`;
}

// One exclusivity tag per device identity: boots for the same device
// serialize (the registries would converge them anyway — the tag just avoids
// two acquires racing to plan), and the chromedriver prefetch queues behind
// its device's boot task, which releases at boot *initiation*.
export function deviceResourceTag(
  platform: string,
  desc:
    | { name?: string; deviceType?: string; osVersion?: string }
    | undefined
): string {
  return `warm-device:${deviceIdentity(platform, desc)}`;
}

/**
 * Re-wrap the named effect functions on an acquire-deps object so the first
 * invocation of any of them fires `signal` — the boot-initiation hook
 * raceBootInitiation races against. Shared by the android (createAvd/boot)
 * and ios (create/boot) device-boot bodies so the initiation contract lives
 * in one place.
 */
export function wrapInitiationEffects<T extends Record<string, any>>(
  deps: T,
  keys: (keyof T)[],
  signal: () => void
): T {
  const wrapped: Record<string, any> = { ...deps };
  for (const key of keys) {
    const original = deps[key];
    if (typeof original !== "function") continue;
    wrapped[key as string] = (...args: any[]) => {
      signal();
      return original(...args);
    };
  }
  return wrapped as T;
}

// The predicates and helpers the planner borrows from tests.ts (bound by
// buildWarmPlanDeps there). Injected to break the would-be import cycle and
// to keep the planner hermetically unit-testable.
export type WarmPlanDeps = {
  isBrowserRequired(args: { test: any }): boolean;
  isAppDriverRequired(args: { test: any }): boolean;
  isMobileTargetPlatform(platform: unknown): "android" | "ios" | null;
  getDefaultBrowser(args: { runnerDetails: any }): any;
  requiredBrowserAssets(name: string | undefined): unknown[];
  collectDeviceDescriptors(context: any): any[];
  normalizeDeviceDescriptor(args: {
    contextDevice?: any;
    stepDevice?: any;
    platform: "android" | "ios";
  }): any;
  mobileBrowserGate(args: {
    platform: "android" | "ios";
    browser?: any;
    hasBrowserStep: boolean;
    hasAppStep: boolean;
  }):
    | { action: "proceed"; browserName: string | null }
    | { action: "skip"; level: "warning"; reason: string }
    | { action: "fail"; reason: string };
  // Null when the context's `requires` gate is absent or met; a skip message
  // when unmet — the same gate runContext applies BEFORE any provisioning.
  contextRequirementsSkipMessage(args: { context: any }): string | null;
  // platform → { driverPackage } (the APP_DRIVER_PLATFORMS projection).
  appDriverPlatforms: Record<string, { driverPackage: string }>;
};

/**
 * Derive the warm tasks a run needs from its sizing jobs (flat + routed).
 * Pure: no I/O of its own, and — unlike selectWarmUpTargets — it never
 * writes defaults onto the job contexts; effective platform/browser are
 * computed locally so planning leaves the jobs byte-identical for the
 * execution paths that own those mutations.
 *
 * Derivation is strictly "what the run's own paths would JIT-provision":
 * a pure-web run plans only the browser installs (and, at limit > 1 with a
 * pool, the session probe) that today's pre-pass already performs; mobile
 * and app contexts add their driver installs, device boots, WDA check, and
 * chromedriver prefetch. Anything the run's own gates would refuse before
 * provisioning — an unmet `requires` gate, an ios context off darwin, a
 * windows app context off windows, a mobile context the browser gate
 * skips/fails — is not planned, mirroring the per-context gates.
 */
export function planWarmTasks({
  sizingJobs,
  runnerDetails,
  limit,
  hasAppiumPool,
  deps,
}: {
  sizingJobs: any[];
  runnerDetails: any;
  limit: number;
  hasAppiumPool: boolean;
  deps: WarmPlanDeps;
}): WarmTask[] {
  // The runner's platform in runOn vocabulary ("windows" | "mac" | "linux") —
  // the same source every peer (selectWarmUpTargets, runContext) reads.
  const hostPlatform = runnerDetails?.environment?.platform;
  const tasks: WarmTask[] = [];
  const seen = new Set<string>();
  const addTask = (task: WarmTask) => {
    if (seen.has(task.name)) return;
    seen.add(task.name);
    tasks.push(task);
  };
  let probeEligible = false;
  // The run-constant default browser, resolved at most once.
  let defaultBrowser: any;
  const getDefaultBrowser = () =>
    (defaultBrowser ??= deps.getDefaultBrowser({ runnerDetails }));
  // Warm boots at most ONE device per mobile platform: emulator/simulator
  // boots are the heaviest thing a CI host runs, and overlapping them
  // starves everything (four concurrent emulator boots on a 2-core KVM
  // runner starve the very sessions the tests need). The first device's
  // boot overlaps the install tasks — the win the phase exists for — and
  // every additional device boots exactly where it does today: inside its
  // consuming context, serialized on the Phase-2 exclusivity tags.
  const bootPlannedFor = new Set<string>();

  for (const job of sizingJobs ?? []) {
    const context = job?.context;
    if (!context) continue;
    // runContext evaluates the `requires` capability gate before ANY
    // provisioning (install, preflight, boot) — a context it would skip
    // must warm nothing.
    if (deps.contextRequirementsSkipMessage({ context })) continue;
    const effPlatform = context.platform || hostPlatform;
    const mobileTarget = deps.isMobileTargetPlatform(effPlatform);

    if (mobileTarget) {
      // ios (and its WDA/simulator toolchain) only provisions on a mac host;
      // android emulators run anywhere the SDK does.
      if (mobileTarget === "ios" && hostPlatform !== "mac") continue;

      const hasAppStep = deps.isAppDriverRequired({ test: context });
      const gate = deps.mobileBrowserGate({
        platform: mobileTarget,
        browser: context.browser,
        hasBrowserStep: deps.isBrowserRequired({ test: context }),
        hasAppStep,
      });
      // A context the gate would SKIP/FAIL never reaches device work in
      // runContext — warm nothing for it.
      if (gate.action !== "proceed") continue;
      const isMobileWeb = typeof gate.browserName === "string";
      if (!isMobileWeb && !hasAppStep) continue;

      const driverPackage =
        deps.appDriverPlatforms[mobileTarget]?.driverPackage;
      if (driverPackage) {
        addTask({
          name: `driver-install:${driverPackage}`,
          kind: "driver-install",
          exclusiveResources: [RUNTIME_INSTALL_RESOURCE],
          payload: { driverPackage, platform: mobileTarget },
        });
      }

      for (const stepDevice of deps.collectDeviceDescriptors(context)) {
        const desc = deps.normalizeDeviceDescriptor({
          contextDevice: context.device,
          stepDevice,
          platform: mobileTarget,
        });
        const identity = deviceIdentity(mobileTarget, desc);
        const tag = deviceResourceTag(mobileTarget, desc);
        if (!bootPlannedFor.has(mobileTarget)) {
          bootPlannedFor.add(mobileTarget);
          // No "android-emulator" tag here: runResourceAware would release
          // it at task resolution (boot initiation), before the boot
          // finishes. The runner instead holds a manual lease on that name
          // from initiation until the boot settles, so Phase-2 jobs (which
          // tag it) still see one-emulator-at-a-time across phases.
          addTask({
            name: `device-boot:${identity}`,
            kind: "device-boot",
            exclusiveResources: [tag],
            payload: { platform: mobileTarget, desc },
          });
        }
        // The chromedriver autodownload is a mobile-WEB-android cost: the
        // UiAutomator2 server fetches a chromedriver matching the device's
        // Chrome at session creation. One prefetch per device. Only the
        // device tag: its cache-mutating preflight half runs under a
        // manually-acquired runtime-install lease inside the task body, so
        // the long device-ready await never holds the install mutex.
        if (mobileTarget === "android" && isMobileWeb) {
          addTask({
            name: `chromedriver-prefetch:${identity}`,
            kind: "chromedriver-prefetch",
            exclusiveResources: [tag],
            payload: { platform: mobileTarget, desc },
          });
        }
      }

      if (mobileTarget === "ios") {
        addTask({
          name: "wda-check",
          kind: "wda-check",
          // Read-only (plus the last-used stamp) — contends with nothing.
          exclusiveResources: [],
          payload: {},
        });
      }
      continue;
    }

    // Desktop contexts.
    if (deps.isBrowserRequired({ test: context })) {
      const effBrowser = context.browser ?? getDefaultBrowser();
      const browserName = effBrowser?.name;
      if (browserName) {
        probeEligible = true;
        // Install work only applies to the host's own platform (a context
        // pinned to another platform is skipped per-context, never
        // installed for) and to engines with downloadable assets.
        if (
          effPlatform === hostPlatform &&
          deps.requiredBrowserAssets(browserName).length > 0
        ) {
          addTask({
            name: `browser-install:${browserName.toLowerCase()}`,
            kind: "browser-install",
            exclusiveResources: [RUNTIME_INSTALL_RESOURCE],
            payload: { browserName },
          });
        }
      }
    }

    if (
      (effPlatform === "windows" || effPlatform === "mac") &&
      effPlatform === hostPlatform &&
      deps.isAppDriverRequired({ test: context })
    ) {
      const driverPackage = deps.appDriverPlatforms[effPlatform]?.driverPackage;
      if (driverPackage) {
        addTask({
          name: `driver-install:${driverPackage}`,
          kind: "driver-install",
          exclusiveResources: [RUNTIME_INSTALL_RESOURCE],
          payload: { driverPackage, platform: effPlatform },
        });
      }
    }
  }

  // The folded-in session probe keeps its historical gate: a throwaway
  // driver session is only worth paying when it prevents concurrent
  // first-session races (limit > 1), and it needs the browser Appium pool.
  // The warm PHASE always runs; only this task kind stays gated — preserving
  // the documented byte-identical serial-run behavior.
  if (limit > 1 && hasAppiumPool && probeEligible) {
    addTask({
      name: "session-probe",
      kind: "session-probe",
      // Its install half mutates the shared caches, exactly like the
      // dedicated install tasks (usually a memo hit by the time it runs).
      exclusiveResources: [RUNTIME_INSTALL_RESOURCE],
      payload: {},
    });
  }

  return tasks;
}

/**
 * Run planned warm tasks through the run's resource registry, bounded by
 * WARM_POOL_LIMIT. Best-effort by contract: a task that throws is recorded
 * as failed and logged as a warning — the returned promise never rejects,
 * and nothing here can gate the run.
 */
export async function executeWarmTasks({
  tasks,
  registry,
  runTask,
  log,
  now = Date.now,
}: {
  tasks: WarmTask[];
  registry: ResourceRegistry;
  runTask: (task: WarmTask) => Promise<{ outcome: WarmOutcome; note?: string }>;
  log: (level: string, message: string) => void;
  now?: () => number;
}): Promise<WarmReport> {
  const results: WarmTaskResult[] = [];
  const start = now();
  await runResourceAware(tasks, WARM_POOL_LIMIT, registry, async (task) => {
    const taskStart = now();
    try {
      const { outcome, note } = await runTask(task);
      results.push({
        name: task.name,
        kind: task.kind,
        outcome,
        durationMs: now() - taskStart,
        ...(note ? { note } : {}),
      });
      if (outcome === "failed") {
        log(
          "warning",
          `Warm task '${task.name}' failed (continuing)${note ? `: ${note}` : "."}`
        );
      } else {
        log(
          "debug",
          `Warm task '${task.name}': ${outcome}${note ? ` (${note})` : ""}.`
        );
      }
    } catch (error: any) {
      const note = error?.message ?? String(error);
      results.push({
        name: task.name,
        kind: task.kind,
        outcome: "failed",
        durationMs: now() - taskStart,
        note,
      });
      log("warning", `Warm task '${task.name}' failed (continuing): ${note}`);
    }
  });
  return { durationMs: now() - start, tasks: results };
}

/**
 * Resolve a device-boot task at boot INITIATION rather than boot completion:
 * warm's job is to start the clock early, not to block on it — the first
 * consuming context awaits the registry entry's `ready` promise exactly
 * where it does today.
 *
 * `startAcquire` receives a `signalInitiated` callback the caller wires into
 * the acquire deps' create/boot effects (wrapInitiationEffects).
 * acquireDevice/acquireSimulator invoke those effects synchronously inside
 * the ready-promise body and then synchronously register the
 * `bootedByUs: true` placeholder before any microtask runs — so by the time
 * the race resolves on the signal, the registry entry (with its in-flight
 * `ready`) is already visible to consumers. Fast paths (registry hit,
 * reuse-running, plan skip) never signal and settle through the acquire
 * promise itself.
 *
 * The catch is chained onto the acquire promise BEFORE the race, so a boot
 * that fails after the task already resolved can never surface as an
 * unhandled rejection; `onError` is the caller's warn hook. acquire deletes
 * its registry placeholder on failure, so a consuming context retries fresh.
 */
export function raceBootInitiation({
  startAcquire,
  onError,
}: {
  startAcquire: (
    signalInitiated: () => void
  ) => Promise<{ entry?: any; skip?: string }>;
  onError: (error: unknown) => void;
}): Promise<{ outcome: WarmOutcome; note?: string }> {
  let initiatedResolve!: () => void;
  const initiated = new Promise<void>((resolve) => {
    initiatedResolve = resolve;
  });
  const acquired: Promise<{ outcome: WarmOutcome; note?: string }> =
    (async () => {
      try {
        const result = await startAcquire(() => initiatedResolve());
        if (result && typeof result === "object" && "skip" in result) {
          return { outcome: "skipped" as const, note: result.skip };
        }
        return { outcome: "warmed" as const, note: "device ready" };
      } catch (error) {
        onError(error);
        return {
          outcome: "failed" as const,
          note: (error as any)?.message ?? String(error),
        };
      }
    })();
  return Promise.race([
    initiated.then(() => ({
      outcome: "warmed" as const,
      note: "boot initiated",
    })),
    acquired,
  ]);
}
