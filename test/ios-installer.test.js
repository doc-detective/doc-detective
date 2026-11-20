import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import {
  defaultRunBuild,
  ensureManagedWda,
  installIos,
  stopWdaBuilds,
} from "../dist/runtime/iosInstaller.js";
import { installSubcommands } from "../dist/runtime/installCommand.js";
import { locateManagedWda, makeXcodeProbe } from "../dist/runtime/wdaProducts.js";
import { APP_DRIVER_PLATFORMS } from "../dist/core/tests/appSurface.js";
import { buildMobileBrowserCapabilities } from "../dist/core/tests/mobileBrowser.js";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("native app surfaces (A4): install ios", function () {
  it("dry-run returns a preview report", async function () {
    const reports = await installIos({ dryRun: true });
    expect(reports).to.have.length(1);
    expect(reports[0].action).to.equal("dry-run");
    expect((reports[0].notes || []).join(" ")).to.match(/simctl|XCUITest/i);
  });

  it("skips on non-macOS hosts", async function () {
    const reports = await installIos({
      yes: true,
      deps: { platform: "win32" },
    });
    expect(reports[0].action).to.equal("skipped");
    expect((reports[0].notes || []).join(" ")).to.match(/macOS/i);
  });

  it("requires --yes for non-dry-run checks", async function () {
    const reports = await installIos({
      deps: { platform: "darwin" },
    });
    expect(reports[0].action).to.equal("skipped");
    expect((reports[0].notes || []).join(" ")).to.match(/--yes/);
  });

  it("reports up-to-date when xcode-select and simctl are available", async function () {
    const reports = await installIos({
      yes: true,
      deps: {
        platform: "darwin",
        run: () => ({ status: 0, stderr: "" }),
      },
    });
    expect(reports[0].action).to.equal("already-up-to-date");
  });

  it("skips with guidance when xcode-select is not configured", async function () {
    const reports = await installIos({
      yes: true,
      deps: {
        platform: "darwin",
        run: (command) =>
          command === "xcode-select"
            ? { status: 1, stderr: "unable to get active developer directory" }
            : { status: 0, stderr: "" },
      },
    });
    expect(reports[0].action).to.equal("skipped");
    expect((reports[0].notes || []).join(" ")).to.match(/xcode-select/i);
  });

  it("skips with guidance when simctl is unavailable", async function () {
    const reports = await installIos({
      yes: true,
      deps: {
        platform: "darwin",
        run: (command, args) =>
          command === "xcrun" && args[0] === "simctl"
            ? { status: 1, stderr: "simctl not found" }
            : { status: 0, stderr: "" },
      },
    });
    expect(reports[0].action).to.equal("skipped");
    expect((reports[0].notes || []).join(" ")).to.match(/simctl/i);
  });
});

// --- WDA prebuild (docs/design/ios-wda-prebuild.md, phase 2) ---

// The toolchain probes pass; what varies per test is the xcodebuild -version
// probe and the build pipeline stubs.
function probeRun({ xcodebuildVersion = "Xcode 16.4\nBuild version 16F6" } = {}) {
  return (command, args) => {
    if (command === "xcodebuild" && args[0] === "-version") {
      return xcodebuildVersion === null
        ? { status: 1, stderr: "xcode-select: error: tool 'xcodebuild' requires Xcode" }
        : { status: 0, stderr: "", stdout: xcodebuildVersion };
    }
    return { status: 0, stderr: "" };
  };
}

function wdaRow(reports) {
  return reports.find((r) => r.assetId === "ios-wda");
}

describe("install ios: WebDriverAgent prebuild", function () {
  it("dry-run notes that a WDA prebuild would be verified/performed", async function () {
    const reports = await installIos({ dryRun: true });
    expect((reports[0].notes || []).join(" ")).to.match(/prebuild/i);
  });

  it("skips the prebuild with guidance on a CLT-only host (no xcodebuild)", async function () {
    const reports = await installIos({
      yes: true,
      deps: {
        platform: "darwin",
        run: probeRun({ xcodebuildVersion: null }),
      },
    });
    const row = wdaRow(reports);
    expect(row, "a WDA report row is emitted").to.not.equal(undefined);
    expect(row.action).to.equal("skipped");
    expect((row.notes || []).join(" ")).to.match(/full Xcode/i);
  });

  it("skips the prebuild with upgrade guidance below the Xcode floor", async function () {
    const reports = await installIos({
      yes: true,
      deps: {
        platform: "darwin",
        run: probeRun({ xcodebuildVersion: "Xcode 13.4.1\nBuild version 13F100" }),
      },
    });
    const row = wdaRow(reports);
    expect(row.action).to.equal("skipped");
    expect((row.notes || []).join(" ")).to.match(/Xcode 13.4.1/);
    expect((row.notes || []).join(" ")).to.match(/update|upgrade/i);
  });

  it("cold host: installs the driver, builds WDA, publishes the marker, records the key", async function () {
    const env = makeWdaEnv();

    const reports = await installIos({ yes: true, deps: env.deps });
    const row = wdaRow(reports);
    expect(row.action, (row.notes || []).join(" | ")).to.equal("installed");

    expect(env.ensured, "driver install goes through the loader").to.deep.equal([
      ["appium-xcuitest-driver"],
    ]);

    expect(env.builds, "one xcodebuild build-for-testing runs").to.have.length(1);
    const [command, args] = env.builds[0];
    expect(command).to.equal("xcodebuild");
    expect(args).to.include("build-for-testing");
    expect(args).to.include(path.join(env.wdaSource, "WebDriverAgent.xcodeproj"));
    expect(args).to.include("WebDriverAgentRunner");
    expect(args).to.include("generic/platform=iOS Simulator");
    expect(args).to.include(path.join(env.keyDir, "DerivedData"));

    const marker = JSON.parse(env.fs.files.get(path.join(env.keyDir, "products.json")));
    expect(marker.key).to.equal(env.key);
    expect(marker.driverVersion).to.equal("10.8.1");
    expect(marker.xcode).to.deep.equal({ version: "16.4", build: "16F6" });
    expect(env.fs.files.has(path.join(env.keyDir, "last-used")), "last-used stamp written").to.equal(true);

    expect(env.written, "installed.json updated").to.have.length(1);
    expect(env.written[0].ios.wdaKeys).to.deep.equal([env.key]);

    expect(env.lock.released, "the writer lock is released").to.equal(true);
  });

  it("fast path: a valid marker skips the lock and the build entirely", async function () {
    const env = makeWdaEnv();
    env.seedMarker();
    env.deps.acquire = () => {
      throw new Error("must not lock on the marker fast path");
    };

    const reports = await installIos({ yes: true, deps: env.deps });
    const row = wdaRow(reports);
    expect(row.action).to.equal("already-up-to-date");
    expect(env.builds).to.have.length(0);
  });

  it("builds when the key directory's marker names another key, as the session locator would miss it", async function () {
    for (const when of ["before the lock", "under the lock"]) {
      const env = makeWdaEnv();
      const seedForeignMarker = () => {
        env.seedMarker();
        const markerPath = path.join(env.keyDir, "products.json");
        const marker = JSON.parse(env.fs.files.get(markerPath));
        env.fs.files.set(markerPath, JSON.stringify({ ...marker, key: "xcode-15.4-15F31d-driver-10.8.1" }));
      };
      if (when === "before the lock") seedForeignMarker();
      else {
        env.deps.acquire = async () => {
          seedForeignMarker();
          return { release: () => (env.lock.released = true) };
        };
      }

      const row = wdaRow(await installIos({ yes: true, deps: env.deps }));
      expect(row.action, when).to.equal("installed");
      expect(env.builds, when).to.have.length(1);
      const marker = JSON.parse(env.fs.files.get(path.join(env.keyDir, "products.json")));
      expect(marker.key, when).to.equal(env.key);
    }
  });

  it("skips when the lock wait elapses (another install is building)", async function () {
    const env = makeWdaEnv();
    env.deps.acquire = async () => null;

    const reports = await installIos({ yes: true, deps: env.deps });
    const row = wdaRow(reports);
    expect(row.action).to.equal("skipped");
    expect((row.notes || []).join(" ")).to.match(/another install/i);
    expect(env.builds).to.have.length(0);
  });

  it("contend-and-lose: finds the marker after acquiring the lock and skips the build", async function () {
    const env = makeWdaEnv();
    // The concurrent winner publishes its products while this contender
    // waits on the lock: seed the marker at acquire time, after the pre-lock
    // check has already missed.
    env.deps.acquire = async () => {
      env.seedMarker();
      return {
        release: () => {
          env.lock.released = true;
        },
      };
    };

    const reports = await installIos({ yes: true, deps: env.deps });
    const row = wdaRow(reports);
    expect(row.action).to.equal("already-up-to-date");
    expect(env.builds, "the losing contender never builds").to.have.length(0);
    expect(env.lock.released).to.equal(true);
  });

  it("retries once on a transient xcodebuild failure, then succeeds", async function () {
    const env = makeWdaEnv();
    const warns = [];
    let attempt = 0;
    env.deps.logger = (msg, level) => {
      if (level === "warning") warns.push(msg);
    };
    env.deps.sleep = async () => {};
    env.deps.runBuild = async (command, args) => {
      env.builds.push([command, args]);
      attempt += 1;
      if (attempt === 1) {
        return { status: 65, stdout: "", stderr: "Build service could not create build operation" };
      }
      env.fs.files.set(env.runnerApp, "<app>");
      return { status: 0, stdout: "", stderr: "" };
    };

    const reports = await installIos({ yes: true, deps: env.deps });
    const row = wdaRow(reports);
    expect(row.action).to.equal("installed");
    expect(env.builds).to.have.length(2);
    expect(warns.join(" ")).to.match(/transient/i);
  });

  it("does not retry a non-transient xcodebuild failure", async function () {
    const env = makeWdaEnv();
    env.deps.runBuild = async (command, args) => {
      env.builds.push([command, args]);
      return { status: 65, stdout: "", stderr: "error: no such module 'XCTest'" };
    };

    const reports = await installIos({ yes: true, deps: env.deps });
    const row = wdaRow(reports);
    expect(row.action).to.equal("skipped");
    expect(env.builds, "a real failure gets exactly one attempt").to.have.length(1);
    expect((row.notes || []).join(" ")).to.match(/no such module/);
    expect(env.lock.released).to.equal(true);
  });

  it("skips without building when the driver is below the consumption floor", async function () {
    const env = makeWdaEnv();
    env.deps.resolveDriverVersion = () => "9.9.9";

    const reports = await installIos({ yes: true, deps: env.deps });
    const row = wdaRow(reports);
    expect(row.action).to.equal("skipped");
    expect((row.notes || []).join(" ")).to.match(/9\.9\.9/);
    expect(env.builds, "products no session would consume are never built").to.have.length(0);
  });

  it("never retries a build killed at the timeout ceiling", async function () {
    const env = makeWdaEnv();
    env.deps.runBuild = async (command, args) => {
      env.builds.push([command, args]);
      // Ceiling kill: even though the text contains a transient-looking
      // signature, the timedOut flag must veto the retry.
      return {
        status: null,
        stdout: "",
        stderr: "Build service lost; xcodebuild killed at the 1200000 ms ceiling",
        timedOut: true,
      };
    };

    const reports = await installIos({ yes: true, deps: env.deps });
    const row = wdaRow(reports);
    expect(row.action).to.equal("skipped");
    expect((row.notes || []).join(" ")).to.match(/ceiling/i);
    expect(env.builds, "a ceiling kill gets exactly one attempt").to.have.length(1);
    expect(env.lock.released).to.equal(true);
  });

  it("degrades an unexpected pipeline throw to a skipped row (best-effort to the last)", async function () {
    const env = makeWdaEnv();
    env.deps.writeRecord = () => {
      throw new Error("installed.json is unwritable");
    };

    const reports = await installIos({ yes: true, deps: env.deps });
    expect(reports[0].action, "the toolchain row is unaffected").to.equal("already-up-to-date");
    const row = wdaRow(reports);
    expect(row.action).to.equal("skipped");
    expect((row.notes || []).join(" ")).to.match(/installed\.json is unwritable/);
    expect(env.lock.released, "the lock is released despite the throw").to.equal(true);
  });

  it("skips with guidance when the driver install fails", async function () {
    const env = makeWdaEnv();
    env.deps.ensureInstalled = async () => {
      throw new Error("npm exploded");
    };

    const reports = await installIos({ yes: true, deps: env.deps });
    const row = wdaRow(reports);
    expect(row.action).to.equal("skipped");
    expect((row.notes || []).join(" ")).to.match(/npm exploded/);
    expect(env.builds).to.have.length(0);
  });

  it("prunes stale and markerless siblings and reports 'updated' when the toolchain moved", async function () {
    const env = makeWdaEnv();
    const NOW = 1_752_000_000_000;
    const DAY = 24 * 60 * 60 * 1000;

    // Prior toolchain's key: valid marker, last used 45 days ago → pruned.
    const staleKey = "xcode-15.4-15F31d-driver-7.20.0";
    env.seedSibling(staleKey, { lastUsedMtime: NOW - 45 * DAY });
    // Recently-used sibling (another runner image in the pool) → kept.
    const freshKey = "xcode-16.3-16E140-driver-7.28.3";
    env.seedSibling(freshKey, { lastUsedMtime: NOW - 2 * DAY });
    // Crashed half-build: no marker → pruned.
    env.fs.dirs.add(path.join(env.wdaRootDir, "xcode-junk"));
    env.fs.files.set(
      path.join(env.wdaRootDir, "xcode-junk", "DerivedData", "partial.o"),
      "junk"
    );

    env.setRecord({
      npmPackages: {},
      browsers: {},
      ios: { wdaKeys: [staleKey, freshKey], updatedAt: "2026-06-01T00:00:00.000Z" },
    });

    const reports = await installIos({ yes: true, deps: env.deps });
    const row = wdaRow(reports);
    expect(row.action, "a new key while others were recorded = updated").to.equal("updated");

    expect(
      env.fs.files.has(path.join(env.wdaRootDir, staleKey, "products.json")),
      "45-day-unused sibling pruned"
    ).to.equal(false);
    expect(
      env.fs.files.has(path.join(env.wdaRootDir, freshKey, "products.json")),
      "recently-used sibling kept"
    ).to.equal(true);
    expect(
      env.fs.files.has(path.join(env.wdaRootDir, "xcode-junk", "DerivedData", "partial.o")),
      "markerless half-build pruned"
    ).to.equal(false);

    const recorded = env.written.at(-1).ios.wdaKeys;
    expect(recorded).to.include(env.key);
    expect(recorded).to.include(freshKey);
    expect(recorded, "installed.json never references a deleted key").to.not.include(staleKey);
  });

  it("skips (best-effort) when the build succeeds but the Runner app is missing", async function () {
    const env = makeWdaEnv({ buildCreatesRunner: false });

    const reports = await installIos({ yes: true, deps: env.deps });
    const row = wdaRow(reports);
    expect(row.action).to.equal("skipped");
    expect((row.notes || []).join(" ")).to.match(/Runner|products/i);
    expect(
      env.fs.files.has(path.join(env.keyDir, "products.json")),
      "no completeness marker for a productless build"
    ).to.equal(false);
    expect(env.lock.released).to.equal(true);
  });
});

// --- interrupts (#1005) ---

// A build that runs until its signal aborts, as a killed xcodebuild does.
function buildUntilStopped(env, result = { status: null, stdout: "", stderr: "" }) {
  env.deps.runBuild = (command, args, opts) => {
    env.builds.push([command, args]);
    return new Promise((resolve) =>
      opts.signal.addEventListener("abort", () => resolve(result))
    );
  };
}
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

describe("interrupting a WebDriverAgent build", function () {
  it("stops the build in flight, and resolves only after the lock is released", async function () {
    const env = makeWdaEnv();
    buildUntilStopped(env);
    const install = installIos({ yes: true, deps: env.deps });
    await nextTurn();
    expect(env.builds).to.have.length(1);
    expect(env.lock.released).to.equal(false);

    await stopWdaBuilds();
    expect(env.lock.released, "released before the process may exit").to.equal(true);
    expect(wdaRow(await install).action).to.equal("skipped");
    expect(
      env.fs.files.has(path.join(env.keyDir, "products.json")),
      "a half-built directory gets no completeness marker"
    ).to.equal(false);
    expect(env.written, "installed.json doesn't record it").to.have.length(0);
  });

  it("never retries an interrupted build, even when its output looks transient", async function () {
    const env = makeWdaEnv();
    env.deps.sleep = async () => {};
    buildUntilStopped(env, { status: null, stdout: "", stderr: "Build service unexpectedly quit" });
    const install = installIos({ yes: true, deps: env.deps });
    await nextTurn();

    await stopWdaBuilds();
    await install;
    expect(env.builds, "a second xcodebuild would outlive the process").to.have.length(1);
  });

  it("starts no second attempt when the interrupt lands during the retry backoff", async function () {
    const env = makeWdaEnv();
    let wake;
    env.deps.sleep = () => new Promise((resolve) => (wake = resolve));
    env.deps.runBuild = async (command, args) => {
      env.builds.push([command, args]);
      return { status: 65, stdout: "", stderr: "Build service could not create build operation" };
    };
    const install = installIos({ yes: true, deps: env.deps });
    await nextTurn();

    const stopped = stopWdaBuilds();
    wake();
    await stopped;
    expect(wdaRow(await install).action).to.equal("skipped");
    expect(env.builds).to.have.length(1);
    expect(env.lock.released).to.equal(true);
  });

  it("resolves at once with nothing to stop, and forgets a build that finished", async function () {
    await stopWdaBuilds();

    const env = makeWdaEnv();
    const build = env.deps.runBuild;
    let signal;
    env.deps.runBuild = (command, args, opts) => {
      signal = opts.signal;
      return build(command, args);
    };
    expect(wdaRow(await installIos({ yes: true, deps: env.deps })).action).to.equal("installed");
    await stopWdaBuilds();
    expect(signal.aborted, "a finished build is no longer stopped").to.equal(false);
  });

  it("`install ios` stops the build on an interrupt, then exits with the signal's code", async function () {
    // The command's interrupt handler, captured while a dry run has it registered.
    const before = process.listeners("SIGINT");
    const beforeTerm = process.listenerCount("SIGTERM");
    let onSignal;
    let termDuring;
    const log = console.log;
    console.log = () => {
      onSignal ??= process.listeners("SIGINT").find((listener) => !before.includes(listener));
      termDuring = process.listenerCount("SIGTERM");
    };
    try {
      await installSubcommands.ios.handler({ "dry-run": true });
    } finally {
      console.log = log;
    }
    expect(onSignal, "registered while the command runs").to.be.a("function");
    expect(termDuring, "for SIGTERM too").to.equal(beforeTerm + 1);
    expect(process.listeners("SIGINT"), "and removed when it returns").to.deep.equal(before);
    expect(process.listenerCount("SIGTERM")).to.equal(beforeTerm);

    const env = makeWdaEnv();
    buildUntilStopped(env);
    const install = installIos({ yes: true, deps: env.deps });
    await nextTurn();
    const exits = [];
    const lines = [];
    const exit = process.exit;
    const error = console.error;
    process.exit = (code) => exits.push({ code, lockReleased: env.lock.released });
    console.error = (line) => lines.push(line);
    try {
      onSignal("SIGINT");
      await install;
      await nextTurn();
    } finally {
      process.exit = exit;
      console.error = error;
    }
    expect(lines[0]).to.match(/^Stopping/);
    expect(exits).to.deep.equal([{ code: 130, lockReleased: true }]);
  });
});

describe("xcodebuild runner (the spawn site)", function () {
  // A child process that does only what the test tells it to.
  function fakeChild() {
    const child = new EventEmitter();
    child.pid = 4242;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = [];
    child.kill = (signal) => child.killed.push(signal);
    return child;
  }
  function start(opts, kill) {
    const child = fakeChild();
    const kills = [];
    const spawned = [];
    const result = defaultRunBuild("xcodebuild", ["build-for-testing"], opts, {
      spawn: (command, args, options) => {
        spawned.push({ command, args, options });
        return child;
      },
      kill: kill ?? ((pid, signal) => kills.push([pid, signal])),
    });
    return { child, kills, spawned, result };
  }

  it("gives xcodebuild its own process group, and reports how it closed", async function () {
    const { child, kills, spawned, result } = start();
    expect(spawned[0].options.detached).to.equal(true);
    child.stdout.emit("data", "out");
    child.stderr.emit("data", "err");
    child.emit("close", 0);

    expect(await result).to.deep.equal({ status: 0, stdout: "out", stderr: "err", timedOut: false });
    expect(kills).to.deep.equal([]);
  });

  it("kills the whole process group when its signal aborts", async function () {
    const stop = new AbortController();
    const { child, kills, result } = start({ signal: stop.signal });
    expect(kills).to.deep.equal([]);

    stop.abort();
    expect(kills, "a negative pid addresses the group").to.deep.equal([[-4242, "SIGKILL"]]);
    child.emit("close", null);
    expect(await result).to.include({ status: null, timedOut: false });
  });

  it("kills at once when the signal aborted before the spawn", function () {
    const stop = new AbortController();
    stop.abort();
    expect(start({ signal: stop.signal }).kills).to.deep.equal([[-4242, "SIGKILL"]]);
  });

  it("stops listening for the abort once the build has closed", async function () {
    const stop = new AbortController();
    const { child, kills, result } = start({ signal: stop.signal });
    child.emit("close", 0);
    await result;

    stop.abort();
    expect(kills, "the pid may belong to another process by now").to.deep.equal([]);
  });

  it("still kills the group at the timeout ceiling", async function () {
    const { child, kills, result } = start({ timeoutMs: 5 });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(kills).to.deep.equal([[-4242, "SIGKILL"]]);
    child.emit("close", null);

    const build = await result;
    expect(build.timedOut).to.equal(true);
    expect(build.stderr).to.match(/5 ms ceiling/);
  });

  it("kills the child alone when the group can't be signaled", function () {
    const stop = new AbortController();
    const { child } = start({ signal: stop.signal }, () => {
      throw Object.assign(new Error("kill ESRCH"), { code: "ESRCH" });
    });
    stop.abort();
    expect(child.killed).to.deep.equal(["SIGKILL"]);
  });

  it("rejects when xcodebuild can't start", async function () {
    const { child, result } = start();
    child.emit("error", new Error("spawn xcodebuild ENOENT"));
    let thrown;
    await result.catch((error) => (thrown = error));
    expect(thrown?.message).to.match(/ENOENT/);
  });

  it("takes down what the build spawned, with real processes", async function () {
    // Windows has no process groups, and the build runs only on macOS.
    if (process.platform === "win32") this.skip();
    const stop = new AbortController();
    let child;
    // The shell starts a background `sleep`, which inherits the output pipes.
    const result = defaultRunBuild(
      "sh",
      ["-c", "sleep 30 & echo started; wait"],
      { signal: stop.signal },
      { spawn: (...args) => (child = spawn(...args)) }
    );
    await new Promise((resolve) => child.stdout.once("data", resolve));

    stop.abort();
    // The build closes once every holder of its output pipes is gone. Killing
    // the shell alone would leave `sleep` holding them until this test timed out.
    expect(await result).to.include({ status: null, stdout: "started\n" });
  });
});

// --- session-time managed-products locator (design phase 3) ---

describe("managed WDA locator (session consumption)", function () {
  const NOW = 1_752_000_000_000;

  function makeLocatorEnv() {
    const env = makeWdaEnv();
    return {
      ...env,
      options: {
        wdaRootDir: env.wdaRootDir,
        fs: env.fs,
        platform: "darwin",
        probeXcode: () => ({ version: "16.4", build: "16F6" }),
        resolveDriverVersion: () => "10.8.1",
        now: () => NOW,
      },
      // The seeded marker must match the locator's driver version.
      seedMarker() {
        env.seedMarker.call(env);
        const markerPath = path.join(env.keyDir, "products.json");
        const marker = JSON.parse(env.fs.files.get(markerPath));
        env.fs.files.set(
          markerPath,
          JSON.stringify({ ...marker, key: env.key, driverVersion: "10.8.1" })
        );
      },
    };
  }

  // The seeded env key encodes driver 7.28.3; the locator env uses 10.8.1,
  // so recompute the expected key for hits.
  const HIT_KEY = "xcode-16.4-16F6-driver-10.8.1";

  it("returns the keyed DerivedData path on a valid marker hit and touches last-used", function () {
    const env = makeLocatorEnv();
    const keyDir = path.join(env.wdaRootDir, HIT_KEY);
    const runnerApp = path.join(
      keyDir,
      "DerivedData",
      "Build",
      "Products",
      "Debug-iphonesimulator",
      "WebDriverAgentRunner-Runner.app"
    );
    env.fs.files.set(runnerApp, "<app>");
    env.fs.files.set(
      path.join(keyDir, "products.json"),
      JSON.stringify({
        key: HIT_KEY,
        driverVersion: "10.8.1",
        xcode: { version: "16.4", build: "16F6" },
        runnerApp,
        builtAt: "2026-07-01T00:00:00.000Z",
      })
    );

    const hit = locateManagedWda(env.options);
    expect(hit).to.not.equal(null);
    expect(hit.derivedDataPath).to.equal(path.join(keyDir, "DerivedData"));
    expect(hit.key).to.equal(HIT_KEY);
    expect(
      env.fs.files.get(path.join(keyDir, "last-used")),
      "reader touches the last-used stamp"
    ).to.equal(String(NOW));
  });

  it("returns the runner app for direct launch only on driver 12+ (ADR 01110)", function () {
    for (const [driverVersion, direct] of [["12.15.0", true], ["10.8.1", false]]) {
      const env = makeLocatorEnv();
      env.options.resolveDriverVersion = () => driverVersion;
      const key = `xcode-16.4-16F6-driver-${driverVersion}`;
      const keyDir = path.join(env.wdaRootDir, key);
      const runnerApp = path.join(keyDir, "DerivedData", "Build", "Products",
        "Debug-iphonesimulator", "WebDriverAgentRunner-Runner.app");
      env.fs.files.set(runnerApp, "<app>");
      env.fs.files.set(path.join(keyDir, "products.json"), JSON.stringify({
        key, driverVersion, xcode: { version: "16.4", build: "16F6" }, runnerApp,
        builtAt: "2026-07-01T00:00:00.000Z",
      }));

      const hit = locateManagedWda(env.options);
      expect(hit, driverVersion).to.not.equal(null);
      expect(hit.runnerAppPath, driverVersion).to.equal(direct ? runnerApp : undefined);
    }
  });

  it("hits on a relocated cache: marker's stale absolute path is ignored, layout wins", function () {
    const env = makeLocatorEnv();
    const keyDir = path.join(env.wdaRootDir, HIT_KEY);
    const layoutRunnerApp = path.join(
      keyDir,
      "DerivedData",
      "Build",
      "Products",
      "Debug-iphonesimulator",
      "WebDriverAgentRunner-Runner.app"
    );
    env.fs.files.set(layoutRunnerApp, "<app>");
    env.fs.files.set(
      path.join(keyDir, "products.json"),
      JSON.stringify({
        key: HIT_KEY,
        driverVersion: "10.8.1",
        // Recorded on a host whose cache root no longer exists — must not
        // invalidate products that are intact at the layout-relative path.
        runnerApp: "/old-machine/dd-cache/ios/wda/x/DerivedData/.../Runner.app",
        builtAt: "2026-07-01T00:00:00.000Z",
      })
    );

    const hit = locateManagedWda(env.options);
    expect(hit, "relocated caches keep their valid products").to.not.equal(null);
    expect(hit.derivedDataPath).to.equal(path.join(keyDir, "DerivedData"));
  });

  it("returns null when no marker exists for the current key", function () {
    const env = makeLocatorEnv();
    expect(locateManagedWda(env.options)).to.equal(null);
  });

  it("returns null when the marker's Runner app is gone (stale marker)", function () {
    const env = makeLocatorEnv();
    const keyDir = path.join(env.wdaRootDir, HIT_KEY);
    env.fs.files.set(
      path.join(keyDir, "products.json"),
      JSON.stringify({
        key: HIT_KEY,
        driverVersion: "10.8.1",
        xcode: { version: "16.4", build: "16F6" },
        runnerApp: path.join(keyDir, "gone.app"),
        builtAt: "2026-07-01T00:00:00.000Z",
      })
    );
    expect(locateManagedWda(env.options)).to.equal(null);
  });

  it("returns null below the supported driver floor (no guessing on old drivers)", function () {
    const env = makeLocatorEnv();
    env.options.resolveDriverVersion = () => "9.9.9";
    expect(locateManagedWda(env.options)).to.equal(null);
  });

  it("returns null when the driver version is unresolvable", function () {
    const env = makeLocatorEnv();
    env.options.resolveDriverVersion = () => null;
    expect(locateManagedWda(env.options)).to.equal(null);
  });

  it("returns null when Xcode is not probeable", function () {
    const env = makeLocatorEnv();
    env.options.probeXcode = () => null;
    expect(locateManagedWda(env.options)).to.equal(null);
  });

  it("returns null off macOS without touching any effect", function () {
    const env = makeLocatorEnv();
    env.options.platform = "win32";
    env.options.probeXcode = () => {
      throw new Error("must not probe off darwin");
    };
    expect(locateManagedWda(env.options)).to.equal(null);
  });
});

describe("Xcode version probe", function () {
  const answer = { status: 0, stdout: "Xcode 16.4\nBuild version 16F6" };

  it("asks again after a probe that timed out or couldn't start", function () {
    for (const noAnswer of [
      () => ({ status: null }),
      () => {
        throw new Error("spawn failed");
      },
    ]) {
      const runs = [noAnswer, () => answer];
      const probe = makeXcodeProbe(() => runs.shift()());

      expect(probe(), "no answer says nothing about Xcode").to.equal(null);
      expect(probe(), "the next call asks again").to.deep.equal({ version: "16.4", build: "16F6" });
    }
  });

  it("asks once when the command answered, whatever the answer", function () {
    for (const [result, expected] of [
      [answer, { version: "16.4", build: "16F6" }],
      // Command Line Tools without Xcode: a real answer, and it won't change.
      [{ status: 1, stdout: "" }, null],
    ]) {
      let calls = 0;
      const probe = makeXcodeProbe(() => {
        calls += 1;
        return result;
      });

      expect(probe()).to.deep.equal(expected);
      expect(probe()).to.deep.equal(expected);
      expect(calls).to.equal(1);
    }
  });
});

// --- first-use build during a test run (ADR 01214) ---

describe("first-use WebDriverAgent build (ADR 01214)", function () {
  const BUILDING =
    "No WebDriverAgent build is cached for this Xcode version, so Doc Detective is building one. The first build takes about 10 minutes. Run `doc-detective install ios --yes` ahead of time to skip the wait.";
  const UNRECORDED =
    "Couldn't update the cache record after building WebDriverAgent, so `installed.json` may not list this build.";
  const FAILED =
    "Couldn't build WebDriverAgent before the test, so Appium builds it during the session.";

  // The prebuild fakes, plus the session locator's Xcode probe and a record
  // of what the run was warned about.
  function makeFirstUseEnv(options) {
    const env = makeWdaEnv(options);
    env.deps.probeXcode = () => ({ version: "16.4", build: "16F6" });
    env.warned = [];
    env.ensure = (overrides = {}) =>
      ensureManagedWda({
        scope: env,
        warn: (message) => env.warned.push(message),
        env: {},
        deps: env.deps,
        ...overrides,
      });
    // What an iOS session builder would see after the helper ran.
    env.locate = () =>
      locateManagedWda({
        wdaRootDir: env.wdaRootDir,
        fs: env.fs,
        platform: "darwin",
        probeXcode: env.deps.probeXcode,
        resolveDriverVersion: env.deps.resolveDriverVersion,
      });
    return env;
  }

  // The capabilities each kind of iOS session would send to Appium, given the
  // locator the runner passes in. The builders read the derived-data override
  // from the real environment, so clear it for the call.
  function sessionCapabilities(env) {
    const saved = process.env.DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH;
    delete process.env.DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH;
    try {
      return {
        app: APP_DRIVER_PLATFORMS.ios.buildCapabilities(
          { app: "com.apple.Preferences" },
          "com.apple.Preferences",
          { udid: "SIM", locateWda: env.locate }
        ),
        web: buildMobileBrowserCapabilities({
          platform: "ios",
          udid: "SIM",
          cacheDir: "/cache",
          locateWda: env.locate,
        }),
      };
    } finally {
      if (saved !== undefined) process.env.DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH = saved;
    }
  }
  function expectManaged(env, capabilities) {
    for (const kind of ["app", "web"]) {
      expect(capabilities[kind]["appium:derivedDataPath"], kind).to.equal(
        path.join(env.keyDir, "DerivedData")
      );
      expect(capabilities[kind]["appium:usePrebuiltWDA"], kind).to.equal(true);
    }
  }

  // Any effect at all means the helper went too far.
  function forbidEffects(env) {
    const never = (what) => () => {
      throw new Error(`must not ${what}`);
    };
    env.deps.probeXcode = never("probe Xcode");
    env.deps.run = never("run a command");
    env.deps.ensureInstalled = never("install the driver");
    env.deps.acquire = never("take the lock");
    env.deps.runBuild = never("build");
  }

  it("builds nothing when a managed build is already cached", async function () {
    const env = makeFirstUseEnv();
    env.seedMarker();

    expect(await env.ensure()).to.deep.equal([]);
    expect(env.warned).to.deep.equal([]);
    expect(env.builds).to.have.length(0);
  });

  it("warns, builds, and leaves managed products for the session on a miss", async function () {
    const env = makeFirstUseEnv();

    expect(await env.ensure()).to.deep.equal([BUILDING]);
    expect(env.warned, "the terminal hears it once").to.deep.equal([BUILDING]);
    expect(env.builds).to.have.length(1);
    expect(env.written.at(-1).ios.wdaKeys, "installed.json records the key").to.deep.equal([env.key]);
    expect(env.lock.released, "the WebDriverAgent lock is released").to.equal(true);

    // Both kinds of iOS session then start on the managed build.
    expectManaged(env, sessionCapabilities(env));
  });

  it("doesn't call a build failed when another process finished it during the lock wait", async function () {
    const env = makeFirstUseEnv();
    env.deps.acquire = async () => {
      env.seedMarker();
      return null;
    };

    expect(await env.ensure()).to.deep.equal([BUILDING]);
    expect(env.builds).to.have.length(0);
    expectManaged(env, sessionCapabilities(env));
  });

  it("says the record wasn't updated, not that the build failed, when only the record write fails", async function () {
    const cases = [
      [Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" }), "The cache directory isn't writable."],
      [Object.assign(new Error("ENOSPC"), { code: "ENOSPC" }), "The disk is full."],
      [new Error("boom"), "An unexpected error stopped the update."],
    ];
    for (const [error, cause] of cases) {
      const env = makeFirstUseEnv();
      env.deps.writeRecord = () => {
        throw error;
      };

      expect(await env.ensure(), cause).to.deep.equal([BUILDING, `${UNRECORDED} ${cause}`]);
      expect(env.warned, cause).to.deep.equal([BUILDING, `${UNRECORDED} ${cause}`]);
      // The build itself is fine, so the session uses it.
      expectManaged(env, sessionCapabilities(env));
    }
  });

  it("doesn't blame the record when the build failed earlier and another process published it", async function () {
    const env = makeFirstUseEnv();
    env.deps.acquire = async () => {
      // This process can't take the lock, and a process that can has built.
      env.seedMarker();
      throw Object.assign(new Error("EACCES: permission denied, mkdir"), { code: "EACCES" });
    };

    expect(await env.ensure()).to.deep.equal([BUILDING]);
    expectManaged(env, sessionCapabilities(env));
  });

  it("builds with the Xcode version it already checked, without asking again", async function () {
    const env = makeFirstUseEnv();
    // A second `xcodebuild -version` that fails must not read as "no Xcode".
    env.deps.run = probeRun({ xcodebuildVersion: null });

    expect(await env.ensure()).to.deep.equal([BUILDING]);
    expect(env.builds).to.have.length(1);
    expect(env.locate().key).to.equal(env.key);
  });

  it("tries again in the same run after an Xcode probe that didn't answer", async function () {
    const env = makeFirstUseEnv();
    let answers = false;
    env.deps.probeXcode = () => (answers ? { version: "16.4", build: "16F6" } : null);

    expect(await env.ensure(), "no answer: build nothing").to.deep.equal([]);
    expect(env.builds).to.have.length(0);
    answers = true;
    expect(await env.ensure(), "the next context builds").to.deep.equal([BUILDING]);
    expect(env.builds).to.have.length(1);
  });

  it("builds nothing when DOC_DETECTIVE_NO_IOS_AUTOINSTALL is on", async function () {
    for (const value of ["1", "true", "yes", "on"]) {
      const env = makeFirstUseEnv();
      forbidEffects(env);

      const warnings = await env.ensure({ env: { DOC_DETECTIVE_NO_IOS_AUTOINSTALL: value } });
      expect(warnings, value).to.deep.equal([]);
      expect(env.warned, value).to.deep.equal([]);
    }
  });

  it("reads the opt-out before it touches the real host", async function () {
    // No injected effects at all: on a Mac this would probe Xcode and build.
    const warnings = await ensureManagedWda({
      scope: {},
      env: { DOC_DETECTIVE_NO_IOS_AUTOINSTALL: "1" },
    });
    expect(warnings).to.deep.equal([]);
  });

  it("still builds when DOC_DETECTIVE_NO_IOS_AUTOINSTALL is off", async function () {
    const env = makeFirstUseEnv();
    expect(await env.ensure({ env: { DOC_DETECTIVE_NO_IOS_AUTOINSTALL: "0" } })).to.deep.equal([BUILDING]);
    expect(env.builds).to.have.length(1);
  });

  it("builds nothing when DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH supplies a build", async function () {
    const env = makeFirstUseEnv();
    forbidEffects(env);

    const warnings = await env.ensure({
      env: { DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH: " /Users/me/wda " },
    });
    expect(warnings).to.deep.equal([]);
    expect(env.warned).to.deep.equal([]);
  });

  it("treats a blank DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH as unset", async function () {
    const env = makeFirstUseEnv();
    expect(await env.ensure({ env: { DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH: "  " } })).to.deep.equal([BUILDING]);
  });

  it("builds nothing off macOS", async function () {
    const env = makeFirstUseEnv();
    forbidEffects(env);
    env.deps.platform = "win32";

    expect(await env.ensure()).to.deep.equal([]);
    expect(env.warned).to.deep.equal([]);
  });

  it("builds nothing, silently, when Xcode or the driver is too old for the managed build", async function () {
    const tooOld = [
      ["no full Xcode", (env) => (env.deps.probeXcode = () => null)],
      ["Xcode below the floor", (env) => (env.deps.probeXcode = () => ({ version: "13.4.1", build: "13F100" }))],
      ["driver below the floor", (env) => (env.deps.resolveDriverVersion = () => "9.9.9")],
      ["driver not installed", (env) => (env.deps.resolveDriverVersion = () => null)],
    ];
    for (const [label, arrange] of tooOld) {
      const env = makeFirstUseEnv();
      arrange(env);

      expect(await env.ensure(), label).to.deep.equal([]);
      expect(env.warned, label).to.deep.equal([]);
      expect(env.builds, label).to.have.length(0);
    }
  });

  it("warns again and falls back to Appium's own build when the build fails", async function () {
    const env = makeFirstUseEnv();
    const debug = [];
    env.deps.logger = (message) => debug.push(message);
    env.deps.runBuild = async (command, args) => {
      env.builds.push([command, args]);
      return { status: 65, stdout: "", stderr: "error: no such module 'XCTest'" };
    };

    const failure = `${FAILED} \`xcodebuild\` exited with an error.`;
    expect(await env.ensure()).to.deep.equal([BUILDING, failure]);
    expect(env.warned).to.deep.equal([BUILDING, failure]);
    expect(env.locate(), "the session gets no managed products").to.equal(null);
    expect(debug.join("\n"), "the build output stays in the debug log").to.match(/no such module/);
    expect(env.lock.released).to.equal(true);
  });

  it("names each cause of a failed build in words", async function () {
    const causes = [
      [
        (env) => (env.deps.acquire = async () => null),
        "Another process held the WebDriverAgent build lock for the whole wait.",
      ],
      [
        (env) =>
          (env.deps.runBuild = async () => ({ status: null, stdout: "", stderr: "killed", timedOut: true })),
        "The build didn't finish within 20 minutes.",
      ],
      [
        (env) => (env.deps.runBuild = async () => ({ status: 0, stdout: "", stderr: "" })),
        "The build finished without the WebDriverAgent runner app.",
      ],
      [
        (env) => (env.deps.resolveDriverPath = () => "/elsewhere/appium-xcuitest-driver/build/index.js"),
        "The WebDriverAgent source wasn't found under the installed `appium-xcuitest-driver`.",
      ],
      [
        (env) => (env.deps.resolveDriverPath = () => null),
        "The `appium-xcuitest-driver` package wasn't found after its install.",
      ],
      [
        (env) =>
          (env.deps.ensureInstalled = async () => {
            throw new Error("npm exploded");
          }),
        "The `appium-xcuitest-driver` install failed.",
      ],
      [
        (env) => {
          const mkdirSync = env.fs.mkdirSync;
          env.fs.mkdirSync = (p, opts) => {
            if (p.endsWith("DerivedData")) throw new Error("ENOSPC: no space left on device");
            return mkdirSync(p, opts);
          };
        },
        "An unexpected error stopped the build.",
      ],
    ];
    for (const [arrange, cause] of causes) {
      const env = makeFirstUseEnv();
      arrange(env);

      expect(await env.ensure(), cause).to.deep.equal([BUILDING, `${FAILED} ${cause}`]);
    }
  });

  it("adds no fallback warning when an interrupt stops the build", async function () {
    const env = makeFirstUseEnv();
    buildUntilStopped(env);
    const ensuring = env.ensure();
    await nextTurn();

    await stopWdaBuilds();
    expect(await ensuring, "the run is stopping, so no session follows").to.deep.equal([BUILDING]);
    expect(env.warned).to.deep.equal([BUILDING]);
    expect(env.locate(), "and no session would take the half-built directory").to.equal(null);
    expect(env.lock.released).to.equal(true);
  });

  it("builds once per run: concurrent contexts share the build, later ones don't retry a failure", async function () {
    const env = makeFirstUseEnv();
    let finishBuild;
    env.deps.runBuild = (command, args) => {
      env.builds.push([command, args]);
      return new Promise((resolve) => {
        finishBuild = () => resolve({ status: 65, stdout: "", stderr: "error: broken" });
      });
    };

    const first = env.ensure();
    const second = env.ensure();
    // Both contexts are now waiting on the one build.
    await new Promise((resolve) => setImmediate(resolve));
    finishBuild();
    const failure = `${FAILED} \`xcodebuild\` exited with an error.`;
    expect(await first).to.deep.equal([BUILDING, failure]);
    expect(await second, "the waiting context reports the same warnings").to.deep.equal([BUILDING, failure]);
    expect(env.warned, "the terminal hears each warning once").to.deep.equal([BUILDING, failure]);
    expect(env.builds).to.have.length(1);

    expect(await env.ensure(), "a later context in the same run doesn't rebuild").to.deep.equal([]);
    expect(env.builds).to.have.length(1);

    env.deps.runBuild = async (command, args) => {
      env.builds.push([command, args]);
      return { status: 65, stdout: "", stderr: "error: broken" };
    };
    expect(await env.ensure({ scope: {} }), "the next run tries again").to.have.length(2);
    expect(env.builds).to.have.length(2);
  });
});

// Full fake environment for the prebuild pipeline. Everything effectful is
// injected: probe run, async build runner, loader ensure/resolve, fs,
// lock, installed.json record IO, and the clock.
function makeWdaEnv({ buildCreatesRunner = true } = {}) {
  const fs = makeInstallerFsFake();
  const wdaRootDir = "/cache/ios/wda";
  const driverEntry =
    "/rt/node_modules/appium-xcuitest-driver/build/index.js";
  const wdaSource =
    "/rt/node_modules/appium-xcuitest-driver/node_modules/appium-webdriveragent";
  fs.files.set(path.join(wdaSource, "WebDriverAgent.xcodeproj"), "<proj>");

  const key = "xcode-16.4-16F6-driver-10.8.1";
  const keyDir = path.join(wdaRootDir, key);
  const runnerApp = path.join(
    keyDir,
    "DerivedData",
    "Build",
    "Products",
    "Debug-iphonesimulator",
    "WebDriverAgentRunner-Runner.app"
  );

  const ensured = [];
  const builds = [];
  const written = [];
  const lock = { released: false };
  let record = { npmPackages: {}, browsers: {} };

  const env = {
    fs,
    wdaRootDir,
    wdaSource,
    key,
    keyDir,
    runnerApp,
    ensured,
    builds,
    written,
    lock,
    seedMarker() {
      fs.dirs.add(keyDir);
      fs.files.set(runnerApp, "<app>");
      fs.files.set(
        path.join(keyDir, "products.json"),
        JSON.stringify({
          key,
          driverVersion: "10.8.1",
          xcode: { version: "16.4", build: "16F6" },
          runnerApp,
          builtAt: "2026-07-01T00:00:00.000Z",
        })
      );
      fs.files.set(path.join(keyDir, "last-used"), "1000");
    },
    // A completed sibling key dir with a controllable last-used mtime.
    seedSibling(siblingKey, { lastUsedMtime }) {
      const dir = path.join(wdaRootDir, siblingKey);
      const app = path.join(
        dir,
        "DerivedData",
        "Build",
        "Products",
        "Debug-iphonesimulator",
        "WebDriverAgentRunner-Runner.app"
      );
      fs.dirs.add(dir);
      fs.files.set(app, "<app>");
      fs.files.set(
        path.join(dir, "products.json"),
        JSON.stringify({
          key: siblingKey,
          driverVersion: "x",
          xcode: { version: "x", build: "x" },
          runnerApp: app,
          builtAt: "2026-06-01T00:00:00.000Z",
        })
      );
      fs.files.set(path.join(dir, "last-used"), String(lastUsedMtime));
      fs.mtimes.set(path.join(dir, "last-used"), lastUsedMtime);
    },
    setRecord(r) {
      record = r;
    },
    deps: {
      platform: "darwin",
      run: probeRun(),
      ensureInstalled: async (packages) => {
        ensured.push(packages);
      },
      resolveDriverPath: () => driverEntry,
      resolveDriverVersion: () => "10.8.1",
      fs,
      wdaRootDir,
      acquire: async () => ({
        release: () => {
          lock.released = true;
        },
      }),
      runBuild: async (command, args) => {
        builds.push([command, args]);
        if (buildCreatesRunner) fs.files.set(runnerApp, "<app>");
        return { status: 0, stdout: "", stderr: "" };
      },
      readRecord: () => record,
      writeRecord: (r) => {
        written.push(JSON.parse(JSON.stringify(r)));
        record = r;
      },
      now: () => 1_752_000_000_000,
    },
  };
  return env;
}

// In-memory fs fake for the installer pipeline (superset of the lock test's
// fake: adds existsSync/renameSync/readdirSync/statSync).
function makeInstallerFsFake() {
  const dirs = new Set();
  const files = new Map();
  const mtimes = new Map();
  const err = (code) => Object.assign(new Error(code), { code });
  const exists = (p) =>
    dirs.has(p) ||
    files.has(p) ||
    [...dirs].some((d) => d.startsWith(p + path.sep)) ||
    [...files.keys()].some((f) => f.startsWith(p + path.sep));
  return {
    dirs,
    files,
    mtimes,
    existsSync: exists,
    mkdirSync(p, opts = {}) {
      if (!opts.recursive && dirs.has(p)) throw err("EEXIST");
      dirs.add(p);
    },
    writeFileSync(p, data) {
      files.set(p, String(data));
      mtimes.set(p, 1_752_000_000_000);
    },
    readFileSync(p) {
      if (!files.has(p)) throw err("ENOENT");
      return files.get(p);
    },
    renameSync(from, to) {
      if (!files.has(from)) throw err("ENOENT");
      files.set(to, files.get(from));
      mtimes.set(to, mtimes.get(from));
      files.delete(from);
      mtimes.delete(from);
    },
    rmSync(p, opts = {}) {
      let removed = dirs.delete(p);
      for (const d of [...dirs]) {
        if (d.startsWith(p + path.sep)) {
          dirs.delete(d);
          removed = true;
        }
      }
      for (const f of [...files.keys()]) {
        if (f === p || f.startsWith(p + path.sep)) {
          files.delete(f);
          mtimes.delete(f);
          removed = true;
        }
      }
      if (!removed && !opts.force) throw err("ENOENT");
    },
    readdirSync(p) {
      const names = new Set();
      for (const entry of [...dirs, ...files.keys()]) {
        if (entry.startsWith(p + path.sep)) {
          names.add(entry.slice(p.length + 1).split(path.sep)[0]);
        }
      }
      return [...names];
    },
    statSync(p) {
      if (!files.has(p) && !dirs.has(p)) throw err("ENOENT");
      return { mtimeMs: mtimes.get(p) ?? 0 };
    },
  };
}
