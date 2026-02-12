import { validate } from "doc-detective-common";
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
      while (!fs.existsSync(config.recording.downloadPath)) {
        await new Promise((r) => setTimeout(r, 1000));
      }
      // Close recording tab
      await driver.closeWindow();

      // Convert the file into the target format/location
      const targetPath = `${config.recording.targetPath}`;
      const downloadPath = `${config.recording.downloadPath}`;
      const endMessage = `Finished processing file: ${config.recording.targetPath}`;
      const ffmpegArgs = ["-y", "-i", downloadPath, "-pix_fmt", "yuv420p"];
      if (path.extname(targetPath) === ".gif") {
        ffmpegArgs.push("-vf", "scale=iw:-1:flags=lanczos");
      }
      ffmpegArgs.push(targetPath);
      execFile(ffmpegPath, ffmpegArgs).on("close", () => {
        if (targetPath !== downloadPath) {
          // Delete the downloaded file
          fs.unlinkSync(downloadPath);
          log(config, "debug", endMessage);
        }
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
