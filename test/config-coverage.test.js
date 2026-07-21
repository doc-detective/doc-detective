// Hermetic unit coverage for src/core/config.ts (compiled dist/core/config.js).
// Phase 9 coverage-ratchet: no network, no real browser/driver spawns, fully
// deterministic. Environment-probe functions are driven through their public
// entry points against fresh empty tmpdir cache dirs (so the read-only browser
// scan and `appium driver list` resolve to "nothing installed" quickly and
// offline). Where a branch keys off installed.json contents, we write a real
// record into the temp cache dir. os/fs helpers reached through the imported
// namespace objects are stubbed with sinon and restored in afterEach.

import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import sinon from "sinon";

import {
  setConfig,
  getAvailableApps,
  getBrowserDiagnostics,
  getEnvironment,
  resolveConcurrentRunners,
  clearAppCache,
  patchAppCache,
  verifyAppDrivers,
  detectInstalledBrowserDrivers,
} from "../dist/core/config.js";

// A throwaway cache dir per test keeps getAvailableApps / getBrowserDiagnostics
// isolated from any real install and from each other's module-level cache.
function freshCacheDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dd-config-cov-"));
}

const tmpDirs = [];
function trackedTmpDir() {
  const d = freshCacheDir();
  tmpDirs.push(d);
  return d;
}

afterEach(function () {
  sinon.restore();
  // Ensure module-level app cache never leaks across tests.
  clearAppCache();
  delete process.env.DOC_DETECTIVE;
  delete process.env.DOC_DETECTIVE_CACHE_DIR;
});

after(function () {
  for (const d of tmpDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
});

describe("config.ts — pure helpers", function () {
  describe("resolveConcurrentRunners", function () {
    it("returns the integer value for a valid positive number", function () {
      assert.equal(resolveConcurrentRunners({ concurrentRunners: 3 }), 3);
    });

    it("floors a fractional value", function () {
      assert.equal(resolveConcurrentRunners({ concurrentRunners: 2.9 }), 2);
    });

    it("caps the boolean-true convenience option at 4 and floors at 1", function () {
      const n = resolveConcurrentRunners({ concurrentRunners: true });
      assert.ok(Number.isInteger(n));
      assert.ok(n >= 1 && n <= 4);
    });

    it("floors the boolean option at 1 even when os.cpus() reports 0", function () {
      sinon.stub(os, "cpus").returns([]);
      assert.equal(resolveConcurrentRunners({ concurrentRunners: true }), 1);
    });

    it("falls back to 1 for invalid values (0, NaN, string, undefined)", function () {
      assert.equal(resolveConcurrentRunners({ concurrentRunners: 0 }), 1);
      assert.equal(resolveConcurrentRunners({ concurrentRunners: NaN }), 1);
      assert.equal(resolveConcurrentRunners({ concurrentRunners: "nope" }), 1);
      assert.equal(resolveConcurrentRunners({}), 1);
      assert.equal(resolveConcurrentRunners({ concurrentRunners: -5 }), 1);
    });
  });

  describe("getEnvironment", function () {
    it("reports arch and a mapped platform string", function () {
      const env = getEnvironment();
      assert.equal(env.arch, os.arch());
      // platform is mapped through platformMap; on any supported CI OS it
      // resolves to one of these three.
      assert.ok(["mac", "linux", "windows"].includes(env.platform));
    });

    it("maps darwin/linux/win32 to common terms", function () {
      const platforms = { darwin: "mac", linux: "linux", win32: "windows" };
      for (const [nodePlat, expected] of Object.entries(platforms)) {
        sinon.stub(process, "platform").value(nodePlat);
        assert.equal(getEnvironment().platform, expected);
        sinon.restore();
      }
    });

    it("yields undefined platform for an unmapped process.platform", function () {
      sinon.stub(process, "platform").value("aix");
      assert.equal(getEnvironment().platform, undefined);
    });
  });

  describe("verifyAppDrivers (Layer 2 gate)", function () {
    // Complements test/available-apps-verify.test.js; kept minimal here.
    it("passes through descriptors that have no driver path", async function () {
      const apps = await verifyAppDrivers([{ app: { name: "safari" } }], {
        verify: async () => {
          throw new Error("must not be called");
        },
      });
      assert.deepEqual(apps.map((a) => a.name), ["safari"]);
    });

    it("excludes a broken driver and uses driverName in the warning when app has no name", async function () {
      const warnings = [];
      const apps = await verifyAppDrivers(
        [{ app: {}, driverName: "geckodriver", driverPath: "/x/geckodriver" }],
        {
          verify: async () => ({ ok: false }),
          logger: (msg) => warnings.push(msg),
        }
      );
      assert.deepEqual(apps, []);
      assert.match(warnings.join("\n"), /geckodriver/);
      // "no error reported" fallback when res.error is absent.
      assert.match(warnings.join("\n"), /no error reported/);
    });

    it("silently drops a broken driver when no logger is supplied", async function () {
      const apps = await verifyAppDrivers(
        [{ app: { name: "chrome" }, driverName: "chromedriver", driverPath: "/x/cd" }],
        { verify: async () => ({ ok: false, error: "boom" }) }
      );
      assert.deepEqual(apps, []);
    });
  });
});

describe("config.ts — clearAppCache", function () {
  this.timeout(30000);

  it("clears all cached entries when called with no argument", async function () {
    const cacheDir = trackedTmpDir();
    const config = { cacheDir, environment: { platform: "windows" } };
    const first = await getAvailableApps({ config });
    assert.deepEqual(first, []);
    // Second call should hit the module-level cache (same array reference).
    const cached = await getAvailableApps({ config });
    assert.strictEqual(cached, first);
    clearAppCache();
    // After a global clear, a fresh probe runs and returns a new array.
    const afterClear = await getAvailableApps({ config });
    assert.notStrictEqual(afterClear, first);
    assert.deepEqual(afterClear, []);
  });

  it("clears only the entry for a specific config's cache dir", async function () {
    const cacheDir = trackedTmpDir();
    const config = { cacheDir, environment: { platform: "windows" } };
    const first = await getAvailableApps({ config });
    clearAppCache(config);
    const afterClear = await getAvailableApps({ config });
    assert.notStrictEqual(afterClear, first);
  });
});

// 2.1: driver presence is a filesystem question, not an `appium driver list`
// spawn. detectInstalledBrowserDrivers maps each managed browser driver to its
// npm package name — the coverage the old table-regex parsing recognized.
describe("config.ts — detectInstalledBrowserDrivers (2.1)", function () {
  it("maps chromium/gecko/safari to their appium-*-driver packages", function () {
    const probed = [];
    const drivers = detectInstalledBrowserDrivers({ cacheDir: "/nonexistent" }, (name) => {
      probed.push(name);
      return name === "appium-chromium-driver";
    });
    assert.deepEqual(drivers, { chromium: true, gecko: false, safari: false });
    assert.deepEqual(
      probed.slice().sort(),
      ["appium-chromium-driver", "appium-geckodriver", "appium-safari-driver"]
    );
  });

  it("reports gecko and safari present when their packages resolve", function () {
    const drivers = detectInstalledBrowserDrivers({}, (name) => name !== "appium-chromium-driver");
    assert.deepEqual(drivers, { chromium: false, gecko: true, safari: true });
  });

  it("reports all absent when nothing resolves", function () {
    const drivers = detectInstalledBrowserDrivers({}, () => false);
    assert.deepEqual(drivers, { chromium: false, gecko: false, safari: false });
  });
});

// 2.2: after a JIT preflight install, patch the app cache with the just-installed
// descriptors so the next getAvailableApps() is a cache HIT (no re-probe). The
// functional verifyDriverBinary (Layer 2) gate is preserved; fail-open on error.
describe("config.ts — patchAppCache (2.2)", function () {
  this.timeout(30000);

  const chromeDesc = {
    name: "chrome",
    version: "123",
    path: "/fake/chrome",
    driverPath: "/fake/chromedriver",
  };

  it("adds a verified just-installed chrome so getAvailableApps hits the patched cache", async function () {
    const cacheDir = trackedTmpDir();
    const config = { cacheDir, environment: { platform: "windows" } };
    // Pre-install probe result (empty) is cached first.
    assert.deepEqual(await getAvailableApps({ config }), []);
    await patchAppCache(config, [chromeDesc], {
      verify: async () => ({ ok: true }),
      detectDrivers: () => ({ chromium: true, gecko: false, safari: false }),
    });
    const after = await getAvailableApps({ config });
    assert.equal(after.length, 1);
    assert.equal(after[0].name, "chrome");
    assert.equal(after[0].version, "123");
    assert.equal(after[0].driver, "/fake/chromedriver");
  });

  it("excludes a browser whose driver fails the functional gate (Layer 2 preserved)", async function () {
    const cacheDir = trackedTmpDir();
    const config = { cacheDir, environment: { platform: "windows" } };
    await getAvailableApps({ config });
    await patchAppCache(config, [chromeDesc], {
      verify: async () => ({ ok: false, error: "did not validate" }),
      detectDrivers: () => ({ chromium: true, gecko: false, safari: false }),
    });
    assert.deepEqual(await getAvailableApps({ config }), []);
  });

  it("skips a browser whose appium driver package is absent (presence gate)", async function () {
    const cacheDir = trackedTmpDir();
    const config = { cacheDir, environment: { platform: "windows" } };
    await getAvailableApps({ config });
    await patchAppCache(config, [chromeDesc], {
      verify: async () => ({ ok: true }),
      detectDrivers: () => ({ chromium: false, gecko: false, safari: false }),
    });
    assert.deepEqual(await getAvailableApps({ config }), []);
  });

  it("fails open (invalidates the cache) when verification throws", async function () {
    const cacheDir = trackedTmpDir();
    const config = { cacheDir, environment: { platform: "windows" } };
    const primed = await getAvailableApps({ config });
    // Confirm the entry is cached (same reference on a hit).
    assert.strictEqual(await getAvailableApps({ config }), primed);
    await patchAppCache(config, [chromeDesc], {
      verify: async () => {
        throw new Error("boom");
      },
      detectDrivers: () => ({ chromium: true, gecko: false, safari: false }),
    });
    // The entry was deleted → next call re-probes into a NEW array.
    const after = await getAvailableApps({ config });
    assert.notStrictEqual(after, primed);
    assert.deepEqual(after, []);
  });

  it("merges into the existing cache entry without duplicating browsers", async function () {
    const cacheDir = trackedTmpDir();
    const config = { cacheDir, environment: { platform: "windows" } };
    await getAvailableApps({ config });
    await patchAppCache(config, [chromeDesc], {
      verify: async () => ({ ok: true }),
      detectDrivers: () => ({ chromium: true, gecko: false, safari: false }),
    });
    // A second patch for the same browser must not add a duplicate entry.
    await patchAppCache(config, [chromeDesc], {
      verify: async () => ({ ok: true }),
      detectDrivers: () => ({ chromium: true, gecko: false, safari: false }),
    });
    const after = await getAvailableApps({ config });
    assert.equal(after.filter((a) => a.name === "chrome").length, 1);
  });
});

describe("config.ts — getAvailableApps (empty cache dir)", function () {
  this.timeout(30000);

  it("returns [] when no browsers/drivers are installed and caches the result", async function () {
    const cacheDir = trackedTmpDir();
    const config = { cacheDir, environment: { platform: "windows" } };
    const apps = await getAvailableApps({ config });
    assert.deepEqual(apps, []);
    // Cache hit returns the identical array.
    const again = await getAvailableApps({ config });
    assert.strictEqual(again, apps);
  });

  it("exercises the mac Safari branch without a real Safari (defaults spawn fails on non-mac)", async function () {
    const cacheDir = trackedTmpDir();
    const config = { cacheDir, environment: { platform: "mac" } };
    // On a non-mac host `defaults` errors, so Safari is dropped and the result
    // is []. On the macOS CI cell Safari + its appium driver may actually be
    // present, so an app CAN surface — assert only the structural contract so
    // the mac branch is walked without baking in a host-specific outcome.
    const apps = await getAvailableApps({ config });
    assert.ok(Array.isArray(apps));
  });

  // Regression: tests resolved by the DOC_DETECTIVE_API orchestration path
  // arrive with resolvedTests.config as-is — it never passes through
  // setConfig(), so config.environment is never populated the way a locally
  // resolved run's config is. getAvailableApps must tolerate that instead of
  // throwing "Cannot read properties of undefined (reading 'platform')".
  it("does not throw when config.environment is absent (pre-resolved API config)", async function () {
    const cacheDir = trackedTmpDir();
    const config = { cacheDir };
    const apps = await getAvailableApps({ config });
    assert.ok(Array.isArray(apps));
  });
});

describe("config.ts — getBrowserDiagnostics", function () {
  this.timeout(30000);

  function writeInstalled(cacheDir, record) {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, "installed.json"),
      JSON.stringify(record, null, 2),
      "utf8"
    );
  }

  it("reports all three browsers unavailable with an empty cache on non-mac", async function () {
    const cacheDir = trackedTmpDir();
    const config = { cacheDir, environment: { platform: "windows" } };
    const { browsers, detectionFailed } = await getBrowserDiagnostics({ config });
    assert.equal(detectionFailed, false);
    const byName = Object.fromEntries(browsers.map((b) => [b.name, b]));
    assert.equal(byName.chrome.available, false);
    assert.equal(byName.firefox.available, false);
    // Safari unsupported off mac, with the explanatory note.
    assert.equal(byName.safari.supported, false);
    assert.equal(byName.safari.available, false);
    assert.match(byName.safari.note, /only available on macOS/i);
  });

  it("marks chrome available when the browser + chromedriver record exists and the appium driver resolves", async function () {
    const cacheDir = trackedTmpDir();
    writeInstalled(cacheDir, {
      npmPackages: {},
      browsers: {
        chrome: { installedVersion: "124.0.0" },
        chromedriver: { installedVersion: "124.0.0" },
      },
    });
    const config = { cacheDir, environment: { platform: "windows" } };
    const { browsers } = await getBrowserDiagnostics({ config });
    const chrome = browsers.find((b) => b.name === "chrome");
    // appium-chromium-driver resolves from the dev checkout's node_modules,
    // so with both browser components recorded, chrome is available and its
    // component details echo the recorded versions.
    assert.equal(chrome.available, true);
    const browserComp = chrome.components.find((c) => c.label === "chrome browser");
    assert.equal(browserComp.installed, true);
    assert.equal(browserComp.detail, "124.0.0");
  });

  it("marks firefox available when firefox + geckodriver are recorded", async function () {
    const cacheDir = trackedTmpDir();
    writeInstalled(cacheDir, {
      npmPackages: {},
      browsers: {
        firefox: { installedVersion: "126.0" },
        geckodriver: { installedVersion: "0.34.0" },
      },
    });
    const config = { cacheDir, environment: { platform: "windows" } };
    const { browsers } = await getBrowserDiagnostics({ config });
    const firefox = browsers.find((b) => b.name === "firefox");
    assert.equal(firefox.available, true);
  });

  it("walks the mac Safari branch (probeSafariVersion) when platform is mac", async function () {
    const cacheDir = trackedTmpDir();
    const config = { cacheDir, environment: { platform: "mac" } };
    const { browsers } = await getBrowserDiagnostics({ config });
    const safari = browsers.find((b) => b.name === "safari");
    assert.equal(safari.supported, true);
    // No note when supported.
    assert.equal(safari.note, undefined);
    // On a non-mac host the `defaults` probe errors -> Safari app reported
    // absent. On a real mac it may be present; either way the branch executes
    // and `available` is a boolean.
    assert.equal(typeof safari.available, "boolean");
    const appComp = safari.components.find((c) => c.label === "Safari app");
    assert.ok(appComp);
  });

  it("degrades to an empty record (detectionFailed false) when installed.json is corrupt", async function () {
    // readInstalledRecord never throws — a corrupt/unparseable file degrades
    // to an empty record internally, so getBrowserDiagnostics's defensive
    // try/catch around it does not fire. This locks that contract: a bad
    // record still produces a clean, all-unavailable diagnostic.
    const cacheDir = trackedTmpDir();
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, "installed.json"), "{ not json", "utf8");
    const config = { cacheDir, environment: { platform: "windows" } };
    const { detectionFailed, browsers } = await getBrowserDiagnostics({ config });
    assert.equal(detectionFailed, false);
    assert.equal(browsers.find((b) => b.name === "chrome").available, false);
  });
});

describe("config.ts — setConfig", function () {
  this.timeout(30000);

  const created = [];
  afterEach(function () {
    while (created.length) {
      const d = created.pop();
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  function tmp() {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "dd-setconfig-"));
    created.push(d);
    return d;
  }

  it("loads environment variables from a loadVariables file before validating", async function () {
    const dir = tmp();
    const envFile = path.join(dir, ".env");
    const varName = "DD_COV_TEST_VAR_" + Date.now();
    fs.writeFileSync(envFile, `${varName}=hello-from-env\n`, "utf8");
    try {
      const config = await setConfig({
        config: {
          logLevel: "silent",
          dryRun: true,
          input: ["./README.md"],
          loadVariables: envFile,
        },
      });
      assert.ok(config.environment);
      assert.equal(process.env[varName], "hello-from-env");
    } finally {
      delete process.env[varName];
    }
  });

  it("validates a minimal config, resolves environment + concurrentRunners on a dry run", async function () {
    const config = await setConfig({
      config: { logLevel: "silent", dryRun: true, input: ["./README.md"] },
    });
    assert.ok(config.environment);
    assert.ok(["mac", "linux", "windows"].includes(config.environment.platform));
    // dryRun short-circuits app detection.
    assert.deepEqual(config.environment.apps, []);
    assert.ok(config.concurrentRunners >= 1);
  });

  it("throws on an invalid config object", async function () {
    await assert.rejects(
      () =>
        setConfig({
          config: { logLevel: "silent", concurrentRunners: "not-a-number-or-bool-or-int" },
        }),
      /Invalid config object/
    );
  });

  it("expands string fileType keywords into their default objects", async function () {
    const config = await setConfig({
      config: {
        logLevel: "silent",
        dryRun: true,
        input: ["./README.md"],
        fileTypes: ["markdown"],
      },
    });
    assert.equal(typeof config.fileTypes[0], "object");
    assert.equal(config.fileTypes[0].name, "markdown");
  });

  it("rejects an unknown fileType keyword string at the schema layer", async function () {
    // AJV's config_v3 enum guard fires before setConfig's own
    // defaultFileTypes[fileType] undefined check, so an unknown fileType
    // string surfaces as an "Invalid config object" schema error.
    await assert.rejects(
      () =>
        setConfig({
          config: {
            logLevel: "silent",
            dryRun: true,
            input: ["./README.md"],
            fileTypes: ["totally-not-a-filetype"],
          },
        }),
      /Invalid config object/
    );
  });

  it("normalizes an empty-string beforeAny/afterAll to an empty array", async function () {
    const config = await setConfig({
      config: {
        logLevel: "silent",
        dryRun: true,
        input: ["./README.md"],
        beforeAny: "",
        afterAll: "",
      },
    });
    assert.deepEqual(config.beforeAny, []);
    assert.deepEqual(config.afterAll, []);
  });

  it("wraps non-empty string beforeAny/afterAll/input into arrays", async function () {
    const config = await setConfig({
      config: {
        logLevel: "silent",
        dryRun: true,
        input: "./README.md",
        beforeAny: "./setup.json",
        afterAll: "./cleanup.json",
      },
    });
    assert.deepEqual(config.input, ["./README.md"]);
    assert.deepEqual(config.beforeAny, ["./setup.json"]);
    assert.deepEqual(config.afterAll, ["./cleanup.json"]);
  });

  it("normalizes a custom object fileType's string inlineStatements and markup regex into arrays", async function () {
    const config = await setConfig({
      config: {
        logLevel: "silent",
        dryRun: true,
        input: ["./README.md"],
        fileTypes: [
          {
            name: "custom",
            extensions: ["cst"],
            inlineStatements: {
              testStart: "STARTRE",
              testEnd: "ENDRE",
              ignoreStart: "IGSTART",
              ignoreEnd: "IGEND",
              step: "STEPRE",
            },
            markup: [{ name: "m", regex: "FOO", actions: ["find"] }],
          },
        ],
      },
    });
    const ft = config.fileTypes[0];
    assert.deepEqual(ft.inlineStatements.testStart, ["STARTRE"]);
    assert.deepEqual(ft.inlineStatements.testEnd, ["ENDRE"]);
    assert.deepEqual(ft.inlineStatements.ignoreStart, ["IGSTART"]);
    assert.deepEqual(ft.inlineStatements.ignoreEnd, ["IGEND"]);
    assert.deepEqual(ft.inlineStatements.step, ["STEPRE"]);
    assert.deepEqual(ft.markup[0].regex, ["FOO"]);
  });

  it("merges a fileType that extends a known default definition", async function () {
    const config = await setConfig({
      config: {
        logLevel: "silent",
        dryRun: true,
        input: ["./README.md"],
        fileTypes: [
          {
            extends: "markdown",
            extensions: ["mdextra"],
            inlineStatements: { step: ["CUSTOMSTEP"] },
            markup: [{ name: "brandNew", regex: ["X"], actions: ["find"] }],
          },
        ],
      },
    });
    const ft = config.fileTypes[0];
    // name inherited from the extended definition.
    assert.equal(ft.name, "markdown");
    // extensions are unioned (markdown's + the custom one).
    assert.ok(ft.extensions.includes("md"));
    assert.ok(ft.extensions.includes("mdextra"));
    // custom step merged with inherited steps.
    assert.ok(ft.inlineStatements.step.includes("CUSTOMSTEP"));
    // the brand-new markup entry survives and inherited markup is appended.
    const names = ft.markup.map((m) => m.name);
    assert.ok(names.includes("brandNew"));
    assert.ok(names.includes("findOnscreenText"));
  });

  it("extends a default definition when the extending fileType omits inlineStatements and markup", async function () {
    // Exercises the `fileType.inlineStatements === undefined` init branch and
    // the `fileType.markup = fileType.markup || []` init branch during merge.
    const config = await setConfig({
      config: {
        logLevel: "silent",
        dryRun: true,
        input: ["./README.md"],
        fileTypes: [{ extends: "markdown", extensions: ["mdbare"] }],
      },
    });
    const ft = config.fileTypes[0];
    assert.equal(ft.name, "markdown");
    // inlineStatements were initialized and populated from the parent.
    assert.ok(Array.isArray(ft.inlineStatements.testStart));
    assert.ok(ft.inlineStatements.testStart.length > 0);
    // markup array initialized and populated from the parent.
    assert.ok(Array.isArray(ft.markup));
    assert.ok(ft.markup.some((m) => m.name === "findOnscreenText"));
    assert.ok(ft.extensions.includes("mdbare"));
  });

  it("rejects a fileType that extends an unknown definition at validation", async function () {
    // Schema validation rejects unknown `extends` values before the runtime
    // extends-merge guard can fire (the enum only lists known definitions).
    await assert.rejects(
      () =>
        setConfig({
          config: {
            logLevel: "silent",
            dryRun: true,
            input: ["./README.md"],
            fileTypes: [{ extends: "nope-nope", extensions: ["z"] }],
          },
        }),
      /Invalid config object/
    );
  });

  it("applies a DOC_DETECTIVE env-var config override via deepMerge", async function () {
    process.env.DOC_DETECTIVE = JSON.stringify({
      config: { concurrentRunners: 3 },
    });
    const config = await setConfig({
      config: { logLevel: "silent", dryRun: true, input: ["./README.md"] },
    });
    assert.equal(config.concurrentRunners, 3);
  });

  it("ignores malformed JSON in the DOC_DETECTIVE env var and still resolves", async function () {
    process.env.DOC_DETECTIVE = "{ not valid json";
    const config = await setConfig({
      config: { logLevel: "silent", dryRun: true, input: ["./README.md"] },
    });
    assert.ok(config.environment);
  });

  it("deep-merges a nested object from DOC_DETECTIVE, preserving un-overridden nested keys", async function () {
    // Base telemetry has both keys; the env override only sets `send`. The
    // recursive both-sides-are-objects merge keeps userId and overrides send.
    process.env.DOC_DETECTIVE = JSON.stringify({ config: { telemetry: { send: true } } });
    const config = await setConfig({
      config: {
        logLevel: "silent",
        dryRun: true,
        input: ["./README.md"],
        telemetry: { send: false, userId: "keep-me" },
      },
    });
    assert.equal(config.telemetry.send, true);
    assert.equal(config.telemetry.userId, "keep-me");
  });

  it("deep-clones a nested override object when the base has no matching object key", async function () {
    // Base has no telemetry object, so the override branch clones via
    // deepMerge({}, override[key]).
    process.env.DOC_DETECTIVE = JSON.stringify({
      config: { telemetry: { send: false, userId: "cloned" } },
    });
    const config = await setConfig({
      config: { logLevel: "silent", dryRun: true, input: ["./README.md"] },
    });
    assert.equal(config.telemetry.send, false);
    assert.equal(config.telemetry.userId, "cloned");
  });

  it("ignores a DOC_DETECTIVE value whose parsed config is not an object", async function () {
    process.env.DOC_DETECTIVE = JSON.stringify({ config: "a string, not an object" });
    const config = await setConfig({
      config: { logLevel: "silent", dryRun: true, input: ["./README.md"] },
    });
    assert.ok(config.environment);
  });

  it("loads an OpenAPI description into config.integrations.openApi", async function () {
    const dir = tmp();
    const oapi = path.join(dir, "api.json");
    fs.writeFileSync(
      oapi,
      JSON.stringify({ openapi: "3.0.0", info: { title: "T", version: "1.0.0" }, paths: {} }),
      "utf8"
    );
    const config = await setConfig({
      config: {
        logLevel: "silent",
        dryRun: true,
        input: ["./README.md"],
        integrations: { openApi: [{ name: "api", descriptionPath: oapi }] },
      },
    });
    assert.equal(config.integrations.openApi.length, 1);
    assert.ok(config.integrations.openApi[0].definition);
  });

  it("drops an OpenAPI integration whose description fails to load", async function () {
    const dir = tmp();
    const config = await setConfig({
      config: {
        logLevel: "silent",
        dryRun: true,
        input: ["./README.md"],
        integrations: {
          openApi: [{ name: "bad", descriptionPath: path.join(dir, "missing.json") }],
        },
      },
    });
    assert.deepEqual(config.integrations.openApi, []);
  });

  it("performs real app detection (not dry run) against an empty tmp cache", async function () {
    const cacheDir = tmp();
    const config = await setConfig({
      config: {
        logLevel: "silent",
        input: ["./README.md"],
        cacheDir,
      },
    });
    // Exercises the non-dry-run getAvailableApps path with an empty cache. On
    // most hosts this yields [], but the macOS CI cell may surface a system
    // Safari, so assert only that detection ran and produced an array.
    assert.ok(Array.isArray(config.environment.apps));
  });
});
