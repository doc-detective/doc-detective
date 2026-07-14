// The chromedriver-prefetch warm task (docs/design/warm-phase.md, phase B1 +
// the chained-throwaway-session decision): on-device chromedriver is only
// downloadable through a live UiAutomator2 session, so the task awaits the
// device, opens a disposable mobile-web session on a short-lived Appium
// server with the autodownload flag, and tears both down in a finally.
// Hermetic: every effect is injected.
import assert from "node:assert/strict";
import { prefetchMobileChromedriver } from "../dist/core/tests.js";

function harness(overrides = {}) {
  const calls = [];
  const deps = {
    appSurfacePreflight: async () => {
      calls.push("preflight");
      return { ok: true, appiumEntry: "/entry.js", appiumHome: "/appium-home" };
    },
    acquireDevice: async () => {
      calls.push("acquire");
      return { entry: { name: "pixel", udid: "emulator-5554" } };
    },
    startAppiumServer: async (entry, config, display, env, extraArgs) => {
      calls.push("server");
      deps._serverArgs = { entry, env, extraArgs };
      return { port: 4725, process: { pid: 4242 } };
    },
    driverStart: async (capabilities, port) => {
      calls.push("session");
      deps._session = { capabilities, port };
      return {
        deleteSession: async () => {
          calls.push("deleteSession");
        },
      };
    },
    killTree: async (pid) => {
      calls.push(`killTree:${pid}`);
    },
    ...overrides,
  };
  return { calls, deps };
}

function run(deps, { envReady = true } = {}) {
  return prefetchMobileChromedriver({
    config: {},
    desc: {},
    deviceRegistry: new Map(),
    getAndroidEnv: async () =>
      envReady ? { sdkRoot: "/sdk", deviceDeps: {} } : null,
    deps,
  });
}

describe("warm phase: chromedriver prefetch via throwaway session", function () {
  it("runs preflight → acquire → server → session and tears both down", async function () {
    const { calls, deps } = harness();
    const result = await run(deps);
    assert.equal(result.outcome, "warmed");
    assert.match(result.note, /pixel/);
    assert.deepEqual(calls, [
      "preflight",
      "acquire",
      "server",
      "session",
      "deleteSession",
      "killTree:4242",
    ]);
    // The server is homed with the driver and allows the scoped
    // autodownload insecure feature — same shape as the real session path.
    assert.equal(deps._serverArgs.env.APPIUM_HOME, "/appium-home");
    assert.equal(deps._serverArgs.env.ANDROID_HOME, "/sdk");
    assert.deepEqual(deps._serverArgs.extraArgs, [
      "--allow-insecure",
      "uiautomator2:chromedriver_autodownload",
    ]);
    // The session carries the autodownload capabilities on the device.
    assert.equal(deps._session.capabilities["appium:udid"], "emulator-5554");
    assert.equal(
      deps._session.capabilities["appium:chromedriverAutodownload"],
      true
    );
    assert.equal(deps._session.port, 4725);
  });

  it("skips in milliseconds when the android toolchain isn't ready", async function () {
    const { calls, deps } = harness();
    const result = await run(deps, { envReady: false });
    assert.equal(result.outcome, "skipped");
    assert.deepEqual(calls, []);
  });

  it("skips with the preflight's reason when the driver can't be homed", async function () {
    const { calls, deps } = harness({
      appSurfacePreflight: async () => {
        calls.push("preflight");
        return { ok: false, reason: "driver install failed" };
      },
    });
    const result = await run(deps);
    assert.equal(result.outcome, "skipped");
    assert.match(result.note, /driver install failed/);
    assert.deepEqual(calls, ["preflight"]);
  });

  it("skips when the device plan can't resolve, without starting a server", async function () {
    const { calls, deps } = harness({
      acquireDevice: async () => {
        calls.push("acquire");
        return { skip: "no AVD resolvable" };
      },
    });
    const result = await run(deps);
    assert.equal(result.outcome, "skipped");
    assert.match(result.note, /no AVD resolvable/);
    assert.ok(!calls.includes("server"));
  });

  it("still kills the server when the throwaway session fails", async function () {
    const { calls, deps } = harness({
      driverStart: async () => {
        calls.push("session");
        throw new Error("Chrome not present on image");
      },
    });
    await assert.rejects(() => run(deps), /Chrome not present/);
    assert.ok(calls.includes("killTree:4242"), `calls: ${calls}`);
    assert.ok(!calls.includes("deleteSession"));
  });
});
