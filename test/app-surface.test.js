// Unit tests for the pure native-app-surface helpers (phase A1 of
// docs/design/native-app-surfaces.md): app-identifier classification, default
// surface naming, native-selector escape-hatch classification, and the UIA
// (Windows) semantic-locator mapping. Everything here is pure — no driver, no
// fs, no env.
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import {
  classifyAppIdentifier,
  defaultAppSurfaceName,
  classifyNativeSelector,
  buildUiaLocator,
  buildAxLocator,
  createAppSessionState,
  appSurfacePreflight,
  probeMacAccessibility,
  isAppDriverRequired,
  stepTargetsAppSurface,
  resolveAppSurfaceRef,
  startAppSurface,
  buildAppLocator,
  findAppElement,
  closeAppSurface,
  teardownAppSession,
  invalidateStaleAppiumManifest,
} from "../dist/core/tests/appSurface.js";

describe("classifyAppIdentifier", function () {
  it("classifies absolute and relative paths", function () {
    assert.equal(classifyAppIdentifier("C:\\Windows\\notepad.exe"), "path");
    assert.equal(classifyAppIdentifier("C:/Windows/notepad.exe"), "path");
    assert.equal(classifyAppIdentifier("/Applications/Calculator.app"), "path");
    assert.equal(classifyAppIdentifier("./build/MyApp.exe"), "path");
  });

  it("classifies UWP AUMIDs by the ! separator", function () {
    assert.equal(
      classifyAppIdentifier("Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"),
      "aumid"
    );
  });

  it("classifies reverse-DNS identifiers (bundle/package/desktop-file ids)", function () {
    assert.equal(classifyAppIdentifier("com.apple.TextEdit"), "id");
    assert.equal(classifyAppIdentifier("org.gnome.TextEditor"), "id");
  });

  it("treats a bare token as a path (relative executable)", function () {
    assert.equal(classifyAppIdentifier("notepad.exe"), "path");
    assert.equal(classifyAppIdentifier("notepad"), "path");
  });
});

describe("defaultAppSurfaceName", function () {
  it("uses the executable basename without extension for paths", function () {
    assert.equal(defaultAppSurfaceName("C:\\Windows\\notepad.exe"), "notepad");
    assert.equal(
      defaultAppSurfaceName("/Applications/Calculator.app"),
      "Calculator"
    );
    assert.equal(defaultAppSurfaceName("./build/MyApp.exe"), "MyApp");
  });

  it("uses the final dot-segment for reverse-DNS ids", function () {
    assert.equal(defaultAppSurfaceName("com.apple.TextEdit"), "TextEdit");
  });

  it("uses the package family name's app token for AUMIDs", function () {
    assert.equal(
      defaultAppSurfaceName("Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"),
      "WindowsCalculator"
    );
  });

  it("falls back to the identifier itself when nothing better exists", function () {
    assert.equal(defaultAppSurfaceName("notepad"), "notepad");
  });
});

describe("classifyNativeSelector", function () {
  it("classifies XPath by // or ( prefix", function () {
    assert.equal(classifyNativeSelector('//Button[@Name="Save"]'), "xpath");
    assert.equal(
      classifyNativeSelector('(//Button)[last()]'),
      "xpath"
    );
  });

  it("classifies ~ prefixed selectors as accessibility ids", function () {
    assert.equal(classifyNativeSelector("~SaveButton"), "accessibilityId");
  });

  it("classifies everything else as CSS (browser-only; caller rejects on app surfaces)", function () {
    assert.equal(classifyNativeSelector("#save"), "css");
    assert.equal(classifyNativeSelector("button.primary"), "css");
  });
});

describe("buildUiaLocator", function () {
  it("maps a lone elementId to the accessibility id strategy (AutomationId fast path)", function () {
    assert.deepEqual(buildUiaLocator({ elementId: "SaveButton" }), {
      strategy: "accessibility id",
      value: "SaveButton",
    });
  });

  it("maps elementText to an XPath @Name match", function () {
    assert.deepEqual(buildUiaLocator({ elementText: "Save" }), {
      strategy: "xpath",
      value: '//*[@Name="Save"]',
    });
  });

  it("ANDs combined semantic criteria into one XPath", function () {
    assert.deepEqual(
      buildUiaLocator({ elementId: "SaveButton", elementText: "Save" }),
      {
        strategy: "xpath",
        value: '//*[@AutomationId="SaveButton" and @Name="Save"]',
      }
    );
  });

  it("maps elementAria role+name to a ControlType tag with @Name", function () {
    assert.deepEqual(
      buildUiaLocator({ elementAria: { role: "button", name: "Save" } }),
      {
        strategy: "xpath",
        value: '//Button[@Name="Save"]',
      }
    );
  });

  it("maps a role-only elementAria to a bare ControlType tag", function () {
    assert.deepEqual(buildUiaLocator({ elementAria: { role: "button" } }), {
      strategy: "xpath",
      value: "//Button",
    });
  });

  it("escapes double quotes in values", function () {
    const { value } = buildUiaLocator({ elementText: 'Say "hi"' });
    assert.equal(value.includes('concat('), true);
  });

  it("returns null for criteria with no UIA mapping", function () {
    assert.equal(buildUiaLocator({}), null);
    assert.equal(buildUiaLocator({ elementClass: "x" }), null);
  });
});

describe("buildAxLocator", function () {
  it("maps a lone elementId to the accessibility id strategy (AXIdentifier fast path)", function () {
    assert.deepEqual(buildAxLocator({ elementId: "saveButton" }), {
      strategy: "accessibility id",
      value: "saveButton",
    });
    assert.deepEqual(buildAxLocator({ elementTestId: "saveButton" }), {
      strategy: "accessibility id",
      value: "saveButton",
    });
  });

  it("maps elementText to an XPath matching title OR label OR value", function () {
    // macOS controls split their visible text across AXTitle (buttons),
    // label (static text), and AXValue (text views, the Calculator display),
    // so the pragmatic contract matches any of them — CI-verified against
    // real apps in phase A2.
    assert.deepEqual(buildAxLocator({ elementText: "Save" }), {
      strategy: "xpath",
      value: '//*[@title="Save" or @label="Save" or @value="Save"]',
    });
  });

  it("ANDs combined semantic criteria into one XPath", function () {
    assert.deepEqual(
      buildAxLocator({ elementId: "saveButton", elementText: "Save" }),
      {
        strategy: "xpath",
        value:
          '//*[@identifier="saveButton" and (@title="Save" or @label="Save" or @value="Save")]',
      }
    );
  });

  it("maps elementAria role+name to an XCUIElementType tag with title/label", function () {
    assert.deepEqual(
      buildAxLocator({ elementAria: { role: "button", name: "Save" } }),
      {
        strategy: "xpath",
        value: '//XCUIElementTypeButton[@title="Save" or @label="Save"]',
      }
    );
  });

  it("maps a role-only elementAria to a bare XCUIElementType tag", function () {
    assert.deepEqual(buildAxLocator({ elementAria: { role: "button" } }), {
      strategy: "xpath",
      value: "//XCUIElementTypeButton",
    });
  });

  it("maps the aria-ish role names onto XCUIElementType tags", function () {
    const cases = [
      ["textbox", "XCUIElementTypeTextField"],
      ["text", "XCUIElementTypeStaticText"],
      ["checkbox", "XCUIElementTypeCheckBox"],
      ["menuitem", "XCUIElementTypeMenuItem"],
      ["window", "XCUIElementTypeWindow"],
    ];
    for (const [role, tag] of cases) {
      assert.deepEqual(buildAxLocator({ elementAria: { role } }), {
        strategy: "xpath",
        value: `//${tag}`,
      });
    }
    // Unknown roles pass through capitalized so new element types work
    // without a table update (XCUIElementTypeImage exists, for example).
    assert.deepEqual(buildAxLocator({ elementAria: { role: "image" } }), {
      strategy: "xpath",
      value: "//XCUIElementTypeImage",
    });
  });

  it("treats a string elementAria as a name-only match (no value — a name is not a value)", function () {
    assert.deepEqual(buildAxLocator({ elementAria: "Save" }), {
      strategy: "xpath",
      value: '//*[@title="Save" or @label="Save"]',
    });
  });

  it("escapes double quotes in values", function () {
    const { value } = buildAxLocator({ elementText: 'Say "hi"' });
    assert.equal(value.includes("concat("), true);
  });

  it("returns null for criteria with no AX mapping", function () {
    assert.equal(buildAxLocator({}), null);
    assert.equal(buildAxLocator({ elementClass: "x" }), null);
  });
});

// --- runtime helpers (hermetic: injected deps, fake drivers, temp dirs) ---

describe("isAppDriverRequired / stepTargetsAppSurface", function () {
  it("counts startSurface steps and object-form app surfaces", function () {
    assert.equal(
      isAppDriverRequired({ test: { steps: [{ startSurface: { app: "x" } }] } }),
      true
    );
    assert.equal(
      isAppDriverRequired({
        test: { steps: [{ find: { elementText: "a", surface: { app: "x" } } }] },
      }),
      true
    );
    assert.equal(
      isAppDriverRequired({
        test: { steps: [{ goTo: "https://example.com" }] },
      }),
      false
    );
    assert.equal(isAppDriverRequired({ test: {} }), false);
  });

  it("does not count string surfaces or browser surfaces", function () {
    assert.equal(
      stepTargetsAppSurface({ find: { elementText: "a", surface: "chrome" } }),
      false
    );
    assert.equal(
      stepTargetsAppSurface({
        find: { elementText: "a", surface: { browser: "chrome" } },
      }),
      false
    );
    assert.equal(stepTargetsAppSurface(null), false);
  });
});

describe("resolveAppSurfaceRef", function () {
  it("resolves object refs against the registry and errors on unknown names", function () {
    const appSession = createAppSessionState();
    appSession.surfaces.set("calc", { name: "calc", appId: "x", driver: {} });
    const hit = resolveAppSurfaceRef({ app: "calc", window: -1 }, appSession);
    assert.equal(hit.entry.name, "calc");
    assert.equal(hit.window, -1);
    const miss = resolveAppSurfaceRef({ app: "nope" }, appSession);
    assert.match(miss.error, /No app surface named "nope"/);
  });

  it("resolves bare strings only when registered, and never without a session", function () {
    const appSession = createAppSessionState();
    appSession.surfaces.set("calc", { name: "calc", appId: "x", driver: {} });
    assert.equal(resolveAppSurfaceRef("calc", appSession).entry.name, "calc");
    assert.equal(resolveAppSurfaceRef("web", appSession), null);
    assert.equal(resolveAppSurfaceRef({ app: "calc" }, undefined), null);
  });
});

describe("buildAppLocator", function () {
  it("passes through native selectors and rejects CSS", function () {
    assert.deepEqual(buildAppLocator({ selector: '//Edit[@Name="x"]' }), {
      strategy: "xpath",
      value: '//Edit[@Name="x"]',
    });
    assert.deepEqual(buildAppLocator({ selector: "~SaveButton" }), {
      strategy: "accessibility id",
      value: "SaveButton",
    });
    assert.match(buildAppLocator({ selector: "#save" }).error, /CSS selectors/);
  });

  it("names unsupported fields and empty criteria", function () {
    assert.match(
      buildAppLocator({ elementClass: "x" }).error,
      /elementClass/
    );
    assert.match(buildAppLocator({}).error, /No app-mappable/);
  });

  it("selects the platform's locator column (mac → AX, default → UIA)", function () {
    assert.deepEqual(buildAppLocator({ elementText: "Save" }, "mac"), {
      strategy: "xpath",
      value: '//*[@title="Save" or @label="Save" or @value="Save"]',
    });
    // No platform argument stays the Windows/UIA column (A1 behavior).
    assert.deepEqual(buildAppLocator({ elementText: "Save" }), {
      strategy: "xpath",
      value: '//*[@Name="Save"]',
    });
    // The escape hatch and the shared guards are platform-independent.
    assert.match(
      buildAppLocator({ selector: "#save" }, "mac").error,
      /CSS selectors/
    );
    assert.match(
      buildAppLocator({ elementText: "Save", elementAria: "Cancel" }, "mac")
        .error,
      /compile to conflicting predicates/
    );
  });

  it("rejects conflicting elementText/elementAria names and dedupes equal ones", function () {
    // Different values: both map to @Name, so no element can match — error.
    const conflict = buildAppLocator({
      elementText: "Save",
      elementAria: "Cancel",
    });
    assert.match(conflict.error, /compile to conflicting predicates/);
    // Equal values: one predicate, not a redundant AND.
    const merged = buildAppLocator({ elementText: "Save", elementAria: "Save" });
    assert.deepEqual(merged, { strategy: "xpath", value: '//*[@Name="Save"]' });
  });
});

describe("invalidateStaleAppiumManifest", function () {
  const manifestDir = (home) =>
    path.join(home, "node_modules", ".cache", "appium");

  it("deletes a manifest that predates the driver so Appium rescans", function () {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "dd-home-"));
    fs.mkdirSync(manifestDir(home), { recursive: true });
    fs.writeFileSync(
      path.join(manifestDir(home), "extensions.yaml"),
      "drivers:\n  chromium: {}\n"
    );
    invalidateStaleAppiumManifest(home, "appium-novawindows-driver");
    assert.equal(fs.existsSync(manifestDir(home)), false);
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("keeps a manifest that already lists the driver, and no-ops when absent", function () {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "dd-home-"));
    fs.mkdirSync(manifestDir(home), { recursive: true });
    fs.writeFileSync(
      path.join(manifestDir(home), "extensions.yaml"),
      "drivers:\n  novawindows:\n    pkgName: appium-novawindows-driver\n"
    );
    invalidateStaleAppiumManifest(home, "appium-novawindows-driver");
    assert.equal(fs.existsSync(manifestDir(home)), true);
    fs.rmSync(home, { recursive: true, force: true });

    // Absent manifest: nothing to do, nothing thrown.
    invalidateStaleAppiumManifest(
      fs.mkdtempSync(path.join(os.tmpdir(), "dd-home-")),
      "appium-novawindows-driver"
    );
  });

  it("checks for the PLATFORM'S driver: a novawindows-only manifest is stale for mac2", function () {
    // A2: the staleness check is per-driver, not hard-coded to novawindows —
    // a home whose manifest lists only the Windows driver must rescan when
    // the mac driver installs into it, and vice versa.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "dd-home-"));
    fs.mkdirSync(manifestDir(home), { recursive: true });
    fs.writeFileSync(
      path.join(manifestDir(home), "extensions.yaml"),
      "drivers:\n  novawindows:\n    pkgName: appium-novawindows-driver\n"
    );
    invalidateStaleAppiumManifest(home, "appium-mac2-driver");
    assert.equal(fs.existsSync(manifestDir(home)), false);
    fs.rmSync(home, { recursive: true, force: true });

    const freshHome = fs.mkdtempSync(path.join(os.tmpdir(), "dd-home-"));
    fs.mkdirSync(manifestDir(freshHome), { recursive: true });
    fs.writeFileSync(
      path.join(manifestDir(freshHome), "extensions.yaml"),
      "drivers:\n  mac2:\n    pkgName: appium-mac2-driver\n"
    );
    invalidateStaleAppiumManifest(freshHome, "appium-mac2-driver");
    assert.equal(fs.existsSync(manifestDir(freshHome)), true);
    fs.rmSync(freshHome, { recursive: true, force: true });
  });
});

describe("appSurfacePreflight", function () {
  it("skips unsupported platforms with gating guidance naming the supported set", async function () {
    const outcome = await appSurfacePreflight({
      config: {},
      platform: "linux",
    });
    assert.equal(outcome.ok, false);
    assert.match(outcome.reason, /Windows and macOS/);
  });

  it("resolves the macOS driver (appium-mac2-driver) on mac", async function () {
    // A2: the preflight is platform-tabled — on mac it must resolve/install
    // the Mac2 driver, never the Windows one.
    const sep = path.sep;
    const requested = [];
    const outcome = await appSurfacePreflight({
      config: {},
      platform: "mac",
      deps: {
        resolveSource: (name) => {
          requested.push(name);
          return "shim";
        },
        resolvePath: (name) =>
          `${sep}repo${sep}node_modules${sep}${name}${sep}index.js`,
        probeAccessibility: async () => true,
      },
    });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.appiumHome, `${sep}repo`);
    assert.deepEqual(requested, ["appium-mac2-driver"]);
  });

  it("skips when the driver cannot be installed", async function () {
    const outcome = await appSurfacePreflight({
      config: {},
      platform: "windows",
      deps: {
        resolveSource: () => null,
        ensureInstalled: async () => {
          throw new Error("offline");
        },
      },
    });
    assert.equal(outcome.ok, false);
    assert.match(outcome.reason, /could not be installed/);
    assert.match(outcome.reason, /offline/);
  });

  it("resolves the shim home when the driver is shim-installed", async function () {
    const sep = path.sep;
    const outcome = await appSurfacePreflight({
      config: {},
      platform: "windows",
      deps: {
        resolveSource: () => "shim",
        resolvePath: (name) =>
          `${sep}repo${sep}node_modules${sep}${name}${sep}index.js`,
      },
    });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.appiumHome, `${sep}repo`);
  });

  it("skips on mac when TCC accessibility is definitively denied, with the settings walkthrough", async function () {
    const outcome = await appSurfacePreflight({
      config: {},
      platform: "mac",
      deps: {
        resolveSource: () => "shim",
        resolvePath: (name) => `/repo/node_modules/${name}/index.js`,
        probeAccessibility: async () => false,
      },
    });
    assert.equal(outcome.ok, false);
    assert.match(outcome.reason, /Accessibility/);
    assert.match(outcome.reason, /Privacy & Security/);
  });

  it("proceeds on mac when the TCC probe is inconclusive, and never probes on Windows", async function () {
    // An erroring/unknown probe must NOT false-skip — a real TCC failure
    // still surfaces at session start with the same walkthrough.
    // Paths are built with path.sep and the cache resolvers are stubbed:
    // a foreign-separator path makes appiumHomeForDriverPath return null,
    // which falls through to the REAL runtime cache (a force appium install
    // + manifest invalidation) — that stomped the browser drivers' Appium
    // home mid-suite on the Windows CI leg.
    const sep = path.sep;
    const hermeticDeps = {
      resolveSource: () => "shim",
      resolvePath: (name) =>
        `${sep}repo${sep}node_modules${sep}${name}${sep}index.js`,
      resolvePathInCache: () => {
        throw new Error("test must not reach the real runtime cache");
      },
      ensureInstalled: async () => {
        throw new Error("test must not install anything");
      },
    };
    const inconclusive = await appSurfacePreflight({
      config: {},
      platform: "mac",
      deps: {
        ...hermeticDeps,
        probeAccessibility: async () => {
          throw new Error("osascript unavailable");
        },
      },
    });
    assert.equal(inconclusive.ok, true);

    let probed = 0;
    const win = await appSurfacePreflight({
      config: {},
      platform: "windows",
      deps: {
        ...hermeticDeps,
        probeAccessibility: async () => {
          probed++;
          return false;
        },
      },
    });
    assert.equal(win.ok, true);
    assert.equal(probed, 0);
  });

  it("the real macOS probe returns a definitive boolean (AXIsProcessTrusted is bound)", async function () {
    // The deps-injected probe tests above never exercise the real JXA script,
    // so a broken AXIsProcessTrusted bind is invisible to them. On a real
    // macOS host osascript exists and the (correctly bound) call runs cleanly,
    // so the verdict must be a real boolean — a null means the script errored
    // (e.g. the C function was never bound via ObjC.bindFunction), which is
    // exactly the regression that makes the definitive-denied SKIP unreachable.
    // Skipped off-macOS, where osascript is absent and null is expected.
    if (process.platform !== "darwin") this.skip();
    const verdict = await probeMacAccessibility();
    assert.equal(
      typeof verdict,
      "boolean",
      `expected a definitive boolean from the JXA probe, got ${verdict}`
    );
  });

  it("installs appium into the cache when the driver is cache-resolved", async function () {
    const installed = [];
    let cacheHasAppium = false;
    const outcome = await appSurfacePreflight({
      config: {},
      platform: "windows",
      deps: {
        resolveSource: () => "cache",
        resolvePathInCache: (name) =>
          cacheHasAppium ? `/cache/node_modules/${name}/index.js` : null,
        ensureInstalled: async (pkgs) => {
          installed.push(...pkgs);
          cacheHasAppium = true;
        },
      },
    });
    assert.equal(outcome.ok, true);
    assert.deepEqual(installed, ["appium"]);
  });
});

describe("startAppSurface", function () {
  const fakeDriver = () => ({
    deleted: false,
    async deleteSession() {
      this.deleted = true;
    },
  });
  const okServerDeps = (driver) => ({
    startServer: async () => ({ port: 4999, process: { pid: 1 } }),
    startDriver: async () => driver,
  });
  const preflighted = () => {
    const appSession = createAppSessionState();
    appSession.appiumEntry = "/x/appium/index.js";
    appSession.appiumHome = "/x";
    return appSession;
  };

  it("launches, names, and registers the surface", async function () {
    const appSession = preflighted();
    const driver = fakeDriver();
    const result = await startAppSurface({
      config: {},
      step: { startSurface: { app: "C:\\Windows\\System32\\charmap.exe" } },
      appSession,
      platform: "windows",
      serverDeps: okServerDeps(driver),
    });
    assert.equal(result.status, "PASS");
    assert.equal(appSession.surfaces.get("charmap").driver, driver);
    assert.equal(appSession.activeApp, "charmap");
  });

  it("fails reserved fields, env, unsupported platforms, and name collisions with guidance", async function () {
    const appSession = preflighted();
    const cases = [
      [{ app: "x", device: "phone" }, /reserved for the mobile phases/],
      [{ app: "x", install: "./a.apk" }, /reserved for the mobile phases/],
      [{ app: "x", env: { A: "1" } }, /not supported by the Windows app driver/],
    ];
    for (const [descriptor, pattern] of cases) {
      const result = await startAppSurface({
        config: {},
        step: { startSurface: descriptor },
        appSession,
        platform: "windows",
        serverDeps: okServerDeps(fakeDriver()),
      });
      assert.equal(result.status, "FAIL");
      assert.match(result.description, pattern);
    }

    const unsupportedPlatform = await startAppSurface({
      config: {},
      step: { startSurface: { app: "x" } },
      appSession,
      platform: "linux",
      serverDeps: okServerDeps(fakeDriver()),
    });
    assert.match(unsupportedPlatform.description, /Windows and macOS/);

    appSession.surfaces.set("x", { name: "x", appId: "x", driver: {} });
    const collision = await startAppSurface({
      config: {},
      step: { startSurface: { app: "x" } },
      appSession,
      platform: "windows",
      serverDeps: okServerDeps(fakeDriver()),
    });
    assert.match(collision.description, /already open/);
  });

  it("fails cleanly on a malformed descriptor (missing app) instead of throwing", async function () {
    const appSession = preflighted();
    const result = await startAppSurface({
      config: {},
      step: { startSurface: { name: "calc" } },
      appSession,
      platform: "windows",
      serverDeps: okServerDeps(fakeDriver()),
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Invalid step definition/);
  });

  it("late-binds pending window crops from the first opened app surface", async function () {
    const appSession = preflighted();
    // A synthetic autoRecord capture started before any app window existed:
    // full-display with a pending marker.
    const handle = { type: "ffmpeg", pendingAppWindowCrop: true };
    appSession.recordingHost.state.recordings.push(handle);
    const driver = {
      async deleteSession() {},
      async getWindowRect() {
        return { x: 10, y: 20, width: 800, height: 600 };
      },
      async execute() {
        // NovaWindows: execute is unimplemented -> dpr falls back to 1.
        throw new Error("Method is not implemented");
      },
    };
    const result = await startAppSurface({
      config: {},
      step: { startSurface: { app: "C:\\x\\app.exe" } },
      appSession,
      platform: "windows",
      serverDeps: okServerDeps(driver),
    });
    assert.equal(result.status, "PASS");
    assert.deepEqual(handle.crop, { x: 10, y: 20, w: 800, h: 600 });
    assert.equal(handle.pendingAppWindowCrop, false);
  });

  it("waits for element readiness, and tears the session down when readiness never comes", async function () {
    // Readiness success: waitUntil.find resolves -> surface registers.
    const readyDriver = {
      async deleteSession() {},
      $: async () => ({ async waitForExist() {} }),
    };
    const okSession = preflighted();
    const ok = await startAppSurface({
      config: {},
      step: {
        startSurface: {
          app: "C:\\x\\app.exe",
          waitUntil: { delayMs: 1, find: { elementText: "Ready" } },
          timeout: 50,
        },
      },
      appSession: okSession,
      platform: "windows",
      serverDeps: okServerDeps(readyDriver),
    });
    assert.equal(ok.status, "PASS");
    assert.equal(okSession.surfaces.size, 1);

    // Readiness failure: the launched session is deleted and the step FAILs.
    let deleted = 0;
    const neverReady = {
      async deleteSession() {
        deleted++;
      },
      $: async () => ({
        async waitForExist() {
          throw new Error("nope");
        },
      }),
    };
    const failSession = preflighted();
    const fail = await startAppSurface({
      config: {},
      step: {
        startSurface: {
          app: "C:\\x\\app.exe",
          waitUntil: { find: { elementText: "Ready" } },
          timeout: 10,
        },
      },
      appSession: failSession,
      platform: "windows",
      serverDeps: okServerDeps(neverReady),
    });
    assert.equal(fail.status, "FAIL");
    assert.match(fail.description, /never became ready/);
    assert.equal(deleted, 1);
    assert.equal(failSession.surfaces.size, 0);
  });

  it("fails cleanly when the app automation server can't start", async function () {
    const appSession = preflighted();
    const result = await startAppSurface({
      config: {},
      step: { startSurface: { app: "C:\\x\\app.exe" } },
      appSession,
      platform: "windows",
      serverDeps: {
        startServer: async () => {
          throw new Error("port already bound");
        },
        startDriver: async () => fakeDriver(),
      },
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Couldn't start the app automation server/);
    assert.match(result.description, /port already bound/);
  });

  it("fails cleanly when the session can't start", async function () {
    const appSession = preflighted();
    const result = await startAppSurface({
      config: {},
      step: { startSurface: { app: "C:\\x\\missing.exe" } },
      appSession,
      platform: "windows",
      serverDeps: {
        startServer: async () => ({ port: 1, process: {} }),
        startDriver: async () => {
          throw new Error("no window");
        },
      },
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Couldn't launch app/);
    assert.equal(appSession.surfaces.size, 0);
  });

  it("launches macOS apps with Mac2 capabilities (bundleId form)", async function () {
    const appSession = preflighted();
    let caps;
    const result = await startAppSurface({
      config: {},
      step: {
        startSurface: {
          app: "com.apple.TextEdit",
          args: ["/tmp/dd-a2.txt"],
          env: { DD_A2: "1" },
          timeout: 300000,
          driverOptions: { "appium:skipAppKill": true },
        },
      },
      appSession,
      platform: "mac",
      serverDeps: {
        startServer: async () => ({ port: 1, process: {} }),
        startDriver: async (capabilities) => {
          caps = capabilities;
          return fakeDriver();
        },
      },
    });
    assert.equal(result.status, "PASS");
    assert.equal(appSession.surfaces.get("TextEdit").platform, "mac");
    assert.equal(caps.platformName, "mac");
    assert.equal(caps["appium:automationName"], "Mac2");
    assert.equal(caps["appium:bundleId"], "com.apple.TextEdit");
    assert.equal(caps["appium:appPath"], undefined);
    // Mac2 takes launch arguments as an ARRAY (NovaWindows joins a string).
    assert.deepEqual(caps["appium:arguments"], ["/tmp/dd-a2.txt"]);
    assert.deepEqual(caps["appium:environment"], { DD_A2: "1" });
    // The descriptor timeout must also cover WebDriverAgentMac's startup
    // (first session builds it via xcodebuild).
    assert.equal(caps["appium:serverStartupTimeout"], 300000);
    assert.equal(caps["appium:skipAppKill"], true);
  });

  it("launches macOS apps by .app path with a forgiving default WDA startup timeout", async function () {
    const appSession = preflighted();
    let caps;
    await startAppSurface({
      config: {},
      step: {
        startSurface: { app: "/System/Applications/Calculator.app" },
      },
      appSession,
      platform: "mac",
      serverDeps: {
        startServer: async () => ({ port: 1, process: {} }),
        startDriver: async (capabilities) => {
          caps = capabilities;
          return fakeDriver();
        },
      },
    });
    assert.equal(
      caps["appium:appPath"],
      "/System/Applications/Calculator.app"
    );
    assert.equal(caps["appium:bundleId"], undefined);
    // Default descriptor timeout is 60s, but the first-ever session builds
    // WebDriverAgentMac (minutes on CI) — the WDA startup floor is higher.
    assert.equal(caps["appium:serverStartupTimeout"], 120000);
    assert.equal(appSession.surfaces.get("Calculator").platform, "mac");
  });

  it("fails workingDirectory on macOS with guidance but tolerates the schema default", async function () {
    const appSession = preflighted();
    const explicit = await startAppSurface({
      config: {},
      step: {
        startSurface: { app: "com.apple.TextEdit", workingDirectory: "/tmp" },
      },
      appSession,
      platform: "mac",
      serverDeps: okServerDeps(fakeDriver()),
    });
    assert.equal(explicit.status, "FAIL");
    assert.match(explicit.description, /not supported by the macOS app driver/);

    // "." is the schema's injected default, not an author request — it must
    // not trip the unsupported-field guard.
    const defaulted = await startAppSurface({
      config: {},
      step: {
        startSurface: { app: "com.apple.Notes", workingDirectory: "." },
      },
      appSession,
      platform: "mac",
      serverDeps: okServerDeps(fakeDriver()),
    });
    assert.equal(defaulted.status, "PASS");
  });

  it("appends the TCC walkthrough when a mac launch fails with an accessibility-shaped error", async function () {
    const appSession = preflighted();
    const result = await startAppSurface({
      config: {},
      step: { startSurface: { app: "com.apple.TextEdit" } },
      appSession,
      platform: "mac",
      serverDeps: {
        startServer: async () => ({ port: 1, process: {} }),
        startDriver: async () => {
          throw new Error(
            "WebDriverAgentMac process is not trusted for Accessibility"
          );
        },
      },
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Couldn't launch app/);
    assert.match(result.description, /Privacy & Security/);
  });

  it("maps args and workingDirectory into driver capabilities", async function () {
    const appSession = preflighted();
    let caps;
    await startAppSurface({
      config: {},
      step: {
        startSurface: {
          app: "C:\\x\\app.exe",
          args: ["--a", "--b"],
          workingDirectory: "./sandbox",
          driverOptions: { "nova:smoothMouseMove": true },
        },
      },
      appSession,
      platform: "windows",
      serverDeps: {
        startServer: async () => ({ port: 1, process: {} }),
        startDriver: async (capabilities) => {
          caps = capabilities;
          return fakeDriver();
        },
      },
    });
    assert.equal(caps["appium:appArguments"], "--a --b");
    assert.equal(caps["appium:appWorkingDir"], path.resolve("./sandbox"));
    assert.equal(caps["nova:smoothMouseMove"], true);
    assert.equal(caps["appium:automationName"], "NovaWindows");
  });
});

describe("findAppElement / closeAppSurface / teardownAppSession", function () {
  it("findAppElement returns the element or a criteria-naming error", async function () {
    const element = { async waitForExist() {} };
    const found = await findAppElement({
      driver: { $: async () => element },
      criteria: { elementText: "Save" },
    });
    assert.equal(found.element, element);

    const missing = await findAppElement({
      driver: {
        $: async () => ({
          async waitForExist() {
            throw new Error("nope");
          },
        }),
      },
      criteria: { elementText: "Save" },
      timeout: 10,
    });
    assert.match(missing.error, /No element matched/);

    const unmappable = await findAppElement({
      driver: {},
      criteria: { selector: "#css" },
    });
    assert.match(unmappable.error, /CSS selectors/);
  });

  it("findAppElement builds the locator for the requested platform", async function () {
    const selectors = [];
    const driver = {
      $: async (sel) => {
        selectors.push(sel);
        return { async waitForExist() {} };
      },
    };
    await findAppElement({
      driver,
      criteria: { elementText: "Save" },
      platform: "mac",
    });
    assert.match(selectors[0], /@title="Save"/);
  });

  it("findAppElement distinguishes a dead session from a criteria miss", async function () {
    // driver.$() itself throwing means the session is broken — the error
    // must say so, not blame the author's criteria.
    const broken = await findAppElement({
      driver: {
        $: async () => {
          throw new Error("invalid session id");
        },
      },
      criteria: { elementText: "Save" },
      timeout: 10,
    });
    assert.match(broken.error, /App driver error/);
    assert.match(broken.error, /invalid session id/);
  });

  it("closeAppSurface deregisters and ends the session idempotently", async function () {
    const appSession = createAppSessionState();
    let deleted = 0;
    const entry = {
      name: "a",
      appId: "x",
      driver: {
        async deleteSession() {
          deleted++;
          throw new Error("already gone");
        },
      },
    };
    appSession.surfaces.set("a", entry);
    appSession.activeApp = "a";
    await closeAppSurface({ entry, appSession });
    assert.equal(appSession.surfaces.size, 0);
    assert.equal(appSession.activeApp, undefined);
    assert.equal(deleted, 1);
  });

  it("teardownAppSession closes every surface and kills the server", async function () {
    const appSession = createAppSessionState();
    const killed = [];
    let closed = 0;
    for (const name of ["a", "b"]) {
      appSession.surfaces.set(name, {
        name,
        appId: name,
        driver: {
          async deleteSession() {
            closed++;
          },
        },
      });
    }
    appSession.server = { port: 1, process: { pid: 42 } };
    await teardownAppSession(appSession, async (pid) => {
      killed.push(pid);
    });
    assert.equal(closed, 2);
    assert.deepEqual(killed, [42]);
    assert.equal(appSession.surfaces.size, 0);
    assert.equal(appSession.server, undefined);
    // No-ops safely on undefined.
    await teardownAppSession(undefined, async () => {});
  });
});
