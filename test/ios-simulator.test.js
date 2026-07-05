import assert from "node:assert/strict";
import {
  parseSimctlDevices,
  parseSimctlRuntimes,
  parseSimctlDeviceTypes,
  compareVersions,
  newestRuntime,
  productFamilyForDeviceType,
  newestDeviceType,
  planSimulatorAcquisition,
  createSimulatorRegistry,
  acquireSimulator,
  teardownSimulatorRegistry,
  normalizeDeviceDescriptor,
} from "../dist/core/tests/iosSimulator.js";

const RT_175 = "com.apple.CoreSimulator.SimRuntime.iOS-17-5";
const RT_180 = "com.apple.CoreSimulator.SimRuntime.iOS-18-0";
const DT_IPHONE15 = "com.apple.CoreSimulator.SimDeviceType.iPhone-15";
const DT_IPAD = "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch";

const devicesJson = JSON.stringify({
  devices: {
    [RT_175]: [
      {
        udid: "UDID-15-175",
        name: "iPhone 15",
        state: "Shutdown",
        isAvailable: true,
        deviceTypeIdentifier: DT_IPHONE15,
      },
    ],
    [RT_180]: [
      {
        udid: "UDID-15-180",
        name: "iPhone 15",
        state: "Shutdown",
        isAvailable: true,
        deviceTypeIdentifier: DT_IPHONE15,
      },
      {
        udid: "UDID-IPAD-180",
        name: "iPad Pro",
        state: "Shutdown",
        isAvailable: true,
        deviceTypeIdentifier: DT_IPAD,
      },
    ],
  },
});

const runtimesJson = JSON.stringify({
  runtimes: [
    {
      identifier: RT_175,
      version: "17.5",
      name: "iOS 17.5",
      isAvailable: true,
      platform: "iOS",
    },
    {
      identifier: RT_180,
      version: "18.0",
      name: "iOS 18.0",
      isAvailable: true,
      platform: "iOS",
    },
    {
      identifier: "com.apple.CoreSimulator.SimRuntime.watchOS-10-5",
      version: "10.5",
      name: "watchOS 10.5",
      isAvailable: true,
      platform: "watchOS",
    },
    {
      identifier: "com.apple.CoreSimulator.SimRuntime.iOS-16-0",
      version: "16.0",
      name: "iOS 16.0",
      isAvailable: false,
      platform: "iOS",
    },
  ],
});

const deviceTypesJson = JSON.stringify({
  devicetypes: [
    { identifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-14", name: "iPhone 14", productFamily: "iPhone" },
    { identifier: DT_IPHONE15, name: "iPhone 15", productFamily: "iPhone" },
    { identifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro", name: "iPhone 15 Pro", productFamily: "iPhone" },
    { identifier: DT_IPAD, name: "iPad Pro 11-inch", productFamily: "iPad" },
  ],
});

describe("iosSimulator: parsers", function () {
  it("parseSimctlDevices flattens the runtime→devices map and stamps runtime", function () {
    const devices = parseSimctlDevices(devicesJson);
    assert.equal(devices.length, 3);
    const iphone180 = devices.find((d) => d.udid === "UDID-15-180");
    assert.equal(iphone180.name, "iPhone 15");
    assert.equal(iphone180.runtime, RT_180);
    assert.equal(iphone180.state, "Shutdown");
  });

  it("parseSimctlDevices drops malformed entries and bad JSON", function () {
    const bad = JSON.stringify({
      devices: { [RT_175]: [{ name: "no udid" }, null, { udid: "x", name: "ok", state: "Booted" }] },
    });
    assert.equal(parseSimctlDevices(bad).length, 1);
    assert.deepEqual(parseSimctlDevices("not json"), []);
    assert.deepEqual(parseSimctlDevices("{}"), []);
  });

  it("parseSimctlRuntimes and parseSimctlDeviceTypes parse their lists", function () {
    assert.equal(parseSimctlRuntimes(runtimesJson).length, 4);
    assert.equal(parseSimctlDeviceTypes(deviceTypesJson).length, 4);
    assert.deepEqual(parseSimctlRuntimes("nope"), []);
    assert.deepEqual(parseSimctlRuntimes("{}"), []);
    assert.deepEqual(parseSimctlDeviceTypes("not json"), []);
    assert.deepEqual(parseSimctlDeviceTypes("{}"), []);
  });
});

describe("iosSimulator: selection helpers", function () {
  it("compareVersions orders dotted versions numerically", function () {
    assert.ok(compareVersions("18.0", "17.5") > 0);
    assert.ok(compareVersions("17.10", "17.9") > 0);
    assert.equal(compareVersions("17.5", "17.5"), 0);
  });

  it("newestRuntime picks the highest available iOS runtime, ignoring watchOS and unavailable", function () {
    const rt = newestRuntime(parseSimctlRuntimes(runtimesJson));
    assert.equal(rt.identifier, RT_180);
    assert.equal(newestRuntime([]), null);
  });

  it("productFamilyForDeviceType maps tablet→iPad, else iPhone", function () {
    assert.equal(productFamilyForDeviceType("tablet"), "iPad");
    assert.equal(productFamilyForDeviceType("phone"), "iPhone");
    assert.equal(productFamilyForDeviceType(undefined), "iPhone");
  });

  it("newestDeviceType picks the highest model, Pro tie-breaking above plain", function () {
    const types = parseSimctlDeviceTypes(deviceTypesJson);
    assert.equal(newestDeviceType(types, "iPhone").name, "iPhone 15 Pro");
    assert.equal(newestDeviceType(types, "iPad").name, "iPad Pro 11-inch");
    assert.equal(newestDeviceType([], "iPhone"), null);
  });

  it("newestDeviceType ranks Pro Max > Plus/Pro > plain within a model, ignoring family-less types", function () {
    const types = parseSimctlDeviceTypes(
      JSON.stringify({
        devicetypes: [
          { identifier: "x.iPhone-15", name: "iPhone 15", productFamily: "iPhone" },
          { identifier: "x.iPhone-15-Plus", name: "iPhone 15 Plus", productFamily: "iPhone" },
          { identifier: "x.iPhone-15-Pro", name: "iPhone 15 Pro", productFamily: "iPhone" },
          { identifier: "x.iPhone-15-Pro-Max", name: "iPhone 15 Pro Max", productFamily: "iPhone" },
          { identifier: "x.no-family", name: "iPhone 15 Mystery" },
        ],
      })
    );
    assert.equal(newestDeviceType(types, "iPhone").name, "iPhone 15 Pro Max");
  });
});

describe("iosSimulator: planSimulatorAcquisition", function () {
  const ctx = {
    devices: parseSimctlDevices(devicesJson),
    runtimes: parseSimctlRuntimes(runtimesJson),
    deviceTypes: parseSimctlDeviceTypes(deviceTypesJson),
  };

  it("default device boots the newest-runtime existing iPhone", function () {
    const plan = planSimulatorAcquisition({ platform: "ios" }, ctx);
    assert.equal(plan.action, "boot");
    assert.equal(plan.udid, "UDID-15-180"); // iOS 18.0 beats 17.5
  });

  it("excludes non-iOS devices (visionOS/watchOS) from the iPhone default", function () {
    // Regression: hosted runners ship visionOS/watchOS/tvOS runtimes + devices;
    // the default picked an Apple Vision Pro and built a slow-failing WDA.
    const devices = parseSimctlDevices(
      JSON.stringify({
        devices: {
          "com.apple.CoreSimulator.SimRuntime.xrOS-2-0": [
            { udid: "VISION", name: "Apple Vision Pro", state: "Shutdown", isAvailable: true, deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.Apple-Vision-Pro" },
          ],
          "com.apple.CoreSimulator.SimRuntime.watchOS-11-0": [
            { udid: "WATCH", name: "Apple Watch Series 10", state: "Booted", isAvailable: true, deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.Apple-Watch-Series-10" },
          ],
          [RT_180]: [
            { udid: "IPHONE", name: "iPhone 15", state: "Shutdown", isAvailable: true, deviceTypeIdentifier: DT_IPHONE15 },
          ],
        },
      })
    );
    const runtimes = parseSimctlRuntimes(
      JSON.stringify({
        runtimes: [
          { identifier: "com.apple.CoreSimulator.SimRuntime.xrOS-2-0", version: "2.0", name: "visionOS 2.0", isAvailable: true, platform: "xrOS" },
          { identifier: "com.apple.CoreSimulator.SimRuntime.watchOS-11-0", version: "11.0", name: "watchOS 11.0", isAvailable: true, platform: "watchOS" },
          { identifier: RT_180, version: "18.0", name: "iOS 18.0", isAvailable: true, platform: "iOS" },
        ],
      })
    );
    const plan = planSimulatorAcquisition(
      { platform: "ios" },
      { devices, runtimes, deviceTypes: parseSimctlDeviceTypes(deviceTypesJson) }
    );
    // The booted Apple Watch is NOT reused; the iPhone is booted instead.
    assert.equal(plan.action, "boot");
    assert.equal(plan.udid, "IPHONE");
  });

  it("default device reuses any already-booted candidate", function () {
    const booted = ctx.devices.map((d) =>
      d.udid === "UDID-15-175" ? { ...d, state: "Booted" } : d
    );
    const plan = planSimulatorAcquisition({ platform: "ios" }, { ...ctx, devices: booted });
    assert.equal(plan.action, "reuse-booted");
    assert.equal(plan.udid, "UDID-15-175");
  });

  it("default tablet device targets an iPad", function () {
    const plan = planSimulatorAcquisition({ platform: "ios", deviceType: "tablet" }, ctx);
    assert.equal(plan.action, "boot");
    assert.equal(plan.udid, "UDID-IPAD-180");
  });

  it("osVersion filters existing devices to that runtime version", function () {
    const plan = planSimulatorAcquisition({ platform: "ios", osVersion: "17.5" }, ctx);
    assert.equal(plan.action, "boot");
    assert.equal(plan.udid, "UDID-15-175");
  });

  it("a named device that exists (shutdown) boots it; booted reuses it", function () {
    const boot = planSimulatorAcquisition({ platform: "ios", name: "iPhone 15" }, ctx);
    assert.equal(boot.action, "boot");
    const bootedDevices = ctx.devices.map((d) =>
      d.udid === "UDID-15-180" ? { ...d, state: "Booted" } : d
    );
    const reuse = planSimulatorAcquisition(
      { platform: "ios", name: "iPhone 15" },
      { ...ctx, devices: bootedDevices }
    );
    assert.equal(reuse.action, "reuse-booted");
    assert.equal(reuse.udid, "UDID-15-180");
  });

  it("a named device that does not exist is created and booted (newest iPhone type + runtime)", function () {
    const plan = planSimulatorAcquisition({ platform: "ios", name: "dd-phone" }, ctx);
    assert.equal(plan.action, "create-boot");
    assert.equal(plan.name, "dd-phone");
    assert.equal(
      plan.deviceTypeId,
      "com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro"
    );
    assert.equal(plan.runtimeId, RT_180); // newest runtime
  });

  it("creates on the newest runtime that already has simulators, not a device-less newer one", function () {
    // iOS 18.0 is newer but carries no simulators (freshly downloaded / partial);
    // 17.5 already has one, so it is the proven-usable runtime to create on.
    const devices = parseSimctlDevices(
      JSON.stringify({
        devices: {
          [RT_175]: [{ udid: "U", name: "iPhone 15", state: "Shutdown", isAvailable: true, deviceTypeIdentifier: DT_IPHONE15 }],
        },
      })
    );
    const runtimes = parseSimctlRuntimes(
      JSON.stringify({
        runtimes: [
          { identifier: RT_175, version: "17.5", name: "iOS 17.5", isAvailable: true, platform: "iOS" },
          { identifier: RT_180, version: "18.0", name: "iOS 18.0", isAvailable: true, platform: "iOS" },
        ],
      })
    );
    const plan = planSimulatorAcquisition(
      { platform: "ios", name: "dd-new" },
      { devices, runtimes, deviceTypes: parseSimctlDeviceTypes(deviceTypesJson) }
    );
    assert.equal(plan.action, "create-boot");
    assert.equal(plan.runtimeId, RT_175);
  });

  it("creates the newest iPhone when no simulators exist at all", function () {
    const plan = planSimulatorAcquisition(
      { platform: "ios" },
      { ...ctx, devices: [] }
    );
    assert.equal(plan.action, "create-boot");
    assert.equal(plan.name, "doc-detective-iphone");
  });

  it("SKIPs with guidance when no iOS runtime is installed", function () {
    const plan = planSimulatorAcquisition(
      { platform: "ios" },
      { devices: [], runtimes: [], deviceTypes: parseSimctlDeviceTypes(deviceTypesJson) }
    );
    assert.equal(plan.action, "skip");
    assert.match(plan.reason, /no installed iOS simulator runtime/i);
  });

  it("SKIPs naming the version when the requested osVersion runtime is missing", function () {
    const plan = planSimulatorAcquisition(
      { platform: "ios", name: "dd", osVersion: "42.0" },
      { ...ctx, devices: [] }
    );
    assert.equal(plan.action, "skip");
    assert.match(plan.reason, /iOS 42\.0/);
  });

  it("SKIPs when a runtime exists but no matching device type is available", function () {
    const plan = planSimulatorAcquisition(
      { platform: "ios", name: "dd" },
      { devices: [], runtimes: parseSimctlRuntimes(runtimesJson), deviceTypes: [] }
    );
    assert.equal(plan.action, "skip");
    assert.match(plan.reason, /no iPhone simulator device type/i);
  });

  it("treats a platform-less iOS runtime as iOS and names a created tablet default", function () {
    // Runtimes lacking the `platform` field — hosted images sometimes omit it;
    // the iOS identifier still classifies them (newestRuntime + planCreate).
    const runtimes = parseSimctlRuntimes(
      JSON.stringify({
        runtimes: [
          { identifier: RT_175, version: "17.5", name: "iOS 17.5", isAvailable: true },
          { identifier: RT_180, version: "18.0", name: "iOS 18.0", isAvailable: true },
        ],
      })
    );
    assert.equal(newestRuntime(runtimes).identifier, RT_180);
    const plan = planSimulatorAcquisition(
      { platform: "ios", deviceType: "tablet" },
      { devices: [], runtimes, deviceTypes: parseSimctlDeviceTypes(deviceTypesJson) }
    );
    assert.equal(plan.action, "create-boot");
    assert.equal(plan.name, "doc-detective-ipad");
    assert.equal(plan.runtimeId, RT_180);
  });

  it("keeps an iOS-runtime device with no deviceTypeIdentifier via its name, excluding non-iOS runtimes", function () {
    const devices = parseSimctlDevices(
      JSON.stringify({
        devices: {
          "com.apple.CoreSimulator.SimRuntime.tvOS-18-0": [
            { udid: "TV", name: "Apple TV 4K", state: "Shutdown", isAvailable: true },
          ],
          [RT_175]: [
            // No deviceTypeIdentifier — family matches on the name instead.
            { udid: "IPHONE-NOTYPE", name: "iPhone Mystery", state: "Shutdown", isAvailable: true },
          ],
        },
      })
    );
    const runtimes = parseSimctlRuntimes(
      JSON.stringify({
        runtimes: [
          { identifier: "com.apple.CoreSimulator.SimRuntime.tvOS-18-0", version: "18.0", name: "tvOS 18.0", isAvailable: true, platform: "tvOS" },
          { identifier: RT_175, version: "17.5", name: "iOS 17.5", isAvailable: true, platform: "iOS" },
        ],
      })
    );
    const plan = planSimulatorAcquisition(
      { platform: "ios" },
      { devices, runtimes, deviceTypes: parseSimctlDeviceTypes(deviceTypesJson) }
    );
    assert.equal(plan.action, "boot");
    assert.equal(plan.udid, "IPHONE-NOTYPE");
  });

  it("keeps the running-best candidate when a later one is older", function () {
    const devices = parseSimctlDevices(
      JSON.stringify({
        devices: {
          [RT_180]: [{ udid: "U-180", name: "iPhone 15", state: "Shutdown", deviceTypeIdentifier: DT_IPHONE15 }],
          [RT_175]: [{ udid: "U-175", name: "iPhone 15", state: "Shutdown", deviceTypeIdentifier: DT_IPHONE15 }],
        },
      })
    );
    const plan = planSimulatorAcquisition(
      { platform: "ios" },
      { devices, runtimes: parseSimctlRuntimes(runtimesJson), deviceTypes: parseSimctlDeviceTypes(deviceTypesJson) }
    );
    assert.equal(plan.udid, "U-180");
  });
});

describe("iosSimulator: acquireSimulator + teardown", function () {
  function fakeDeps(overrides = {}) {
    const calls = { create: 0, boot: [], shutdown: [], log: [] };
    return {
      calls,
      deps: {
        listDevices: async () => parseSimctlDevices(devicesJson),
        listRuntimes: async () => parseSimctlRuntimes(runtimesJson),
        listDeviceTypes: async () => parseSimctlDeviceTypes(deviceTypesJson),
        create: async (args) => {
          calls.create++;
          return { udid: "UDID-CREATED" };
        },
        boot: async (udid) => {
          calls.boot.push(udid);
        },
        log: (m) => calls.log.push(m),
        ...overrides,
      },
    };
  }

  it("boots the default device and registers it as bootedByUs", async function () {
    const registry = createSimulatorRegistry();
    const { deps, calls } = fakeDeps();
    const result = await acquireSimulator({ desc: { platform: "ios" }, registry, deps });
    assert.ok("entry" in result);
    assert.equal(result.entry.udid, "UDID-15-180");
    assert.equal(result.entry.bootedByUs, true);
    assert.deepEqual(calls.boot, ["UDID-15-180"]);
    assert.equal(registry.size, 1);
  });

  it("reuses an already-booted device without booting (bootedByUs false)", async function () {
    const registry = createSimulatorRegistry();
    const booted = JSON.stringify({
      devices: { [RT_180]: [{ udid: "UDID-B", name: "iPhone 15", state: "Booted", isAvailable: true, deviceTypeIdentifier: DT_IPHONE15 }] },
    });
    const { deps, calls } = fakeDeps({ listDevices: async () => parseSimctlDevices(booted) });
    const result = await acquireSimulator({ desc: { platform: "ios" }, registry, deps });
    assert.equal(result.entry.udid, "UDID-B");
    assert.equal(result.entry.bootedByUs, false);
    assert.deepEqual(calls.boot, []);
  });

  it("creates+boots a named-missing device", async function () {
    const registry = createSimulatorRegistry();
    const { deps, calls } = fakeDeps();
    const result = await acquireSimulator({ desc: { platform: "ios", name: "dd-new" }, registry, deps });
    assert.equal(result.entry.udid, "UDID-CREATED");
    assert.equal(result.entry.bootedByUs, true);
    assert.equal(calls.create, 1);
    assert.deepEqual(calls.boot, ["UDID-CREATED"]);
  });

  it("memoizes an in-flight boot so concurrent acquirers share one create+boot", async function () {
    const registry = createSimulatorRegistry();
    let release;
    const gate = new Promise((r) => (release = r));
    const { deps, calls } = fakeDeps({
      create: async () => {
        calls.create++;
        await gate;
        return { udid: "UDID-CREATED" };
      },
    });
    const p1 = acquireSimulator({ desc: { platform: "ios", name: "dd" }, registry, deps });
    const p2 = acquireSimulator({ desc: { platform: "ios", name: "dd" }, registry, deps });
    release();
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(r1.entry.udid, "UDID-CREATED");
    assert.equal(r2.entry.udid, "UDID-CREATED");
    assert.equal(calls.create, 1, "create must run once for concurrent acquirers");
  });

  it("drops the placeholder when a boot fails so a retry starts fresh", async function () {
    const registry = createSimulatorRegistry();
    const { deps } = fakeDeps({
      boot: async () => {
        throw new Error("boot exploded");
      },
    });
    await assert.rejects(
      acquireSimulator({ desc: { platform: "ios", name: "dd" }, registry, deps }),
      /boot exploded/
    );
    assert.equal(registry.size, 0);
  });

  it("passes a plan skip through as { skip }", async function () {
    const registry = createSimulatorRegistry();
    const { deps } = fakeDeps({
      listDevices: async () => [],
      listRuntimes: async () => [],
    });
    const result = await acquireSimulator({ desc: { platform: "ios" }, registry, deps });
    assert.ok("skip" in result);
    assert.match(result.skip, /no installed iOS simulator runtime/i);
  });

  it("reuses a named device already acquired this run without re-probing", async function () {
    const registry = createSimulatorRegistry();
    const { deps, calls } = fakeDeps();
    const first = await acquireSimulator({ desc: { platform: "ios", name: "dd" }, registry, deps });
    assert.equal(first.entry.udid, "UDID-CREATED");
    // Second acquire of the same name short-circuits on the registry before any probe.
    let probed = false;
    const guardedDeps = {
      ...deps,
      listDevices: async () => {
        probed = true;
        return [];
      },
    };
    const second = await acquireSimulator({ desc: { platform: "ios", name: "dd" }, registry, deps: guardedDeps });
    assert.equal(second.entry.udid, "UDID-CREATED");
    assert.equal(probed, false, "the fast registry path must not re-probe simctl");
    assert.equal(calls.create, 1);
  });

  it("reuses a booted device across sequential named and default acquires (no re-boot)", async function () {
    const registry = createSimulatorRegistry();
    const booted = JSON.stringify({
      devices: { [RT_180]: [{ udid: "UDID-B", name: "iPhone 15", state: "Booted", isAvailable: true, deviceTypeIdentifier: DT_IPHONE15 }] },
    });
    const { deps, calls } = fakeDeps({ listDevices: async () => parseSimctlDevices(booted) });
    // Named acquire → reuse-booted, registered without an in-flight `ready`.
    const named1 = await acquireSimulator({ desc: { platform: "ios", name: "iPhone 15" }, registry, deps });
    assert.equal(named1.entry.udid, "UDID-B");
    // Second named acquire hits the fast registry path on an entry with no `ready`.
    const named2 = await acquireSimulator({ desc: { platform: "ios", name: "iPhone 15" }, registry, deps });
    assert.equal(named2.entry.udid, "UDID-B");
    // A default acquire resolves to the same already-registered name (no `ready`).
    const def = await acquireSimulator({ desc: { platform: "ios" }, registry, deps });
    assert.equal(def.entry.udid, "UDID-B");
    assert.deepEqual(calls.boot, []);
  });

  it("teardown shuts down only devices we booted, then clears the registry", async function () {
    const registry = createSimulatorRegistry();
    registry.set("a", { name: "a", udid: "UDID-A", bootedByUs: true });
    registry.set("b", { name: "b", udid: "UDID-B", bootedByUs: false });
    const shutdown = [];
    await teardownSimulatorRegistry(registry, async (entry) => {
      shutdown.push(entry.udid);
    });
    assert.deepEqual(shutdown, ["UDID-A"]);
    assert.equal(registry.size, 0);
  });

  it("teardown tolerates a shutdown error and still clears the registry", async function () {
    const registry = createSimulatorRegistry();
    registry.set("a", { name: "a", udid: "UDID-A", bootedByUs: true });
    await teardownSimulatorRegistry(registry, async () => {
      throw new Error("stuck simulator");
    });
    assert.equal(registry.size, 0);
  });

  it("re-exports normalizeDeviceDescriptor", function () {
    assert.deepEqual(normalizeDeviceDescriptor({ stepDevice: "iPhone 15", platform: "ios" }), {
      name: "iPhone 15",
      platform: "ios",
    });
  });
});
