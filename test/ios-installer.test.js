import path from "node:path";
import { installIos } from "../dist/runtime/iosInstaller.js";
import { locateManagedWda } from "../dist/runtime/wdaProducts.js";

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
      if (level === "warn") warns.push(msg);
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
