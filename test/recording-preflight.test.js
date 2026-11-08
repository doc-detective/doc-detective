// Recording preflight (ADR 01177, DA3/DA4): once per run, before any test,
// check what the planned recordings need on this host. Every probe is
// injected, so each platform's branch runs on any host.
import { expect } from "chai";
import {
  recordingPreflight,
  planRecordingPreflight,
  frameProbeArgs,
  macScreenStatus,
  preflightKey,
} from "../dist/core/tests/ffmpegRecorder.js";

const pass = async () => ({ ok: true });
const okDeps = (extra = {}) => ({
  ffmpegVersion: pass,
  captureFrame: pass,
  macScreenRecording: async () => true,
  macScreen: async () => "found",
  hasXvfb: async () => false,
  display: ":0",
  ...extra,
});

describe("recordingPreflight", function () {
  it("fails every engine when the managed ffmpeg doesn't run", async function () {
    const deps = okDeps({ ffmpegVersion: async () => ({ ok: false, cause: "spawn ENOENT" }) });
    for (const plan of ["ffmpeg", "browser", "device"]) {
      expect(await recordingPreflight({ platform: "win32", plan, deps }), plan).to.deep.equal({
        ok: false,
        reason: "ffmpeg isn't available (spawn ENOENT)",
        fix: "run `doc-detective install runtime @ffmpeg-installer/ffmpeg`",
      });
    }
  });

  it("checks only ffmpeg for the browser engine and device recordings", async function () {
    let captured = 0;
    const deps = okDeps({
      captureFrame: async () => {
        captured++;
        return { ok: false, cause: "x" };
      },
      macScreenRecording: async () => false,
      hasXvfb: async () => false,
      display: undefined,
    });
    for (const platform of ["win32", "darwin", "linux"]) {
      for (const plan of ["browser", "device"]) {
        expect(await recordingPreflight({ platform, plan, deps })).to.deep.equal({ ok: true });
      }
    }
    expect(captured).to.equal(0);
  });

  describe("Windows screen capture", function () {
    it("passes when a one-frame capture works", async function () {
      expect(await recordingPreflight({ platform: "win32", plan: "ffmpeg", deps: okDeps() })).to.deep.equal({ ok: true });
    });

    it("fails when a one-frame capture fails", async function () {
      const deps = okDeps({ captureFrame: async () => ({ ok: false, cause: "Could not capture desktop" }) });
      expect(await recordingPreflight({ platform: "win32", plan: "ffmpeg", deps })).to.deep.equal({
        ok: false,
        reason: "ffmpeg can't capture the desktop (Could not capture desktop)",
        fix: "run Doc Detective in a signed-in desktop session, not as a service",
      });
    });
  });

  describe("macOS screen capture", function () {
    it("fails without Screen Recording permission", async function () {
      const deps = okDeps({ macScreenRecording: async () => false });
      expect(await recordingPreflight({ platform: "darwin", plan: "ffmpeg", deps })).to.deep.equal({
        ok: false,
        reason: "macOS hasn't given Screen Recording permission to the app that runs Doc Detective",
        fix: "turn it on in System Settings → Privacy & Security → Screen Recording for your terminal, IDE, or CI runner",
      });
    });

    it("never fails on an inconclusive permission probe", async function () {
      const deps = okDeps({ macScreenRecording: async () => null });
      expect(await recordingPreflight({ platform: "darwin", plan: "ffmpeg", deps })).to.deep.equal({ ok: true });
    });

    it("fails when ffmpeg's device listing shows no screen", async function () {
      const deps = okDeps({ macScreen: async () => "none" });
      expect(await recordingPreflight({ platform: "darwin", plan: "ffmpeg", deps })).to.deep.equal({
        ok: false,
        reason: "ffmpeg can't see a screen to capture",
        fix: "run in a signed-in desktop session",
      });
    });

    // A listing that timed out or couldn't run says nothing about the screen;
    // startRecording falls back to screen 0 then.
    it("never fails on an inconclusive screen listing", async function () {
      const deps = okDeps({ macScreen: async () => "unknown" });
      expect(await recordingPreflight({ platform: "darwin", plan: "ffmpeg", deps })).to.deep.equal({ ok: true });
    });
  });

  describe("macScreenStatus", function () {
    it("reads a completed device listing as found or none, and anything else as unknown", function () {
      const listing = (devices) =>
        `[AVFoundation indev @ 0x1] AVFoundation video devices:\n${devices}[AVFoundation indev @ 0x1] AVFoundation audio devices:\n`;
      expect(macScreenStatus(listing("[AVFoundation indev @ 0x1] [0] FaceTime HD Camera\n[AVFoundation indev @ 0x1] [1] Capture screen 0\n"))).to.equal("found");
      expect(macScreenStatus(listing("[AVFoundation indev @ 0x1] [0] FaceTime HD Camera\n"))).to.equal("none");
      expect(macScreenStatus(null)).to.equal("unknown");
      expect(macScreenStatus("dyld: Library not loaded")).to.equal("unknown");
    });
  });

  describe("Linux screen capture", function () {
    it("passes on a working DISPLAY", async function () {
      const deps = okDeps({ hasXvfb: async () => false });
      expect(await recordingPreflight({ platform: "linux", plan: "ffmpeg", deps })).to.deep.equal({ ok: true, xvfb: false });
    });

    it("passes with Xvfb and no DISPLAY, and reports Xvfb", async function () {
      const deps = okDeps({ display: undefined, hasXvfb: async () => true });
      expect(await recordingPreflight({ platform: "linux", plan: "ffmpeg", deps })).to.deep.equal({ ok: true, xvfb: true });
    });

    it("fails with no working DISPLAY and no Xvfb", async function () {
      for (const deps of [
        okDeps({ display: undefined }),
        okDeps({ captureFrame: async () => ({ ok: false, cause: "Cannot open display" }) }),
      ]) {
        expect(await recordingPreflight({ platform: "linux", plan: "ffmpeg", deps })).to.deep.equal({
          ok: false,
          reason: "there's no display to capture",
          fix: "install Xvfb or set DISPLAY",
        });
      }
    });
  });
});

// Android records with adb and writes the MP4 itself, so a broken ffmpeg
// mustn't drop its recordings: it has no preflight entry.
describe("preflightKey", function () {
  it("keys every engine by name, except Android device recordings", function () {
    expect(preflightKey("ffmpeg", "windows")).to.equal("ffmpeg");
    expect(preflightKey("browser", "linux")).to.equal("browser");
    expect(preflightKey("device", "ios")).to.equal("device");
    expect(preflightKey("device", "android")).to.equal(null);
  });
});

describe("planRecordingPreflight", function () {
  it("runs each probe once across engines", async function () {
    const calls = { ffmpeg: 0, frame: 0 };
    const deps = okDeps({
      ffmpegVersion: async () => {
        calls.ffmpeg++;
        return { ok: true };
      },
      captureFrame: async () => {
        calls.frame++;
        return { ok: true };
      },
    });
    const results = await planRecordingPreflight({
      platform: "win32",
      plans: new Set(["ffmpeg", "browser", "device"]),
      deps,
    });
    expect(results).to.deep.equal({ ffmpeg: { ok: true }, browser: { ok: true }, device: { ok: true } });
    expect(calls).to.deep.equal({ ffmpeg: 1, frame: 1 });
  });

  it("runs no probe when nothing records", async function () {
    let called = false;
    const deps = okDeps({
      ffmpegVersion: async () => {
        called = true;
        return { ok: true };
      },
    });
    expect(await planRecordingPreflight({ platform: "win32", plans: new Set(), deps })).to.deep.equal({});
    expect(called).to.equal(false);
  });
});

describe("frameProbeArgs", function () {
  it("captures one frame with the recorder's own input arguments", function () {
    expect(frameProbeArgs({ platform: "win32" })).to.deep.equal([
      "-y", "-f", "gdigrab", "-framerate", "1", "-i", "desktop",
      "-frames:v", "1", "-f", "null", "-",
    ]);
    expect(frameProbeArgs({ platform: "linux", displayEnv: ":5" })).to.deep.equal([
      "-y", "-f", "x11grab", "-framerate", "1", "-i", ":5",
      "-frames:v", "1", "-f", "null", "-",
    ]);
  });
});
