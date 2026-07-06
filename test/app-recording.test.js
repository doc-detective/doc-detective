// Phase A7 — recording on app surfaces and mobile devices.
// startRecording's app-surface routing (desktop ffmpeg window capture) and
// the internal device engine (Appium startRecordingScreen on android/ios),
// exercised with fake drivers/app sessions — no real ffmpeg or Appium.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { startRecording } from "../dist/core/tests/startRecording.js";

function makeAppSession({ surfaces = [], deviceSessions = [] } = {}) {
  return {
    surfaces: new Map(surfaces.map((s) => [s.name, s])),
    deviceSessions: new Map(deviceSessions.map((d) => [d.name, d])),
    recordingHost: { state: { recordings: [] } },
    activeApp: surfaces[0]?.name,
  };
}

// A fake ffmpeg process handle that "starts" successfully.
function makeFakeProc() {
  return {
    exitCode: null,
    stderr: { on() {} },
    on() {},
    stdin: { write() {}, end() {} },
    kill() {},
  };
}

describe("startRecording: app surfaces (desktop)", function () {
  this.timeout(15000);
  let tmpDir;
  const config = {};

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-apprec-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("FAILs when the named app surface isn't open", async function () {
    const result = await startRecording({
      config,
      context: { platform: "windows" },
      step: {
        stepId: "x",
        record: { path: path.join(tmpDir, "a.mp4"), surface: { app: "ghost" } },
      },
      driver: undefined,
      appSession: makeAppSession(),
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /No app surface named "ghost"/);
  });

  it("FAILs on a window selector (not supported on app recordings)", async function () {
    const appSession = makeAppSession({
      surfaces: [
        { name: "notepad", appId: "notepad.exe", driver: {}, platform: "windows" },
      ],
    });
    const result = await startRecording({
      config,
      context: { platform: "windows" },
      step: {
        stepId: "x",
        record: {
          path: path.join(tmpDir, "a.mp4"),
          surface: { app: "notepad", window: -1 },
        },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /[Ww]indow selectors on app recordings/);
  });

  it("SKIPs a viewport target on an app surface with guidance", async function () {
    const appSession = makeAppSession({
      surfaces: [
        { name: "notepad", appId: "notepad.exe", driver: {}, platform: "windows" },
      ],
    });
    const result = await startRecording({
      config,
      context: { platform: "windows" },
      step: {
        stepId: "x",
        record: {
          path: path.join(tmpDir, "a.mp4"),
          surface: { app: "notepad" },
          engine: { name: "ffmpeg", target: "viewport" },
        },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "SKIPPED");
    assert.match(result.description, /viewport/);
    assert.match(result.description, /window.*display|display.*window/);
  });

  it("SKIPs an explicit browser engine on an app surface with guidance", async function () {
    const appSession = makeAppSession({
      surfaces: [
        { name: "notepad", appId: "notepad.exe", driver: {}, platform: "windows" },
      ],
    });
    const result = await startRecording({
      config,
      context: {
        platform: "windows",
        browser: { name: "chrome", headless: false },
      },
      step: {
        stepId: "x",
        record: {
          path: path.join(tmpDir, "a.mp4"),
          surface: { app: "notepad" },
          engine: "browser",
        },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "SKIPPED");
    assert.match(result.description, /browser engine/);
  });

  it("records an app surface with an unscaled window crop rect (default window target)", async function () {
    let cursorTouched = false;
    const appDriver = {
      getWindowRect: async () => ({ x: 10, y: 20, width: 300, height: 200 }),
      execute: async () => {
        cursorTouched = true;
        return 1;
      },
    };
    const appSession = makeAppSession({
      surfaces: [
        {
          name: "notepad",
          appId: "notepad.exe",
          driver: appDriver,
          platform: "windows",
        },
      ],
    });
    const result = await startRecording({
      config,
      context: { platform: "windows" },
      step: {
        stepId: "x",
        record: { path: path.join(tmpDir, "a.mp4"), surface: { app: "notepad" } },
      },
      driver: undefined,
      appSession,
      deps: {
        spawn: () => makeFakeProc(),
        getFfmpegPath: async () => "ffmpeg",
      },
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.recording.type, "ffmpeg");
    // Unscaled driver units + a pending-scale marker: the stop-side transcode
    // derives the physical-pixel scale from the capture frame size.
    assert.deepEqual(result.recording.cropRect, { x: 10, y: 20, w: 300, h: 200 });
    assert.equal(result.recording.cropPendingScale, true);
    // No browser session: the synthetic cursor is a browser-page concept.
    assert.equal(cursorTouched, false);
  });

  it("explicit display target on an app surface records without a crop", async function () {
    const appDriver = {
      getWindowRect: async () => ({ x: 10, y: 20, width: 300, height: 200 }),
    };
    const appSession = makeAppSession({
      surfaces: [
        {
          name: "notepad",
          appId: "notepad.exe",
          driver: appDriver,
          platform: "windows",
        },
      ],
    });
    const result = await startRecording({
      config,
      context: { platform: "windows" },
      step: {
        stepId: "x",
        record: {
          path: path.join(tmpDir, "a.mp4"),
          surface: { app: "notepad" },
          engine: { name: "ffmpeg", target: "display" },
        },
      },
      driver: undefined,
      appSession,
      deps: {
        spawn: () => makeFakeProc(),
        getFfmpegPath: async () => "ffmpeg",
      },
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.recording.type, "ffmpeg");
    assert.equal(result.recording.cropRect, undefined);
    assert.equal(result.recording.cropPendingScale, undefined);
  });
});

describe("startRecording: device engine (android/ios)", function () {
  this.timeout(15000);
  let tmpDir;
  const config = {};

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-devrec-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("records an android app surface via startRecordingScreen (no ffmpeg spawn)", async function () {
    let recordingOpts = null;
    let spawned = false;
    const appDriver = {
      startRecordingScreen: async (opts) => {
        recordingOpts = opts;
      },
    };
    const appSession = makeAppSession({
      surfaces: [
        {
          name: "chat",
          appId: "com.example.chat",
          driver: appDriver,
          platform: "android",
          deviceName: "Pixel_7",
        },
      ],
      deviceSessions: [
        { name: "Pixel_7", driver: appDriver, foregroundApp: "com.example.chat" },
      ],
    });
    const result = await startRecording({
      config,
      context: { platform: "android" },
      step: {
        stepId: "x",
        record: { path: path.join(tmpDir, "a.mp4"), surface: { app: "chat" } },
      },
      driver: undefined,
      appSession,
      deps: {
        spawn: () => {
          spawned = true;
          return makeFakeProc();
        },
      },
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.recording.type, "appium");
    assert.equal(result.recording.driver, appDriver);
    assert.equal(result.recording.targetPath, path.join(tmpDir, "a.mp4"));
    assert.equal(recordingOpts.timeLimit, 1800);
    assert.equal(spawned, false);
  });

  it("passes iOS-specific options (videoType h264)", async function () {
    let recordingOpts = null;
    const appDriver = {
      startRecordingScreen: async (opts) => {
        recordingOpts = opts;
      },
    };
    const appSession = makeAppSession({
      surfaces: [
        {
          name: "app",
          appId: "com.example.app",
          driver: appDriver,
          platform: "ios",
          deviceName: "iPhone_15",
        },
      ],
      deviceSessions: [
        { name: "iPhone_15", driver: appDriver, foregroundApp: "com.example.app" },
      ],
    });
    const result = await startRecording({
      config,
      context: { platform: "ios" },
      step: {
        stepId: "x",
        record: { path: path.join(tmpDir, "a.mp4"), surface: { app: "app" } },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "PASS");
    assert.equal(recordingOpts.videoType, "h264");
    assert.equal(recordingOpts.timeLimit, 1800);
  });

  it("records a mobile-web context through the device browser driver", async function () {
    let recordingOpts = null;
    const deviceBrowserDriver = {
      startRecordingScreen: async (opts) => {
        recordingOpts = opts;
      },
    };
    const result = await startRecording({
      config,
      context: { platform: "android", browser: { name: "chrome" } },
      step: { stepId: "x", record: { path: path.join(tmpDir, "a.mp4") } },
      driver: deviceBrowserDriver,
      appSession: undefined,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.recording.type, "appium");
    assert.equal(result.recording.driver, deviceBrowserDriver);
    assert.equal(recordingOpts.timeLimit, 1800);
  });

  it("SKIPs an explicit desktop engine on a mobile context with guidance", async function () {
    for (const engine of ["ffmpeg", "browser"]) {
      const result = await startRecording({
        config,
        context: { platform: "android" },
        step: {
          stepId: "x",
          record: { path: path.join(tmpDir, `${engine}.mp4`), engine },
        },
        driver: undefined,
        appSession: makeAppSession(),
      });
      assert.equal(result.status, "SKIPPED", engine);
      assert.match(result.description, /device screen/);
    }
  });

  it("FAILs when the driver can't start the device recording", async function () {
    const appDriver = {
      startRecordingScreen: async () => {
        throw new Error("screenrecord unavailable");
      },
    };
    const appSession = makeAppSession({
      surfaces: [
        {
          name: "chat",
          appId: "com.example.chat",
          driver: appDriver,
          platform: "android",
          deviceName: "Pixel_7",
        },
      ],
      deviceSessions: [
        { name: "Pixel_7", driver: appDriver, foregroundApp: "com.example.chat" },
      ],
    });
    const result = await startRecording({
      config,
      context: { platform: "android" },
      step: {
        stepId: "x",
        record: { path: path.join(tmpDir, "a.mp4"), surface: { app: "chat" } },
      },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /screenrecord unavailable/);
  });

  it("returns a pending handle when no device session exists yet (autoRecord shape)", async function () {
    const result = await startRecording({
      config,
      context: { platform: "android" },
      step: { stepId: "x", record: { path: path.join(tmpDir, "a.mp4") } },
      driver: undefined,
      appSession: makeAppSession(),
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.recording.type, "appium-pending");
    assert.equal(result.recording.targetPath, path.join(tmpDir, "a.mp4"));
  });

  it("starts immediately on an existing device session when no surface is targeted", async function () {
    let recordingOpts = null;
    const sessionDriver = {
      startRecordingScreen: async (opts) => {
        recordingOpts = opts;
      },
    };
    const appSession = makeAppSession({
      deviceSessions: [{ name: "Pixel_7", driver: sessionDriver }],
    });
    const result = await startRecording({
      config,
      context: { platform: "android" },
      step: { stepId: "x", record: { path: path.join(tmpDir, "a.mp4") } },
      driver: undefined,
      appSession,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.recording.type, "appium");
    assert.equal(result.recording.driver, sessionDriver);
    assert.equal(recordingOpts.timeLimit, 1800);
  });
});
