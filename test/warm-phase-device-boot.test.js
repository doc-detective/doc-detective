// Device-boot warm semantics (docs/design/warm-phase.md, phase B1):
// raceBootInitiation resolves at boot INITIATION (the registry placeholder is
// already registered with bootedByUs + an in-flight `ready` promise), a boot
// that later fails surfaces through onError — never as an unhandled rejection
// — and a warm-booted, never-consumed device is swept by the existing
// run-end teardown. Hermetic: acquireSimulator's effects are injected fakes.
import assert from "node:assert/strict";
import { raceBootInitiation } from "../dist/core/warmPhase.js";
import {
  acquireSimulator,
  createSimulatorRegistry,
  teardownSimulatorRegistry,
} from "../dist/core/tests/iosSimulator.js";

const RUNTIME = {
  identifier: "com.apple.CoreSimulator.SimRuntime.iOS-17-0",
  version: "17.0",
  name: "iOS 17.0",
  isAvailable: true,
  platform: "iOS",
};

function shutdownDevice() {
  return {
    name: "warm-sim",
    udid: "UDID-1",
    state: "Shutdown",
    runtime: RUNTIME.identifier,
    isAvailable: true,
    deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-15",
  };
}

function fakeDeps({ boot, devices = [shutdownDevice()], runtimes = [RUNTIME] }) {
  return {
    listDevices: async () => devices,
    listRuntimes: async () => runtimes,
    listDeviceTypes: async () => [],
    create: async () => ({ udid: "CREATED" }),
    boot,
  };
}

function warmAcquire({ registry, deps, desc = { name: "warm-sim" }, onError = () => {} }) {
  return raceBootInitiation({
    onError,
    startAcquire: (signal) =>
      acquireSimulator({
        desc,
        registry,
        deps: {
          ...deps,
          create: (args) => {
            signal();
            return deps.create(args);
          },
          boot: (udid) => {
            signal();
            return deps.boot(udid);
          },
        },
      }),
  });
}

describe("warm phase: device-boot initiation and ownership", function () {
  it("resolves at boot initiation with the owned placeholder already registered", async function () {
    const registry = createSimulatorRegistry();
    let bootCalls = 0;
    // A boot that never finishes: the task must still resolve.
    const deps = fakeDeps({
      boot: () => {
        bootCalls++;
        return new Promise(() => {});
      },
    });
    const result = await warmAcquire({ registry, deps });
    assert.equal(result.outcome, "warmed");
    assert.match(result.note, /initiated/);
    assert.equal(bootCalls, 1);
    const entry = registry.get("warm-sim");
    assert.ok(entry, "placeholder must be registered before the task resolves");
    assert.equal(entry.bootedByUs, true);
    assert.ok(entry.ready instanceof Promise, "in-flight ready promise shared with consumers");
  });

  it("routes a post-resolution boot failure to onError, deletes the placeholder, and leaks no unhandled rejection", async function () {
    const registry = createSimulatorRegistry();
    let rejectBoot;
    const deps = fakeDeps({
      boot: () => new Promise((_, reject) => (rejectBoot = reject)),
    });
    const errors = [];
    const unhandled = [];
    const trap = (err) => unhandled.push(err);
    process.on("unhandledRejection", trap);
    try {
      const result = await warmAcquire({
        registry,
        deps,
        onError: (e) => errors.push(e),
      });
      assert.equal(result.outcome, "warmed");
      rejectBoot(new Error("boot exploded"));
      // Let the rejection propagate through the acquire chain.
      await new Promise((r) => setTimeout(r, 30));
      assert.equal(errors.length, 1);
      assert.match(String(errors[0]), /boot exploded/);
      assert.equal(
        registry.has("warm-sim"),
        false,
        "failed placeholder must be dropped so a consuming context retries fresh"
      );
      assert.deepEqual(unhandled, []);
    } finally {
      process.off("unhandledRejection", trap);
    }
  });

  it("settles as skipped through the acquire promise when the plan can't boot anything", async function () {
    const registry = createSimulatorRegistry();
    const deps = fakeDeps({ boot: async () => {}, devices: [], runtimes: [] });
    const result = await warmAcquire({ registry, deps, desc: {} });
    assert.equal(result.outcome, "skipped");
    assert.match(result.note, /runtime/i);
    assert.equal(registry.size, 0);
  });

  it("reuses an already-booted device without claiming ownership", async function () {
    const registry = createSimulatorRegistry();
    const deps = fakeDeps({
      boot: async () => {
        throw new Error("must not boot a booted device");
      },
      devices: [{ ...shutdownDevice(), state: "Booted" }],
    });
    const result = await warmAcquire({ registry, deps });
    assert.equal(result.outcome, "warmed");
    const entry = registry.get("warm-sim");
    assert.equal(entry.bootedByUs, false);
  });

  it("sweeps a warm-booted, never-consumed device exactly once at teardown", async function () {
    const registry = createSimulatorRegistry();
    const deps = fakeDeps({ boot: async () => {} });
    const result = await warmAcquire({ registry, deps });
    assert.equal(result.outcome, "warmed");
    const entry = registry.get("warm-sim");
    // No test ever consumes the device; let its boot finish.
    await entry.ready;
    const swept = [];
    await teardownSimulatorRegistry(registry, async (e) => {
      swept.push(e.name);
    });
    assert.deepEqual(swept, ["warm-sim"]);
    assert.equal(registry.size, 0);
  });

  it("awaits an in-flight warm boot at teardown so the device is never orphaned", async function () {
    // The warm task resolves at boot INITIATION, so a run can end while the
    // boot is still in flight (the consuming context skipped, the other
    // tests were fast). The sweep must await readiness before shutting the
    // device down — otherwise it would sweep a placeholder with no udid yet
    // and orphan the real device.
    const registry = createSimulatorRegistry();
    let resolveBoot;
    const deps = fakeDeps({
      boot: () => new Promise((r) => (resolveBoot = r)),
    });
    const result = await warmAcquire({ registry, deps });
    assert.equal(result.outcome, "warmed");
    const swept = [];
    const teardown = teardownSimulatorRegistry(registry, async (e) => {
      swept.push(e.udid);
    });
    // Boot completes only after teardown already started.
    resolveBoot();
    await teardown;
    assert.deepEqual(swept, ["UDID-1"]);
    assert.equal(registry.size, 0);
  });

  it("skips a warm boot that fails while teardown is waiting on it", async function () {
    const registry = createSimulatorRegistry();
    let rejectBoot;
    const deps = fakeDeps({
      boot: () => new Promise((_, r) => (rejectBoot = r)),
    });
    await warmAcquire({ registry, deps, onError: () => {} });
    const swept = [];
    const teardown = teardownSimulatorRegistry(registry, async (e) => {
      swept.push(e.udid);
    });
    rejectBoot(new Error("boot exploded"));
    await teardown;
    // Nothing booted, so nothing to shut down — and no throw from teardown.
    assert.deepEqual(swept, []);
    assert.equal(registry.size, 0);
  });

  it("leaves reused (not-owned) devices alone at teardown", async function () {
    const registry = createSimulatorRegistry();
    const deps = fakeDeps({
      boot: async () => {},
      devices: [{ ...shutdownDevice(), state: "Booted" }],
    });
    await warmAcquire({ registry, deps });
    const swept = [];
    await teardownSimulatorRegistry(registry, async (e) => {
      swept.push(e.name);
    });
    assert.deepEqual(swept, []);
  });
});
