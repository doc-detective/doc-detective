import { validate } from "../../common/src/validate.js";
import { log } from "../utils.js";
import { syncHandles } from "./browserSurface.js";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import {
  getFfmpegPath,
  selectRecordingToStop,
  stopRecordTargetName,
  deriveCropScale,
  detectDisplayPointSize,
  probeVideoMetadata,
  detectAllBlack,
} from "./ffmpegRecorder.js";
import {
  buildConditionContext,
  evaluateImplicitAssertions,
} from "../routing.js";
import type { ImplicitAssertionSpec } from "../routing.js";
import {
  computeSpanVerdict,
  promoteRecordingSpan,
  buildCheckpointOutputs,
} from "./recordingCheckpoints.js";
import type { CheckpointsConfig } from "./recordingCheckpoints.js";

export { stopRecording };

// `deps` is a test seam for the pending-scale crop derivation (platform +
// display probe); production callers omit it.
async function stopRecording({
  config,
  step,
  driver,
  deps = {},
}: {
  config: any;
  step: any;
  driver: any;
  deps?: {
    platform?: string;
    detectDisplayPointSize?: () => Promise<{ w: number; h: number } | null>;
  };
}) {
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

  // `stopRecord: false` is an explicit no-op (mirrors `record: false`): it must
  // not stop anything. Runtime dispatch keys on property presence, so guard the
  // value here rather than in the schema (the boolean form stays valid).
  if (step.stopRecord === false) {
    result.status = "SKIPPED";
    result.description = "Recording stop is disabled (stopRecord: false).";
    return result;
  }

  // Resolve which active recording to stop. Recordings are per-session (they
  // live on driver.state.recordings), so concurrent contexts can't see each
  // other's recordings. `__stopAny` (set by end-of-context cleanup) lets a
  // generic stop also drain the synthetic autoRecord recording.
  let recordings: any[] = Array.isArray(driver?.state?.recordings)
    ? driver.state.recordings
    : [];
  let recording = selectRecordingToStop(recordings, step.stopRecord, {
    includeSynthetic: step?.__stopAny === true,
  });
  // Phase 4 (ADR 01019): the recording may live on a browser session other
  // than the active one (record targeted a surface, then focus moved on).
  // A stop that finds nothing on this session searches the context's other
  // sessions and stops against the owning session's driver.
  if (!recording && driver?.state?.sessionRegistry) {
    for (const entry of driver.state.sessionRegistry.sessions.values()) {
      if (entry.driver === driver) continue;
      const sessionRecordings: any[] = Array.isArray(
        entry.driver?.state?.recordings
      )
        ? entry.driver.state.recordings
        : [];
      const found = selectRecordingToStop(sessionRecordings, step.stopRecord, {
        includeSynthetic: step?.__stopAny === true,
      });
      if (found) {
        driver = entry.driver;
        recordings = sessionRecordings;
        recording = found;
        break;
      }
    }
  }
  if (!recording) {
    result.status = "SKIPPED";
    const target = stopRecordTargetName(step.stopRecord);
    if (target !== undefined) {
      result.description = `No active recording named '${target}'.`;
    } else if (recordings.length > 0) {
      // An untargeted stop found only the synthetic autoRecord recording, which
      // it deliberately skips — say so rather than the misleading "isn't started".
      result.description = `No user-stoppable recording is active; an automatic (autoRecord) recording is still running and stops at the end of the context.`;
    } else {
      result.description = `Recording isn't started.`;
    }
    return result;
  }

  // Remove this specific handle from the active set regardless of how the stop
  // below resolves — a failed stop must not leave a dead handle that the
  // end-of-context cleanup would retry forever.
  const dropHandle = () => {
    const idx = recordings.indexOf(recording);
    if (idx !== -1) recordings.splice(idx, 1);
  };

  // Staged checkpoint captures live under the OS temp dir keyed by handle id;
  // every exit path that abandons the stop (FAIL, never-started) must discard
  // them or they leak — a fresh id per recording means nothing ever reuses
  // the directory. The success path cleans up after baseline seeding instead.
  const discardCheckpointStaging = () => {
    const dir = recording?.checkpoints?.stagingDir;
    if (!dir) return;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  };

  // Phantom span (ADR 01074): the recording itself was skipped (headless),
  // but checkpoints ran against the committed baselines. Compute the span
  // verdict READ-ONLY — no video, no seeding, no baseline updates, no orphan
  // deletion — and surface staleness. WARNING = the recording appears stale;
  // SKIPPED = the recording was skipped but its content still matches.
  if (recording.type === "phantom") {
    dropHandle();
    const phantomCheckpoints: CheckpointsConfig | undefined =
      recording.checkpoints;
    const entries = phantomCheckpoints?.entries ?? [];
    discardCheckpointStaging();
    // A dirty span (a step FAILed mid-span) or a span that captured nothing
    // has no evidence either way — report neither stale nor current.
    if (phantomCheckpoints?.spanDirty || entries.length === 0) {
      result.status = "SKIPPED";
      result.description = `Recording skipped (headless); the span didn't produce a complete checkpoint set, so staleness couldn't be determined.`;
      return result;
    }
    const verdict = computeSpanVerdict({
      entries,
      baselineDir: phantomCheckpoints?.baselineDir ?? "",
      maxVariation: phantomCheckpoints?.maxVariation ?? 0.05,
      targetExists: fs.existsSync(recording.targetPath),
    });
    result.outputs = {
      stale: verdict.changed,
      ...buildCheckpointOutputs(entries),
    };
    if (verdict.changed) {
      result.status = "WARNING";
      result.description = `The recording at ${recording.targetPath} appears stale — ${verdict.reasons.join("; ")}. Recording is skipped in headless mode; re-run headed to refresh it.`;
    } else {
      result.status = "SKIPPED";
      result.description = `Recording skipped (headless); checkpoints match their baselines, so the recording appears current.`;
    }
    return result;
  }

  // A pending device recording never actually started. If the late-start
  // attempt errored, surface that as the FAIL; otherwise no app surface ever
  // opened a device session — there's nothing to save.
  if (recording.type === "appium-pending") {
    dropHandle();
    discardCheckpointStaging();
    if (recording.startError) {
      // An environment gap (missing host ffmpeg) is a gated SKIP; anything
      // else is a real start failure.
      result.status = recording.startSkip ? "SKIPPED" : "FAIL";
      result.description = recording.startError;
      return result;
    }
    result.status = "SKIPPED";
    result.description =
      "The device recording never started (no app surface opened a device session), so there is nothing to save.";
    return result;
  }

  // overwrite "aboveVariation" (ADR 01073): the produced file lands at a
  // staging path in the target's directory (same volume — promotion is a
  // rename), and the span verdict decides at the end whether it replaces the
  // existing recording or is discarded. Every other mode writes the target
  // directly, as before.
  // The staging name is DETERMINISTIC (no per-run suffix): concurrent
  // same-target recordings are already refused at start, and a crashed or
  // failed run's leftover staging file is simply overwritten by the next
  // run's transcode (-y) instead of accumulating orphans.
  let appliedCrop: { x: number; y: number; w: number; h: number } | null =
    null;
  const isAboveVariation = recording.overwrite === "aboveVariation";
  const finalTargetPath = recording.targetPath;
  const writeTargetPath = isAboveVariation
    ? path.join(
        path.dirname(finalTargetPath),
        `.${path.basename(
          finalTargetPath,
          path.extname(finalTargetPath)
        )}.staging${path.extname(finalTargetPath)}`
      )
    : finalTargetPath;

  try {
    if (recording.type === "MediaRecorder") {
      // Browser engine.

      // Remember the focused content tab so multi-tab tests return to the tab
      // they were on, not an arbitrary surviving handle.
      let returnTab: string | null = null;
      try {
        returnTab = await driver.getWindowHandle();
      } catch {
        /* stale focus; fall back to any survivor below */
      }
      const pickReturnHandle = (remaining: string[]) =>
        returnTab && remaining.includes(returnTab) ? returnTab : remaining[0];

      // Close the recorder tab, return focus to the content tab, and prune the
      // recorder handle from the window/tab registry. Every MediaRecorder exit
      // path (recorder-missing, download-timeout, success) needs this exact
      // sequence; sharing one helper keeps them from drifting apart (the
      // download-timeout path once omitted it, leaving later steps focused in
      // the recorder tab).
      const closeRecorderTabAndRestoreFocus = async () => {
        const allHandles = await driver.getWindowHandles();
        await driver.closeWindow();
        const remainingHandles = allHandles.filter(
          (h: string) => h !== recording.tab
        );
        if (remainingHandles.length > 0) {
          await driver.switchToWindow(pickReturnHandle(remainingHandles));
        }
        await syncHandles(driver);
      };

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
        await closeRecorderTabAndRestoreFocus();
        dropHandle();
        discardCheckpointStaging();
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
        // We're still focused inside the recorder tab (from switchToWindow
        // above), so close it and restore focus before returning — otherwise
        // later steps run in the recorder tab.
        await closeRecorderTabAndRestoreFocus();
        // Clear the state so the auto-stop in runContext doesn't re-invoke
        // a doomed second stop (the recorder was already told to stop).
        dropHandle();
        discardCheckpointStaging();
        return result;
      }
      // Close recording tab and switch back to the original content tab.
      await closeRecorderTabAndRestoreFocus();

      // Convert the downloaded .webm into the target format/location.
      await transcode({
        config,
        sourcePath: recording.downloadPath,
        targetPath: writeTargetPath,
        deleteSource: true,
      });
      dropHandle();
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

      // Pending-scale crops (app windows, phase A7): the rect is in native
      // driver units; scale it to capture pixels using the frame size parsed
      // from the capture's stderr over the display's size in points. Any
      // missing input degrades to scale 1 — correct on scale-1 displays, and
      // the transcode's min/max expressions clamp the rest.
      let crop = recording.crop ?? null;
      if (!crop && recording.cropRect && recording.cropPendingScale) {
        const platform = deps.platform ?? process.platform;
        let scale = 1;
        try {
          const displayPointSize =
            platform === "darwin"
              ? await (deps.detectDisplayPointSize ?? detectDisplayPointSize)()
              : null;
          scale = deriveCropScale({
            platform,
            frameSize: recording.captureInfo?.frameSize ?? null,
            displayPointSize,
          });
        } catch {
          // A probe failure keeps the initial scale of 1 — today's behavior,
          // correct on scale-1 displays.
        }
        crop = {
          x: Math.round(recording.cropRect.x * scale),
          y: Math.round(recording.cropRect.y * scale),
          w: Math.round(recording.cropRect.w * scale),
          h: Math.round(recording.cropRect.h * scale),
        };
      }

      await transcode({
        config,
        sourcePath: recording.tempPath,
        targetPath: writeTargetPath,
        deleteSource: true,
        crop,
      });
      appliedCrop = crop;
      dropHandle();
    } else if (recording.type === "appium") {
      // Device engine (phase A7): the whole video arrives base64 from the
      // driver (adb screenrecord / simctl). Write it out; non-mp4 targets go
      // through the shared transcode (which also applies the gif scale
      // filter). No crop — the device frame IS the content.
      const b64 = await recording.driver.stopRecordingScreen();
      if (typeof b64 !== "string" || b64.length === 0) {
        result.status = "FAIL";
        result.description =
          "The device recording returned no data; nothing was saved.";
        dropHandle();
        discardCheckpointStaging();
        return result;
      }
      // The whole video arrives in one base64 string; a very long recording
      // (the drivers cap at 30 minutes) can make this allocation fail. Name
      // the cause instead of surfacing a bare out-of-memory error.
      // Buffer.from(…, "base64") is permissive — characters outside the
      // alphabet are dropped — so an invalid payload can decode to zero bytes
      // without throwing. An empty decode is "no data", not a valid video.
      let buffer: Buffer;
      try {
        buffer = Buffer.from(b64, "base64");
      } catch (error: any) {
        result.status = "FAIL";
        result.description = `Couldn't buffer the device recording (${Math.round(
          b64.length / 1024 / 1024
        )} MB base64) — device recordings transfer in one payload, so long recordings can exhaust memory. Keep device recordings short (they cap at 30 minutes). ${error?.message ?? error}`;
        dropHandle();
        discardCheckpointStaging();
        return result;
      }
      if (buffer.length === 0) {
        result.status = "FAIL";
        result.description =
          "The device recording decoded to an empty payload (no data); nothing was saved.";
        dropHandle();
        discardCheckpointStaging();
        return result;
      }
      if (path.extname(writeTargetPath) === ".mp4") {
        fs.writeFileSync(writeTargetPath, buffer);
      } else {
        const tempDir = path.join(os.tmpdir(), "doc-detective", "recordings");
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const tempPath = path.join(
          tempDir,
          `device-${randomUUID().slice(0, 8)}.mp4`
        );
        fs.writeFileSync(tempPath, buffer);
        await transcode({
          config,
          sourcePath: tempPath,
          targetPath: writeTargetPath,
          deleteSource: true,
        });
      }
      dropHandle();
    }
  } catch (error) {
    // Couldn't stop recording
    result.status = "FAIL";
    result.description = `Couldn't stop recording. ${error}`;
    // Drop the handle so the auto-stop in runContext doesn't re-invoke a
    // doomed second stop.
    dropHandle();
    discardCheckpointStaging();
    if (isAboveVariation) {
      // A failed transcode can leave a partial staging file beside the
      // user's recording — remove it (the target itself was never touched).
      try {
        fs.rmSync(writeTargetPath, { force: true });
      } catch {
        /* best-effort */
      }
    }
    return result;
  }

  // PASS — first decide the produced file's fate, then report on the file
  // the user actually keeps.
  const checkpoints: CheckpointsConfig | undefined = recording.checkpoints;
  let seededBaselines = 0;
  result.outputs = {};
  if (isAboveVariation) {
    // Span verdict (ADR 01073): promote the staged capture over the target
    // only when the span meaningfully changed; otherwise discard it and
    // leave target + baselines byte-untouched. Promote updates ALL baselines
    // together with the video — they must never disagree. Two indeterminate
    // cases keep the existing recording (unless none exists, when the fresh
    // capture is better than nothing): a dirty span (a step FAILed — the
    // entry set is incomplete, so orphans would misread as removed steps)
    // and a span that captured no checkpoints at all (no evidence).
    const entries = checkpoints?.entries ?? [];
    const targetExists = fs.existsSync(finalTargetPath);
    const discardStagedVideo = () => {
      try {
        fs.rmSync(writeTargetPath, { force: true });
      } catch {
        /* best-effort */
      }
    };
    const indeterminate = checkpoints?.spanDirty || entries.length === 0;
    if (indeterminate && targetExists) {
      discardStagedVideo();
      result.outputs.changed = false;
      log(
        config,
        "warning",
        checkpoints?.spanDirty
          ? `Recording kept unchanged (${finalTargetPath}): a step failed during the span, so drift couldn't be judged.`
          : `Recording kept unchanged (${finalTargetPath}): no checkpoints were captured this run, so drift couldn't be judged.`
      );
    } else if (indeterminate) {
      // No committed recording yet — promote the fresh capture without a
      // verdict (better than nothing), seeding whatever baselines exist.
      const promoted = promoteRecordingSpan({
        config,
        stagingTarget: writeTargetPath,
        targetPath: finalTargetPath,
        entries,
        orphans: [],
        baselineDir: checkpoints?.baselineDir ?? "",
      });
      seededBaselines = promoted.seededBaselines;
      result.outputs.changed = promoted.videoPromoted;
      if (promoted.videoPromoted) {
        result.outputs.changeReasons = ["the recording file is missing"];
      }
    } else {
      const verdict = computeSpanVerdict({
        entries,
        baselineDir: checkpoints?.baselineDir ?? "",
        maxVariation: checkpoints?.maxVariation ?? 0.05,
        targetExists,
      });
      if (verdict.changed) {
        const promoted = promoteRecordingSpan({
          config,
          stagingTarget: writeTargetPath,
          targetPath: finalTargetPath,
          entries,
          orphans: verdict.orphans,
          baselineDir: checkpoints?.baselineDir ?? "",
        });
        seededBaselines = promoted.seededBaselines;
        result.outputs.changed = promoted.videoPromoted;
        if (promoted.videoPromoted) {
          result.outputs.changeReasons = verdict.reasons;
          log(
            config,
            "info",
            `Recording refreshed (${finalTargetPath}): ${verdict.reasons.join("; ")}`
          );
        }
      } else {
        discardStagedVideo();
        result.outputs.changed = false;
      }
    }
  } else if (checkpoints?.entries?.length) {
    // Recording checkpoints without aboveVariation (ADR 01072): seed missing
    // baselines from the staged captures (first run); never modify existing
    // baselines. A dirty span (a step FAILed) seeds nothing — first-run
    // baselines must come from a clean run.
    for (const entry of checkpoints.entries) {
      if (checkpoints.spanDirty) break;
      if (entry.baselineMissing && !entry.error) {
        try {
          fs.mkdirSync(checkpoints.baselineDir, { recursive: true });
          fs.copyFileSync(entry.stagingPath, entry.baselinePath);
          seededBaselines++;
        } catch (error: any) {
          entry.error = String(error?.message ?? error);
          log(
            config,
            "warning",
            `Couldn't seed checkpoint baseline ${entry.baselinePath}: ${entry.error}`
          );
        }
      }
    }
  }

  // Report what was produced/kept. Metadata is best-effort: a probe failure
  // omits fields and logs debug; it never changes the step's status. The
  // field list is copied explicitly — the outputs object is a documented
  // user-facing contract ($$duration etc.), so parser additions must opt in.
  result.outputs.recordingPath = path.resolve(finalTargetPath);
  result.outputs.format = path.extname(finalTargetPath).slice(1);
  const meta = await probeVideoMetadata({
    cacheDir: config?.cacheDir,
    filePath: finalTargetPath,
  });
  if (meta?.duration !== undefined) result.outputs.duration = meta.duration;
  if (meta?.width !== undefined) result.outputs.width = meta.width;
  if (meta?.height !== undefined) result.outputs.height = meta.height;
  if (meta?.fps !== undefined) result.outputs.fps = meta.fps;
  if (!meta || Object.keys(meta).length === 0) {
    log(
      config,
      "debug",
      `Couldn't probe recording metadata for ${finalTargetPath}.`
    );
  }

  // Structural verify guards (ADR 01075) and checkpoint drift reporting
  // (ADR 01072) evaluate through ONE shared implicit-assertion pass, so the
  // FAIL > WARNING roll-up is computed once: a violated structural guard
  // (author-demanded, FAIL severity) outranks checkpoint drift (advice,
  // WARNING severity).
  const specs: ImplicitAssertionSpec[] = [];
  const verify = recording.verify;
  if (verify && typeof verify === "object") {
    if (typeof verify.minDuration === "number") {
      // An unprobeable duration fails the guard — an author who demanded a
      // duration floor shouldn't get a silent pass on an unreadable file.
      specs.push({
        statement: `$$outputs.duration >= ${verify.minDuration}`,
        severity: "fail",
      });
    }
    if (typeof verify.maxDuration === "number") {
      specs.push({
        statement: `$$outputs.duration <= ${verify.maxDuration}`,
        severity: "fail",
      });
    }
    if (verify.resolution !== undefined && verify.resolution !== false) {
      // resolution: true compares against the resolved capture expectation
      // (crop rect when one applied, else the capture frame size). The
      // object form compares literal dimensions. ±2 px tolerance — encoders
      // round to even dimensions.
      let expected: { width: number; height: number } | null = null;
      if (verify.resolution === true) {
        if (appliedCrop) {
          expected = { width: appliedCrop.w, height: appliedCrop.h };
        } else if (recording.captureInfo?.frameSize) {
          expected = {
            width: recording.captureInfo.frameSize.w,
            height: recording.captureInfo.frameSize.h,
          };
        }
      } else {
        expected = {
          width: verify.resolution.width,
          height: verify.resolution.height,
        };
      }
      if (!expected) {
        log(
          config,
          "debug",
          `verify.resolution: true has no capture expectation for this engine; skipping the check.`
        );
      } else {
        result.outputs.resolutionMatch =
          typeof result.outputs.width === "number" &&
          typeof result.outputs.height === "number" &&
          Math.abs(result.outputs.width - expected.width) <= 2 &&
          Math.abs(result.outputs.height - expected.height) <= 2;
        specs.push({
          statement: `$$outputs.resolutionMatch == true`,
          severity: "fail",
        });
      }
    }
    if (verify.notBlack) {
      // Blackness is judged as a fraction of the clip, so an unknown duration
      // can't be judged at all — skip rather than report a not-black that
      // never had evidence behind it.
      const allBlack =
        typeof result.outputs.duration === "number"
          ? await detectAllBlack({
              cacheDir: config?.cacheDir,
              filePath: finalTargetPath,
              duration: result.outputs.duration,
              fps: result.outputs.fps,
            })
          : null;
      if (allBlack === null) {
        log(
          config,
          "debug",
          `verify.notBlack: couldn't analyze ${finalTargetPath} (unreadable or unknown duration); skipping the check.`
        );
      } else {
        result.outputs.allBlack = allBlack;
        specs.push({
          statement: `$$outputs.allBlack == false`,
          severity: "fail",
        });
      }
    }
  }
  if (checkpoints?.entries?.length) {
    // Errored checkpoints (capture failure, aspect-ratio mismatch against
    // the baseline) can hide extreme drift behind a variation of 0 — they
    // get their own WARNING-severity spec so they never read as a clean
    // pass.
    Object.assign(result.outputs, buildCheckpointOutputs(checkpoints.entries));
    result.outputs.seededBaselines = seededBaselines;
    specs.push(
      {
        statement: `$$outputs.maxCheckpointVariation <= ${checkpoints.maxVariation}`,
        severity: "warning",
      },
      {
        statement: `$$outputs.checkpointErrors == 0`,
        severity: "warning",
      }
    );
  }
  if (specs.length > 0) {
    const ctx = buildConditionContext({ outputs: result.outputs });
    const { assertions, status } = await evaluateImplicitAssertions(specs, ctx);
    result.assertions = assertions;
    result.status = status;
    if (status === "FAIL") {
      result.description += ` One or more structural verify guards failed.`;
    } else if (status === "WARNING" && checkpoints?.entries?.length) {
      result.description += isAboveVariation
        ? ` One or more checkpoints drifted beyond maxVariation (${checkpoints.maxVariation}) or couldn't be compared — the recording was refreshed to match the current content.`
        : ` One or more checkpoints drifted beyond maxVariation (${checkpoints.maxVariation}) or couldn't be compared — the recorded flow's content may have changed since its baselines were captured.`;
    }
  }
  if (checkpoints) {
    try {
      fs.rmSync(checkpoints.stagingDir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup; staged files live under the OS temp dir */
    }
  }
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
    // Clamp the crop to the captured frame using ffmpeg expressions (iw/ih),
    // so a window/viewport rectangle larger than the captured display can't
    // make the crop filter fail with "Invalid too big size". Commas inside
    // min()/max() are escaped (\,) so they aren't read as filter separators.
    const cw = `min(iw\\,${crop.w})`;
    const ch = `min(ih\\,${crop.h})`;
    const cx = `max(0\\,min(${crop.x}\\,iw-${cw}))`;
    const cy = `max(0\\,min(${crop.y}\\,ih-${ch}))`;
    filters.push(`crop=w=${cw}:h=${ch}:x=${cx}:y=${cy}`);
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

// Wait for a file to exist and stop growing (size unchanged across three reads
// ~500ms apart, i.e. ~1s of stability), up to `maxSeconds`. Returns true once
// stable, false on timeout. Guards against transcoding a download that's still
// being written — concurrent recordings make a mid-write size plateau (the OS
// flushing in chunks) more likely, so a single agreeing read isn't enough.
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
      if (stableReads >= 2) return true;
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
