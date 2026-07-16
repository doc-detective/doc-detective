import { expect } from "chai";
import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  capPathSegment,
  stepArtifactFileName,
  resolveCheckpointsConfig,
  captureRecordingCheckpoints,
} from "../dist/core/tests/recordingCheckpoints.js";
import { saveScreenshot } from "../dist/core/tests/saveScreenshot.js";
import { stopRecording } from "../dist/core/tests/stopRecording.js";

// sharp is an optionalDependency; skip the pixel-comparison suites when it
// isn't installed (same guard as recording-screenshot-coverage.test.js).
let sharp = null;
try {
  sharp = (await import("sharp")).default;
} catch {
  /* not installed */
}
const describeIfSharp = sharp ? describe : describe.skip;

async function makePngBuffer(width, height, { r, g, b } = { r: 255, g: 0, b: 0 }) {
  return sharp({
    create: { width, height, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();
}

function fakeDriver(buffer) {
  return {
    async takeScreenshot() {
      return buffer.toString("base64");
    },
    async saveScreenshot(filePath) {
      fs.writeFileSync(filePath, buffer);
    },
  };
}

describe("recordingCheckpoints", function () {
  // stepArtifactFileName must produce byte-identical names to the historical
  // autoScreenshot naming logic in tests.ts (ordinal-action-stepRef, testId
  // prefix stripped, zero-pad to the step count's width) — run-over-run
  // comparison depends on the name being stable.
  describe("stepArtifactFileName", function () {
    it("builds NN-action-stepRef.png with the testId prefix stripped", function () {
      const name = stepArtifactFileName({
        step: { stepId: "myTest~s1a2b3c4d", click: "button" },
        stepIndex: 4,
        stepCount: 12,
        testId: "myTest",
      });
      expect(name).to.equal("05-click-s1a2b3c4d.png");
    });

    it("keeps a stepId that doesn't embed the testId", function () {
      const name = stepArtifactFileName({
        step: { stepId: "custom-id", goTo: "http://x" },
        stepIndex: 0,
        stepCount: 3,
        testId: "otherTest",
      });
      expect(name).to.equal("01-goTo-custom-id.png");
    });

    it("zero-pads the ordinal to the step count's width (min 2)", function () {
      const wide = stepArtifactFileName({
        step: { stepId: "t~s1", find: "x" },
        stepIndex: 99,
        stepCount: 150,
        testId: "t",
      });
      expect(wide).to.equal("100-find-s1.png");
      const narrow = stepArtifactFileName({
        step: { stepId: "t~s1", find: "x" },
        stepIndex: 0,
        stepCount: 1,
        testId: "t",
      });
      expect(narrow).to.equal("01-find-s1.png");
    });

    it("falls back to 'step' for non-driver actions", function () {
      const name = stepArtifactFileName({
        step: { stepId: "t~s9", runShell: "echo hi" },
        stepIndex: 1,
        stepCount: 2,
        testId: "t",
      });
      expect(name).to.equal("02-step-s9.png");
    });

    it("caps long stepRefs with the deterministic hash-tail scheme", function () {
      const longRef = "a".repeat(60);
      const name = stepArtifactFileName({
        step: { stepId: `t~${longRef}`, click: "x" },
        stepIndex: 0,
        stepCount: 2,
        testId: "t",
      });
      const hash = createHash("sha1").update(longRef).digest("hex").slice(0, 8);
      const tail = longRef.slice(longRef.length - (32 - hash.length - 1));
      expect(name).to.equal(`01-click-${hash}-${tail}.png`);
    });
  });

  describe("capPathSegment", function () {
    it("returns short segments unchanged", function () {
      expect(capPathSegment("short")).to.equal("short");
    });

    it("caps long segments with a deterministic hash prefix", function () {
      const seg = "x".repeat(50);
      const capped = capPathSegment(seg);
      expect(capped.length).to.equal(32);
      expect(capPathSegment(seg)).to.equal(capped);
    });
  });

  describe("resolveCheckpointsConfig", function () {
    const targetPath = path.resolve("out", "demo.mp4");

    it("returns null when checkpoints are unset or disabled", function () {
      for (const record of [
        { path: "demo.mp4" },
        { path: "demo.mp4", checkpoints: false },
      ]) {
        expect(
          resolveCheckpointsConfig({ record, targetPath, handleId: "h1" })
        ).to.equal(null);
      }
    });

    it("applies defaults for checkpoints: true and {}", function () {
      for (const checkpoints of [true, {}]) {
        const resolved = resolveCheckpointsConfig({
          record: { path: "demo.mp4", checkpoints },
          targetPath,
          handleId: "h1",
        });
        expect(resolved.maxVariation).to.equal(0.05);
        expect(resolved.baselineDir).to.equal(`${targetPath}.checkpoints`);
        expect(resolved.stagingDir).to.equal(
          path.join(os.tmpdir(), "doc-detective", "checkpoints", "h1")
        );
        expect(resolved.entries).to.deep.equal([]);
      }
    });

    it("honors maxVariation and a relative directory override (resolved beside the recording)", function () {
      const resolved = resolveCheckpointsConfig({
        record: {
          path: "demo.mp4",
          checkpoints: { maxVariation: 0.2, directory: "baselines" },
        },
        targetPath,
        handleId: "h2",
      });
      expect(resolved.maxVariation).to.equal(0.2);
      expect(resolved.baselineDir).to.equal(
        path.resolve(path.dirname(targetPath), "baselines")
      );
    });

    it("keeps an absolute directory override as-is", function () {
      const abs = path.resolve("elsewhere", "b");
      const resolved = resolveCheckpointsConfig({
        record: { path: "demo.mp4", checkpoints: { directory: abs } },
        targetPath,
        handleId: "h3",
      });
      expect(resolved.baselineDir).to.equal(abs);
    });
  });
});

// saveScreenshot's internal compareOnly mode: recording checkpoints compare
// against a persistent baseline WITHOUT ever writing it mid-span. The fresh
// capture always lands at internal.capturePath (staging); baseline writes
// happen only at stopRecord.
describeIfSharp("saveScreenshot: internal compareOnly", function () {
  this.timeout(20000);
  let tmpDir;
  const config = {};

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-ckpt-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function checkpointStep(baselinePath, maxVariation = 0.05) {
    return {
      stepId: "ckpt",
      screenshot: {
        path: baselinePath,
        maxVariation,
        overwrite: "aboveVariation",
      },
    };
  }

  it("leaves a drifted baseline untouched and stages the capture (WARNING)", async function () {
    const baselinePath = path.join(tmpDir, "base.png");
    const stagingPath = path.join(tmpDir, "staged.png");
    const baselineBytes = await makePngBuffer(24, 24, { r: 255, g: 0, b: 0 });
    fs.writeFileSync(baselinePath, baselineBytes);
    const captured = await makePngBuffer(24, 24, { r: 0, g: 0, b: 255 });

    const result = await saveScreenshot({
      config,
      step: checkpointStep(baselinePath),
      driver: fakeDriver(captured),
      internal: { compareOnly: true, capturePath: stagingPath },
    });

    expect(result.status).to.equal("WARNING");
    expect(result.outputs.variation).to.be.greaterThan(0.05);
    expect(result.outputs.changed).to.equal(false);
    expect(
      fs.readFileSync(baselinePath).equals(baselineBytes),
      "baseline must not be rewritten in compareOnly mode"
    ).to.equal(true);
    expect(fs.existsSync(stagingPath), "capture staged").to.equal(true);
  });

  it("passes within variation, staging the capture and keeping the baseline", async function () {
    const baselinePath = path.join(tmpDir, "base.png");
    const stagingPath = path.join(tmpDir, "staged.png");
    const bytes = await makePngBuffer(24, 24);
    fs.writeFileSync(baselinePath, bytes);

    const result = await saveScreenshot({
      config,
      step: checkpointStep(baselinePath),
      driver: fakeDriver(bytes),
      internal: { compareOnly: true, capturePath: stagingPath },
    });

    expect(result.status).to.equal("PASS");
    expect(result.outputs.variation).to.equal(0);
    expect(fs.existsSync(stagingPath), "capture staged").to.equal(true);
    expect(fs.readFileSync(baselinePath).equals(bytes)).to.equal(true);
  });

  it("reports baselineMissing without writing the baseline when none exists", async function () {
    const baselinePath = path.join(tmpDir, "missing.png");
    const stagingPath = path.join(tmpDir, "staged.png");
    const captured = await makePngBuffer(24, 24);

    const result = await saveScreenshot({
      config,
      step: checkpointStep(baselinePath),
      driver: fakeDriver(captured),
      internal: { compareOnly: true, capturePath: stagingPath },
    });

    expect(result.status).to.equal("PASS");
    expect(result.outputs.baselineMissing).to.equal(true);
    expect(result.outputs.changed).to.equal(false);
    expect(
      fs.existsSync(baselinePath),
      "baseline must not be created mid-span"
    ).to.equal(false);
    expect(fs.existsSync(stagingPath), "capture staged").to.equal(true);
  });

  it("does not change non-internal behavior: no-reference capture still writes the target", async function () {
    const target = path.join(tmpDir, "plain.png");
    const captured = await makePngBuffer(24, 24);
    const result = await saveScreenshot({
      config,
      step: checkpointStep(target),
      driver: fakeDriver(captured),
    });
    expect(result.status).to.equal("PASS");
    expect(fs.existsSync(target)).to.equal(true);
    expect(result.outputs.changed).to.equal(true);
    expect(result.outputs.baselineMissing).to.equal(undefined);
  });
});

// captureRecordingCheckpoints: the post-step hook body. For every active,
// non-synthetic recording handle with checkpoints enabled, capture once,
// compare compare-only against the baseline, and push an entry onto the
// handle. Never throws; failures record an entry with `error`.
describeIfSharp("captureRecordingCheckpoints", function () {
  this.timeout(20000);
  let tmpDir;
  const config = {};

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-ckpt-hook-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeHandle(overrides = {}) {
    const targetPath = path.join(tmpDir, "demo.mp4");
    const checkpoints = resolveCheckpointsConfig({
      record: { path: "demo.mp4", checkpoints: true },
      targetPath,
      handleId: `h-${Math.random().toString(36).slice(2, 8)}`,
    });
    // Keep staging inside the test's tmp dir so cleanup is hermetic.
    checkpoints.stagingDir = path.join(tmpDir, "staging");
    return { id: "rec1", targetPath, checkpoints, ...overrides };
  }

  it("pushes a baselineMissing entry and stages the capture on first run", async function () {
    const handle = makeHandle();
    const driver = fakeDriver(await makePngBuffer(24, 24));
    const host = { state: { recordings: [handle] } };

    await captureRecordingCheckpoints({
      config,
      driver,
      recordingHost: host,
      step: { stepId: "t~s1", find: "x" },
      stepIndex: 2,
      stepCount: 5,
      testId: "t",
    });

    expect(handle.checkpoints.entries).to.have.length(1);
    const entry = handle.checkpoints.entries[0];
    expect(entry.fileName).to.equal("03-find-s1.png");
    expect(entry.baselineMissing).to.equal(true);
    expect(entry.baselinePath).to.equal(
      path.join(handle.checkpoints.baselineDir, "03-find-s1.png")
    );
    expect(fs.existsSync(entry.stagingPath), "staged capture").to.equal(true);
    expect(
      fs.existsSync(entry.baselinePath),
      "baseline must not be written mid-span"
    ).to.equal(false);
  });

  it("records variation against an existing baseline without touching it", async function () {
    const handle = makeHandle();
    const baselinePath = path.join(
      handle.checkpoints.baselineDir,
      "03-find-s1.png"
    );
    fs.mkdirSync(handle.checkpoints.baselineDir, { recursive: true });
    const baselineBytes = await makePngBuffer(24, 24, { r: 255, g: 0, b: 0 });
    fs.writeFileSync(baselinePath, baselineBytes);
    const driver = fakeDriver(await makePngBuffer(24, 24, { r: 0, g: 0, b: 255 }));
    const host = { state: { recordings: [handle] } };

    await captureRecordingCheckpoints({
      config,
      driver,
      recordingHost: host,
      step: { stepId: "t~s1", find: "x" },
      stepIndex: 2,
      stepCount: 5,
      testId: "t",
    });

    const entry = handle.checkpoints.entries[0];
    expect(entry.baselineMissing).to.not.equal(true);
    expect(entry.variation).to.be.greaterThan(0.05);
    expect(fs.readFileSync(baselinePath).equals(baselineBytes)).to.equal(true);
  });

  it("skips synthetic (autoRecord) handles and handles without checkpoints", async function () {
    const synthetic = makeHandle({ synthetic: true });
    const plain = makeHandle({ checkpoints: null });
    const withCheckpoints = makeHandle();
    const driver = fakeDriver(await makePngBuffer(24, 24));
    const host = {
      state: { recordings: [synthetic, plain, withCheckpoints] },
    };

    await captureRecordingCheckpoints({
      config,
      driver,
      recordingHost: host,
      step: { stepId: "t~s1", find: "x" },
      stepIndex: 0,
      stepCount: 1,
      testId: "t",
    });

    expect(synthetic.checkpoints.entries).to.have.length(0);
    expect(withCheckpoints.checkpoints.entries).to.have.length(1);
  });

  it("records an error entry instead of throwing when capture fails", async function () {
    const handle = makeHandle();
    const driver = {
      async takeScreenshot() {
        throw new Error("boom");
      },
    };
    const host = { state: { recordings: [handle] } };

    await captureRecordingCheckpoints({
      config,
      driver,
      recordingHost: host,
      step: { stepId: "t~s1", find: "x" },
      stepIndex: 0,
      stepCount: 1,
      testId: "t",
    });

    expect(handle.checkpoints.entries).to.have.length(1);
    expect(handle.checkpoints.entries[0].error).to.be.a("string");
  });
});

// stopRecording + checkpoints: at stop time, missing baselines seed from the
// staged captures (first run), checkpoint results land in outputs, and drift
// beyond maxVariation surfaces as a WARNING-severity implicit assertion —
// never a FAIL. Existing baselines are never modified by this layer.
describe("stopRecording: checkpoint seeding and outputs", function () {
  this.timeout(20000);
  let tmpDir;
  const config = {};

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-ckpt-stop-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeStoppableHandle(entries) {
    const targetPath = path.join(tmpDir, "demo.mp4");
    const checkpoints = {
      maxVariation: 0.05,
      baselineDir: path.join(tmpDir, "demo.mp4.checkpoints"),
      stagingDir: path.join(tmpDir, "staging"),
      entries,
    };
    return {
      type: "appium",
      driver: {
        // Any non-empty payload: the write succeeds; metadata probe fails
        // gracefully and the step stays PASS.
        stopRecordingScreen: async () => Buffer.from("x").toString("base64"),
      },
      targetPath,
      checkpoints,
    };
  }

  function stage(checkpoints, fileName, contents) {
    fs.mkdirSync(checkpoints.stagingDir, { recursive: true });
    const stagingPath = path.join(checkpoints.stagingDir, fileName);
    fs.writeFileSync(stagingPath, contents);
    return {
      fileName,
      stagingPath,
      baselinePath: path.join(checkpoints.baselineDir, fileName),
    };
  }

  it("seeds missing baselines from staged captures and reports outputs", async function () {
    const handle = makeStoppableHandle([]);
    const e1 = {
      ...stage(handle.checkpoints, "01-goTo-s1.png", "capture-one"),
      baselineMissing: true,
    };
    const e2 = {
      ...stage(handle.checkpoints, "02-find-s2.png", "capture-two"),
      baselineMissing: true,
    };
    handle.checkpoints.entries.push(e1, e2);
    const host = { state: { recordings: [handle] } };

    const result = await stopRecording({
      config,
      step: { stepId: "x", stopRecord: true },
      driver: host,
    });

    assert.equal(result.status, "PASS");
    assert.equal(
      fs.readFileSync(e1.baselinePath, "utf8"),
      "capture-one",
      "first baseline seeded from staging"
    );
    assert.equal(fs.readFileSync(e2.baselinePath, "utf8"), "capture-two");
    assert.deepEqual(
      result.outputs.checkpoints.map((c) => c.fileName),
      ["01-goTo-s1.png", "02-find-s2.png"]
    );
    assert.equal(result.outputs.checkpoints[0].baselineMissing, true);
    assert.equal(result.outputs.seededBaselines, 2);
    assert.equal(
      fs.existsSync(handle.checkpoints.stagingDir),
      false,
      "staging cleaned up"
    );
  });

  it("reports WARNING (not FAIL) when a checkpoint drifted beyond maxVariation", async function () {
    const handle = makeStoppableHandle([]);
    fs.mkdirSync(handle.checkpoints.baselineDir, { recursive: true });
    const entry = stage(handle.checkpoints, "01-goTo-s1.png", "new-pixels");
    fs.writeFileSync(entry.baselinePath, "old-pixels");
    handle.checkpoints.entries.push({ ...entry, variation: 0.4 });
    const host = { state: { recordings: [handle] } };

    const result = await stopRecording({
      config,
      step: { stepId: "x", stopRecord: true },
      driver: host,
    });

    assert.equal(result.status, "WARNING");
    assert.equal(result.outputs.maxCheckpointVariation, 0.4);
    assert.equal(result.outputs.seededBaselines, 0);
    assert.equal(
      fs.readFileSync(entry.baselinePath, "utf8"),
      "old-pixels",
      "existing baseline never modified by this layer"
    );
    assert.ok(
      (result.assertions || []).length > 0,
      "drift is recorded through the implicit-assertion engine"
    );
  });

  it("stays PASS when all checkpoints are within maxVariation", async function () {
    const handle = makeStoppableHandle([]);
    fs.mkdirSync(handle.checkpoints.baselineDir, { recursive: true });
    const entry = stage(handle.checkpoints, "01-goTo-s1.png", "same");
    fs.writeFileSync(entry.baselinePath, "same");
    handle.checkpoints.entries.push({ ...entry, variation: 0.001 });
    const host = { state: { recordings: [handle] } };

    const result = await stopRecording({
      config,
      step: { stepId: "x", stopRecord: true },
      driver: host,
    });

    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.maxCheckpointVariation, 0.001);
  });
});

// A FAILed step marks every active checkpoint span dirty (ADR 01073): the
// entry set is incomplete from that point, so span verdicts must not run.
describeIfSharp("captureRecordingCheckpoints: dirty spans", function () {
  this.timeout(20000);
  let tmpDir;
  const config = {};

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-ckpt-dirty-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("marks active spans dirty on a FAILed step instead of capturing", async function () {
    const targetPath = path.join(tmpDir, "demo.mp4");
    const handle = {
      id: "rec1",
      targetPath,
      checkpoints: resolveCheckpointsConfig({
        record: { path: "demo.mp4", checkpoints: true },
        targetPath,
        handleId: "h-dirty",
      }),
    };
    const driver = fakeDriver(await makePngBuffer(24, 24));
    const host = { state: { recordings: [handle] } };

    await captureRecordingCheckpoints({
      config,
      driver,
      recordingHost: host,
      step: { stepId: "t~s1", find: "x" },
      stepStatus: "FAIL",
      stepIndex: 0,
      stepCount: 1,
      testId: "t",
    });

    expect(handle.checkpoints.spanDirty).to.equal(true);
    expect(handle.checkpoints.entries).to.have.length(0);
  });
});
