import { validate } from "../../common/src/validate.js";
import { startSurfaceDescriptors } from "../../runtime/browserStepKeys.js";
import {
  startAppSurface as realStartAppSurface,
  defaultAppSurfaceName,
  type AppSessionState,
} from "./appSurface.js";
import { startBackgroundProcessSurface as realStartBackgroundProcessSurface } from "./processSurface.js";
import {
  openSession,
  activateSession,
  normalizeEngine,
  type BrowserSessionRegistry,
} from "./browserSessions.js";

export { startSurfaceStep };

// Multi-surface Phase 6: the startSurface dispatch. One step opens one
// surface (object form — the app branch returns its handler result verbatim
// for byte-compatibility with A1–A7) or several concurrently (array form).
//
// Array semantics — three lanes, all concurrent, gathered with allSettled so
// one fast failure never abandons an in-flight boot:
//   - app lane: every app descriptor's device is pre-acquired in PARALLEL
//     (the device registry registers in-flight boots synchronously, so the
//     30–60s emulator/simulator boots overlap), then startAppSurface runs
//     per descriptor SERIALLY in authored order (its internals — lazy server
//     start, shared deviceSessions, pending-recording loops — are not
//     concurrency-safe, and serial order keeps activation deterministic).
//   - browser lane: descriptors open in parallel through the context's
//     session registry (openSession), then viewport applies post-start.
//   - process lane: descriptors launch in parallel through the shared
//     background-process launcher.
//
// Roll-up: any FAIL ⇒ FAIL, else any SKIPPED ⇒ SKIPPED, else PASS. After all
// lanes settle, activation is re-asserted in authored order so the LAST
// authored descriptor of each kind is that kind's active surface regardless
// of completion order.

type Kind = "app" | "browser" | "process";

interface LaneResult {
  name: string;
  kind: Kind;
  status: string;
  description: string;
  outputs?: any;
}

function descriptorKind(d: any): Kind | null {
  if (d && typeof d === "object") {
    if (typeof d.app === "string") return "app";
    if (typeof d.browser === "string") return "browser";
    if (typeof d.process === "string") return "process";
  }
  return null;
}

function intendedName(d: any, kind: Kind): string {
  if (typeof d.name === "string" && d.name.trim()) return d.name.trim();
  if (kind === "browser") return String(d.browser).trim();
  if (kind === "app") return defaultAppSurfaceName(String(d.app).trim());
  // Process descriptors require `name` at the schema level; this fallback is
  // defence-in-depth for programmatic callers.
  return String(d.process ?? "").trim();
}

async function startSurfaceStep({
  config,
  step,
  platform,
  driver,
  processRegistry,
  appSession,
  serverDeps,
  deps,
}: {
  config: any;
  step: any;
  platform: string;
  driver?: any;
  processRegistry?: Map<string, any>;
  appSession?: AppSessionState;
  serverDeps?: any;
  // Injected for unit tests; defaults to the real lane implementations.
  deps?: {
    startAppSurface?: typeof realStartAppSurface;
    startBackgroundProcessSurface?: typeof realStartBackgroundProcessSurface;
  };
}): Promise<any> {
  const startApp = deps?.startAppSurface ?? realStartAppSurface;
  const startProcess =
    deps?.startBackgroundProcessSurface ?? realStartBackgroundProcessSurface;

  // Validate the whole step once (the array form is a first-class schema
  // shape). The app lane's per-descriptor calls re-validate their synthetic
  // single-descriptor steps — harmless and keeps startAppSurface unchanged.
  const isValidStep = validate({ schemaKey: "step_v3", object: step });
  if (!isValidStep.valid) {
    return {
      status: "FAIL",
      description: `Invalid step definition: ${isValidStep.errors}`,
    };
  }
  step = isValidStep.object;

  const authored = step.startSurface;
  const isArrayForm = Array.isArray(authored);
  const descriptors = startSurfaceDescriptors(step);

  // The browser session registry rides on the context's default driver.
  const browserRegistry: BrowserSessionRegistry | undefined =
    driver?.state?.sessionRegistry;

  // Duplicate intended names within one step FAIL before anything launches —
  // a half-launched array with a name collision would leave surfaces the
  // author can't address.
  if (isArrayForm) {
    const seen = new Map<string, number>();
    for (const d of descriptors) {
      const kind = descriptorKind(d);
      if (!kind) continue;
      const name = intendedName(d, kind);
      seen.set(name, (seen.get(name) ?? 0) + 1);
    }
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([n]) => n);
    if (dupes.length) {
      return {
        status: "FAIL",
        description: `Invalid startSurface array: duplicate surface name${dupes.length > 1 ? "s" : ""} ${dupes
          .map((n) => `"${n}"`)
          .join(", ")}. Give each surface a unique \`name\`.`,
      };
    }
  }

  // --- Lane runners (shared by both forms) ---

  const runAppDescriptor = async (d: any): Promise<any> => {
    if (!appSession) {
      return {
        status: "FAIL",
        description:
          "startSurface ran without an app session; this is a runner bug (runContext must preflight app-driver tests).",
      };
    }
    return startApp({
      config,
      step: { startSurface: d },
      appSession,
      platform: platform ?? "",
      serverDeps: serverDeps ?? {},
    });
  };

  const runBrowserDescriptor = async (d: any): Promise<any> => {
    if (!browserRegistry) {
      return {
        status: "FAIL",
        description:
          "startSurface can't open a browser surface in this context (no browser session is available). This is a runner bug — a startSurface browser descriptor must mark the context browser-required.",
      };
    }
    // Normalize the engine the same way context resolution does (edge is
    // Chromium, so edge -> chrome): the caps builder and driver stack only
    // know chrome/firefox/safari, so a schema-valid `edge` must open a chrome
    // session rather than fail at launch.
    const engine = normalizeEngine(d.browser);
    const opened = await openSession(browserRegistry, {
      engine,
      name: d.name,
      overrides: {
        ...(d.headless !== undefined ? { headless: d.headless } : {}),
        ...(d.size ? { size: d.size } : {}),
        ...(d.driverOptions ? { driverOptions: d.driverOptions } : {}),
      },
    });
    if (!opened.ok) {
      return { status: "FAIL", description: opened.message };
    }
    // Apply the viewport only for a POSITIVE dimension: the schema doesn't
    // floor these, so guard against 0/negative (which would resize the
    // window to a degenerate content area) rather than trusting truthiness.
    const vw = Number(d.viewport?.width);
    const vh = Number(d.viewport?.height);
    if (vw > 0 || vh > 0) {
      try {
        await applyViewport(opened.driver, d.viewport);
      } catch (error: any) {
        return {
          status: "FAIL",
          description: `Opened browser surface "${opened.name}" but couldn't apply the viewport: ${error?.message ?? error}`,
        };
      }
    }
    return {
      status: "PASS",
      description: `Opened browser surface "${opened.name}" (${engine}).`,
      outputs: { name: opened.name, engine },
    };
  };

  const runProcessDescriptor = async (d: any): Promise<any> =>
    startProcess({
      config,
      descriptor: {
        command: d.process,
        name: d.name,
        args: d.args,
        workingDirectory: d.workingDirectory,
        tty: d.tty,
        waitUntil: d.waitUntil,
        timeout: d.timeout,
      },
      processRegistry,
      driver,
    });

  // --- Single-object form: dispatch directly; the app branch returns its
  // handler result verbatim (byte-compatible with pre-Phase 6 behavior). ---
  if (!isArrayForm) {
    const d = descriptors[0];
    const kind = descriptorKind(d);
    if (kind === "app") return runAppDescriptor(d);
    if (kind === "browser") return runBrowserDescriptor(d);
    if (kind === "process") return runProcessDescriptor(d);
    return {
      status: "FAIL",
      description:
        "startSurface needs an app, browser, or process descriptor.",
    };
  }

  // --- Array form: three lanes, all concurrent. ---

  const indexed = descriptors.map((d: any, i: number) => ({
    d,
    i,
    kind: descriptorKind(d) as Kind,
    name: intendedName(d, descriptorKind(d) as Kind),
  }));
  const results: LaneResult[] = new Array(indexed.length);

  const record = (slot: (typeof indexed)[number], r: any) => {
    results[slot.i] = {
      name: slot.name,
      kind: slot.kind,
      status: r?.status ?? "FAIL",
      description: r?.description ?? "No result.",
      ...(r?.outputs ? { outputs: r.outputs } : {}),
    };
  };

  const appSlots = indexed.filter((s) => s.kind === "app");
  const browserSlots = indexed.filter((s) => s.kind === "browser");
  const processSlots = indexed.filter((s) => s.kind === "process");

  // Pre-acquire every app descriptor's device in parallel (fire now, don't
  // await): the device registry registers in-flight boots synchronously, so
  // startAppSurface's own acquire reuses the same boot instead of starting a
  // second one. Failures are swallowed here — the serial startAppSurface call
  // surfaces them per descriptor.
  if (serverDeps?.acquireDevice) {
    for (const slot of appSlots) {
      try {
        void Promise.resolve(serverDeps.acquireDevice(slot.d.device)).catch(
          () => {}
        );
      } catch {
        /* surfaced by the serial startAppSurface call */
      }
    }
  }

  const appLane = (async () => {
    for (const slot of appSlots) {
      try {
        record(slot, await runAppDescriptor(slot.d));
      } catch (error: any) {
        record(slot, {
          status: "FAIL",
          description: `Couldn't open app surface "${slot.name}": ${error?.message ?? error}`,
        });
      }
    }
  })();

  const browserLane = Promise.allSettled(
    browserSlots.map(async (slot) => {
      try {
        record(slot, await runBrowserDescriptor(slot.d));
      } catch (error: any) {
        record(slot, {
          status: "FAIL",
          description: `Couldn't open browser surface "${slot.name}": ${error?.message ?? error}`,
        });
      }
    })
  );

  const processLane = Promise.allSettled(
    processSlots.map(async (slot) => {
      try {
        record(slot, await runProcessDescriptor(slot.d));
      } catch (error: any) {
        record(slot, {
          status: "FAIL",
          description: `Couldn't start background process "${slot.name}": ${error?.message ?? error}`,
        });
      }
    })
  );

  await Promise.allSettled([appLane, browserLane, processLane]);

  // Authored-order activation: parallel opens activate in completion order;
  // re-assert so the LAST authored successful descriptor of each kind is
  // active. The app lane is already serial-in-authored-order (startAppSurface
  // activates as it goes), so only the browser registry needs the re-assert.
  if (browserRegistry) {
    for (const slot of browserSlots) {
      if (results[slot.i]?.status === "PASS") {
        activateSession(browserRegistry, results[slot.i].outputs?.name ?? slot.name);
      }
    }
  }

  // Roll-up: FAIL > SKIPPED > PASS.
  const statuses = results.map((r) => r?.status ?? "FAIL");
  const rollup = statuses.includes("FAIL")
    ? "FAIL"
    : statuses.includes("SKIPPED")
      ? "SKIPPED"
      : "PASS";

  const description = results
    .map((r) => `${r.name} (${r.kind}): ${r.status} — ${r.description}`)
    .join("\n");

  return {
    status: rollup,
    description,
    outputs: { surfaces: results },
  };
}

// Grow/shrink the window so the page viewport hits the requested dimensions —
// the same delta math the context-level viewport sizing uses.
async function applyViewport(
  driver: any,
  viewport: { width?: number; height?: number }
): Promise<void> {
  const viewportSize = await driver.execute(
    "return { width: window.innerWidth, height: window.innerHeight }",
    []
  );
  const windowSize = await driver.getWindowSize();
  const deltaWidth = (viewport.width || viewportSize.width) - viewportSize.width;
  const deltaHeight =
    (viewport.height || viewportSize.height) - viewportSize.height;
  await driver.setWindowSize(
    windowSize.width + deltaWidth,
    windowSize.height + deltaHeight
  );
}
