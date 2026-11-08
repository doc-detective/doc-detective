import { validate } from "../../common/src/validate.js";
import { log, restoreSessionViewport } from "../utils.js";
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

export { stopRecording, saveBrowserRecording };

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

  // Validate step payload. The recording state lives on driver.state, so the
  // only field we read is the effective `stopRecord` (ADR 01167): `true`, a
  // `{ name }` target, or `false`.
  // `__stopAny` is the runner's own marker, and step_v3 rejects unknown keys.
  const { __stopAny: _stopAny, ...authoredStep } = step;
  const isValidStep = validate({ schemaKey: "step_v3", object: authoredStep });
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = `Invalid step definition: ${isValidStep.errors}`;
    return result;
  }
  const { stopRecord } = isValidStep.object;

  // `stopRecord: false` is an explicit no-op (mirrors `record: false`): it must
  // not stop anything. Runtime dispatch keys on property presence, so guard the
  // value here rather than in the schema (the boolean form stays valid).
  if (stopRecord === false) {
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
  let recording = selectRecordingToStop(recordings, stopRecord, {
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
      const found = selectRecordingToStop(sessionRecordings, stopRecord, {
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
    const target = stopRecordTargetName(stopRecord);
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

  // Phantom span (ADR 01079): the recording itself was skipped — headless, or
  // the target already exists — but checkpoints ran against the committed
  // baselines. Compute the span verdict READ-ONLY — no video, no seeding, no
  // baseline updates, no orphan deletion — and surface staleness. WARNING =
  // the recording appears stale; SKIPPED = it was skipped but still matches.
  if (recording.type === "phantom") {
    dropHandle();
    const phantomCheckpoints: CheckpointsConfig | undefined =
      recording.checkpoints;
    const entries = phantomCheckpoints?.entries ?? [];
    discardCheckpointStaging();
    // Name the skip and its remedy accurately: a headless run needs a headed
    // one, an existing target needs `overwrite` (or the file removed).
    const skipCause =
      recording.skipReason === "targetExists"
        ? `Recording skipped (the target already exists)`
        : `Recording skipped (headless)`;
    const refreshRemedy =
      recording.skipReason === "targetExists"
        ? `Delete it, or set \`overwrite\` to "true" or "aboveVariation", to refresh it.`
        : `Recording is skipped in headless mode; re-run headed to refresh it.`;
    // A dirty span (a step FAILed mid-span) or a span that captured nothing
    // has no evidence either way — report neither stale nor current.
    if (phantomCheckpoints?.spanDirty || entries.length === 0) {
      result.status = "SKIPPED";
      result.description = `${skipCause}; the span didn't produce a complete checkpoint set, so staleness couldn't be determined.`;
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
      result.description = `The recording at ${recording.targetPath} appears stale — ${verdict.reasons.join("; ")}. ${refreshRemedy}`;
    } else {
      result.status = "SKIPPED";
      result.description = `${skipCause}; checkpoints match their baselines, so the recording appears current.`;
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

  // overwrite "aboveVariation" (ADR 01078): the produced file lands at a
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
        // Chrome's sharing bar is gone now, so the viewport grew by its height.
        await restoreSessionViewport(driver, config);
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

      // Stop the recorder and copy its video out of the page. Whatever
      // happens, close the recorder tab and return focus to the content tab
      // (we're still focused inside the recorder tab, from switchToWindow
      // above) — otherwise later steps run in the recorder tab.
      let failure: string | null;
      try {
        failure = await saveBrowserRecording({
          driver,
          filePath: recording.downloadPath,
        });
      } finally {
        await closeRecorderTabAndRestoreFocus();
      }
      if (failure) {
        result.status = "FAIL";
        result.description = failure;
        // Clear the state so the auto-stop in runContext doesn't re-invoke
        // a doomed second stop (the recorder was already told to stop).
        dropHandle();
        discardCheckpointStaging();
        return result;
      }

      // Convert the saved .webm into the target format/location.
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
      if (path.extname(writeTargetPath).toLowerCase() === ".mp4") {
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
  // the user actually keeps. (This supersedes the probe-then-seed order from
  // the checkpoints layer: under aboveVariation the probe has to read the
  // file that survives the promote/discard decision, not the staged one.)
  const checkpoints: CheckpointsConfig | undefined = recording.checkpoints;
  let seededBaselines = 0;
  // A promote that couldn't commit must never read as a clean PASS, and a
  // video that refreshed without its baselines is only a partial refresh.
  let promoteFailed = false;
  let baselineFailures = 0;
  result.outputs = {};
  if (isAboveVariation) {
    // Span verdict (ADR 01078): promote the staged capture over the target
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
      promoteFailed = !promoted.videoPromoted;
      baselineFailures = promoted.baselineFailures;
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
        promoteFailed = !promoted.videoPromoted;
        baselineFailures = promoted.baselineFailures;
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
    // Recording checkpoints without aboveVariation (ADR 01075): seed missing
    // baselines from the staged captures (first run); never modify existing
    // baselines. A dirty span (a step FAILed) seeds nothing — first-run
    // baselines must come from a clean run.
    for (const entry of checkpoints.entries) {
      if (checkpoints.spanDirty) break;
      if (entry.baselineMissing && !entry.error) {
        try {
          fs.mkdirSync(checkpoints.baselineDir, { recursive: true });
          // COPYFILE_EXCL enforces "seeding never overwrites a baseline" at
          // the syscall: `baselineMissing` was decided back when the
          // checkpoint was captured, so a baseline committed (or written by
          // another run) since then would otherwise be silently replaced —
          // the one thing this layer promises not to do.
          fs.copyFileSync(
            entry.stagingPath,
            entry.baselinePath,
            fs.constants.COPYFILE_EXCL
          );
          seededBaselines++;
        } catch (error: any) {
          entry.error =
            error?.code === "EEXIST"
              ? `A baseline appeared at ${entry.baselinePath} after this checkpoint was captured; left it untouched.`
              : String(error?.message ?? error);
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
  result.outputs.format = path.extname(finalTargetPath).slice(1).toLowerCase();
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

  // Structural verify guards (ADR 01080) and checkpoint drift reporting
  // (ADR 01075) evaluate through ONE shared implicit-assertion pass, so the
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
    // Only verify guards carry FAIL severity; checkpoint specs are warnings.
    // So a FAIL here is always a guard, and a WARNING always has checkpoints —
    // the `entries` check keeps that assumption honest rather than implicit,
    // since the guards can run on a span with no checkpoints at all.
    if (status === "FAIL") {
      result.description += ` One or more structural verify guards failed.`;
    } else if (status === "WARNING" && checkpoints?.entries?.length) {
      // Only claim a refresh when one actually happened: an indeterminate or
      // failed span keeps the existing recording, so saying "refreshed" there
      // would describe the opposite of what's on disk.
      result.description += !isAboveVariation
        ? ` One or more checkpoints drifted beyond maxVariation (${checkpoints.maxVariation}) or couldn't be compared — the recorded flow's content may have changed since its baselines were captured.`
        : result.outputs.changed
          ? ` One or more checkpoints drifted beyond maxVariation (${checkpoints.maxVariation}) or couldn't be compared — the recording was refreshed to match the current content.`
          : ` One or more checkpoints drifted beyond maxVariation (${checkpoints.maxVariation}) or couldn't be compared — the existing recording was kept.`;
    }
    if (baselineFailures > 0) {
      result.outputs.baselineFailures = baselineFailures;
    }
  }
  if (checkpoints) {
    try {
      fs.rmSync(checkpoints.stagingDir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup; staged files live under the OS temp dir */
    }
  }

  // A promote that couldn't commit outranks everything above: the step must
  // not report a clean PASS over a recording that isn't there. With no target
  // at all there is nothing to hand the user (FAIL, and drop the path we can't
  // honour); with the previous target retained the run still has a video, just
  // a stale one (WARNING).
  if (promoteFailed) {
    if (!fs.existsSync(finalTargetPath)) {
      result.status = "FAIL";
      result.description = `Couldn't save the recording to ${finalTargetPath}: promoting the captured video failed and no previous recording exists at that path.`;
      delete result.outputs.recordingPath;
      delete result.outputs.format;
    } else {
      // Never downgrade a structural verify FAIL (ADR 01080) to WARNING here:
      // a guard the author explicitly demanded outranks "we kept the old
      // video", and the roll-up is FAIL > WARNING everywhere else. Say the
      // target is stale either way — that's additive information, not a
      // verdict.
      if (result.status !== "FAIL") result.status = "WARNING";
      result.description += ` The captured video couldn't replace ${finalTargetPath}, so the existing (now stale) recording was kept.`;
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
  if (path.extname(targetPath).toLowerCase() === ".gif") {
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

// How long the recorder tab gets to finish the recording after it's stopped.
// Under WebDriver's default 30 s script timeout, since the wait runs in-page.
const BROWSER_RECORDING_WAIT_MS = 20000;
// Raw bytes per WebDriver round trip (~5.6 MB of base64).
const BROWSER_RECORDING_CHUNK_BYTES = 4 * 1024 * 1024;

// Stop the browser-engine recorder (the driver is focused on its tab), then
// copy the finished WebM out of the page to `filePath` in base64 chunks.
// Chrome's own download of the blob dropped files intermittently in headless
// Chrome, so the bytes come back through WebDriver instead (ADR 01176).
// Returns null once the file is saved, or why it isn't. A failure never
// leaves a partial file behind.
async function saveBrowserRecording({
  driver,
  filePath,
  chunkSize = BROWSER_RECORDING_CHUNK_BYTES,
}: {
  driver: any;
  filePath: string;
  chunkSize?: number;
}): Promise<string | null> {
  const fail = (reason: string) => {
    try {
      fs.rmSync(filePath, { force: true });
    } catch {
      /* best-effort */
    }
    return `Couldn't save the recording: ${reason}.`;
  };
  try {
    const size = await driver.execute(async (waitMs: number) => {
      const w = window as any;
      if (w.recorder && w.recorder.state !== "inactive") w.recorder.stop();
      const deadline = Date.now() + waitMs;
      while (!w.__ddRecording && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      return w.__ddRecording ? w.__ddRecording.size : -1;
    }, BROWSER_RECORDING_WAIT_MS);
    if (typeof size !== "number" || size < 0) {
      return fail(
        `the browser didn't finish it within ${BROWSER_RECORDING_WAIT_MS / 1000} seconds`
      );
    }
    if (size === 0) return fail("the browser recorded no video");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.alloc(0));
    for (let start = 0; start < size; start += chunkSize) {
      const end = Math.min(start + chunkSize, size);
      const base64 = await driver.execute(
        async (from: number, to: number) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL((window as any).__ddRecording.slice(from, to));
          }),
        start,
        end
      );
      if (typeof base64 !== "string" || base64.length === 0) {
        return fail(`the browser sent no data for bytes ${start} to ${end}`);
      }
      fs.appendFileSync(filePath, Buffer.from(base64, "base64"));
    }
    const written = fs.statSync(filePath).size;
    if (written !== size) return fail(`the browser sent ${written} of ${size} bytes`);
    return null;
  } catch (error: any) {
    return fail(String(error?.message ?? error).replace(/\.\s*$/, ""));
  }
}
