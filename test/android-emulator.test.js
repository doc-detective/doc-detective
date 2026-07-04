// Native app surfaces phase A3b: the managed Android device layer. Pure
// parsers + the reuse-or-create decision are tested directly; acquireDevice /
// teardown are tested with injected effects (no adb, emulator, or SDK).

import {
  parseAdbDevices,
  parseEmuAvdName,
  parseListAvds,
  parseAccelCheck,
  normalizeDeviceDescriptor,
  emulatorBootArgs,
  nextEmulatorPort,
  udidForPort,
  planDeviceAcquisition,
  createDeviceRegistry,
  acquireDevice,
  teardownDeviceRegistry,
} from "../dist/core/tests/androidEmulator.js";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("androidEmulator: output parsers", function () {
  it("parseAdbDevices skips the header and keeps serial+state", function () {
    const text = [
      "List of devices attached",
      "emulator-5554\tdevice",
      "emulator-5556\toffline",
      "",
    ].join("\n");
    expect(parseAdbDevices(text)).to.deep.equal([
      { udid: "emulator-5554", state: "device" },
      { udid: "emulator-5556", state: "offline" },
    ]);
  });

  it("parseEmuAvdName strips the trailing OK line", function () {
    expect(parseEmuAvdName("Pixel_7\nOK\n")).to.equal("Pixel_7");
    expect(parseEmuAvdName("OK\n")).to.equal(null);
  });

  it("parseListAvds returns one name per line", function () {
    expect(parseListAvds("Pixel_7\ndoc-detective\n")).to.deep.equal([
      "Pixel_7",
      "doc-detective",
    ]);
  });

  it("parseAccelCheck reads the exit code, vetoed by a not-usable phrase", function () {
    expect(parseAccelCheck({ code: 0, text: "KVM is installed and usable." })).to.equal(true);
    expect(parseAccelCheck({ code: 1, text: "" })).to.equal(false);
    expect(parseAccelCheck({ code: 0, text: "KVM is not installed" })).to.equal(false);
  });
});

describe("androidEmulator: descriptor + boot computation", function () {
  it("normalizeDeviceDescriptor merges context + step, string shorthand, step wins", function () {
    expect(
      normalizeDeviceDescriptor({ contextDevice: "pixel7", platform: "android" })
    ).to.deep.equal({ name: "pixel7", platform: "android" });

    expect(
      normalizeDeviceDescriptor({
        contextDevice: { name: "phone", deviceType: "phone", osVersion: "13" },
        stepDevice: { name: "phone2", osVersion: "14" },
        platform: "android",
      })
    ).to.deep.equal({
      name: "phone2",
      deviceType: "phone",
      osVersion: "14",
      platform: "android",
    });
  });

  it("udidForPort and nextEmulatorPort walk even ports from 5554", function () {
    expect(udidForPort(5554)).to.equal("emulator-5554");
    expect(nextEmulatorPort([])).to.equal(5554);
    expect(nextEmulatorPort([5554])).to.equal(5556);
    expect(nextEmulatorPort([5554, 5556])).to.equal(5558);
  });

  it("emulatorBootArgs adds headless + deterministic flags", function () {
    expect(emulatorBootArgs({ name: "phone" }, 5554)).to.deep.equal([
      "-avd", "phone", "-port", "5554", "-no-snapshot-save", "-no-boot-anim",
    ]);
    expect(emulatorBootArgs({ name: "phone", headless: true }, 5556)).to.deep.equal([
      "-avd", "phone", "-port", "5556",
      "-no-window", "-no-audio", "-no-snapshot-save", "-no-boot-anim",
    ]);
  });
});

describe("androidEmulator: planDeviceAcquisition (reuse-or-create)", function () {
  const base = {
    running: [],
    avds: [],
    installedImages: ["system-images;android-34;google_apis;x86_64"],
    abi: "x86_64",
    javaPresent: true,
  };

  it("reuses a running emulator whose AVD name matches", function () {
    const plan = planDeviceAcquisition(
      { name: "pixel7" },
      { ...base, running: [{ udid: "emulator-5554", name: "pixel7" }] }
    );
    expect(plan).to.deep.equal({
      action: "reuse-running",
      name: "pixel7",
      udid: "emulator-5554",
    });
  });

  it("uses any running emulator as the default when no device is named", function () {
    const plan = planDeviceAcquisition(
      {},
      { ...base, running: [{ udid: "emulator-5554", name: "someAvd" }] }
    );
    expect(plan.action).to.equal("reuse-running");
    expect(plan.udid).to.equal("emulator-5554");
  });

  it("boots an existing AVD by name", function () {
    const plan = planDeviceAcquisition(
      { name: "pixel7" },
      { ...base, avds: ["pixel7"] }
    );
    expect(plan).to.deep.equal({ action: "boot", name: "pixel7" });
  });

  it("creates-and-boots when the AVD is missing but an image + java exist", function () {
    const plan = planDeviceAcquisition(
      { name: "phone", deviceType: "tablet" },
      base
    );
    expect(plan.action).to.equal("create-boot");
    expect(plan.name).to.equal("phone");
    expect(plan.systemImage).to.equal("system-images;android-34;google_apis;x86_64");
    expect(plan.device).to.equal("pixel_tablet");
  });

  it("defaults an unnamed device to the doc-detective AVD", function () {
    expect(planDeviceAcquisition({}, base).name).to.equal("doc-detective");
    // Prefer an existing doc-detective AVD over an arbitrary one.
    const plan = planDeviceAcquisition({}, { ...base, avds: ["other", "doc-detective"] });
    expect(plan).to.deep.equal({ action: "boot", name: "doc-detective" });
  });

  it("SKIPs when no system image is installed (points at install android)", function () {
    const plan = planDeviceAcquisition(
      { name: "phone", osVersion: "14" },
      { ...base, installedImages: [] }
    );
    expect(plan.action).to.equal("skip");
    expect(plan.reason).to.match(/install android/);
    expect(plan.reason).to.match(/14/);
  });

  it("SKIPs when Java is missing for AVD creation", function () {
    const plan = planDeviceAcquisition(
      { name: "phone" },
      { ...base, javaPresent: false }
    );
    expect(plan.action).to.equal("skip");
    expect(plan.reason).to.match(/Java/);
  });
});

describe("androidEmulator: acquireDevice + teardown (injected effects)", function () {
  function makeDeps(overrides = {}) {
    return {
      listRunning: async () => [],
      listAvds: async () => ["pixel7"],
      installedImages: () => ["system-images;android-34;google_apis;x86_64"],
      javaPresent: () => true,
      abi: "x86_64",
      createAvd: async () => {},
      boot: async (desc, port) => ({
        udid: `emulator-${port}`,
        process: { pid: 1000 + port },
      }),
      log: () => {},
      ...overrides,
    };
  }

  it("boots an existing AVD and registers it as bootedByUs", async function () {
    const registry = createDeviceRegistry();
    const res = await acquireDevice({
      desc: { name: "pixel7" },
      registry,
      sdkRoot: "/sdk",
      deps: makeDeps(),
    });
    expect(res.entry.name).to.equal("pixel7");
    expect(res.entry.udid).to.equal("emulator-5554");
    expect(res.entry.bootedByUs).to.equal(true);
    expect(registry.get("pixel7")).to.equal(res.entry);
  });

  it("reuses a running emulator without booting (bootedByUs false)", async function () {
    let booted = false;
    const registry = createDeviceRegistry();
    const res = await acquireDevice({
      desc: { name: "pixel7" },
      registry,
      sdkRoot: "/sdk",
      deps: makeDeps({
        listRunning: async () => [{ udid: "emulator-5554", name: "pixel7" }],
        boot: async () => {
          booted = true;
          return { udid: "x", process: {} };
        },
      }),
    });
    expect(res.entry.bootedByUs).to.equal(false);
    expect(booted).to.equal(false);
  });

  it("creates the AVD before booting when it is missing", async function () {
    const calls = [];
    const registry = createDeviceRegistry();
    await acquireDevice({
      desc: { name: "brand-new", deviceType: "phone" },
      registry,
      sdkRoot: "/sdk",
      deps: makeDeps({
        listAvds: async () => [],
        createAvd: async (a) => calls.push(a),
      }),
    });
    expect(calls).to.have.length(1);
    expect(calls[0].name).to.equal("brand-new");
    expect(calls[0].device).to.equal("pixel");
  });

  it("shares one boot across concurrent acquirers of the same device", async function () {
    let boots = 0;
    const registry = createDeviceRegistry();
    const deps = makeDeps({
      boot: async (desc, port) => {
        boots++;
        await new Promise((r) => setTimeout(r, 10));
        return { udid: `emulator-${port}`, process: {} };
      },
    });
    const [a, b] = await Promise.all([
      acquireDevice({ desc: { name: "pixel7" }, registry, sdkRoot: "/sdk", deps }),
      acquireDevice({ desc: { name: "pixel7" }, registry, sdkRoot: "/sdk", deps }),
    ]);
    expect(boots).to.equal(1);
    expect(a.entry.udid).to.equal(b.entry.udid);
  });

  it("returns a skip when the plan can't proceed", async function () {
    const registry = createDeviceRegistry();
    const res = await acquireDevice({
      desc: { name: "brand-new" },
      registry,
      sdkRoot: "/sdk",
      deps: makeDeps({ listAvds: async () => [], installedImages: () => [] }),
    });
    expect(res.skip).to.match(/install android/);
  });

  it("teardown kills only bootedByUs devices, leaving pre-existing ones", async function () {
    const registry = createDeviceRegistry();
    registry.set("mine", { name: "mine", udid: "emulator-5554", bootedByUs: true, sdkRoot: "/sdk" });
    registry.set("theirs", { name: "theirs", udid: "emulator-5556", bootedByUs: false, sdkRoot: "/sdk" });
    const killed = [];
    await teardownDeviceRegistry(registry, async (e) => killed.push(e.name));
    expect(killed).to.deep.equal(["mine"]);
    expect(registry.size).to.equal(0);
  });
});
