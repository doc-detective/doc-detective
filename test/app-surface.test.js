// Unit tests for the pure native-app-surface helpers (phase A1 of
// docs/design/native-app-surfaces.md): app-identifier classification, default
// surface naming, native-selector escape-hatch classification, and the UIA
// (Windows) semantic-locator mapping. Everything here is pure — no driver, no
// fs, no env.
import assert from "node:assert/strict";
import path from "node:path";
import {
  classifyAppIdentifier,
  defaultAppSurfaceName,
  classifyNativeSelector,
  buildUiaLocator,
  createAppSessionState,
  appSurfacePreflight,
  isAppDriverRequired,
  stepTargetsAppSurface,
  resolveAppSurfaceRef,
  startAppSurface,
  buildAppLocator,
  findAppElement,
  closeAppSurface,
  teardownAppSession,
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
});

describe("appSurfacePreflight", function () {
  it("skips non-Windows platforms with gating guidance", async function () {
    const outcome = await appSurfacePreflight({
      config: {},
      platform: "linux",
    });
    assert.equal(outcome.ok, false);
    assert.match(outcome.reason, /Windows only in this phase/);
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

  it("fails reserved fields, env, non-Windows, and name collisions with guidance", async function () {
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

    const nonWindows = await startAppSurface({
      config: {},
      step: { startSurface: { app: "x" } },
      appSession,
      platform: "mac",
      serverDeps: okServerDeps(fakeDriver()),
    });
    assert.match(nonWindows.description, /Windows only in this phase/);

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
