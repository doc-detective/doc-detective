// Registry ↔ handoff conversion for the warm ownership handoff (phase B3):
// adopted devices are seeded into the run registries as bootedByUs (so the
// existing run-end sweep reclaims them), and a warm-only run collects its
// owned, booted devices back out of the registries into manifest shape.
import assert from "node:assert/strict";
import {
  seedRegistriesFromHandoff,
  collectHandoffDevices,
} from "../dist/core/tests.js";
import {
  createSimulatorRegistry,
  teardownSimulatorRegistry,
} from "../dist/core/tests/iosSimulator.js";
import {
  createDeviceRegistry,
  teardownDeviceRegistry,
} from "../dist/core/tests/androidEmulator.js";

const androidDevice = {
  platform: "android",
  name: "doc-detective",
  udid: "emulator-5554",
  pid: 4242,
  sdkRoot: "C:\\sdk",
  headless: true,
};
const iosDevice = {
  platform: "ios",
  name: "doc-detective-iphone",
  udid: "UDID-1",
};

describe("warm handoff: registry seeding and collection", function () {
  it("seeds adopted devices as owned registry entries the run-end sweep reclaims", async function () {
    const deviceRegistry = createDeviceRegistry();
    const simulatorRegistry = createSimulatorRegistry();
    seedRegistriesFromHandoff({
      devices: [androidDevice, iosDevice],
      deviceRegistry,
      simulatorRegistry,
    });

    const emulator = deviceRegistry.get("doc-detective");
    assert.ok(emulator);
    assert.equal(emulator.bootedByUs, true);
    assert.equal(emulator.udid, "emulator-5554");
    assert.equal(emulator.process.pid, 4242);
    assert.equal(emulator.sdkRoot, "C:\\sdk");

    const simulator = simulatorRegistry.get("doc-detective-iphone");
    assert.ok(simulator);
    assert.equal(simulator.bootedByUs, true);
    assert.equal(simulator.udid, "UDID-1");

    // The existing sweeps must reclaim both without any new lifecycle code.
    const killed = [];
    await teardownDeviceRegistry(deviceRegistry, async (entry) => {
      killed.push(entry.process?.pid);
    });
    assert.deepEqual(killed, [4242]);
    const shutdown = [];
    await teardownSimulatorRegistry(simulatorRegistry, async (entry) => {
      shutdown.push(entry.udid);
    });
    assert.deepEqual(shutdown, ["UDID-1"]);
  });

  it("ignores malformed handoff entries instead of seeding broken registry state", function () {
    const deviceRegistry = createDeviceRegistry();
    const simulatorRegistry = createSimulatorRegistry();
    seedRegistriesFromHandoff({
      devices: [
        { platform: "android", name: "", udid: "emulator-5556" },
        { platform: "ios", name: "no-udid", udid: "" },
        { platform: "other", name: "x", udid: "y" },
      ],
      deviceRegistry,
      simulatorRegistry,
    });
    assert.equal(deviceRegistry.size, 0);
    assert.equal(simulatorRegistry.size, 0);
  });

  it("collects only owned, booted devices back into handoff shape", function () {
    const deviceRegistry = createDeviceRegistry();
    const simulatorRegistry = createSimulatorRegistry();
    deviceRegistry.set("doc-detective", {
      name: "doc-detective",
      udid: "emulator-5554",
      bootedByUs: true,
      process: { pid: 4242 },
      sdkRoot: "C:\\sdk",
      headless: true,
    });
    // Reused (not owned) — must not be handed off: this run never booted it.
    deviceRegistry.set("pre-existing", {
      name: "pre-existing",
      udid: "emulator-5556",
      bootedByUs: false,
      sdkRoot: "C:\\sdk",
    });
    simulatorRegistry.set("doc-detective-iphone", {
      name: "doc-detective-iphone",
      udid: "UDID-1",
      bootedByUs: true,
    });
    // Mid-create placeholder without a udid — nothing adoptable to record.
    simulatorRegistry.set("half-built", {
      name: "half-built",
      udid: "",
      bootedByUs: true,
    });

    const devices = collectHandoffDevices({ deviceRegistry, simulatorRegistry });
    assert.deepEqual(devices, [
      {
        platform: "android",
        name: "doc-detective",
        udid: "emulator-5554",
        pid: 4242,
        sdkRoot: "C:\\sdk",
        headless: true,
      },
      { platform: "ios", name: "doc-detective-iphone", udid: "UDID-1" },
    ]);
  });

  it("round-trips: seeding then collecting reproduces the handoff", function () {
    const deviceRegistry = createDeviceRegistry();
    const simulatorRegistry = createSimulatorRegistry();
    seedRegistriesFromHandoff({
      devices: [androidDevice, iosDevice],
      deviceRegistry,
      simulatorRegistry,
    });
    assert.deepEqual(collectHandoffDevices({ deviceRegistry, simulatorRegistry }), [
      androidDevice,
      iosDevice,
    ]);
  });
});
