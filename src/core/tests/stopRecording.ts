import { validate } from "../../common/src/validate.js";
import { log } from "../utils.js";
import { execFile } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { loadHeavyDep } from "../../runtime/loader.js";

// Resolve the ffmpeg binary path lazily — @ffmpeg-installer/ffmpeg is a
// heavy runtime dep that should only be loaded when a stopRecording step
// actually runs. The ctx is threaded through so a user-overridden
// cacheDir is honored here just as it is by the JIT pre-flight installer.
async function getFfmpegPath(ctx: { cacheDir?: string } = {}): Promise<string> {
  const mod = await loadHeavyDep<any>("@ffmpeg-installer/ffmpeg", { ctx });
  // The package's CJS entry exports an object with a .path field; in ESM
  // dynamic import we get { default: { path }, path? } shape depending on
  // bundler. Try both, then guard before handing it to execFile so a
  // malformed install fails with an actionable message instead of a
  // confusing "argument must be of type string" deep in node's exec.
  const candidate = mod && (mod.path ?? mod.default?.path);
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new Error(
      "ffmpeg binary path is missing or malformed in the installed @ffmpeg-installer/ffmpeg package. Try `doc-detective install runtime --force` to reinstall."
    );
  }
  return candidate;
}

export { stopRecording };

async function stopRecording({ config, step, driver }: { config: any; step: any; driver: any }) {
  let result: any = {
    status: "PASS",
    description: "Stopped recording.",
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

  // Skip if recording is not started
  if (!config.recording) {
    result.status = "SKIPPED";
    result.description = `Recording isn't started.`;
    return result;
  }

  try {
    if (config.recording.type === "MediaRecorder") {
      // MediaRecorder

      // Switch to recording tab
      await driver.switchToWindow(config.recording.tab);

      // Check that recorder was properly initialized
      const recorderExists = await driver.execute(() => {
        return typeof (window as any).recorder !== "undefined" && (window as any).recorder !== null;
      });
      if (!recorderExists) {
        result.status = "FAIL";
        result.description =
          "Recording was not properly started. The recorder object doesn't exist in the browser context.";
        const allHandles = await driver.getWindowHandles();
        await driver.closeWindow();
        const remainingHandles = allHandles.filter(
          (h: string) => h !== config.recording.tab
        );
        if (remainingHandles.length > 0) {
          await driver.switchToWindow(remainingHandles[0]);
        }
        config.recording = null;
        return result;
      }

      // Stop recording
      await driver.execute(() => {
        (window as any).recorder.stop();
      });
      // Wait for file to be in download path
      let waitCount = 0;
      while (!fs.existsSync(config.recording.downloadPath) && waitCount < 60) {
        await new Promise((r) => setTimeout(r, 1000));
        waitCount++;
      }
      if (!fs.existsSync(config.recording.downloadPath)) {
        result.status = "FAIL";
        result.description = "Recording download timed out.";
        return result;
      }
      // Close recording tab and switch back to the original content tab
      const allHandles = await driver.getWindowHandles();
      await driver.closeWindow();
      const remainingHandles = allHandles.filter(
        (h: string) => h !== config.recording.tab
      );
      if (remainingHandles.length > 0) {
        await driver.switchToWindow(remainingHandles[0]);
      }

      // Convert the file into the target format/location
      const targetPath = `${config.recording.targetPath}`;
      const downloadPath = `${config.recording.downloadPath}`;
      const endMessage = `Finished processing file: ${config.recording.targetPath}`;
      const ffmpegArgs = ["-y", "-i", downloadPath, "-pix_fmt", "yuv420p"];
      if (path.extname(targetPath) === ".gif") {
        ffmpegArgs.push("-vf", "scale=iw:-1:flags=lanczos");
      }
      ffmpegArgs.push(targetPath);
      // Await transcoding to complete before returning
      const ffmpegPath = await getFfmpegPath({ cacheDir: config?.cacheDir });
      await new Promise<void>((resolve, reject) => {
        execFile(ffmpegPath, ffmpegArgs)
          .on("close", (code) => {
            if (code === 0) {
              // Only delete the downloaded file after successful transcoding
              if (targetPath !== downloadPath) {
                try { fs.unlinkSync(downloadPath); } catch { /* ignore */ }
              }
              log(config, "debug", endMessage);
              resolve();
            } else {
              reject(new Error(`ffmpeg exited with code ${code}`));
            }
          })
          .on("error", reject);
      });
      config.recording = null;
    } else {
      // FFMPEG
      // config.recording.stdin.write("q");
    }
  } catch (error) {
    // Couldn't stop recording
    result.status = "FAIL";
    result.description = `Couldn't stop recording. ${error}`;
    return result;
  }

  // PASS
  return result;
}
