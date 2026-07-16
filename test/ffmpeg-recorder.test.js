import { expect } from "chai";
import os from "node:os";
import path from "node:path";
import {
  resolveRecordPlan,
  coerceRecordContextBrowser,
  parseCaptureFrameSize,
  parseMediaProbeStderr,
  deriveCropScale,
  ffmpegPathEnv,
  safeContextId,
  browserCaptureTitle,
  browserDownloadDir,
  buildCaptureArgs,
  resolveCropGeometry,
  jobIsFfmpegRecording,
  computeEffectiveConcurrency,
  jobExclusiveResources,
  isFfmpegRecordingForScheduling,
  contextHasRouting,
  parseMacScreenIndex,
  checkSystemBinary,
  xvfbDisplay,
  isRecordingActive,
  recordStepName,
  stopRecordTargetName,
  selectRecordingToStop,
  detectRecordingNameConflict,
  getFfmpegPath,
  detectMacScreenIndex,
  detectX11ScreenSize,
  startXvfb,
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

    it("resolves an app-surface record to ffmpeg with a window target, even on headed chrome", function () {
      const plan = resolveRecordPlan({
        step: { record: { path: "x.mp4", surface: { app: "notepad" } } },
        context: {
          platform: "windows",
          browser: { name: "chrome", headless: false },
        },
      });
      expect(plan).to.deep.equal({ name: "ffmpeg", target: "window", fps: 30 });
    });

    it("keeps an explicit display target on an app-surface record", function () {
      const plan = resolveRecordPlan({
        step: {
          record: {
            surface: { app: "notepad" },
            engine: { name: "ffmpeg", target: "display" },
          },
        },
        context: { platform: "windows" },
      });
      expect(plan.target).to.equal("display");
    });

    it("resolves mobile-platform contexts to the device plan", function () {
      for (const platform of ["android", "ios"]) {
        for (const record of [
          true,
          "out.mp4",
          { path: "x.mp4", surface: { app: "chat" } },
        ]) {
          const plan = resolveRecordPlan({
            step: { record },
            context: { platform },
          });
          expect(
            plan.name,
            `${platform}: ${JSON.stringify(record)}`
          ).to.equal("device");
        }
      }
    });

    it("lets an explicit engine win over the mobile device plan", function () {
      const plan = resolveRecordPlan({
        step: { record: { engine: "ffmpeg" } },
        context: { platform: "android" },
      });
      expect(plan.name).to.equal("ffmpeg");
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

    it("does not coerce when the engineless record targets an app surface", function () {
      const out = coerceRecordContextBrowser({
        context: { steps: [{ record: { surface: { app: "notepad" } } }] },
        availableApps: chromeApps,
      });
      expect(out).to.equal(null);
    });

    it("does not coerce mobile-platform contexts (device recording needs no browser)", function () {
      const out = coerceRecordContextBrowser({
        context: { platform: "android", steps: [{ record: true }] },
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

    it("computes a viewport crop offset past the browser chrome and scaled by DPR", async function () {
      // window at (10,20), 800x600 content inside an 800x700 outer window:
      // side border = 0, top chrome = 700-600 = 100. Content top-left =
      // (10, 120); scaled by dpr 2 => (20, 240), size 1600x1200.
      const driver = {
        execute: async () => ({
          sx: 10,
          sy: 20,
          iw: 800,
          ih: 600,
          ow: 800,
          oh: 700,
          dpr: 2,
        }),
      };
      const geo = await resolveCropGeometry({ driver, target: "viewport" });
      expect(geo).to.deep.equal({ x: 20, y: 240, w: 1600, h: 1200 });
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

  describe("parseCaptureFrameSize", function () {
    it("reads the input stream size from gdigrab stderr", function () {
      const stderr = [
        "Input #0, gdigrab, from 'desktop':",
        "  Duration: N/A, start: 1633.383824, bitrate: 3187760 kb/s",
        "  Stream #0:0: Video: bmp, bgra, 2560x1440, 3187760 kb/s, 30 fps, 30 tbr, 1000k tbn",
      ].join("\n");
      expect(parseCaptureFrameSize(stderr)).to.deep.equal({ w: 2560, h: 1440 });
    });

    it("reads the input stream size from avfoundation stderr", function () {
      const stderr = [
        "Input #0, avfoundation, from 'Capture screen 0':",
        "  Stream #0:0: Video: rawvideo (UYVY / 0x59565955), uyvy422, 2880x1800, 30 tbr, 1000k tbn",
      ].join("\n");
      expect(parseCaptureFrameSize(stderr)).to.deep.equal({ w: 2880, h: 1800 });
    });

    it("reads the input stream size from x11grab stderr", function () {
      const stderr = [
        "Input #0, x11grab, from ':99':",
        "  Stream #0:0: Video: rawvideo (BGR[0] / 0x30524742), bgr0, 1920x1080, 30 fps, 30 tbr, 1000k tbn",
      ].join("\n");
      expect(parseCaptureFrameSize(stderr)).to.deep.equal({ w: 1920, h: 1080 });
    });

    it("returns null when no stream line is present", function () {
      expect(parseCaptureFrameSize("ffmpeg version 6.0")).to.equal(null);
      expect(parseCaptureFrameSize("")).to.equal(null);
    });
  });

  describe("deriveCropScale", function () {
    it("derives the Retina scale from frame size over display points on darwin", function () {
      expect(
        deriveCropScale({
          platform: "darwin",
          frameSize: { w: 2880, h: 1800 },
          displayPointSize: { w: 1440, h: 900 },
        })
      ).to.equal(2);
    });

    it("rounds to two decimals", function () {
      expect(
        deriveCropScale({
          platform: "darwin",
          frameSize: { w: 2882, h: 1800 },
          displayPointSize: { w: 1440, h: 900 },
        })
      ).to.equal(2);
      expect(
        deriveCropScale({
          platform: "darwin",
          frameSize: { w: 2160, h: 1350 },
          displayPointSize: { w: 1440, h: 900 },
        })
      ).to.equal(1.5);
    });

    it("clamps implausible ratios into [1, 4]", function () {
      expect(
        deriveCropScale({
          platform: "darwin",
          frameSize: { w: 720, h: 450 },
          displayPointSize: { w: 1440, h: 900 },
        })
      ).to.equal(1);
      expect(
        deriveCropScale({
          platform: "darwin",
          frameSize: { w: 20000, h: 20000 },
          displayPointSize: { w: 1440, h: 900 },
        })
      ).to.equal(4);
    });

    it("falls back to 1 on missing inputs", function () {
      expect(
        deriveCropScale({ platform: "darwin", frameSize: null, displayPointSize: { w: 1440, h: 900 } })
      ).to.equal(1);
      expect(
        deriveCropScale({ platform: "darwin", frameSize: { w: 2880, h: 1800 }, displayPointSize: null })
      ).to.equal(1);
    });

    it("is 1 by construction on win32 and linux (physical-pixel rects)", function () {
      for (const platform of ["win32", "linux"]) {
        expect(
          deriveCropScale({
            platform,
            frameSize: { w: 2880, h: 1800 },
            displayPointSize: { w: 1440, h: 900 },
          }),
          platform
        ).to.equal(1);
      }
    });
  });

  describe("ffmpegPathEnv", function () {
    it("prepends the bundled ffmpeg's directory to the existing PATH", function () {
      const dir = path.join("C:", "cache", "ffmpeg-bin");
      const out = ffmpegPathEnv(path.join(dir, "ffmpeg.exe"), {
        Path: "C:\\Windows\\system32",
      });
      expect(out).to.deep.equal({
        Path: `${dir}${path.delimiter}C:\\Windows\\system32`,
      });
    });

    it("matches the PATH key case-insensitively and handles a missing PATH", function () {
      const dir = path.join("/opt", "ffmpeg");
      expect(
        ffmpegPathEnv(path.join(dir, "ffmpeg"), { PATH: "/usr/bin" })
      ).to.deep.equal({ PATH: `${dir}${path.delimiter}/usr/bin` });
      expect(ffmpegPathEnv(path.join(dir, "ffmpeg"), {})).to.deep.equal({
        PATH: dir,
      });
    });
  });

  // App-window rect validation moved to appWindows.appWindowRect (ADR 01036)
  // — covered in test/app-windows.test.js.

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

    it("counts a context whose second browser recording will fall back to ffmpeg", function () {
      // Two overlapping browser-engine recordings: the second falls back to
      // ffmpeg at runtime, so the planner must treat the context as ffmpeg.
      const overlap = {
        context: {
          browser: { name: "chrome", headless: false },
          steps: [
            { record: { name: "a", engine: "browser" } },
            { record: { name: "b", engine: "browser" } },
            { stopRecord: "b" },
            { stopRecord: "a" },
          ],
        },
      };
      expect(jobIsFfmpegRecording(overlap)).to.equal(true);
    });

    it("does not count browser recordings that startRecording would skip (headless/non-chrome)", function () {
      // Explicit browser-engine records on a context that can't run one are
      // SKIPPED at runtime, so two of them must NOT be classified as an ffmpeg
      // fallback (which would wrongly force serial/Xvfb).
      const headless = {
        context: {
          browser: { name: "chrome", headless: true },
          steps: [
            { record: { name: "a", engine: "browser" } },
            { record: { name: "b", engine: "browser" } },
          ],
        },
      };
      const firefox = {
        context: {
          browser: { name: "firefox", headless: false },
          steps: [
            { record: { name: "a", engine: "browser" } },
            { record: { name: "b", engine: "browser" } },
          ],
        },
      };
      expect(jobIsFfmpegRecording(headless)).to.equal(false);
      expect(jobIsFfmpegRecording(firefox)).to.equal(false);
    });

    it("does not count device-plan recordings on mobile contexts", function () {
      // Device recordings capture the device screen through the app driver —
      // they never touch the host display, so they must not serialize the run.
      for (const platform of ["android", "ios"]) {
        const job = {
          context: {
            platform,
            steps: [{ record: true }, { stopRecord: true }],
          },
        };
        expect(jobIsFfmpegRecording(job), platform).to.equal(false);
      }
    });

    it("does not count an explicit desktop engine on a mobile context (runtime SKIPs it)", function () {
      for (const engine of ["ffmpeg", "browser"]) {
        const job = {
          context: {
            platform: "android",
            browser: { name: "chrome", headless: false },
            steps: [
              { record: { name: "a", engine } },
              { record: { name: "b", engine } },
            ],
          },
        };
        expect(jobIsFfmpegRecording(job), engine).to.equal(false);
      }
    });

    it("counts an app-surface record on a desktop context as ffmpeg", function () {
      const job = {
        context: {
          platform: "windows",
          steps: [{ record: { surface: { app: "notepad" } } }],
        },
      };
      expect(jobIsFfmpegRecording(job)).to.equal(true);
    });

    it("does not count sequential (non-overlapping) browser recordings as ffmpeg", function () {
      const sequential = {
        context: {
          browser: { name: "chrome", headless: false },
          steps: [
            { record: { name: "a", engine: "browser" } },
            { stopRecord: "a" },
            { record: { name: "b", engine: "browser" } },
            { stopRecord: "b" },
          ],
        },
      };
      expect(jobIsFfmpegRecording(sequential)).to.equal(false);
    });

    it("does not count sequential ANONYMOUS browser recordings as ffmpeg (untargeted stopRecord LIFO pop)", function () {
      // Anonymous records (no `name`) paired with an untargeted stopRecord
      // (`true`) exercise the LIFO-pop branch (as opposed to the by-name
      // splice branch already covered by the targeted "sequential" test
      // above).
      const sequentialAnonymous = {
        context: {
          browser: { name: "chrome", headless: false },
          steps: [
            { record: { engine: "browser" } },
            { stopRecord: true },
            { record: { engine: "browser" } },
            { stopRecord: true },
          ],
        },
      };
      expect(jobIsFfmpegRecording(sequentialAnonymous)).to.equal(false);
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

    it("allows overlapping captures (parallel anyway) when opted in on win/mac", function () {
      for (const platform of ["win32", "darwin"]) {
        const r = computeEffectiveConcurrency({
          requestedLimit: 4,
          jobs: [ffmpegJob, plainJob],
          platform,
          xvfbAvailable: false,
          allowOverlappingCaptures: true,
        });
        expect(r.limit, platform).to.equal(4);
        expect(r.forcedSerial, platform).to.equal(false);
        expect(r.overlappingCaptures, platform).to.equal(true);
      }
    });

    it("still forces serial for ffmpeg without the overlap opt-in (no regression)", function () {
      const r = computeEffectiveConcurrency({
        requestedLimit: 4,
        jobs: [ffmpegJob],
        platform: "win32",
        xvfbAvailable: false,
        allowOverlappingCaptures: false,
      });
      expect(r.limit).to.equal(1);
      expect(r.forcedSerial).to.equal(true);
    });

    it("prefers Xvfb isolation over overlap even when overlap is allowed", function () {
      const r = computeEffectiveConcurrency({
        requestedLimit: 4,
        jobs: [ffmpegJob],
        platform: "linux",
        xvfbAvailable: true,
        allowOverlappingCaptures: true,
      });
      expect(r.limit).to.equal(4);
      expect(r.forcedSerial).to.equal(false);
      expect(r.xvfbContexts.length).to.equal(1);
      expect(r.overlappingCaptures).to.equal(undefined);
    });
  });

  describe("contextHasRouting", function () {
    it("detects step-level routing: if / goToStep / on* handlers", function () {
      expect(contextHasRouting({ steps: [{ goTo: "x", if: "$$platform == linux" }] })).to.equal(true);
      expect(contextHasRouting({ steps: [{ goTo: "x", goToStep: "later" }] })).to.equal(true);
      expect(contextHasRouting({ steps: [{ goTo: "x", onFail: [{ continue: true }] }] })).to.equal(true);
    });
    it("is false for plain steps and empty handler arrays", function () {
      expect(contextHasRouting({ steps: [{ goTo: "x" }, { wait: 10 }] })).to.equal(false);
      expect(contextHasRouting({ steps: [{ goTo: "x", onPass: [] }] })).to.equal(false);
      expect(contextHasRouting({ steps: [] })).to.equal(false);
    });
  });

  describe("isFfmpegRecordingForScheduling (over-approx for routed contexts)", function () {
    const visibleChrome = { name: "chrome", headless: false };

    it("uses precise detection for non-routed contexts (sequential browser records => not ffmpeg)", function () {
      const job = {
        context: {
          browser: visibleChrome,
          steps: [
            { record: { name: "a", engine: "browser" } },
            { stopRecord: "a" },
            { record: { name: "b", engine: "browser" } },
            { stopRecord: "b" },
          ],
        },
      };
      expect(isFfmpegRecordingForScheduling(job)).to.equal(false);
      // Sanity: precise detector agrees on the same (non-routed) shape.
      expect(jobIsFfmpegRecording(job)).to.equal(false);
    });

    it("over-approximates a routed context whose separating stopRecord could be skipped", function () {
      // Same two sequential browser records, but a routing jump on the
      // stopRecord step means it might not run -> the two could overlap and
      // the 2nd would fall back to ffmpeg. Must be treated as display-exclusive.
      const job = {
        context: {
          browser: visibleChrome,
          steps: [
            { record: { name: "a", engine: "browser" } },
            { stopRecord: "a", goToStep: "tail" },
            { record: { name: "b", engine: "browser" } },
            { stopRecord: "b" },
          ],
        },
      };
      expect(isFfmpegRecordingForScheduling(job)).to.equal(true);
    });

    it("flags any ffmpeg record in a routed context regardless of stopRecord", function () {
      const job = {
        context: {
          steps: [
            { goTo: "x", if: "$$platform == linux" },
            { record: { engine: "ffmpeg" } },
            { stopRecord: true },
          ],
        },
      };
      expect(isFfmpegRecordingForScheduling(job)).to.equal(true);
    });

    it("a routed context with no recording is not display-exclusive", function () {
      const job = { context: { steps: [{ goTo: "x", goToStep: "x" }] } };
      expect(isFfmpegRecordingForScheduling(job)).to.equal(false);
    });

    it("a routed mobile context with recordings is not display-exclusive", function () {
      // Even the over-approximation must not flag mobile contexts: every
      // recording there either runs on the device or is SKIPPED at runtime.
      const job = {
        context: {
          platform: "android",
          steps: [
            { goTo: "x", if: "$$platform == linux" },
            { record: true },
            { record: { engine: "ffmpeg" } },
            { stopRecord: true },
          ],
        },
      };
      expect(isFfmpegRecordingForScheduling(job)).to.equal(false);
    });
  });

  describe("jobExclusiveResources", function () {
    const ffmpegJob = { context: { steps: [{ record: { engine: "ffmpeg" } }] } };
    const browserJob = {
      context: {
        browser: { name: "chrome", headless: false },
        steps: [{ record: true }],
      },
    };
    const plainJob = { context: { steps: [{ goTo: "x" }] } };

    it("tags a shared-display ffmpeg recording with ['display']", function () {
      expect(
        jobExclusiveResources(ffmpegJob, { platform: "win32", xvfbAvailable: false })
      ).to.deep.equal(["display"]);
    });

    it("does not tag browser-engine, no-record, or overlap-opt-in jobs", function () {
      expect(jobExclusiveResources(browserJob, { platform: "win32", xvfbAvailable: false })).to.deep.equal([]);
      expect(jobExclusiveResources(plainJob, { platform: "win32", xvfbAvailable: false })).to.deep.equal([]);
      // autoRecord overlap opt-in.
      expect(jobExclusiveResources(ffmpegJob, { platform: "win32", xvfbAvailable: false, allowOverlappingCaptures: true })).to.deep.equal([]);
    });

    it("tags ffmpeg recordings on every platform, incl. Linux+Xvfb", function () {
      // Per-context Xvfb displays do not make concurrent recordings safe in
      // practice (driver sessions clobber), so recordings serialize everywhere.
      expect(jobExclusiveResources(ffmpegJob, { platform: "linux", xvfbAvailable: true })).to.deep.equal(["display"]);
      expect(jobExclusiveResources(ffmpegJob, { platform: "darwin", xvfbAvailable: false })).to.deep.equal(["display"]);
    });

    it("over-approximation feeds the tag for routed contexts", function () {
      const routed = {
        context: {
          browser: { name: "chrome", headless: false },
          steps: [
            { record: { name: "a", engine: "browser" } },
            { stopRecord: "a", goToStep: "tail" },
            { record: { name: "b", engine: "browser" } },
          ],
        },
      };
      expect(jobExclusiveResources(routed, { platform: "win32", xvfbAvailable: false })).to.deep.equal(["display"]);
    });

    it("does not tag mobile device-recording jobs (no host display involved)", function () {
      const deviceJob = {
        context: { platform: "android", steps: [{ record: true }, { stopRecord: true }] },
      };
      expect(
        jobExclusiveResources(deviceJob, { platform: "linux", xvfbAvailable: false })
      ).to.deep.equal([]);
      const conc = computeEffectiveConcurrency({
        requestedLimit: 4,
        jobs: [deviceJob],
        platform: "linux",
        xvfbAvailable: false,
      });
      expect(conc).to.deep.equal({ limit: 4, xvfbContexts: [], forcedSerial: false });
    });

    it("the autoRecord overlap opt-in leaves recordings untagged (parallel)", function () {
      // computeEffectiveConcurrency keeps the requested limit when overlap is
      // allowed; jobExclusiveResources agrees by leaving the display free.
      const ctx = { platform: "win32", xvfbAvailable: false, allowOverlappingCaptures: true };
      const conc = computeEffectiveConcurrency({ requestedLimit: 4, jobs: [ffmpegJob], ...ctx });
      expect(conc.forcedSerial).to.equal(false);
      expect(jobExclusiveResources(ffmpegJob, ctx)).to.deep.equal([]);
    });
  });

  describe("isRecordingActive", function () {
    it("is false for missing/empty recordings and true for >=1", function () {
      expect(isRecordingActive(undefined)).to.equal(false);
      expect(isRecordingActive({})).to.equal(false);
      expect(isRecordingActive({ state: {} })).to.equal(false);
      expect(isRecordingActive({ state: { recordings: [] } })).to.equal(false);
      expect(isRecordingActive({ state: { recordings: [{ id: "a" }] } })).to.equal(
        true
      );
    });
  });

  describe("recordStepName / stopRecordTargetName", function () {
    it("reads record name only from the detailed object form", function () {
      expect(recordStepName(true)).to.equal(undefined);
      expect(recordStepName("out.mp4")).to.equal(undefined);
      expect(recordStepName({ path: "out.mp4" })).to.equal(undefined);
      expect(recordStepName({ name: "demo" })).to.equal("demo");
      expect(recordStepName({ name: "  demo  " })).to.equal("demo");
      expect(recordStepName({ name: "   " })).to.equal(undefined);
    });

    it("reads stopRecord target from a string or { name }", function () {
      expect(stopRecordTargetName(true)).to.equal(undefined);
      expect(stopRecordTargetName(null)).to.equal(undefined);
      expect(stopRecordTargetName("demo")).to.equal("demo");
      expect(stopRecordTargetName({ name: "demo" })).to.equal("demo");
      expect(stopRecordTargetName({ name: "" })).to.equal(undefined);
    });
  });

  describe("selectRecordingToStop", function () {
    const synth = { id: "s", synthetic: true };
    const a = { id: "a", name: "a" };
    const b = { id: "b", name: "b" };

    it("LIFO returns the most-recent non-synthetic recording", function () {
      expect(selectRecordingToStop([synth, a, b], true)).to.equal(b);
      expect(selectRecordingToStop([synth, a], null)).to.equal(a);
    });

    it("LIFO skips the synthetic recording (returns undefined when only synthetic)", function () {
      expect(selectRecordingToStop([synth], true)).to.equal(undefined);
    });

    it("includeSynthetic lets LIFO stop the synthetic recording (cleanup path)", function () {
      expect(
        selectRecordingToStop([synth], true, { includeSynthetic: true })
      ).to.equal(synth);
    });

    it("targets a recording by name anywhere in the set", function () {
      expect(selectRecordingToStop([synth, a, b], "a")).to.equal(a);
      expect(selectRecordingToStop([synth, a, b], { name: "b" })).to.equal(b);
      expect(selectRecordingToStop([synth, a, b], "missing")).to.equal(undefined);
    });

    it("returns undefined for an empty set", function () {
      expect(selectRecordingToStop([], true)).to.equal(undefined);
    });
  });

  describe("detectRecordingNameConflict", function () {
    it("flags a name reused while still active", function () {
      const steps = [
        { record: { path: "a.mp4", name: "demo" } },
        { record: { path: "b.mp4", name: "demo" } },
      ];
      expect(detectRecordingNameConflict(steps)).to.equal("demo");
    });

    it("allows sequential reuse once the first is stopped", function () {
      const steps = [
        { record: { path: "a.mp4", name: "demo" } },
        { stopRecord: "demo" },
        { record: { path: "b.mp4", name: "demo" } },
      ];
      expect(detectRecordingNameConflict(steps)).to.equal(null);
    });

    it("allows overlapping recordings with distinct names", function () {
      const steps = [
        { record: { path: "a.mp4", name: "a" } },
        { record: { path: "b.mp4", name: "b" } },
        { stopRecord: "a" },
        { stopRecord: "b" },
      ];
      expect(detectRecordingNameConflict(steps)).to.equal(null);
    });

    it("never conflicts on anonymous recordings, and LIFO stop frees the stack", function () {
      const steps = [
        { record: true },
        { record: true },
        { stopRecord: true },
        { record: true },
      ];
      expect(detectRecordingNameConflict(steps)).to.equal(null);
    });

    it("returns null for non-array / empty input", function () {
      expect(detectRecordingNameConflict(undefined)).to.equal(null);
      expect(detectRecordingNameConflict([])).to.equal(null);
    });

    it("does not treat stopRecord: false as freeing the name", function () {
      // stopRecord: false is a no-op, so the first "dup" is still active.
      const steps = [
        { record: { path: "a.mp4", name: "dup" } },
        { stopRecord: false },
        { record: { path: "b.mp4", name: "dup" } },
      ];
      expect(detectRecordingNameConflict(steps)).to.equal("dup");
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

    it("returns false when spawn() throws synchronously (invalid binary name)", async function () {
      // A null byte in the command name makes Node's spawn() throw
      // synchronously (ERR_INVALID_ARG_VALUE) rather than emit an async
      // 'error' event -- exercising the try/catch's catch block, distinct
      // from the async ENOENT path covered above.
      const ok = await checkSystemBinary("bad\0name");
      expect(ok).to.equal(false);
    });
  });

  describe("getFfmpegPath", function () {
    it("resolves the real @ffmpeg-installer/ffmpeg binary path installed in node_modules", async function () {
      // @ffmpeg-installer/ffmpeg is a real dependency of this repo (installed
      // by `npm ci`), so this hermetically exercises loadHeavyDep's shim
      // resolution + the CJS/ESM .path extraction -- no process is spawned,
      // only the installed package's metadata is read.
      const p = await getFfmpegPath();
      expect(p).to.be.a("string");
      expect(p.length).to.be.greaterThan(0);
    });
  });

  describe("detectMacScreenIndex", function () {
    this.timeout(10000);

    it("resolves via the real spawn+close path when the binary launches (path is a real executable)", async function () {
      // detectMacScreenIndex's args are hardcoded, so we can't make a real
      // ffmpeg print a matching "Capture screen" line -- but pointing
      // ffmpegPath at the real Node binary spawns successfully, emits some
      // stderr, and closes quickly, exercising the full spawn/stderr/close
      // wiring (parseMacScreenIndex's regex logic is separately unit-tested
      // above). A `null` result here is expected (Node's own error output
      // won't match the ffmpeg-specific pattern) -- what matters is that it
      // resolves fast via the close handler, not the 5s timeout.
      const start = Date.now();
      const result = await detectMacScreenIndex(process.execPath);
      expect(Date.now() - start).to.be.lessThan(4000);
      expect(result === null || typeof result === "string").to.equal(true);
    });

    it("resolves null when the binary does not exist (ENOENT -> proc.on('error'))", async function () {
      const start = Date.now();
      const result = await detectMacScreenIndex(
        path.join(os.tmpdir(), "dd-definitely-not-a-real-ffmpeg-binary")
      );
      expect(Date.now() - start).to.be.lessThan(4000);
      expect(result).to.equal(null);
    });

    it("resolves null when spawn() throws synchronously (null byte in ffmpegPath)", async function () {
      // A null byte in the executable path makes Node's spawn() throw
      // synchronously rather than emit an async 'error' event, exercising
      // the outer try/catch's catch block (distinct from the async ENOENT
      // path above).
      const start = Date.now();
      const result = await detectMacScreenIndex("bad\0path");
      expect(Date.now() - start).to.be.lessThan(500);
      expect(result).to.equal(null);
    });
  });

  describe("detectX11ScreenSize", function () {
    it("resolves null when xdpyinfo is unavailable, without a display override", async function () {
      // xdpyinfo is not present on this (or most CI) machines, so this
      // exercises the real spawn -> ENOENT -> proc.on('error') -> done(null)
      // path, using process.env directly (no `display` argument).
      const start = Date.now();
      const result = await detectX11ScreenSize();
      expect(Date.now() - start).to.be.lessThan(4000);
      expect(result).to.equal(null);
    });

    it("resolves null when xdpyinfo is unavailable, with a display override (env spread + DISPLAY branch)", async function () {
      const start = Date.now();
      const result = await detectX11ScreenSize(":42");
      expect(Date.now() - start).to.be.lessThan(4000);
      expect(result).to.equal(null);
    });

    it("resolves null when spawn() throws synchronously (null byte in the DISPLAY env value)", async function () {
      // A null byte in an env var value makes Node's spawn() throw
      // synchronously ("must be a string without null bytes"), exercising
      // the outer try/catch's catch block -- distinct from the async ENOENT
      // path above.
      const start = Date.now();
      const result = await detectX11ScreenSize("bad\0display");
      expect(Date.now() - start).to.be.lessThan(500);
      expect(result).to.equal(null);
    });
  });

  describe("startXvfb", function () {
    this.timeout(10000);

    it("throws when the Xvfb binary does not exist (ENOENT surfaces via the spawnErr poll check)", async function () {
      // This asserts the spawnErr throw branch by relying on `Xvfb` being
      // ABSENT from PATH: spawn() then emits an async 'error' event, the
      // readiness-poll loop picks up `spawnErr` on its next iteration, and
      // re-throws it. That absence holds on macOS/Windows CI (Xvfb is a
      // Linux-only package), which cover this branch in the cross-platform
      // coverage union. It does NOT hold on the Linux legs, where
      // `install all` provisions a real Xvfb and startXvfb would instead
      // succeed (or time out) -- so skip there rather than assert a throw
      // that can't happen. startXvfb hardcodes the "Xvfb" binary with no
      // injection seam, so pointing it at a guaranteed-missing binary isn't
      // possible without a source change; the union already covers the line.
      if (process.platform === "linux") this.skip();
      const start = Date.now();
      let threw = null;
      try {
        await startXvfb(xvfbDisplay(97));
      } catch (e) {
        threw = e;
      }
      expect(Date.now() - start).to.be.lessThan(4000);
      expect(threw).to.not.equal(null);
      expect(threw.message).to.match(/ENOENT|spawn/i);
    });
  });
});

// parseMediaProbeStderr parses the human-readable `ffmpeg -i <file>` stderr
// into recording metadata. Canned blobs below are trimmed from real ffmpeg
// output for each supported container.
describe("parseMediaProbeStderr", function () {
  const MP4_STDERR = [
    "ffmpeg version 6.1.1-full_build Copyright (c) 2000-2023 the FFmpeg developers",
    "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'demo.mp4':",
    "  Metadata:",
    "    major_brand     : isom",
    "    encoder         : Lavf60.16.100",
    "  Duration: 00:00:05.43, start: 0.000000, bitrate: 1092 kb/s",
    "  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637634), yuv420p(progressive), 1280x720 [SAR 1:1 DAR 16:9], 1090 kb/s, 30 fps, 30 tbr, 15360 tbn (default)",
    "At least one output file must be specified",
  ].join("\n");

  const WEBM_STDERR = [
    "Input #0, matroska,webm, from 'demo.webm':",
    "  Metadata:",
    "    ENCODER         : Lavf60.3.100",
    "  Duration: 00:01:02.07, start: 0.000000, bitrate: 723 kb/s",
    "  Stream #0:0: Video: vp9 (Profile 0), yuv420p(tv, bt709), 1920x1080, SAR 1:1 DAR 16:9, 29.97 fps, 29.97 tbr, 1k tbn (default)",
    "At least one output file must be specified",
  ].join("\n");

  // gif reports no `fps` token -- only `tbr`.
  const GIF_STDERR = [
    "Input #0, gif, from 'demo.gif':",
    "  Duration: 00:00:03.90, start: 0.000000, bitrate: 1832 kb/s",
    "  Stream #0:0: Video: gif, bgra, 800x600, 10.42 tbr, 100 tbn",
    "At least one output file must be specified",
  ].join("\n");

  it("parses duration, dimensions, and fps from mp4 stderr", function () {
    const meta = parseMediaProbeStderr(MP4_STDERR);
    expect(meta.duration).to.be.closeTo(5.43, 0.001);
    expect(meta.width).to.equal(1280);
    expect(meta.height).to.equal(720);
    expect(meta.fps).to.be.closeTo(30, 0.001);
  });

  it("parses minutes-bearing duration and fractional fps from webm stderr", function () {
    const meta = parseMediaProbeStderr(WEBM_STDERR);
    expect(meta.duration).to.be.closeTo(62.07, 0.001);
    expect(meta.width).to.equal(1920);
    expect(meta.height).to.equal(1080);
    expect(meta.fps).to.be.closeTo(29.97, 0.001);
  });

  it("falls back to tbr when the stream reports no fps (gif)", function () {
    const meta = parseMediaProbeStderr(GIF_STDERR);
    expect(meta.duration).to.be.closeTo(3.9, 0.001);
    expect(meta.width).to.equal(800);
    expect(meta.height).to.equal(600);
    expect(meta.fps).to.be.closeTo(10.42, 0.001);
  });

  it("omits duration when ffmpeg reports N/A", function () {
    const meta = parseMediaProbeStderr(
      [
        "Input #0, matroska,webm, from 'x.webm':",
        "  Duration: N/A, start: 0.000000, bitrate: N/A",
        "  Stream #0:0: Video: vp9, yuv420p, 640x480, 25 fps, 25 tbr, 1k tbn",
      ].join("\n")
    );
    expect(meta.duration).to.equal(undefined);
    expect(meta.width).to.equal(640);
    expect(meta.height).to.equal(480);
  });

  it("returns an empty object for unparsable input", function () {
    expect(parseMediaProbeStderr("")).to.deep.equal({});
    expect(parseMediaProbeStderr("no such file or directory")).to.deep.equal({});
  });

  it("ignores dimension-like tokens outside the Video stream line", function () {
    const meta = parseMediaProbeStderr(
      [
        "Input #0, mov, from 'weird 99x99 name.mp4':",
        "  Duration: 00:00:01.00, start: 0.000000, bitrate: 100 kb/s",
        "  Stream #0:0: Video: h264, yuv420p, 320x240, 15 fps, 15 tbr",
      ].join("\n")
    );
    expect(meta.width).to.equal(320);
    expect(meta.height).to.equal(240);
  });
});
