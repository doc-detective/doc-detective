import { expect } from "chai";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  capPathSegment,
  stepArtifactFileName,
  resolveCheckpointsConfig,
} from "../dist/core/tests/recordingCheckpoints.js";

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
