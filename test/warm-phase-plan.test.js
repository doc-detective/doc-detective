// Unit tests for the pure warm-phase planner (src/core/warmPhase.ts).
// planWarmTasks derives the provisioning tasks a run needs from the sizing
// jobs — pure derivation, no I/O, no context mutation — using the REAL
// predicates bound by buildWarmPlanDeps so these tests exercise production
// selection logic (docs/design/warm-phase.md, phase B1).
import assert from "node:assert/strict";
import {
  planWarmTasks,
  WARM_POOL_LIMIT,
  RUNTIME_INSTALL_RESOURCE,
  deviceResourceTag,
} from "../dist/core/warmPhase.js";
import { buildWarmPlanDeps } from "../dist/core/tests.js";

const deps = buildWarmPlanDeps();

function runnerDetails(platform = "windows", apps = [{ name: "chrome" }]) {
  return {
    environment: { platform },
    availableApps: apps,
    allowUnsafeSteps: true,
  };
}

function job(context) {
  return { context };
}

const browserStep = { goTo: "http://localhost:8092" };
const shellStep = { runShell: { command: "echo hi" } };
const appStep = { startSurface: { app: "notepad" } };

function plan({
  jobs,
  platform = "windows",
  apps = [{ name: "chrome" }],
  limit = 1,
  hasAppiumPool = false,
}) {
  return planWarmTasks({
    sizingJobs: jobs,
    runnerDetails: runnerDetails(platform, apps),
    limit,
    hasAppiumPool,
    deps,
  });
}

function kinds(tasks) {
  return tasks.map((t) => t.kind).sort();
}

describe("warm phase: planWarmTasks", function () {
  it("plans nothing for an empty run", function () {
    assert.deepEqual(plan({ jobs: [] }), []);
  });

  it("plans nothing for a shell-only run", function () {
    const tasks = plan({
      jobs: [job({ steps: [shellStep] }), job({ steps: [shellStep] })],
    });
    assert.deepEqual(tasks, []);
  });

  it("never mutates the sizing jobs' contexts", function () {
    const contexts = [
      { steps: [browserStep] },
      { platform: "android", steps: [browserStep] },
      { platform: "ios", steps: [appStep] },
    ];
    const jobs = contexts.map((c) => job(c));
    const before = JSON.stringify(jobs);
    plan({ jobs, platform: "mac", limit: 2, hasAppiumPool: true });
    assert.equal(JSON.stringify(jobs), before);
  });

  it("desktop web at limit 1: only a browser-install task, deduped by browser", function () {
    const tasks = plan({
      jobs: [job({ steps: [browserStep] }), job({ steps: [browserStep] })],
      limit: 1,
    });
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].kind, "browser-install");
    // Browser defaults from availableApps exactly as runContext would.
    assert.equal(tasks[0].name, "browser-install:chrome");
    assert.deepEqual(tasks[0].exclusiveResources, [RUNTIME_INSTALL_RESOURCE]);
  });

  it("desktop web at limit > 1 with a pool adds exactly one session-probe", function () {
    const tasks = plan({
      jobs: [
        job({ steps: [browserStep] }),
        job({ browser: { name: "firefox" }, steps: [browserStep] }),
      ],
      limit: 2,
      hasAppiumPool: true,
    });
    const probes = tasks.filter((t) => t.kind === "session-probe");
    assert.equal(probes.length, 1);
    assert.deepEqual(probes[0].exclusiveResources, [RUNTIME_INSTALL_RESOURCE]);
    // Both unique browsers get an install task.
    const installs = tasks
      .filter((t) => t.kind === "browser-install")
      .map((t) => t.name)
      .sort();
    assert.deepEqual(installs, [
      "browser-install:chrome",
      "browser-install:firefox",
    ]);
  });

  it("keeps the session-probe behind the appium-pool gate", function () {
    const tasks = plan({
      jobs: [job({ steps: [browserStep] })],
      limit: 2,
      hasAppiumPool: false,
    });
    assert.deepEqual(
      tasks.filter((t) => t.kind === "session-probe"),
      []
    );
  });

  it("skips browser-install for browsers without installable assets", function () {
    // safari has no downloadable assets (requiredBrowserAssets → []).
    const tasks = plan({
      jobs: [job({ browser: { name: "safari" }, steps: [browserStep] })],
      platform: "mac",
      apps: [{ name: "safari" }],
    });
    assert.deepEqual(
      tasks.filter((t) => t.kind === "browser-install"),
      []
    );
  });

  it("skips browser-install when no browser resolves", function () {
    const tasks = plan({
      jobs: [job({ steps: [browserStep] })],
      apps: [],
    });
    assert.deepEqual(
      tasks.filter((t) => t.kind === "browser-install"),
      []
    );
  });

  it("android mobile-web: driver-install + device-boot + chromedriver-prefetch, no desktop tasks", function () {
    const tasks = plan({
      jobs: [
        job({ platform: "android", steps: [browserStep] }),
        job({ platform: "android", steps: [browserStep] }),
      ],
      platform: "linux",
      limit: 2,
      hasAppiumPool: true,
    });
    assert.deepEqual(kinds(tasks), [
      "chromedriver-prefetch",
      "device-boot",
      "driver-install",
    ]);
    const install = tasks.find((t) => t.kind === "driver-install");
    assert.equal(install.name, "driver-install:appium-uiautomator2-driver");
    assert.deepEqual(install.exclusiveResources, [RUNTIME_INSTALL_RESOURCE]);
    const boot = tasks.find((t) => t.kind === "device-boot");
    const tag = deviceResourceTag("android", {});
    // No "android-emulator" task tag: the runner holds a manual lease on
    // that name from initiation until the boot settles instead (a task tag
    // would be released at task resolution — boot initiation — and CI
    // proved concurrent boots starve small runners).
    assert.deepEqual(boot.exclusiveResources, [tag]);
    // The prefetch holds ONLY its device tag: its cache-mutating preflight
    // half runs under a manual runtime-install lease inside the task body,
    // so the long device-ready await never blocks the install tasks.
    const prefetch = tasks.find((t) => t.kind === "chromedriver-prefetch");
    assert.deepEqual(prefetch.exclusiveResources, [tag]);
  });

  it("boots at most one device per mobile platform, deduped across contexts", function () {
    // Emulator/simulator boots are the heaviest thing a CI host runs —
    // overlapping them starves everything (proven on the 2-core KVM leg).
    // Warm pre-pays the FIRST device's boot; every additional device boots
    // inside its consuming context, serialized as today.
    const device = { name: "pixel", osVersion: "14" };
    const tasks = plan({
      jobs: [
        job({ platform: "android", device, steps: [browserStep] }),
        job({ platform: "android", device, steps: [browserStep] }),
        job({ platform: "android", steps: [browserStep] }),
        job({ platform: "android", device: { name: "other" }, steps: [appStep] }),
      ],
      platform: "linux",
    });
    const boots = tasks.filter((t) => t.kind === "device-boot").map((t) => t.name);
    assert.equal(boots.length, 1);
    assert.ok(boots[0].includes("pixel"));
    // The prefetch stays per-device (it serializes on the emulator lease at
    // run time), still deduped by identity.
    const prefetches = tasks.filter((t) => t.kind === "chromedriver-prefetch");
    assert.equal(prefetches.length, 2);
  });

  it("plans one boot per platform in a mixed android + ios run", function () {
    const tasks = plan({
      jobs: [
        job({ platform: "android", steps: [browserStep] }),
        job({ platform: "ios", steps: [appStep] }),
      ],
      platform: "mac",
      apps: [{ name: "safari" }],
    });
    const boots = tasks.filter((t) => t.kind === "device-boot").map((t) => t.name);
    assert.equal(boots.length, 2);
    assert.ok(boots.some((n) => n.includes("android")));
    assert.ok(boots.some((n) => n.includes("ios")));
  });

  it("warms nothing for a context whose `requires` gate is unmet", function () {
    // runContext skips an unmet-requirements context BEFORE any provisioning
    // — warm must not download a browser (or boot a device) for it.
    const tasks = plan({
      jobs: [
        job({
          requires: "doc-detective-no-such-binary-xyz",
          steps: [browserStep],
        }),
        job({
          platform: "android",
          requires: "doc-detective-no-such-binary-xyz",
          steps: [browserStep],
        }),
      ],
      platform: "linux",
      apps: [{ name: "chrome" }],
    });
    assert.deepEqual(tasks, []);
  });

  it("warms normally when the `requires` gate is met", function () {
    const tasks = plan({
      jobs: [job({ requires: "node", steps: [browserStep] })],
      platform: "linux",
      apps: [{ name: "chrome" }],
    });
    assert.equal(
      tasks.filter((t) => t.kind === "browser-install").length,
      1
    );
  });

  it("android native-app context boots a device but plans no chromedriver-prefetch", function () {
    const tasks = plan({
      jobs: [job({ platform: "android", steps: [appStep] })],
      platform: "linux",
    });
    assert.deepEqual(kinds(tasks), ["device-boot", "driver-install"]);
  });

  it("mixed app+web mobile context (gate skip) warms nothing", function () {
    const tasks = plan({
      jobs: [job({ platform: "android", steps: [appStep, browserStep] })],
      platform: "linux",
    });
    assert.deepEqual(tasks, []);
  });

  it("ios on a mac host: driver-install + device-boot + one wda-check", function () {
    const tasks = plan({
      jobs: [
        job({ platform: "ios", steps: [appStep] }),
        job({ platform: "ios", steps: [browserStep] }),
      ],
      platform: "mac",
      apps: [{ name: "safari" }],
    });
    const install = tasks.find((t) => t.kind === "driver-install");
    assert.equal(install.name, "driver-install:appium-xcuitest-driver");
    const wda = tasks.filter((t) => t.kind === "wda-check");
    assert.equal(wda.length, 1);
    assert.deepEqual(wda[0].exclusiveResources, []);
    const boot = tasks.find((t) => t.kind === "device-boot");
    assert.deepEqual(boot.exclusiveResources, [deviceResourceTag("ios", {})]);
  });

  it("plans no ios or mac tasks off-darwin", function () {
    const tasks = plan({
      jobs: [
        job({ platform: "ios", steps: [appStep] }),
        job({ platform: "mac", steps: [appStep] }),
      ],
      platform: "windows",
    });
    assert.deepEqual(tasks, []);
  });

  it("desktop app context on its host platform installs the native driver", function () {
    const tasks = plan({
      jobs: [job({ steps: [appStep] })],
      platform: "windows",
    });
    const installs = tasks.filter((t) => t.kind === "driver-install");
    assert.equal(installs.length, 1);
    assert.equal(installs[0].name, "driver-install:appium-novawindows-driver");
  });

  it("exports a small fixed warm pool ceiling", function () {
    assert.ok(Number.isInteger(WARM_POOL_LIMIT) && WARM_POOL_LIMIT >= 2);
  });
});
