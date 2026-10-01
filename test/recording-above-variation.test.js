import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  computeSpanVerdict,
  promoteRecordingSpan,
  recordingCheckpointsEnabled,
  resolveCheckpointsConfig,
} from "../dist/core/tests/recordingCheckpoints.js";
import { stopRecording } from "../dist/core/tests/stopRecording.js";

// ---------------------------------------------------------------------------
// ADR 01078: record overwrite "aboveVariation" — span verdict + promote.
// ADR 01079: phantom spans — read-only staleness detection headless.
// ---------------------------------------------------------------------------

describe("computeSpanVerdict", function () {
  let tmpDir;
  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-verdict-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function baselineDirWith(fileNames) {
    const dir = path.join(tmpDir, "baselines");
    fs.mkdirSync(dir, { recursive: true });
    for (const name of fileNames) fs.writeFileSync(path.join(dir, name), "x");
    return dir;
  }

  const entry = (fileName, extra = {}) => ({
    fileName,
    stagingPath: path.join(tmpDir, "staging", fileName),
    baselinePath: path.join(tmpDir, "baselines", fileName),
    ...extra,
  });

  it("is UNCHANGED when every checkpoint compared within tolerance and nothing is orphaned", function () {
    const baselineDir = baselineDirWith(["01-a.png", "02-b.png"]);
    const verdict = computeSpanVerdict({
      entries: [
        entry("01-a.png", { variation: 0.01 }),
        entry("02-b.png", { variation: 0 }),
      ],
      baselineDir,
      maxVariation: 0.05,
      targetExists: true,
    });
    assert.equal(verdict.changed, false);
    assert.deepEqual(verdict.reasons, []);
    assert.deepEqual(verdict.orphans, []);
  });

  it("flags CHANGED on variation beyond maxVariation", function () {
    const baselineDir = baselineDirWith(["01-a.png"]);
    const verdict = computeSpanVerdict({
      entries: [entry("01-a.png", { variation: 0.2 })],
      baselineDir,
      maxVariation: 0.05,
      targetExists: true,
    });
    assert.equal(verdict.changed, true);
    assert.ok(verdict.reasons.some((r) => /drift|variation/i.test(r)));
  });

  it("flags CHANGED on a missing baseline (new or renamed step)", function () {
    const baselineDir = baselineDirWith([]);
    const verdict = computeSpanVerdict({
      entries: [entry("01-a.png", { baselineMissing: true })],
      baselineDir,
      maxVariation: 0.05,
      targetExists: true,
    });
    assert.equal(verdict.changed, true);
    assert.ok(verdict.reasons.some((r) => /added|renamed/i.test(r)));
  });

  it("flags CHANGED on an orphaned baseline (removed or renamed step)", function () {
    const baselineDir = baselineDirWith(["01-a.png", "09-gone.png"]);
    const verdict = computeSpanVerdict({
      entries: [entry("01-a.png", { variation: 0 })],
      baselineDir,
      maxVariation: 0.05,
      targetExists: true,
    });
    assert.equal(verdict.changed, true);
    assert.deepEqual(verdict.orphans, ["09-gone.png"]);
    assert.ok(verdict.reasons.some((r) => /removed|renamed/i.test(r)));
  });

  it("flags CHANGED on an errored checkpoint (can't prove unchanged)", function () {
    const baselineDir = baselineDirWith(["01-a.png"]);
    const verdict = computeSpanVerdict({
      entries: [entry("01-a.png", { error: "boom" })],
      baselineDir,
      maxVariation: 0.05,
      targetExists: true,
    });
    assert.equal(verdict.changed, true);
  });

  it("flags CHANGED when the target recording is missing", function () {
    const baselineDir = baselineDirWith(["01-a.png"]);
    const verdict = computeSpanVerdict({
      entries: [entry("01-a.png", { variation: 0 })],
      baselineDir,
      maxVariation: 0.05,
      targetExists: false,
    });
    assert.equal(verdict.changed, true);
    assert.ok(verdict.reasons.some((r) => /missing/i.test(r)));
  });

  it("treats a nonexistent baseline dir as no orphans", function () {
    const verdict = computeSpanVerdict({
      entries: [entry("01-a.png", { baselineMissing: true })],
      baselineDir: path.join(tmpDir, "never-created"),
      maxVariation: 0.05,
      targetExists: true,
    });
    assert.equal(verdict.changed, true);
    assert.deepEqual(verdict.orphans, []);
  });
});

describe("promoteRecordingSpan", function () {
  let tmpDir;
  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-promote-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("replaces the target video, writes baselines, and deletes orphans", function () {
    const targetPath = path.join(tmpDir, "demo.mp4");
    const stagingTarget = path.join(tmpDir, ".demo.staging.mp4");
    const baselineDir = path.join(tmpDir, "demo.mp4.checkpoints");
    const stagingDir = path.join(tmpDir, "staging");
    fs.mkdirSync(baselineDir, { recursive: true });
    fs.mkdirSync(stagingDir, { recursive: true });
    fs.writeFileSync(targetPath, "old-video");
    fs.writeFileSync(stagingTarget, "new-video");
    fs.writeFileSync(path.join(baselineDir, "01-a.png"), "old-baseline");
    fs.writeFileSync(path.join(baselineDir, "09-gone.png"), "orphan");
    fs.writeFileSync(path.join(stagingDir, "01-a.png"), "new-baseline");
    const entries = [
      {
        fileName: "01-a.png",
        stagingPath: path.join(stagingDir, "01-a.png"),
        baselinePath: path.join(baselineDir, "01-a.png"),
        variation: 0.5,
      },
    ];

    promoteRecordingSpan({
      config: {},
      stagingTarget,
      targetPath,
      entries,
      orphans: ["09-gone.png"],
      baselineDir,
    });

    assert.equal(fs.readFileSync(targetPath, "utf8"), "new-video");
    assert.equal(fs.existsSync(stagingTarget), false);
    assert.equal(
      fs.readFileSync(path.join(baselineDir, "01-a.png"), "utf8"),
      "new-baseline"
    );
    assert.equal(fs.existsSync(path.join(baselineDir, "09-gone.png")), false);
  });

  it("creates the baseline dir and target when neither existed (first aboveVariation run)", function () {
    const targetPath = path.join(tmpDir, "demo.mp4");
    const stagingTarget = path.join(tmpDir, ".demo.staging.mp4");
    const baselineDir = path.join(tmpDir, "demo.mp4.checkpoints");
    const stagingDir = path.join(tmpDir, "staging");
    fs.mkdirSync(stagingDir, { recursive: true });
    fs.writeFileSync(stagingTarget, "new-video");
    fs.writeFileSync(path.join(stagingDir, "01-a.png"), "seed");
    const entries = [
      {
        fileName: "01-a.png",
        stagingPath: path.join(stagingDir, "01-a.png"),
        baselinePath: path.join(baselineDir, "01-a.png"),
        baselineMissing: true,
      },
    ];

    promoteRecordingSpan({
      config: {},
      stagingTarget,
      targetPath,
      entries,
      orphans: [],
      baselineDir,
    });

    assert.equal(fs.readFileSync(targetPath, "utf8"), "new-video");
    assert.equal(
      fs.readFileSync(path.join(baselineDir, "01-a.png"), "utf8"),
      "seed"
    );
  });

  it("skips baseline writes whose staged capture is missing without throwing", function () {
    const targetPath = path.join(tmpDir, "demo.mp4");
    const stagingTarget = path.join(tmpDir, ".demo.staging.mp4");
    const baselineDir = path.join(tmpDir, "demo.mp4.checkpoints");
    fs.writeFileSync(stagingTarget, "new-video");
    const entries = [
      {
        fileName: "01-a.png",
        stagingPath: path.join(tmpDir, "staging", "01-a.png"),
        baselinePath: path.join(baselineDir, "01-a.png"),
        error: "capture failed",
      },
    ];

    promoteRecordingSpan({
      config: {},
      stagingTarget,
      targetPath,
      entries,
      orphans: [],
      baselineDir,
    });

    assert.equal(fs.readFileSync(targetPath, "utf8"), "new-video");
    assert.equal(fs.existsSync(path.join(baselineDir, "01-a.png")), false);
  });
});

// stopRecording integration: aboveVariation staging + promote/discard, and
// the phantom read-only staleness branch. Device-engine handles keep these
// hermetic (no real capture process).
describe("stopRecording: overwrite aboveVariation", function () {
  this.timeout(20000);
  let tmpDir;
  const config = {};

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-av-stop-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeHandle({ entries, targetContents }) {
    const targetPath = path.join(tmpDir, "demo.mp4");
    if (targetContents !== undefined) fs.writeFileSync(targetPath, targetContents);
    const checkpoints = {
      maxVariation: 0.05,
      baselineDir: path.join(tmpDir, "demo.mp4.checkpoints"),
      stagingDir: path.join(tmpDir, "staging"),
      entries,
    };
    return {
      type: "appium",
      driver: {
        stopRecordingScreen: async () =>
          Buffer.from("fresh-video").toString("base64"),
      },
      targetPath,
      overwrite: "aboveVariation",
      checkpoints,
    };
  }

  function stage(checkpoints, fileName, contents, extra = {}) {
    fs.mkdirSync(checkpoints.stagingDir, { recursive: true });
    const stagingPath = path.join(checkpoints.stagingDir, fileName);
    fs.writeFileSync(stagingPath, contents);
    return {
      fileName,
      stagingPath,
      baselinePath: path.join(checkpoints.baselineDir, fileName),
      ...extra,
    };
  }

  it("UNCHANGED: discards the fresh capture and leaves target + baselines untouched", async function () {
    const handle = makeHandle({ entries: [], targetContents: "old-video" });
    fs.mkdirSync(handle.checkpoints.baselineDir, { recursive: true });
    const e = stage(handle.checkpoints, "01-a.png", "same", { variation: 0.001 });
    fs.writeFileSync(e.baselinePath, "same");
    handle.checkpoints.entries.push(e);
    const host = { state: { recordings: [handle] } };

    const result = await stopRecording({
      config,
      step: { stepId: "x", stopRecord: true },
      driver: host,
    });

    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.changed, false);
    assert.equal(
      fs.readFileSync(handle.targetPath, "utf8"),
      "old-video",
      "target must not be replaced when the span is unchanged"
    );
    assert.equal(fs.readFileSync(e.baselinePath, "utf8"), "same");
    assert.equal(fs.existsSync(handle.checkpoints.stagingDir), false);
  });

  it("CHANGED (drift): promotes the fresh capture and updates baselines", async function () {
    const handle = makeHandle({ entries: [], targetContents: "old-video" });
    fs.mkdirSync(handle.checkpoints.baselineDir, { recursive: true });
    const e = stage(handle.checkpoints, "01-a.png", "new-pixels", {
      variation: 0.4,
    });
    fs.writeFileSync(e.baselinePath, "old-pixels");
    handle.checkpoints.entries.push(e);
    const host = { state: { recordings: [handle] } };

    const result = await stopRecording({
      config,
      step: { stepId: "x", stopRecord: true },
      driver: host,
    });

    assert.equal(result.outputs.changed, true);
    assert.ok(Array.isArray(result.outputs.changeReasons));
    assert.equal(
      fs.readFileSync(handle.targetPath, "utf8"),
      "fresh-video",
      "target replaced with the fresh capture"
    );
    assert.equal(
      fs.readFileSync(e.baselinePath, "utf8"),
      "new-pixels",
      "baseline updated together with the video"
    );
    // Drift still surfaces as WARNING (ADR 01072 semantics preserved).
    assert.equal(result.status, "WARNING");
  });

  it("CHANGED (first run): seeds video + baselines when the target didn't exist", async function () {
    const handle = makeHandle({ entries: [] });
    const e = stage(handle.checkpoints, "01-a.png", "seed", {
      baselineMissing: true,
    });
    handle.checkpoints.entries.push(e);
    const host = { state: { recordings: [handle] } };

    const result = await stopRecording({
      config,
      step: { stepId: "x", stopRecord: true },
      driver: host,
    });

    assert.equal(result.outputs.changed, true);
    assert.equal(fs.readFileSync(handle.targetPath, "utf8"), "fresh-video");
    assert.equal(fs.readFileSync(e.baselinePath, "utf8"), "seed");
  });

  it("CHANGED (orphan): a removed step's baseline is deleted on promote", async function () {
    const handle = makeHandle({ entries: [], targetContents: "old-video" });
    fs.mkdirSync(handle.checkpoints.baselineDir, { recursive: true });
    const e = stage(handle.checkpoints, "01-a.png", "same", { variation: 0 });
    fs.writeFileSync(e.baselinePath, "same");
    fs.writeFileSync(
      path.join(handle.checkpoints.baselineDir, "09-gone.png"),
      "orphan"
    );
    handle.checkpoints.entries.push(e);
    const host = { state: { recordings: [handle] } };

    const result = await stopRecording({
      config,
      step: { stepId: "x", stopRecord: true },
      driver: host,
    });

    assert.equal(result.outputs.changed, true);
    assert.equal(
      fs.existsSync(path.join(handle.checkpoints.baselineDir, "09-gone.png")),
      false
    );
  });
});

describe("stopRecording: phantom spans (headless staleness)", function () {
  this.timeout(20000);
  let tmpDir;
  const config = {};

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-phantom-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makePhantom({ entries, targetExists, skipReason }) {
    const targetPath = path.join(tmpDir, "demo.mp4");
    if (targetExists) fs.writeFileSync(targetPath, "committed-video");
    return {
      type: "phantom",
      targetPath,
      ...(skipReason ? { skipReason } : {}),
      checkpoints: {
        maxVariation: 0.05,
        baselineDir: path.join(tmpDir, "demo.mp4.checkpoints"),
        stagingDir: path.join(tmpDir, "staging"),
        entries,
      },
    };
  }

  it("reports WARNING + stale when checkpoints drifted, writing nothing", async function () {
    const handle = makePhantom({ entries: [], targetExists: true });
    fs.mkdirSync(handle.checkpoints.baselineDir, { recursive: true });
    fs.mkdirSync(handle.checkpoints.stagingDir, { recursive: true });
    const baselinePath = path.join(
      handle.checkpoints.baselineDir,
      "01-a.png"
    );
    fs.writeFileSync(baselinePath, "committed-baseline");
    handle.checkpoints.entries.push({
      fileName: "01-a.png",
      stagingPath: path.join(handle.checkpoints.stagingDir, "01-a.png"),
      baselinePath,
      variation: 0.4,
    });
    const host = { state: { recordings: [handle] } };

    const result = await stopRecording({
      config,
      step: { stepId: "x", stopRecord: true },
      driver: host,
    });

    assert.equal(result.status, "WARNING");
    assert.equal(result.outputs.stale, true);
    assert.match(result.description, /stale|headed/i);
    assert.equal(
      fs.readFileSync(baselinePath, "utf8"),
      "committed-baseline",
      "phantom stops never write baselines"
    );
    assert.equal(host.state.recordings.length, 0, "handle dropped");
    assert.equal(fs.existsSync(handle.checkpoints.stagingDir), false);
  });

  // A phantom raised by the existing-target skip must not tell the author to
  // re-run headed — the run may already be headed; the remedy is `overwrite`.
  it("names the right remedy when the skip was an existing target, not headless", async function () {
    const handle = makePhantom({
      entries: [],
      targetExists: true,
      skipReason: "targetExists",
    });
    fs.mkdirSync(handle.checkpoints.baselineDir, { recursive: true });
    fs.mkdirSync(handle.checkpoints.stagingDir, { recursive: true });
    const baselinePath = path.join(handle.checkpoints.baselineDir, "01-a.png");
    fs.writeFileSync(baselinePath, "committed-baseline");
    handle.checkpoints.entries.push({
      fileName: "01-a.png",
      stagingPath: path.join(handle.checkpoints.stagingDir, "01-a.png"),
      baselinePath,
      variation: 0.4,
    });
    const host = { state: { recordings: [handle] } };

    const result = await stopRecording({
      config,
      step: { stepId: "x", stopRecord: true },
      driver: host,
    });

    assert.equal(result.status, "WARNING");
    assert.equal(result.outputs.stale, true);
    assert.match(result.description, /overwrite/);
    assert.ok(
      !/headless|headed/i.test(result.description),
      `existing-target skip must not blame headless, got: ${result.description}`
    );
  });

  it("still names headless as the remedy for a headless phantom", async function () {
    const handle = makePhantom({
      entries: [],
      targetExists: true,
      skipReason: "headless",
    });
    fs.mkdirSync(handle.checkpoints.baselineDir, { recursive: true });
    fs.mkdirSync(handle.checkpoints.stagingDir, { recursive: true });
    const baselinePath = path.join(handle.checkpoints.baselineDir, "01-a.png");
    fs.writeFileSync(baselinePath, "committed-baseline");
    handle.checkpoints.entries.push({
      fileName: "01-a.png",
      stagingPath: path.join(handle.checkpoints.stagingDir, "01-a.png"),
      baselinePath,
      variation: 0.4,
    });
    const host = { state: { recordings: [handle] } };

    const result = await stopRecording({
      config,
      step: { stepId: "x", stopRecord: true },
      driver: host,
    });

    assert.equal(result.status, "WARNING");
    assert.equal(result.outputs.stale, true);
    assert.match(result.description, /headed/i);
  });

  it("reports SKIPPED + stale=false when checkpoints match", async function () {
    const handle = makePhantom({ entries: [], targetExists: true });
    fs.mkdirSync(handle.checkpoints.baselineDir, { recursive: true });
    const baselinePath = path.join(
      handle.checkpoints.baselineDir,
      "01-a.png"
    );
    fs.writeFileSync(baselinePath, "x");
    handle.checkpoints.entries.push({
      fileName: "01-a.png",
      stagingPath: path.join(handle.checkpoints.stagingDir, "01-a.png"),
      baselinePath,
      variation: 0.001,
    });
    const host = { state: { recordings: [handle] } };

    const result = await stopRecording({
      config,
      step: { stepId: "x", stopRecord: true },
      driver: host,
    });

    assert.equal(result.status, "SKIPPED");
    assert.equal(result.outputs.stale, false);
  });

  it("reports stale when no baselines exist yet (nothing was ever recorded headed)", async function () {
    const handle = makePhantom({ entries: [], targetExists: false });
    fs.mkdirSync(handle.checkpoints.stagingDir, { recursive: true });
    handle.checkpoints.entries.push({
      fileName: "01-a.png",
      stagingPath: path.join(handle.checkpoints.stagingDir, "01-a.png"),
      baselinePath: path.join(handle.checkpoints.baselineDir, "01-a.png"),
      baselineMissing: true,
    });
    const host = { state: { recordings: [handle] } };

    const result = await stopRecording({
      config,
      step: { stepId: "x", stopRecord: true },
      driver: host,
    });

    assert.equal(result.status, "WARNING");
    assert.equal(result.outputs.stale, true);
    assert.equal(
      fs.existsSync(handle.checkpoints.baselineDir),
      false,
      "phantom stops never seed baselines"
    );
  });
});

// Review hardening (ADR 01078/01074 follow-ups): dirty spans, evidence-free
// verdicts, checkpoint enablement coherence, and truthful promote reporting.
describe("aboveVariation hardening", function () {
  this.timeout(20000);
  let tmpDir;
  const config = {};

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-av-hard-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeHandle({ entries, targetContents, spanDirty }) {
    const targetPath = path.join(tmpDir, "demo.mp4");
    if (targetContents !== undefined)
      fs.writeFileSync(targetPath, targetContents);
    return {
      type: "appium",
      driver: {
        stopRecordingScreen: async () =>
          Buffer.from("fresh-video").toString("base64"),
      },
      targetPath,
      overwrite: "aboveVariation",
      checkpoints: {
        maxVariation: 0.05,
        baselineDir: path.join(tmpDir, "demo.mp4.checkpoints"),
        stagingDir: path.join(tmpDir, "staging"),
        entries,
        ...(spanDirty ? { spanDirty: true } : {}),
      },
    };
  }

  it("a dirty span keeps the existing recording and baselines untouched", async function () {
    const handle = makeHandle({
      entries: [],
      targetContents: "old-video",
      spanDirty: true,
    });
    fs.mkdirSync(handle.checkpoints.baselineDir, { recursive: true });
    const baselinePath = path.join(
      handle.checkpoints.baselineDir,
      "01-a.png"
    );
    fs.writeFileSync(baselinePath, "committed");
    // Even a drifted entry must not promote when the span is dirty.
    fs.mkdirSync(handle.checkpoints.stagingDir, { recursive: true });
    const stagingPath = path.join(handle.checkpoints.stagingDir, "01-a.png");
    fs.writeFileSync(stagingPath, "drifted");
    handle.checkpoints.entries.push({
      fileName: "01-a.png",
      stagingPath,
      baselinePath,
      variation: 0.9,
    });
    const host = { state: { recordings: [handle] } };

    const result = await stopRecording({
      config,
      step: { stepId: "x", stopRecord: true },
      driver: host,
    });

    assert.equal(result.outputs.changed, false);
    assert.equal(fs.readFileSync(handle.targetPath, "utf8"), "old-video");
    assert.equal(fs.readFileSync(baselinePath, "utf8"), "committed");
  });

  it("a span with zero checkpoints keeps an existing recording (no evidence)", async function () {
    const handle = makeHandle({ entries: [], targetContents: "old-video" });
    const host = { state: { recordings: [handle] } };

    const result = await stopRecording({
      config,
      step: { stepId: "x", stopRecord: true },
      driver: host,
    });

    assert.equal(result.outputs.changed, false);
    assert.equal(fs.readFileSync(handle.targetPath, "utf8"), "old-video");
  });

  it("a span with zero checkpoints still seeds a missing recording (first run)", async function () {
    const handle = makeHandle({ entries: [] });
    const host = { state: { recordings: [handle] } };

    const result = await stopRecording({
      config,
      step: { stepId: "x", stopRecord: true },
      driver: host,
    });

    assert.equal(result.outputs.changed, true);
    assert.equal(fs.readFileSync(handle.targetPath, "utf8"), "fresh-video");
  });

  it("a dirty span under plain checkpoints seeds nothing", async function () {
    const handle = makeHandle({
      entries: [],
      targetContents: "old-video",
      spanDirty: true,
    });
    handle.overwrite = "true";
    fs.mkdirSync(handle.checkpoints.stagingDir, { recursive: true });
    const stagingPath = path.join(handle.checkpoints.stagingDir, "01-a.png");
    fs.writeFileSync(stagingPath, "capture");
    handle.checkpoints.entries.push({
      fileName: "01-a.png",
      stagingPath,
      baselinePath: path.join(handle.checkpoints.baselineDir, "01-a.png"),
      baselineMissing: true,
    });
    const host = { state: { recordings: [handle] } };

    const result = await stopRecording({
      config,
      step: { stepId: "x", stopRecord: true },
      driver: host,
    });

    assert.equal(result.outputs.seededBaselines, 0);
    assert.equal(
      fs.existsSync(handle.checkpoints.baselineDir),
      false,
      "a dirty span must not seed baselines"
    );
  });
});

describe("recordingCheckpointsEnabled + aboveVariation implication", function () {
  const targetPath = path.resolve("out", "demo.mp4");

  it("aboveVariation forces checkpoints on, even over explicit false", function () {
    for (const record of [
      { path: "demo.mp4", overwrite: "aboveVariation" },
      { path: "demo.mp4", overwrite: "aboveVariation", checkpoints: false },
    ]) {
      assert.equal(recordingCheckpointsEnabled(record), true);
      const resolved = resolveCheckpointsConfig({
        record,
        targetPath,
        handleId: "h1",
      });
      assert.notEqual(resolved, null);
      assert.equal(resolved.maxVariation, 0.05);
    }
  });

  it("aboveVariation keeps an explicit checkpoints object's tuning", function () {
    const resolved = resolveCheckpointsConfig({
      record: {
        path: "demo.mp4",
        overwrite: "aboveVariation",
        checkpoints: { maxVariation: 0.2 },
      },
      targetPath,
      handleId: "h2",
    });
    assert.equal(resolved.maxVariation, 0.2);
  });

  it("matches resolveCheckpointsConfig's nullability exactly", function () {
    for (const record of [
      { path: "demo.mp4" },
      { path: "demo.mp4", checkpoints: false },
      { path: "demo.mp4", checkpoints: true },
      { path: "demo.mp4", checkpoints: {} },
      { path: "demo.mp4", overwrite: "true" },
      { path: "demo.mp4", overwrite: "aboveVariation", checkpoints: false },
    ]) {
      const enabled = recordingCheckpointsEnabled(record);
      const resolved = resolveCheckpointsConfig({
        record,
        targetPath,
        handleId: "h3",
      });
      assert.equal(
        enabled,
        resolved !== null,
        `predicate/config disagree for ${JSON.stringify(record)}`
      );
    }
  });
});

describe("stopRecording: phantom indeterminate spans", function () {
  this.timeout(20000);
  let tmpDir;
  const config = {};

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-phantom-ind-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("a dirty or empty phantom span reports neither stale nor current", async function () {
    for (const overrides of [
      { entries: [], spanDirty: true },
      { entries: [] },
    ]) {
      const handle = {
        type: "phantom",
        targetPath: path.join(tmpDir, "demo.mp4"),
        checkpoints: {
          maxVariation: 0.05,
          baselineDir: path.join(tmpDir, "demo.mp4.checkpoints"),
          stagingDir: path.join(tmpDir, "staging"),
          ...overrides,
        },
      };
      const host = { state: { recordings: [handle] } };
      const result = await stopRecording({
        config,
        step: { stepId: "x", stopRecord: true },
        driver: host,
      });
      assert.equal(result.status, "SKIPPED");
      assert.equal(result.outputs?.stale, undefined);
    }
  });
});

// Review findings on #651: a promote that can't commit must never read as a
// clean PASS, and cleanup of the backup must not un-report a real refresh.
describe("promoteRecordingSpan: failure honesty", function () {
  let tmpDir;
  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-promote-fail-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("clears a crashed run's leftover backup instead of failing forever", function () {
    const targetPath = path.join(tmpDir, "demo.mp4");
    const stagingTarget = path.join(tmpDir, ".demo.staging.mp4");
    const baselineDir = path.join(tmpDir, "demo.mp4.checkpoints");
    fs.writeFileSync(targetPath, "old-video");
    fs.writeFileSync(stagingTarget, "new-video");
    // A previous run died mid-swap and left this behind. Windows can't rename
    // onto an existing file, so a stale backup would break every future promote.
    fs.writeFileSync(`${targetPath}.promote-backup`, "stale-backup");

    const out = promoteRecordingSpan({
      config: {},
      stagingTarget,
      targetPath,
      entries: [],
      orphans: [],
      baselineDir,
    });

    assert.equal(out.videoPromoted, true);
    assert.equal(fs.readFileSync(targetPath, "utf8"), "new-video");
    assert.equal(fs.existsSync(`${targetPath}.promote-backup`), false);
  });

  it("reports baselineFailures when the video refreshed but a baseline didn't", function () {
    const targetPath = path.join(tmpDir, "demo.mp4");
    const stagingTarget = path.join(tmpDir, ".demo.staging.mp4");
    const baselineDir = path.join(tmpDir, "demo.mp4.checkpoints");
    fs.writeFileSync(targetPath, "old-video");
    fs.writeFileSync(stagingTarget, "new-video");

    const out = promoteRecordingSpan({
      config: {},
      stagingTarget,
      targetPath,
      // Staged capture is absent -> the baseline copy must fail and be counted.
      entries: [
        {
          fileName: "01-a.png",
          stagingPath: path.join(tmpDir, "nope", "01-a.png"),
          baselinePath: path.join(baselineDir, "01-a.png"),
          variation: 0.9,
        },
      ],
      orphans: [],
      baselineDir,
    });

    assert.equal(out.videoPromoted, true, "the video swap still committed");
    assert.equal(out.baselineFailures, 1, "the failed baseline is reported");
  });
});
