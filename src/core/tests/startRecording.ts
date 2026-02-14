import { validate } from "doc-detective-common";
import { instantiateCursor } from "./moveTo.js";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

export { startRecording };

/**
 * Orchestrates starting a screen recording for a test step by validating inputs, preparing target paths, and initiating capture when supported.
 *
 * Validates `step` against the `step_v3` schema, normalizes `step.record` (accepts boolean, string, or object), ensures destination directories exist, and respects `overwrite`. If the browser context is Chrome in non-headless mode, it opens a helper tab, injects an in-page MediaRecorder capture that triggers a download of `<baseName>.webm`, restores the original tab/title, and records metadata on `config.recording`. If recording is not supported or preconditions fail, the function returns a skipped or failed result.
 *
 * @param config - Runner configuration object; when recording is started for Chrome, `config.recording` is populated with recording state.
 * @param context - Execution context containing runtime browser information (e.g., `context.browser.name` and `context.browser.headless`) used to decide support and behavior.
 * @param step - Test step object validated against `step_v3`; `step.record` may be a boolean, string, or object with `path`, `directory`, and `overwrite` controls.
 * @param driver - WebDriver-like driver used to control the browser (getTitle, execute, createWindow, switchToWindow, url, getWindowHandle).
 * @returns Result object with:
 *  - `status`: `"PASS"`, `"SKIPPED"`, or `"FAIL"`.
 *  - `description`: a human-readable reason when status is not `"PASS"`.
 *  - `recording` (when recording started): metadata including `type` (e.g., `"MediaRecorder"`), `tab` (recorder tab handle), `downloadPath` (expected download file in the OS temp dir), and `targetPath` (final desired file path).
 */
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

  // If headless is true, skip recording
  if (context.browser?.headless) {
    result.status = "SKIPPED";
    result.description = `Recording isn't supported in headless mode.`;
    return result;
  }

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

  if (
    context?.browser?.name === "chrome" &&
    context?.browser?.headless === false
  ) {
    config.recording = {};
    // Chrome and Chromium
    // Get document title
    const documentTitle = await driver.getTitle();
    const originalTab = await driver.getWindowHandle();
    // Set document title to "RECORD_ME"
    await driver.execute(() => (document.title = "RECORD_ME"));
    // Instantiate cursor
    await instantiateCursor(driver, { position: "center" });
    // Create new tab
    const recorderTab = await driver.createWindow("tab");
    // Switch to new tab
    await driver.switchToWindow(recorderTab.handle);
    await driver.url("chrome://new-tab-page");
    await driver.execute(() => (document.title = "RECORDER"));
    config.recording.tab = await driver.getWindowHandle();

    // Start recording
    await driver.execute((baseName: any) => {
      let stream;
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
        stream = await startCapture(displayMediaOptions);
        if (stream) {
          await recordStream(stream);
        }
        return stream;
      }
      async function recordStream(stream: any) {
        (window as any).recorder = new MediaRecorder(stream, { mimeType: "video/webm" }); // or 'video/mp4'
        const data: any[] = [];

        (window as any).recorder.ondataavailable = (event: any) => data.push(event.data);
        (window as any).recorder.start();

        const stopped = new Promise((resolve, reject) => {
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
      downloadPath: path.join(os.tmpdir(), `${baseName}.webm`), // Where the recording will be downloaded.
      targetPath: filePath, // Where the recording will be saved.
    };
  } else {
    // Other context — recording not supported
    result.status = "SKIPPED";
    result.description = `Recording is not supported for this context.`;
    return result;
  }

  // PASS
  return result;
}