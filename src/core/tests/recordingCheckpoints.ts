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
  resolveCheckpointsConfig,
  captureRecordingCheckpoints,
};
export type { CheckpointsConfig, CheckpointEntry };

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
};

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
  const raw = record?.checkpoints;
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

// The post-step checkpoint hook body: for every active, non-synthetic
// recording handle with checkpoints enabled, capture one screenshot and
// compare it compare-only against the handle's persistent baseline, pushing
// a CheckpointEntry either way. Baselines are never written here — seeding
// and updates belong to stopRecord (ADR 01072). Never throws: a failed
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
    // limitation — app-surface checkpoints are a follow-up, ADR 01072).
    log(
      config,
      "debug",
      "Recording checkpoints skipped: no browser driver in this context."
    );
    return;
  }
  // A FAILed step's frame is not a meaningful baseline (unlike
  // autoScreenshot, which deliberately captures failure frames for
  // debugging) — seeding it would poison every later comparison.
  if (stepStatus === "FAIL") {
    log(
      config,
      "debug",
      `Recording checkpoint skipped for failed step ${step.stepId}.`
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
