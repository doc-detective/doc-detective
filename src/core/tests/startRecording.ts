import { validate } from "../../common/src/validate.js";
import { log } from "../utils.js";
import { instantiateCursor } from "./moveTo.js";
import {
  resolveRecordPlan,
  safeContextId,
  browserCaptureTitle,
  browserDownloadDir,
  buildCaptureArgs,
  resolveCropGeometry,
  getFfmpegPath,
  detectMacScreenIndex,
} from "./ffmpegRecorder.js";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

export { startRecording };

async function startRecording({ config, context, step, driver }: { config: any; context: any; step: any; driver: any }) {
  let result: any = {
    status: "PASS",
    description: "Started recording.",
  };

  // Validate step payload
  const isValidStep = validate({ schemaKey: "step_v3", object: step });
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = `Invalid step definition: ${isValidStep.errors}`;
    return result;
  }
  // Accept coerced and defaulted values
  step = isValidStep.object;

  // `record: false` explicitly disables recording — don't start one.
  if (step.record === false) {
    result.status = "SKIPPED";
    result.description = "Recording is disabled (record: false).";
    return result;
  }

  // Convert boolean to string
  if (typeof step.record === "boolean") {
    step.record = { path: `${step.stepId}.mp4` };
  }
  // Convert string to object
  if (typeof step.record === "string") {
    step.record = { path: step.record };
  }
  // Compute path if unset
  if (typeof step.record.path === "undefined") {
    step.record.path = `${step.stepId}.mp4`;
    // If `directory` is set, prepend it to the path
    if (step.record.directory) {
      step.record.path = path.resolve(step.record.directory, step.record.path);
    }
  }
  // Set default values
  step.record = {
    ...step.record,
    overwrite: step.record.overwrite || "false",
  };

  // Set file name
  let filePath = step.record.path;
  const baseName = path.basename(filePath, path.extname(filePath));

  // Set path directory
  const dir = path.dirname(step.record.path);
  // If `dir` doesn't exist, create it
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Check if file already exists
  if (fs.existsSync(filePath) && step.record.overwrite == "false") {
    // File already exists
    result.status = "SKIPPED";
    result.description = `File already exists: ${filePath}`;
    return result;
  }

  // Resolve which engine to use. The context's browser is already coerced by
  // the runner (headed Chrome preferred when nothing was specified), so this
  // is a pure read.
  const plan = resolveRecordPlan({ step, context });

  if (plan.name === "browser") {
    // Browser engine: capture the Chrome viewport via getDisplayMedia +
    // MediaRecorder. Concurrency-safe — each context auto-selects its own
    // window by a unique title. Requires headed Chrome.
    if (context.browser?.headless) {
      result.status = "SKIPPED";
      result.description = `Recording isn't supported in headless mode with the browser engine. Use the ffmpeg engine to record headless.`;
      return result;
    }
    if (context.browser?.name !== "chrome") {
      result.status = "SKIPPED";
      result.description = `The browser recording engine requires Chrome. Use the ffmpeg engine for '${context.browser?.name}'.`;
      return result;
    }

    const captureTitle = browserCaptureTitle(context.contextId);
    const downloadDir = browserDownloadDir(context.contextId);
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }
    const downloadPath = path.join(downloadDir, `${baseName}.webm`);
    // Remove any stale download from a previous crashed run — otherwise Chrome
    // saves as "<name> (1).webm" and stopRecording waits on the wrong path.
    if (fs.existsSync(downloadPath)) {
      try {
        fs.unlinkSync(downloadPath);
      } catch {
        /* best-effort */
      }
    }

    // Get document title
    const documentTitle = await driver.getTitle();
    const originalTab = await driver.getWindowHandle();
    // Set document title to the per-context capture title so the launch flag
    // --auto-select-desktop-capture-source picks exactly this window.
    await driver.execute((title: any) => (document.title = title), captureTitle);
    // Instantiate cursor
    await instantiateCursor(driver, { position: "center" });
    // Create new tab
    const recorderTab = await driver.createWindow("tab");
    // Switch to new tab
    await driver.switchToWindow(recorderTab.handle);
    await driver.url("chrome://new-tab-page");
    await driver.execute(() => (document.title = "RECORDER"));

    // Start recording
    const recorderStarted = await driver.executeAsync((baseName: any, done: any) => {
      let doneCalled = false;
      const safeDone = (value: boolean) => {
        if (!doneCalled) {
          doneCalled = true;
          done(value);
        }
      };
      let stream: any;
      const displayMediaOptions = {
        video: {
          displaySurface: "browser",
        },
        audio: {
          suppressLocalAudioPlayback: false,
        },
        preferCurrentTab: false,
        selfBrowserSurface: "exclude",
        systemAudio: "include",
        surfaceSwitching: "include",
        monitorTypeSurfaces: "include",
      };
      async function startCapture(displayMediaOptions: any) {
        try {
          const captureStream = await navigator.mediaDevices.getDisplayMedia(
            displayMediaOptions
          );
          return captureStream;
        } catch (err) {
          console.error(`Error: ${err}`);
          return null;
        }
      }
      async function captureAndDownload() {
        try {
          stream = await startCapture(displayMediaOptions);
          if (!stream) {
            safeDone(false);
            return null;
          }
          await recordStream(stream);
        } catch (err) {
          console.error(`Error: ${err}`);
          safeDone(false);
        }
        return stream;
      }
      async function recordStream(stream: any) {
        (window as any).recorder = new MediaRecorder(stream, { mimeType: "video/webm" }); // or 'video/mp4'
        const data: any[] = [];

        (window as any).recorder.ondataavailable = (event: any) => data.push(event.data);
        (window as any).recorder.start();
        safeDone(true);

        let stopped = new Promise((resolve, reject) => {
          (window as any).recorder.onstop = resolve;
          (window as any).recorder.onerror = (event: any) => reject(event.name);
        });

        await stopped;

        const blob = new Blob(data, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = `${baseName}.webm`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }, 100);
      }
      captureAndDownload();
    }, baseName);

    // Handle recording failure
    if (!recorderStarted) {
      result.status = "FAIL";
      result.description =
        "Failed to start recording. getDisplayMedia may have been rejected. " +
        "On macOS, ensure Chrome has screen recording permission in " +
        "System Preferences > Privacy & Security > Screen Recording.";
      log(config, "error", result.description);
      await driver.closeWindow();
      await driver.switchToWindow(originalTab);
      await driver.execute((documentTitle: any) => {
        document.title = documentTitle;
      }, documentTitle);
      return result;
    }

    // Switch to original tab
    await driver.switchToWindow(originalTab);
    // Set document title back to original
    await driver.execute((documentTitle: any) => {
      document.title = documentTitle;
    }, documentTitle);
    // Set recorder
    result.recording = {
      type: "MediaRecorder",
      tab: recorderTab.handle,
      downloadPath, // Where the recording will be downloaded.
      targetPath: filePath, // Where the recording will be saved.
    };
    return result;
  }

  // ffmpeg engine: capture the screen with ffmpeg. Works for any application.
  // window/viewport targets capture the full display and are cropped during
  // stopRecording's transcode.

  // A headless browser has no on-screen content to capture. ffmpeg headless
  // recording is only meaningful against a virtual display (Linux Xvfb),
  // threaded in as context.__display. Without one, skip — matching the
  // long-standing "recording isn't supported headless" behavior.
  if (context.browser?.headless && !context.__display) {
    result.status = "SKIPPED";
    result.description = `Recording isn't supported in headless mode without a virtual display (Xvfb).`;
    return result;
  }

  let crop: any = null;
  if (driver && plan.target !== "display") {
    try {
      crop = await resolveCropGeometry({ driver, target: plan.target });
    } catch (err) {
      log(
        config,
        "warning",
        `Couldn't resolve ${plan.target} geometry for recording; capturing the full display. ${err}`
      );
    }
  }

  // Show the synthetic cursor in the page so automated actions are visible
  // (WebDriver doesn't move the OS pointer).
  if (driver) {
    try {
      await instantiateCursor(driver, { position: "center" });
    } catch {
      /* non-fatal */
    }
  }

  const tempDir = path.join(os.tmpdir(), "doc-detective", "recordings");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const tempPath = path.join(
    tempDir,
    `${safeContextId(context.contextId)}-${baseName}.mkv`
  );

  let ffmpegPath: string;
  try {
    ffmpegPath = await getFfmpegPath({ cacheDir: config?.cacheDir });
  } catch (err) {
    result.status = "FAIL";
    result.description = `Couldn't start recording: ${err}`;
    log(config, "error", result.description);
    return result;
  }

  // On macOS the avfoundation screen device index isn't fixed (it shifts with
  // attached cameras), so detect it rather than guessing.
  let screenIndex: string | undefined;
  if (process.platform === "darwin") {
    screenIndex = (await detectMacScreenIndex(ffmpegPath)) ?? undefined;
  }

  const args = buildCaptureArgs({
    platform: process.platform,
    fps: plan.fps,
    // Honor a per-context virtual display (Linux Xvfb) when threaded through.
    displayEnv: context.__display || process.env.DISPLAY,
    outputPath: tempPath,
    screenIndex,
  });
  log(
    config,
    "debug",
    `ffmpeg recording: platform=${process.platform} target=${plan.target}${
      screenIndex !== undefined ? ` screen=${screenIndex}` : ""
    }${context.__display ? ` display=${context.__display}` : ""} -> ${tempPath}`
  );

  const proc = spawn(ffmpegPath, args, { stdio: ["pipe", "ignore", "pipe"] });
  let spawnError: any = null;
  // Drain ffmpeg's stderr into a bounded tail: it both prevents the unread
  // pipe from filling and blocking ffmpeg, and surfaces the real reason on a
  // start failure (wrong device index, denied screen-recording permission…).
  let stderrTail = "";
  proc.stderr?.on("data", (d) => {
    stderrTail = (stderrTail + d.toString()).slice(-2000);
  });
  proc.on("error", (err) => {
    spawnError = err;
  });

  // Give ffmpeg a moment to initialize, then make sure it didn't immediately
  // fail (e.g. missing display, permission denied).
  await new Promise((r) => setTimeout(r, 500));
  if (spawnError || proc.exitCode !== null) {
    result.status = "FAIL";
    result.description = `Couldn't start ffmpeg recording.${
      spawnError ? ` ${spawnError}` : ` ffmpeg exited with code ${proc.exitCode}.`
    } On macOS, grant screen recording permission; on Linux, ensure a display (or Xvfb) is available.${
      stderrTail ? ` ffmpeg: ${stderrTail.trim().slice(-500)}` : ""
    }`;
    log(config, "error", result.description);
    return result;
  }

  result.recording = {
    type: "ffmpeg",
    process: proc,
    tempPath,
    targetPath: filePath,
    crop,
  };
  return result;
}
