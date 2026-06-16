import { expect } from "chai";
import {
  resolveRecordPlan,
  coerceRecordContextBrowser,
  safeContextId,
  browserCaptureTitle,
  browserDownloadDir,
  buildCaptureArgs,
  resolveCropGeometry,
  jobIsFfmpegRecording,
  computeEffectiveConcurrency,
  parseMacScreenIndex,
  checkSystemBinary,
  xvfbDisplay,
} from "../dist/core/tests/ffmpegRecorder.js";

describe("ffmpegRecorder", function () {
  describe("resolveRecordPlan", function () {
    it("auto-resolves chrome + headed to the browser engine", function () {
      const plan = resolveRecordPlan({
        step: { record: true },
        context: { browser: { name: "chrome", headless: false } },
      });
      expect(plan).to.deep.equal({
        name: "browser",
        target: "display",
        fps: 30,
      });
    });

    it("auto-resolves non-chrome, headless, or no browser to ffmpeg", function () {
      for (const browser of [
        { name: "firefox", headless: false },
        { name: "chrome", headless: true },
        undefined,
      ]) {
        const plan = resolveRecordPlan({
          step: { record: true },
          context: { browser },
        });
        expect(plan.name, JSON.stringify(browser)).to.equal("ffmpeg");
      }
    });

    it("honors an explicit engine string shorthand with defaults filled", function () {
      const plan = resolveRecordPlan({
        step: { record: { path: "x.mp4", engine: "ffmpeg" } },
        context: { browser: { name: "chrome", headless: false } },
      });
      expect(plan).to.deep.equal({ name: "ffmpeg", target: "display", fps: 30 });
    });

    it("honors an explicit engine object and fills remaining defaults", function () {
      const plan = resolveRecordPlan({
        step: { record: { engine: { name: "ffmpeg", target: "window" } } },
        context: {},
      });
      expect(plan).to.deep.equal({ name: "ffmpeg", target: "window", fps: 30 });
    });

    it("normalizes string shorthand and object form to the same plan", function () {
      const a = resolveRecordPlan({
        step: { record: { engine: "ffmpeg" } },
        context: {},
      });
      const b = resolveRecordPlan({
        step: { record: { engine: { name: "ffmpeg" } } },
        context: {},
      });
      expect(a).to.deep.equal(b);
    });
  });

  describe("coerceRecordContextBrowser", function () {
    const chromeApps = [{ name: "chrome" }, { name: "firefox" }];

    it("coerces an unspecified browser to headed chrome when a record step lacks an engine and chrome is available", function () {
      const out = coerceRecordContextBrowser({
        context: { steps: [{ record: true }] },
        availableApps: chromeApps,
      });
      expect(out).to.deep.equal({ name: "chrome", headless: false });
    });

    it("does not coerce when the browser was user-specified", function () {
      const out = coerceRecordContextBrowser({
        context: { browser: { name: "firefox" }, steps: [{ record: true }] },
        availableApps: chromeApps,
      });
      expect(out).to.equal(null);
    });

    it("does not coerce when the record step specifies an engine", function () {
      const out = coerceRecordContextBrowser({
        context: { steps: [{ record: { engine: "ffmpeg" } }] },
        availableApps: chromeApps,
      });
      expect(out).to.equal(null);
    });

    it("does not coerce when chrome is unavailable", function () {
      const out = coerceRecordContextBrowser({
        context: { steps: [{ record: true }] },
        availableApps: [{ name: "firefox" }],
      });
      expect(out).to.equal(null);
    });

    it("does not coerce when there is no record step", function () {
      const out = coerceRecordContextBrowser({
        context: { steps: [{ goTo: "x" }] },
        availableApps: chromeApps,
      });
      expect(out).to.equal(null);
    });

    it("does not coerce for an explicit record: false", function () {
      const out = coerceRecordContextBrowser({
        context: { steps: [{ record: false }] },
        availableApps: chromeApps,
      });
      expect(out).to.equal(null);
    });
  });

  describe("browser engine paths", function () {
    it("derives a unique capture title per contextId", function () {
      expect(browserCaptureTitle("chrome-2")).to.equal("RECORD_ME_chrome-2");
      expect(browserCaptureTitle("a")).to.not.equal(browserCaptureTitle("b"));
    });

    it("derives a per-context download dir that varies by contextId", function () {
      expect(browserDownloadDir("a")).to.not.equal(browserDownloadDir("b"));
      expect(browserDownloadDir("a")).to.contain("a");
    });

    it("sanitizes a traversal contextId so it can't escape the temp dir", function () {
      expect(safeContextId("../../etc")).to.not.match(/[\\/]/);
      expect(safeContextId("..")).to.not.match(/[\\/]/);
      expect(safeContextId("")).to.not.match(/[\\/]/);
      expect(browserCaptureTitle("../x")).to.not.match(/[\\/]/);
      // The download dir's leaf segment contains no path separator.
      const dir = browserDownloadDir("../../evil");
      expect(/recordings[\\/][^\\/]+$/.test(dir)).to.equal(true);
    });

    it("keeps distinct ids distinct after sanitization (no collision)", function () {
      // Different raw ids that sanitize to the same base must not collide.
      expect(safeContextId("a/b")).to.not.equal(safeContextId("a\\b"));
      expect(safeContextId("..")).to.not.equal(safeContextId(""));
      // A clean, already-safe id is left untouched (no hash noise).
      expect(safeContextId("mac-chrome-2")).to.equal("mac-chrome-2");
    });
  });

  describe("buildCaptureArgs", function () {
    it("builds gdigrab args on win32 with framerate before -i", function () {
      const args = buildCaptureArgs({
        platform: "win32",
        fps: 30,
        outputPath: "out.mkv",
      });
      expect(args).to.include("gdigrab");
      expect(args).to.include("desktop");
      expect(args).to.include("yuv420p");
      expect(args[args.length - 1]).to.equal("out.mkv");
      expect(args.indexOf("-framerate")).to.be.lessThan(args.indexOf("-i"));
    });

    it("builds avfoundation args on darwin honoring fps", function () {
      const args = buildCaptureArgs({
        platform: "darwin",
        fps: 24,
        outputPath: "out.mkv",
      });
      expect(args).to.include("avfoundation");
      expect(args).to.include("24");
    });

    it("builds x11grab args on linux using the provided DISPLAY", function () {
      const args = buildCaptureArgs({
        platform: "linux",
        fps: 30,
        displayEnv: ":99",
        outputPath: "out.mkv",
      });
      expect(args).to.include("x11grab");
      expect(args).to.include(":99");
    });

    it("defaults the linux display to :0.0", function () {
      const args = buildCaptureArgs({
        platform: "linux",
        fps: 30,
        outputPath: "out.mkv",
      });
      expect(args).to.include(":0.0");
    });

    it("passes -video_size before -i on linux when a screen size is given", function () {
      const args = buildCaptureArgs({
        platform: "linux",
        fps: 30,
        displayEnv: ":99",
        screenSize: "1920x1080",
        outputPath: "out.mkv",
      });
      expect(args).to.include("-video_size");
      expect(args).to.include("1920x1080");
      expect(args.indexOf("-video_size")).to.be.lessThan(args.indexOf("-i"));
    });

    it("omits -video_size on linux when no screen size is given", function () {
      const args = buildCaptureArgs({
        platform: "linux",
        fps: 30,
        displayEnv: ":99",
        outputPath: "out.mkv",
      });
      expect(args).to.not.include("-video_size");
    });

    it("throws on an unsupported platform", function () {
      expect(() =>
        buildCaptureArgs({ platform: "sunos", fps: 30, outputPath: "o" })
      ).to.throw();
    });
  });

  describe("resolveCropGeometry", function () {
    it("returns null for the display target", async function () {
      const geo = await resolveCropGeometry({ driver: {}, target: "display" });
      expect(geo).to.equal(null);
    });

    it("computes a viewport crop from window metrics scaled by DPR", async function () {
      const driver = {
        execute: async () => ({ x: 10, y: 20, w: 800, h: 600, dpr: 2 }),
      };
      const geo = await resolveCropGeometry({ driver, target: "viewport" });
      expect(geo).to.deep.equal({ x: 20, y: 40, w: 1600, h: 1200 });
    });

    it("computes a window crop from getWindowRect (dpr=1 when unavailable)", async function () {
      const driver = {
        getWindowRect: async () => ({ x: 5, y: 6, width: 1024, height: 768 }),
      };
      const geo = await resolveCropGeometry({ driver, target: "window" });
      expect(geo).to.deep.equal({ x: 5, y: 6, w: 1024, h: 768 });
    });

    it("scales the window crop by devicePixelRatio on HiDPI", async function () {
      const driver = {
        getWindowRect: async () => ({ x: 5, y: 6, width: 1024, height: 768 }),
        execute: async () => 2,
      };
      const geo = await resolveCropGeometry({ driver, target: "window" });
      expect(geo).to.deep.equal({ x: 10, y: 12, w: 2048, h: 1536 });
    });
  });

  describe("jobIsFfmpegRecording", function () {
    it("is true only for jobs whose record step resolves to ffmpeg", function () {
      const ffmpeg = {
        context: { steps: [{ record: { engine: "ffmpeg" } }] },
      };
      const browser = {
        context: {
          browser: { name: "chrome", headless: false },
          steps: [{ record: true }],
        },
      };
      const none = { context: { steps: [{ goTo: "x" }] } };
      const disabled = { context: { steps: [{ record: false }] } };
      expect(jobIsFfmpegRecording(ffmpeg)).to.equal(true);
      expect(jobIsFfmpegRecording(browser)).to.equal(false);
      expect(jobIsFfmpegRecording(none)).to.equal(false);
      expect(jobIsFfmpegRecording(disabled)).to.equal(false);
    });
  });

  describe("computeEffectiveConcurrency", function () {
    const ffmpegJob = {
      context: { contextId: "ff", steps: [{ record: { engine: "ffmpeg" } }] },
    };
    const browserJob = {
      context: {
        browser: { name: "chrome", headless: false },
        steps: [{ record: true }],
      },
    };
    const plainJob = { context: { steps: [{ goTo: "x" }] } };

    it("does not cap when there is no ffmpeg recording", function () {
      const r = computeEffectiveConcurrency({
        requestedLimit: 4,
        jobs: [browserJob, plainJob],
        platform: "win32",
        xvfbAvailable: false,
      });
      expect(r).to.deep.equal({ limit: 4, xvfbContexts: [], forcedSerial: false });
    });

    it("forces serial for ffmpeg recording on win/mac", function () {
      for (const platform of ["win32", "darwin"]) {
        const r = computeEffectiveConcurrency({
          requestedLimit: 4,
          jobs: [ffmpegJob, plainJob],
          platform,
          xvfbAvailable: true,
        });
        expect(r.limit, platform).to.equal(1);
        expect(r.forcedSerial, platform).to.equal(true);
      }
    });

    it("keeps concurrency for ffmpeg recording on linux with xvfb", function () {
      const r = computeEffectiveConcurrency({
        requestedLimit: 4,
        jobs: [ffmpegJob],
        platform: "linux",
        xvfbAvailable: true,
      });
      expect(r.limit).to.equal(4);
      expect(r.forcedSerial).to.equal(false);
      expect(r.xvfbContexts.length).to.equal(1);
    });

    it("forces serial for ffmpeg recording on linux without xvfb", function () {
      const r = computeEffectiveConcurrency({
        requestedLimit: 4,
        jobs: [ffmpegJob],
        platform: "linux",
        xvfbAvailable: false,
      });
      expect(r.limit).to.equal(1);
      expect(r.forcedSerial).to.equal(true);
    });

    it("does not flag forcedSerial when the requested limit was already 1", function () {
      const r = computeEffectiveConcurrency({
        requestedLimit: 1,
        jobs: [ffmpegJob],
        platform: "win32",
        xvfbAvailable: false,
      });
      expect(r.limit).to.equal(1);
      expect(r.forcedSerial).to.equal(false);
    });
  });

  describe("parseMacScreenIndex", function () {
    it("finds the screen index on a camera-less host (screen at 0)", function () {
      const listing = [
        "[AVFoundation indev @ 0x1] AVFoundation video devices:",
        "[AVFoundation indev @ 0x1] [0] Capture screen 0",
        "[AVFoundation indev @ 0x1] AVFoundation audio devices:",
        "[AVFoundation indev @ 0x1] [0] MacBook Pro Microphone",
      ].join("\n");
      expect(parseMacScreenIndex(listing)).to.equal("0");
    });

    it("finds the screen index past a camera (screen at 1)", function () {
      const listing = [
        "[AVFoundation indev] AVFoundation video devices:",
        "[AVFoundation indev] [0] FaceTime HD Camera",
        "[AVFoundation indev] [1] Capture screen 0",
      ].join("\n");
      expect(parseMacScreenIndex(listing)).to.equal("1");
    });

    it("returns null when no screen device is listed", function () {
      expect(parseMacScreenIndex("[0] FaceTime HD Camera")).to.equal(null);
      expect(parseMacScreenIndex("")).to.equal(null);
    });
  });

  describe("xvfbDisplay", function () {
    it("offsets displays past :0 and gives each runner a distinct display", function () {
      expect(xvfbDisplay(0)).to.equal(":99");
      expect(xvfbDisplay(1)).to.equal(":100");
      expect(xvfbDisplay(0)).to.not.equal(xvfbDisplay(1));
    });
  });

  describe("checkSystemBinary", function () {
    it("returns false for a binary that does not exist", async function () {
      const ok = await checkSystemBinary("definitely-not-a-real-binary-xyz");
      expect(ok).to.equal(false);
    });
  });
});
