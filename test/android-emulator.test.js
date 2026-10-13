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
  cleanSnapshotSaveCommands,
  saveCleanSnapshotWith,
  CLEAN_SNAPSHOT_NAME,
  waitForBootCompleted,
  waitForProcessExit,
  shutdownEmulatorWith,
  adbPathForSdkRoot,
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

  it("resolves true immediately for a process already killed by a signal", async function () {
    // Node leaves exitCode null when a signal ends a child (signalCode is
    // set instead); its exit event may have fired before we attach.
    const p = fakeProc(null);
    p.signalCode = "SIGKILL";
    expect(await waitForProcessExit(p, 1000)).to.equal(true);
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

  it("always releases the stdio pipes, even when waiting or force-killing throws", async function () {
    const f = fakes(false, false);
    f.waitExit = async () => {
      f.calls.push("wait");
      throw new Error("wait failed");
    };
    let threw = false;
    try {
      await shutdownEmulatorWith(f);
    } catch {
      threw = true;
    }
    expect(threw).to.equal(true);
    expect(f.calls).to.include("release");
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

describe("androidEmulator: saveCleanSnapshotWith (ADR 01106)", function () {
  it("saves after the console confirms the delete (it answers OK even when there's nothing to delete)", async function () {
    const ran = [];
    const saved = await saveCleanSnapshotWith(async (args) => {
      ran.push(args[4] + " " + args[5]);
      return { stdout: "OK\r\n" };
    }, "emulator-5554");
    expect(saved).to.equal(true);
    expect(ran).to.deep.equal(["snapshot delete", "snapshot save"]);
  });

  it("reports a save the console didn't confirm as not saved", async function () {
    // e.g. disk full mid-write: callers must not record metadata for it.
    const saved = await saveCleanSnapshotWith(async (args) => ({
      stdout: args[5] === "delete" ? "OK\r\n" : "KO: could not save snapshot",
    }), "emulator-5554");
    expect(saved).to.equal(false);
  });

  it("skips the save when the delete isn't confirmed, so a leftover can't make a bad snapshot", async function () {
    const ran = [];
    const saved = await saveCleanSnapshotWith(async (args) => {
      ran.push(args[5]);
      return { stdout: "KO: device not responding" };
    }, "emulator-5554");
    expect(saved).to.equal(false);
    expect(ran).to.deep.equal(["delete"]);
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
    expect(f.calls).to.deep.equal(["cold", "settle", "save"]);
  });

  it("discards an unloadable snapshot, then retries cold and retakes it", async function () {
    const f = fakes([
      { outcome: { exited: 1 }, id: 1 },
      { outcome: "booted", id: 2 },
    ]);
    const r = await bootWithCleanSnapshot({ hasSnapshot: true, ...f });
    expect(r).to.deep.equal({ outcome: "booted", id: 2 });
    expect(f.calls).to.deep.equal(["snapshot", "discard", "cold", "settle", "save"]);
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
    expect(f.calls).to.deep.equal(["snapshot", "discard", "cold", "settle", "save"]);
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
    expect(f.calls).to.deep.equal(["snapshot", "discard", "cold", "settle", "save"]);
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
    expect(f.calls).to.deep.equal(["cold", "settle", "save"]);
  });

  it("keeps a booted device when the best-effort save fails", async function () {
    const f = fakes([{ outcome: "booted", id: 1 }]);
    f.save = async () => {
      throw new Error("disk full");
    };
    const r = await bootWithCleanSnapshot({ hasSnapshot: false, ...f });
    expect(r.outcome).to.equal("booted");
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

  it("teardown shuts its emulators down concurrently, not one after another", async function () {
    // Graceful shutdowns take seconds each; a multi-device run shouldn't pay
    // their sum. Each fake kill finishes only once BOTH have started.
    const registry = createDeviceRegistry();
    registry.set("a", { name: "a", udid: "emulator-5554", bootedByUs: true, sdkRoot: "/sdk" });
    registry.set("b", { name: "b", udid: "emulator-5556", bootedByUs: true, sdkRoot: "/sdk" });
    let started = 0;
    let bothStarted;
    const barrier = new Promise((r) => (bothStarted = r));
    const kill = async () => {
      if (++started === 2) bothStarted();
      await barrier;
    };
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("kills ran sequentially")), 1000)
    );
    await Promise.race([teardownDeviceRegistry(registry, kill), timeout]);
    expect(registry.size).to.equal(0);
  });
});

describe("androidEmulator: adbPathForSdkRoot", function () {
  it("uses the SDK's platform-tools adb when it's there, else adb on PATH (as boot does)", function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dd-adb-path-"));
    try {
      expect(adbPathForSdkRoot(root)).to.equal("adb");
      const adb = path.join(root, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb");
      fs.mkdirSync(path.dirname(adb), { recursive: true });
      fs.writeFileSync(adb, "");
      expect(adbPathForSdkRoot(root)).to.equal(adb);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
