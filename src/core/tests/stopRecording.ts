import { validate } from "../../common/src/validate.js";
import { log } from "../utils.js";
import { execFile } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
const ffmpegPath = ffmpeg.path;

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
