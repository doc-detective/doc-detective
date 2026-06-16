import { validate } from "../../common/src/validate.js";
import { log } from "../utils.js";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { getFfmpegPath } from "./ffmpegRecorder.js";

export { stopRecording };

async function stopRecording({ config, step, driver }: { config: any; step: any; driver: any }) {
  let result: any = {
    status: "PASS",
    description: "Stopped recording.",
  };

  // Validate step payload. (The stopRecord step carries no fields we read
  // here — the recording state lives on driver.state — so we only assert
  // validity and don't keep the coerced object.)
  const isValidStep = validate({ schemaKey: "step_v3", object: step });
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = `Invalid step definition: ${isValidStep.errors}`;
    return result;
  }

  // Skip if recording is not started. Recording state is per-context (it
  // lives on driver.state), so concurrent contexts can't see each other's
  // recordings.
  const recording = driver?.state?.recording;
  if (!recording) {
    result.status = "SKIPPED";
    result.description = `Recording isn't started.`;
    return result;
  }

  try {
    if (recording.type === "MediaRecorder") {
      // Browser engine.

      // Switch to recording tab
      await driver.switchToWindow(recording.tab);

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
          (h: string) => h !== recording.tab
        );
        if (remainingHandles.length > 0) {
          await driver.switchToWindow(remainingHandles[0]);
        }
        driver.state.recording = null;
        return result;
      }

      // Stop recording
      await driver.execute(() => {
        (window as any).recorder.stop();
      });
      // Wait for the download to appear AND finish writing. Chrome streams the
      // blob to disk (and may use a .crdownload temp first), so existence
      // alone isn't enough — transcoding a still-growing file makes ffmpeg
      // fail. Wait for the size to hold steady across two reads.
      const downloaded = await waitForStableFile(recording.downloadPath, 60);
      if (!downloaded) {
        result.status = "FAIL";
        result.description = "Recording download timed out.";
        // Clear the state so the auto-stop in runContext doesn't re-invoke
        // a doomed second stop (the recorder was already told to stop).
        driver.state.recording = null;
        return result;
      }
      // Close recording tab and switch back to the original content tab
      const allHandles = await driver.getWindowHandles();
      await driver.closeWindow();
      const remainingHandles = allHandles.filter(
        (h: string) => h !== recording.tab
      );
      if (remainingHandles.length > 0) {
        await driver.switchToWindow(remainingHandles[0]);
      }

      // Convert the downloaded .webm into the target format/location.
      await transcode({
        config,
        sourcePath: recording.downloadPath,
        targetPath: recording.targetPath,
        deleteSource: true,
      });
      driver.state.recording = null;
    } else if (recording.type === "ffmpeg") {
      // ffmpeg engine. Stop the capture gracefully (write "q" to stdin so the
      // container is finalized), then transcode the temp .mkv into the target
      // format, cropping to the requested window/viewport if one was resolved.
      const proc = recording.process;
      try {
        proc.stdin?.write("q");
        proc.stdin?.end?.();
      } catch {
        /* fall through to kill */
      }
      await new Promise<void>((resolve) => {
        // Already exited (e.g. ffmpeg reacted to "q" before we got here) —
        // don't wait on a "close" that will never fire again.
        if (proc.exitCode !== null || proc.signalCode !== null) {
          resolve();
          return;
        }
        let settled = false;
        const finish = () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        };
        // Normal path: ffmpeg exits after "q"; close clears the kill timer and
        // we transcode the fully-flushed .mkv.
        const killTimer = setTimeout(() => {
          try {
            proc.kill("SIGKILL");
          } catch {
            /* ignore */
          }
          // Resolve on the post-kill close, or after a short grace if it never
          // arrives. The .mkv survives a hard kill.
          setTimeout(finish, 2000);
        }, 15000);
        proc.once("close", () => {
          clearTimeout(killTimer);
          finish();
        });
      });

      await transcode({
        config,
        sourcePath: recording.tempPath,
        targetPath: recording.targetPath,
        deleteSource: true,
        crop: recording.crop,
      });
      driver.state.recording = null;
    }
  } catch (error) {
    // Couldn't stop recording
    result.status = "FAIL";
    result.description = `Couldn't stop recording. ${error}`;
    // Clear the state so the auto-stop in runContext doesn't re-invoke a
    // doomed second stop.
    driver.state.recording = null;
    return result;
  }

  // PASS
  return result;
}

// Transcode a recording into the requested target format/location with
// ffmpeg, applying an optional crop and the gif scale filter. Deletes the
// source on success when requested (and when it isn't the target itself).
async function transcode({
  config,
  sourcePath,
  targetPath,
  deleteSource,
  crop,
}: {
  config: any;
  sourcePath: string;
  targetPath: string;
  deleteSource: boolean;
  crop?: { x: number; y: number; w: number; h: number } | null;
}): Promise<void> {
  // Drop audio (-an): doc recordings are visual, and the browser engine's
  // captured opus track fails to mux into mp4 ("Too many packets buffered for
  // output stream"). Silent video is the intended, reliable output.
  const ffmpegArgs = ["-y", "-i", `${sourcePath}`, "-an", "-pix_fmt", "yuv420p"];
  const filters: string[] = [];
  if (crop) {
    filters.push(`crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`);
  }
  if (path.extname(targetPath) === ".gif") {
    filters.push("scale=iw:-1:flags=lanczos");
  }
  if (filters.length > 0) {
    ffmpegArgs.push("-vf", filters.join(","));
  }
  ffmpegArgs.push(`${targetPath}`);
  const ffmpegPath = await getFfmpegPath({ cacheDir: config?.cacheDir });
  await new Promise<void>((resolve, reject) => {
    // spawn (not execFile): a long/noisy ffmpeg transcode can emit megabytes
    // of progress on stderr, which would overflow execFile's internal buffer
    // (ERR_CHILD_PROCESS_STDIO_MAXBUFFER). We stream stderr into a bounded tail.
    const child = spawn(ffmpegPath, ffmpegArgs);
    let stderr = "";
    child.stderr?.on("data", (d) => {
      stderr = (stderr + d.toString()).slice(-2000);
    });
    child
      .on("close", (code) => {
        if (code === 0) {
          if (deleteSource && sourcePath !== targetPath) {
            try {
              fs.unlinkSync(sourcePath);
            } catch {
              /* ignore */
            }
          }
          log(config, "debug", `Finished processing file: ${targetPath}`);
          resolve();
        } else {
          reject(
            new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-600)}`)
          );
        }
      })
      .on("error", reject);
  });
}

// Wait for a file to exist and stop growing (size unchanged across two reads
// ~500ms apart), up to `maxSeconds`. Returns true once stable, false on
// timeout. Guards against transcoding a download that's still being written.
async function waitForStableFile(
  filePath: string,
  maxSeconds: number
): Promise<boolean> {
  let lastSize = -1;
  let stableReads = 0;
  const deadline = maxSeconds * 2; // two checks per second
  for (let i = 0; i < deadline; i++) {
    let size = -1;
    try {
      size = fs.statSync(filePath).size;
    } catch {
      size = -1;
    }
    // Require a non-empty, steady size: Chrome may pre-create the .webm
    // before writing data, and transcoding an empty file fails.
    if (size > 0 && size === lastSize) {
      stableReads++;
      if (stableReads >= 1) return true;
    } else {
      stableReads = 0;
    }
    lastSize = size;
    await new Promise((r) => setTimeout(r, 500));
  }
  // Timed out without the size ever holding steady — the file is missing or
  // still being written. Report not-stable so the caller fails cleanly rather
  // than transcoding a partial download.
  return false;
}
