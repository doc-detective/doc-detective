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
  planAndroidToolchain,
  createDeviceRegistry,
  acquireDevice,
  teardownDeviceRegistry,
  hostHasKvm,
  bootWithCleanSnapshot,
  isCleanSnapshotStale,
  findUia2Helpers,
  cleanSnapshotSaveCommands,
  CLEAN_SNAPSHOT_NAME,
  waitForBootCompleted,
  waitForProcessExit,
  shutdownEmulatorWith,
  BOOT_POLL_INTERVAL_MS,
} from "../dist/core/tests/androidEmulator.js";

import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("androidEmulator: waitForProcessExit", function () {
  function fakeProc(exitCode = null) {
    const p = new EventEmitter();
    p.exitCode = exitCode;
    return p;
  }

  it("resolves true once the process exits", async function () {
    const p = fakeProc();
    setTimeout(() => {
      p.exitCode = 0;
      p.emit("exit", 0);
    }, 10);
    expect(await waitForProcessExit(p, 1000)).to.equal(true);
  });

  it("resolves true immediately for an already-exited process", async function () {
    expect(await waitForProcessExit(fakeProc(0), 1000)).to.equal(true);
  });

  it("resolves false when the process outlives the timeout", async function () {
    expect(await waitForProcessExit(fakeProc(), 20)).to.equal(false);
  });

  it("treats a missing process as exited", async function () {
    expect(await waitForProcessExit(undefined, 20)).to.equal(true);
  });
});

describe("androidEmulator: shutdownEmulatorWith (ADR 01106)", function () {
  function fakes(exitsGracefully, consoleAccepted = true) {
    const calls = [];
    return {
      calls,
      flush: async () => {
        calls.push("flush");
      },
      consoleKill: async () => {
        calls.push("console");
        return consoleAccepted;
      },
      waitExit: async () => {
        calls.push("wait");
        return exitsGracefully;
      },
      forceKill: async () => {
        calls.push("force");
      },
      release: () => {
        calls.push("release");
      },
    };
  }

  it("shuts down through the console and waits, never hard-killing a clean exit", async function () {
    // A hard kill can leave qemu's disk images (which hold the clean
    // snapshot) inconsistent; a graceful exit flushes them.
    const f = fakes(true);
    expect(await shutdownEmulatorWith(f)).to.equal("graceful");
    expect(f.calls).to.deep.equal(["flush", "console", "wait", "release"]);
  });

  it("leaves a slow exit to the emulator's own watchdog once the console accepted the kill", async function () {
    // An accepted `emu kill` arms the emulator's watchdog, which ends qemu
    // within 20s on its own (adb clients can stall qemu's exit until then).
    // Waiting longer only delays the run, and a hard kill adds nothing.
    const f = fakes(false, true);
    expect(await shutdownEmulatorWith(f)).to.equal("watchdog");
    expect(f.calls).to.deep.equal(["flush", "console", "wait", "release"]);
  });

  it("force-kills when the console refused the kill and the emulator doesn't exit", async function () {
    const f = fakes(false, false);
    expect(await shutdownEmulatorWith(f)).to.equal("forced");
    expect(f.calls).to.deep.equal(["flush", "console", "wait", "force", "release"]);
  });

  it("flushes the guest's page cache first, and a failed flush never blocks the shutdown", async function () {
    // `emu kill` halts the VM without an Android shutdown: writes still in
    // the guest page cache never reach /data (a just-installed APK came back
    // as pkg=null on the next cold boot 4/4 times without the flush).
    const f = fakes(true);
    f.flush = async () => {
      f.calls.push("flush");
      throw new Error("device offline");
    };
    expect(await shutdownEmulatorWith(f)).to.equal("graceful");
    expect(f.calls).to.deep.equal(["flush", "console", "wait", "release"]);
  });

  it("still waits and force-kills when the console kill throws", async function () {
    const f = fakes(false);
    f.consoleKill = async () => {
      f.calls.push("console");
      throw new Error("adb missing");
    };
    expect(await shutdownEmulatorWith(f)).to.equal("forced");
    expect(f.calls).to.deep.equal(["flush", "console", "wait", "force", "release"]);
  });
});

describe("androidEmulator: waitForBootCompleted", function () {
  // A fake clock: sleep advances it, so deadlines are deterministic.
  function fakeClock() {
    let t = 0;
    const sleeps = [];
    return {
      sleeps,
      now: () => t,
      sleep: async (ms) => {
        sleeps.push(ms);
        t += ms;
      },
    };
  }

  it("probes immediately, then polls on a short interval until booted", async function () {
    const clock = fakeClock();
    let probes = 0;
    const result = await waitForBootCompleted({
      probe: async () => ++probes === 3,
      exitCode: () => null,
      timeoutMs: 180000,
      ...clock,
    });
    expect(result).to.equal("booted");
    expect(probes).to.equal(3);
    // No leading sleep before the first probe; sub-second polling after.
    expect(clock.sleeps).to.deep.equal([BOOT_POLL_INTERVAL_MS, BOOT_POLL_INTERVAL_MS]);
    expect(BOOT_POLL_INTERVAL_MS).to.be.at.most(1000);
  });

  it("fails fast with the exit code when the emulator process dies", async function () {
    const clock = fakeClock();
    let probes = 0;
    let code = null;
    const result = await waitForBootCompleted({
      probe: async () => {
        probes++;
        code = 1; // dies during the first probe
        return false;
      },
      exitCode: () => code,
      timeoutMs: 180000,
      ...clock,
    });
    expect(result).to.deep.equal({ exited: 1 });
    expect(probes).to.equal(1);
  });

  it("times out when the boot flag never flips", async function () {
    const clock = fakeClock();
    const result = await waitForBootCompleted({
      probe: async () => false,
      exitCode: () => null,
      timeoutMs: 2000,
      ...clock,
    });
    expect(result).to.equal("timeout");
    expect(clock.now()).to.be.at.least(2000);
  });
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

  it("emulatorBootArgs cold-boots by default and force-loads the clean snapshot when asked (ADR 01106)", function () {
    expect(CLEAN_SNAPSHOT_NAME).to.equal("doc-detective-clean");
    expect(emulatorBootArgs({ name: "phone" }, 5554)).to.deep.equal([
      "-avd", "phone", "-port", "5554", "-no-snapshot", "-no-boot-anim",
    ]);
    // Snapshot boots never save over it, and exit (rather than silently cold
    // boot) when it can't load — so the caller KNOWS which boot happened.
    expect(emulatorBootArgs({ name: "phone" }, 5554, { snapshot: true })).to.deep.equal([
      "-avd", "phone", "-port", "5554",
      "-snapshot", CLEAN_SNAPSHOT_NAME, "-no-snapshot-save", "-force-snapshot-load",
      "-no-boot-anim",
    ]);
    // Headless adds a software renderer — a windowless emulator with the host
    // GPU has no surface and exits immediately on a headless CI runner.
    expect(emulatorBootArgs({ name: "phone", headless: true }, 5556)).to.deep.equal([
      "-avd", "phone", "-port", "5556",
      "-no-window", "-no-audio", "-gpu", "swiftshader_indirect",
      "-no-snapshot", "-no-boot-anim",
    ]);
  });
});

describe("androidEmulator: cleanSnapshotSaveCommands (ADR 01106)", function () {
  it("deletes any existing snapshot of that name through the console before saving", function () {
    // Deleting only the snapshot directory leaves the qcow2-internal snapshot
    // behind; re-saving the name over it produced a snapshot that never
    // resumed on windowed (host-GPU) emulators, 2/2 — and 2/2 resumed with
    // the console delete first.
    expect(cleanSnapshotSaveCommands("emulator-5554")).to.deep.equal([
      ["-s", "emulator-5554", "emu", "avd", "snapshot", "delete", CLEAN_SNAPSHOT_NAME],
      ["-s", "emulator-5554", "emu", "avd", "snapshot", "save", CLEAN_SNAPSHOT_NAME],
    ]);
  });
});

describe("androidEmulator: bootWithCleanSnapshot (ADR 01106)", function () {
  function fakes(outcomes) {
    const calls = [];
    return {
      calls,
      attempt: async ({ snapshot }) => {
        calls.push(snapshot ? "snapshot" : "cold");
        return outcomes.shift();
      },
      settle: async () => {
        calls.push("settle");
      },
      prepare: async () => {
        calls.push("prepare");
      },
      discard: async () => {
        calls.push("discard");
      },
      save: async () => {
        calls.push("save");
      },
    };
  }

  it("loads an existing snapshot and never saves over it", async function () {
    const f = fakes([{ outcome: "booted", id: 1 }]);
    const r = await bootWithCleanSnapshot({ hasSnapshot: true, ...f });
    expect(r).to.deep.equal({ outcome: "booted", id: 1 });
    expect(f.calls).to.deep.equal(["snapshot"]);
  });

  it("cold-boots and takes the snapshot when there is none", async function () {
    const f = fakes([{ outcome: "booted", id: 1 }]);
    const r = await bootWithCleanSnapshot({ hasSnapshot: false, ...f });
    expect(r.outcome).to.equal("booted");
    expect(f.calls).to.deep.equal(["cold", "settle", "prepare", "save"]);
  });

  it("discards an unloadable snapshot, then retries cold and retakes it", async function () {
    const f = fakes([
      { outcome: { exited: 1 }, id: 1 },
      { outcome: "booted", id: 2 },
    ]);
    const r = await bootWithCleanSnapshot({ hasSnapshot: true, ...f });
    expect(r).to.deep.equal({ outcome: "booted", id: 2 });
    expect(f.calls).to.deep.equal(["snapshot", "discard", "cold", "settle", "prepare", "save"]);
  });

  it("treats a resume that never finishes booting as a bad snapshot (self-healing)", async function () {
    // A snapshot can load yet leave the guest wedged (adb stuck offline). A
    // bad snapshot must never fail a test: discard it and boot cold.
    const f = fakes([
      { outcome: "timeout", id: 1 },
      { outcome: "booted", id: 2 },
    ]);
    const r = await bootWithCleanSnapshot({ hasSnapshot: true, ...f });
    expect(r).to.deep.equal({ outcome: "booted", id: 2 });
    expect(f.calls).to.deep.equal(["snapshot", "discard", "cold", "settle", "prepare", "save"]);
  });

  it("still boots cold when discarding the bad snapshot fails", async function () {
    const f = fakes([
      { outcome: "timeout", id: 1 },
      { outcome: "booted", id: 2 },
    ]);
    f.discard = async () => {
      f.calls.push("discard");
      throw new Error("EBUSY");
    };
    const r = await bootWithCleanSnapshot({ hasSnapshot: true, ...f });
    expect(r.outcome).to.equal("booted");
    expect(f.calls).to.deep.equal(["snapshot", "discard", "cold", "settle", "prepare", "save"]);
  });

  it("returns a failed cold boot as-is, without saving", async function () {
    const f = fakes([{ outcome: { exited: 1 }, id: 1 }]);
    const r = await bootWithCleanSnapshot({ hasSnapshot: false, ...f });
    expect(r.outcome).to.deep.equal({ exited: 1 });
    expect(f.calls).to.deep.equal(["cold"]);
  });

  it("still saves when settling fails (e.g. an Android version without the idle wait)", async function () {
    const f = fakes([{ outcome: "booted", id: 1 }]);
    f.settle = async () => {
      f.calls.push("settle");
      throw new Error("unknown command");
    };
    const r = await bootWithCleanSnapshot({ hasSnapshot: false, ...f });
    expect(r.outcome).to.equal("booted");
    expect(f.calls).to.deep.equal(["cold", "settle", "prepare", "save"]);
  });

  it("keeps a booted device when the best-effort save fails", async function () {
    const f = fakes([{ outcome: "booted", id: 1 }]);
    f.save = async () => {
      throw new Error("disk full");
    };
    const r = await bootWithCleanSnapshot({ hasSnapshot: false, ...f });
    expect(r.outcome).to.equal("booted");
  });

  it("still saves the snapshot when preparing it (installing Appium's helpers) fails", async function () {
    // Without baked helpers Appium installs them per session, as before.
    const f = fakes([{ outcome: "booted", id: 1 }]);
    f.prepare = async () => {
      f.calls.push("prepare");
      throw new Error("adb install failed");
    };
    const r = await bootWithCleanSnapshot({ hasSnapshot: false, ...f });
    expect(r.outcome).to.equal("booted");
    expect(f.calls).to.deep.equal(["cold", "settle", "prepare", "save"]);
  });
});

describe("androidEmulator: isCleanSnapshotStale (ADR 01108)", function () {
  it("is stale when it was built for another driver version, or records none", function () {
    expect(isCleanSnapshotStale({ driverVersion: "8.6.0" }, "8.7.0")).to.equal(true);
    expect(isCleanSnapshotStale(null, "8.7.0")).to.equal(true);
  });

  it("is current when the driver versions match", function () {
    expect(isCleanSnapshotStale({ driverVersion: "8.7.0" }, "8.7.0")).to.equal(false);
  });

  it("is never stale when the driver version is unknown (don't churn snapshots)", function () {
    expect(isCleanSnapshotStale({ driverVersion: "8.6.0" }, undefined)).to.equal(false);
    expect(isCleanSnapshotStale(null, undefined)).to.equal(false);
  });
});

describe("androidEmulator: findUia2Helpers (ADR 01108)", function () {
  let root;
  beforeEach(function () {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "dd-uia2-helpers-"));
  });
  afterEach(function () {
    fs.rmSync(root, { recursive: true, force: true });
  });
  const write = (p, content = "x") => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };

  it("finds the driver version, the settings helper, and the server APKs (nested layout)", function () {
    const driver = path.join(root, "node_modules", "appium-uiautomator2-driver");
    write(path.join(driver, "package.json"), JSON.stringify({ name: "appium-uiautomator2-driver", version: "8.7.0" }));
    const settings = path.join(driver, "node_modules", "io.appium.settings", "apks", "settings_apk-debug.apk");
    const server = path.join(driver, "node_modules", "appium-uiautomator2-server", "apks", "appium-uiautomator2-server-v10.6.6.apk");
    const serverTest = path.join(driver, "node_modules", "appium-uiautomator2-server", "apks", "appium-uiautomator2-server-debug-androidTest.apk");
    for (const p of [settings, server, serverTest]) write(p);
    const found = findUia2Helpers(driver);
    expect(found.driverVersion).to.equal("8.7.0");
    expect(found.apks.slice().sort()).to.deep.equal([server, serverTest, settings].sort());
  });

  it("finds hoisted helper packages next to the driver", function () {
    const nm = path.join(root, "node_modules");
    const driver = path.join(nm, "appium-uiautomator2-driver");
    write(path.join(driver, "package.json"), JSON.stringify({ name: "appium-uiautomator2-driver", version: "8.7.0" }));
    const settings = path.join(nm, "io.appium.settings", "apks", "settings_apk-debug.apk");
    const server = path.join(nm, "appium-uiautomator2-server", "apks", "appium-uiautomator2-server-v10.6.6.apk");
    for (const p of [settings, server]) write(p);
    expect(findUia2Helpers(driver).apks.slice().sort()).to.deep.equal([server, settings].sort());
  });

  it("returns null when the driver isn't there or has no helper APKs", function () {
    expect(findUia2Helpers(path.join(root, "missing"))).to.equal(null);
    const driver = path.join(root, "node_modules", "appium-uiautomator2-driver");
    write(path.join(driver, "package.json"), JSON.stringify({ name: "appium-uiautomator2-driver", version: "8.7.0" }));
    expect(findUia2Helpers(driver)).to.equal(null);
  });
});

describe("androidEmulator: planAndroidToolchain (lazy-install decision)", function () {
  const base = {
    capable: true,
    sdkPresent: true,
    requiredOsVersions: [],
    installedImages: ["system-images;android-34;google_apis;x86_64"],
    abi: "x86_64",
  };

  it("SKIPs (no install) when the host can't run the emulator", function () {
    const plan = planAndroidToolchain({ ...base, capable: false });
    expect(plan.action).to.equal("skip");
    expect(plan.reason).to.match(/can't run the Android emulator/);
  });

  it("is ready when the SDK + a matching image are already installed", function () {
    expect(planAndroidToolchain(base).action).to.equal("ready");
    expect(
      planAndroidToolchain({ ...base, requiredOsVersions: ["14"] }).action
    ).to.equal("ready");
  });

  it("INSTALLs when the SDK is absent (capable host)", function () {
    const plan = planAndroidToolchain({
      ...base,
      sdkPresent: false,
      installedImages: [],
    });
    expect(plan.action).to.equal("install");
    expect(plan.reason).to.match(/multi-GB/);
    expect(plan.reason).to.match(/install android/);
  });

  it("INSTALLs the specific missing version and names it", function () {
    const plan = planAndroidToolchain({
      ...base,
      requiredOsVersions: ["14", "13"],
    });
    // 14 is installed, 13 is not -> install 13.
    expect(plan.action).to.equal("install");
    expect(plan.osVersion).to.equal("13");
  });

  it("never installs on an incapable host even when the SDK is missing", function () {
    const plan = planAndroidToolchain({
      ...base,
      capable: false,
      sdkPresent: false,
      installedImages: [],
    });
    expect(plan.action).to.equal("skip");
  });
});

describe("androidEmulator: hostHasKvm", function () {
  it("returns false on non-Linux hosts (no cheap accel signal there)", async function () {
    if (process.platform === "linux") this.skip();
    expect(await hostHasKvm()).to.equal(false);
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

  it("drops the placeholder from the registry when the boot fails", async function () {
    const registry = createDeviceRegistry();
    let error;
    try {
      await acquireDevice({
        desc: { name: "pixel7" },
        registry,
        sdkRoot: "/sdk",
        deps: makeDeps({ boot: async () => { throw new Error("boot crashed"); } }),
      });
    } catch (e) {
      error = e;
    }
    // The failed boot rethrows AND leaves no broken placeholder wedging retries.
    expect(error?.message).to.match(/boot crashed/);
    expect(registry.size).to.equal(0);
  });

  it("reserves a boot port away from already-running emulators outside the registry", async function () {
    const registry = createDeviceRegistry();
    let bootPort;
    await acquireDevice({
      desc: { name: "brand-new" },
      registry,
      sdkRoot: "/sdk",
      deps: makeDeps({
        // A foreign emulator already on 5554/5556; the new boot must avoid them.
        listRunning: async () => [
          { udid: "emulator-5554", name: "someone-else" },
          { udid: "emulator-5556", name: "another" },
        ],
        listAvds: async () => ["brand-new"],
        boot: async (desc, port) => {
          bootPort = port;
          return { udid: `emulator-${port}`, process: {} };
        },
      }),
    });
    expect(bootPort).to.equal(5558);
  });

  it("reuses a running emulator without booting or listing AVDs (bootedByUs false)", async function () {
    let booted = false;
    let listedAvds = false;
    const registry = createDeviceRegistry();
    const res = await acquireDevice({
      desc: { name: "pixel7" },
      registry,
      sdkRoot: "/sdk",
      deps: makeDeps({
        listRunning: async () => [{ udid: "emulator-5554", name: "pixel7" }],
        // The named-reuse fast path must not shell out to `emulator -list-avds`.
        listAvds: async () => {
          listedAvds = true;
          return ["pixel7"];
        },
        boot: async () => {
          booted = true;
          return { udid: "x", process: {} };
        },
      }),
    });
    expect(res.entry.bootedByUs).to.equal(false);
    expect(booted).to.equal(false);
    expect(listedAvds, "listAvds should not be called on named reuse").to.equal(
      false
    );
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
