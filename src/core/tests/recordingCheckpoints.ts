import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { log, sanitizeFilesystemName } from "../utils.js";
import { BROWSER_STEP_KEYS as driverActions } from "../../runtime/browserStepKeys.js";
import { saveScreenshot } from "./saveScreenshot.js";

export {
  capPathSegment,
  stepArtifactFileName,
  recordingCheckpointsEnabled,
  resolveCheckpointsConfig,
  captureRecordingCheckpoints,
  computeSpanVerdict,
  promoteRecordingSpan,
  buildCheckpointOutputs,
};
export type { CheckpointsConfig, CheckpointEntry, SpanVerdict };

// Directory/file segments built from IDs are capped so deeply nested doc
// trees can't push the full path past Windows' MAX_PATH. The default cap is
// 32: the REST artifact tree nests several id segments
// (specs/<id>/tests/<id>/contexts/<id>/…), so a larger default could exceed
// MAX_PATH on Windows.
//
// Plain tail truncation alone is unsafe: two distinct ids that share the same
// trailing `max` characters (e.g. mirror directory trees that differ only in a
// long prefix) would collapse into the same path segment, so one context's
// screenshots/recording could overwrite another's and the reported relative
// path would resolve to the wrong artifact. When a segment exceeds the cap,
// prepend a short deterministic hash of the *full* segment so distinct ids stay
// distinct, and keep the trailing chars (where generated ids carry their
// content hash) for human correlation. Deterministic — the same id maps to the
// same segment every run, preserving run-over-run comparison.
function capPathSegment(segment: string, max: number = 32): string {
  if (segment.length <= max) return segment;
  const hash = createHash("sha1").update(segment).digest("hex").slice(0, 8);
  const tail = segment.slice(segment.length - (max - hash.length - 1));
  return `${hash}-${tail}`;
}

// The per-step artifact filename shared by autoScreenshot captures and
// recording checkpoints: `NN-<action>-<stepRef>.png`, with the ordinal
// zero-padded to the step count's width (min 2, so listings sort naturally
// past 99 steps) and the stepId's testId prefix stripped to keep names short.
// The name must stay byte-stable across runs — persistent-baseline comparison
// and run-over-run diffing both key on it.
function stepArtifactFileName({
  step,
  stepIndex,
  stepCount,
  testId,
}: {
  step: any;
  stepIndex: number;
  stepCount: number;
  testId: string;
}): string {
  const action =
    driverActions.find((key) => typeof step[key] !== "undefined") || "step";
  const sanitizedTestId = sanitizeFilesystemName(String(testId ?? ""), "test");
  const stepIdString = sanitizeFilesystemName(String(step.stepId ?? ""), "step");
  const stepRef = capPathSegment(
    stepIdString.startsWith(`${sanitizedTestId}~`)
      ? stepIdString.slice(sanitizedTestId.length + 1)
      : stepIdString
  );
  const pad = Math.max(2, String(stepCount).length);
  return `${String(stepIndex + 1).padStart(pad, "0")}-${action}-${stepRef}.png`;
}

// One captured checkpoint: where the fresh capture was staged, which baseline
// it was compared against, and what the comparison said. Accumulated on the
// recording handle during the span; consumed at stopRecord.
type CheckpointEntry = {
  fileName: string;
  stagingPath: string;
  baselinePath: string;
  variation?: number;
  baselineMissing?: boolean;
  error?: string;
};

// Resolved checkpoint settings carried on a recording handle.
type CheckpointsConfig = {
  maxVariation: number;
  baselineDir: string;
  stagingDir: string;
  entries: CheckpointEntry[];
  /**
   * Set when a step FAILed while this span was active. A dirty span's
   * checkpoint set is incomplete (failed/unreached steps have no entries),
   * so orphan-based verdicts would misread it as "steps removed" -- the
   * verdict, promote, and seeding are all skipped for dirty spans.
   */
  spanDirty?: boolean;
};

// Whether a record step's authored form enables checkpoints — the single
// predicate shared by resolveCheckpointsConfig and startRecording's phantom
// gate (ADR 01079), so the two can't drift: this returns true exactly when
// resolveCheckpointsConfig returns a config.
function recordingCheckpointsEnabled(record: any): boolean {
  if (record?.overwrite === "aboveVariation") return true;
  return record?.checkpoints !== undefined && record?.checkpoints !== false;
}

// Resolve a record step's `checkpoints` field against the recording's target
// path. Baselines default to a `.checkpoints` directory named after the full
// recording filename (extension included — `demo.mp4.checkpoints/` — so
// same-stem recordings in one folder never share or orphan-flag each other's
// baselines). A relative `directory` override resolves beside the recording.
// Staged captures go under the OS temp dir, keyed by the handle id.
function resolveCheckpointsConfig({
  record,
  targetPath,
  handleId,
}: {
  record: any;
  targetPath: string;
  handleId: string;
}): CheckpointsConfig | null {
  let raw = record?.checkpoints;
  // overwrite: "aboveVariation" REQUIRES checkpoints — the span verdict
  // (ADR 01078) is computed from them, so the mode forces them on even over
  // an explicit `checkpoints: false` (documented; a verdict with no evidence
  // could never refresh a drifted recording). An explicit checkpoints object
  // still tunes maxVariation/directory.
  if (
    record?.overwrite === "aboveVariation" &&
    (raw === undefined || raw === false)
  ) {
    raw = true;
  }
  if (raw === undefined || raw === false) return null;
  const opts = raw === true ? {} : raw;
  const baselineDir = opts.directory
    ? path.resolve(path.dirname(targetPath), opts.directory)
    : `${targetPath}.checkpoints`;
  return {
    maxVariation: opts.maxVariation ?? 0.05,
    baselineDir,
    stagingDir: path.join(
      os.tmpdir(),
      "doc-detective",
      "checkpoints",
      String(handleId)
    ),
    entries: [],
  };
}

// The outcome of judging a recording span against its baselines (ADR 01078).
type SpanVerdict = {
  changed: boolean;
  reasons: string[];
  orphans: string[];
};

// Judge whether a recording span meaningfully changed since its baselines
// were captured. CHANGED on any of: pixel drift beyond maxVariation, a
// checkpoint with no baseline (step added or renamed), an orphaned baseline
// with no matching checkpoint (step removed or renamed), an errored
// checkpoint (incomparable — can't prove the span unchanged), or a missing
// target recording. Pure decision over the entries plus one baseline-dir
// listing; a renamed step's paired missing+orphan reads as one edit in the
// reasons.
function computeSpanVerdict({
  entries,
  baselineDir,
  maxVariation,
  targetExists,
}: {
  entries: CheckpointEntry[];
  baselineDir: string;
  maxVariation: number;
  targetExists: boolean;
}): SpanVerdict {
  const reasons: string[] = [];
  const drifted = entries.filter(
    (e) => typeof e.variation === "number" && e.variation > maxVariation
  );
  if (drifted.length > 0) {
    reasons.push(
      `${drifted.length} checkpoint(s) drifted beyond maxVariation (${maxVariation}): pixel variation up to ${Math.max(
        ...drifted.map((e) => e.variation as number)
      ).toFixed(3)}`
    );
  }
  const missing = entries.filter((e) => e.baselineMissing);
  if (missing.length > 0) {
    reasons.push(
      `${missing.length} checkpoint(s) have no baseline (step added or renamed)`
    );
  }
  const errored = entries.filter((e) => e.error);
  if (errored.length > 0) {
    reasons.push(
      `${errored.length} checkpoint(s) couldn't be compared (capture or comparison error)`
    );
  }
  let orphans: string[] = [];
  try {
    const expected = new Set(entries.map((e) => e.fileName));
    orphans = fs
      .readdirSync(baselineDir)
      .filter((name) => name.endsWith(".png") && !expected.has(name));
  } catch {
    // No baseline dir yet — nothing to orphan.
  }
  if (orphans.length > 0) {
    reasons.push(
      `${orphans.length} baseline(s) have no matching step (step removed or renamed)`
    );
  }
  if (!targetExists) {
    reasons.push("the recording file is missing");
  }
  return { changed: reasons.length > 0, reasons, orphans };
}

// Promote a CHANGED span: replace the target video with the staged capture,
// then bring every baseline in line with this run's captures, then delete
// orphans — in that order, so any mid-sequence crash leaves a fresh video
// with stale baselines, which the next run detects as CHANGED and repairs
// (self-healing in the safe direction; true multi-file atomicity isn't
// possible). The video swap parks the existing target at a backup name
// first (Windows can't rename over an existing file) and RESTORES it if the
// staging rename fails — the user's committed recording is never destroyed
// without its replacement in place. Baselines write via copy-to-temp-then-
// rename so a torn write never corrupts a committed baseline. Failures log
// warnings; the returned counts tell the caller what actually happened so
// outputs never claim a refresh that didn't land.
function promoteRecordingSpan({
  config,
  stagingTarget,
  targetPath,
  entries,
  orphans,
  baselineDir,
}: {
  config: any;
  stagingTarget: string;
  targetPath: string;
  entries: CheckpointEntry[];
  orphans: string[];
  baselineDir: string;
}): { videoPromoted: boolean; seededBaselines: number } {
  const backupPath = `${targetPath}.promote-backup`;
  const targetExisted = fs.existsSync(targetPath);
  try {
    if (targetExisted) fs.renameSync(targetPath, backupPath);
    fs.renameSync(stagingTarget, targetPath);
    if (targetExisted) fs.rmSync(backupPath, { force: true });
  } catch (error: any) {
    log(
      config,
      "warning",
      `Couldn't promote the refreshed recording over ${targetPath}; keeping the existing recording. ${error?.message ?? error}`
    );
    try {
      if (targetExisted && !fs.existsSync(targetPath)) {
        fs.renameSync(backupPath, targetPath);
      }
      fs.rmSync(stagingTarget, { force: true });
    } catch {
      /* best-effort restore */
    }
    return { videoPromoted: false, seededBaselines: 0 };
  }
  try {
    fs.mkdirSync(baselineDir, { recursive: true });
  } catch {
    /* surfaced by the per-entry writes below */
  }
  let seededBaselines = 0;
  for (const entry of entries) {
    if (entry.error) continue;
    try {
      const tempPath = `${entry.baselinePath}.tmp`;
      fs.copyFileSync(entry.stagingPath, tempPath);
      fs.renameSync(tempPath, entry.baselinePath);
      if (entry.baselineMissing) seededBaselines++;
    } catch (error: any) {
      log(
        config,
        "warning",
        `Couldn't update checkpoint baseline ${entry.baselinePath}: ${error?.message ?? error}`
      );
    }
  }
  for (const orphan of orphans) {
    try {
      fs.unlinkSync(path.join(baselineDir, orphan));
    } catch (error: any) {
      log(
        config,
        "warning",
        `Couldn't remove orphaned checkpoint baseline ${orphan}: ${error?.message ?? error}`
      );
    }
  }
  return { videoPromoted: true, seededBaselines };
}

// The per-checkpoint slice of stopRecord's outputs, shared by headed stops
// and phantom (headless) stops so both report the same structured surface.
function buildCheckpointOutputs(entries: CheckpointEntry[]): {
  checkpoints: any[];
  maxCheckpointVariation: number;
  checkpointErrors: number;
} {
  let maxCheckpointVariation = 0;
  for (const entry of entries) {
    if (typeof entry.variation === "number") {
      maxCheckpointVariation = Math.max(
        maxCheckpointVariation,
        entry.variation
      );
    }
  }
  return {
    checkpoints: entries.map((entry) => ({
      fileName: entry.fileName,
      ...(typeof entry.variation === "number"
        ? { variation: entry.variation }
        : {}),
      ...(entry.baselineMissing ? { baselineMissing: true } : {}),
      ...(entry.error ? { error: entry.error } : {}),
    })),
    maxCheckpointVariation,
    checkpointErrors: entries.filter((entry) => entry.error).length,
  };
}

// The post-step checkpoint hook body: for every active, non-synthetic
// recording handle with checkpoints enabled, capture one screenshot and
// compare it compare-only against the handle's persistent baseline, pushing
// a CheckpointEntry either way. Baselines are never written here — seeding
// and updates belong to stopRecord (ADR 01075). Never throws: a failed
// capture records an entry with `error` and a warning log, mirroring
// captureAutoScreenshot's contract (a missed checkpoint must not fail the
// step it documents).
async function captureRecordingCheckpoints({
  config,
  driver,
  recordingHost,
  step,
  stepStatus,
  stepIndex,
  stepCount,
  testId,
  appSession,
}: {
  config: any;
  driver: any;
  recordingHost: any;
  step: any;
  stepStatus?: string;
  stepIndex: number;
  stepCount: number;
  testId: string;
  appSession?: any;
}): Promise<void> {
  const recordings = recordingHost?.state?.recordings;
  if (!Array.isArray(recordings) || recordings.length === 0) return;
  // Single home for "which handles qualify": non-synthetic (autoRecord's
  // span targets a per-run output folder, so a persistent baseline could
  // never anchor there) with resolved checkpoint config.
  const qualifying = recordings.filter(
    (h: any) => h?.checkpoints && !h.synthetic
  );
  if (qualifying.length === 0) return;
  if (!driver) {
    // App-only contexts have no browser driver to capture with (v1
    // limitation — app-surface checkpoints are a follow-up, ADR 01075).
    log(
      config,
      "debug",
      "Recording checkpoints skipped: no browser driver in this context."
    );
    return;
  }
  // A FAILed step's frame is not a meaningful baseline (unlike
  // autoScreenshot, which deliberately captures failure frames for
  // debugging) — seeding it would poison every later comparison. Worse, the
  // failed step and everything after it produce NO entries, so orphan-based
  // span verdicts would misread the gap as "steps removed" and destroy good
  // artifacts. Mark every active span dirty so stopRecord skips the verdict,
  // promotion, and seeding for this span.
  if (stepStatus === "FAIL") {
    for (const handle of qualifying) {
      handle.checkpoints.spanDirty = true;
    }
    log(
      config,
      "debug",
      `Recording checkpoint skipped for failed step ${step.stepId}; span marked dirty.`
    );
    return;
  }
  for (const handle of qualifying) {
    const checkpoints: CheckpointsConfig = handle.checkpoints;
    const fileName = stepArtifactFileName({
      step,
      stepIndex,
      stepCount,
      testId,
    });
    const entry: CheckpointEntry = {
      fileName,
      stagingPath: path.join(checkpoints.stagingDir, fileName),
      baselinePath: path.join(checkpoints.baselineDir, fileName),
    };
    try {
      fs.mkdirSync(checkpoints.stagingDir, { recursive: true });
      const screenshotStep = {
        stepId: `${step.stepId}_checkpoint`,
        description: "Recording checkpoint screenshot",
        screenshot: {
          path: entry.baselinePath,
          maxVariation: checkpoints.maxVariation,
          overwrite: "aboveVariation",
        },
      };
      const captureResult = await saveScreenshot({
        config,
        step: screenshotStep,
        driver,
        appSession,
        internal: { compareOnly: true, capturePath: entry.stagingPath },
      });
      if (
        captureResult.status !== "PASS" &&
        captureResult.status !== "WARNING"
      ) {
        entry.error = captureResult.description;
        log(
          config,
          "warning",
          `Recording checkpoint failed after step ${step.stepId}: ${captureResult.description}`
        );
      } else {
        if (typeof captureResult.outputs?.variation === "number") {
          entry.variation = captureResult.outputs.variation;
        }
        if (captureResult.outputs?.baselineMissing) {
          entry.baselineMissing = true;
        }
      }
    } catch (error: any) {
      entry.error = String(error?.message ?? error);
      log(
        config,
        "warning",
        `Recording checkpoint failed after step ${step.stepId}: ${entry.error}`
      );
    }
    // A step revisited via goToStep produces the same fileName — keep only
    // the latest visit's entry (latest-visit-wins, same as autoScreenshot).
    const existingIndex = checkpoints.entries.findIndex(
      (e) => e.fileName === fileName
    );
    if (existingIndex >= 0) {
      checkpoints.entries[existingIndex] = entry;
    } else {
      checkpoints.entries.push(entry);
    }
  }
}
