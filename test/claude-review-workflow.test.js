import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = path.join(
  repoRoot,
  ".github",
  "workflows",
  "claude-pr-review.yml"
);

// The bots whose comments dominated the assembled prompt on PR #713. Measured
// from that run's own log: of a 166,450-character prompt, github-actions
// (reviewdog's Vale batches) was 62%, coderabbitai 27%, and claude — the
// action's own failure comments — 7%. Human content was 1%. See ADR 01100.
const HIGH_VOLUME_BOTS = ["github-actions", "coderabbitai", "claude"];

describe("Claude PR review workflow", function () {
  let workflow;
  let runClaude;

  before(function () {
    workflow = parseYaml(fs.readFileSync(workflowPath, "utf8"));
    runClaude = workflow.jobs.review.steps.find(
      (s) => s.name === "Run Claude Code"
    );
  });

  it("keeps bot comment threads out of the assembled prompt", function () {
    assert.ok(runClaude, "Run Claude Code step missing");
    const excluded = String(runClaude.with.exclude_comments_by_actor ?? "");
    assert.notEqual(
      excluded,
      "",
      "exclude_comments_by_actor must be set; without it the prompt is 96% bot chatter"
    );
    for (const bot of HIGH_VOLUME_BOTS) {
      assert.match(
        excluded,
        new RegExp(`(^|,)\\s*${bot}\\[bot\\]\\s*(,|$)`),
        `${bot}[bot] must be excluded from comment context`
      );
    }
  });

  it("breaks the self-reinforcing failure loop", function () {
    // Every failed run posts "Claude encountered an error after 0s" as a PR
    // comment. Without this exclusion that comment becomes context for the
    // next run, so each failure makes the next prompt bigger. Excluding the
    // action's own bot is what stops the loop, so it is asserted separately
    // from the volume argument above.
    assert.match(
      String(runClaude.with.exclude_comments_by_actor ?? ""),
      /claude\[bot\]/,
      "the action must not feed its own comments back into its next prompt"
    );
  });

  it("still triggers on bot-authored pull requests", function () {
    // exclude_comments_by_actor filters comment CONTEXT. allowed_bots governs
    // who may TRIGGER a review. They are different inputs and the fix must not
    // conflate them: agent-authored PRs still need reviewing.
    const allowed = String(runClaude.with.allowed_bots ?? "");
    assert.match(allowed, /promptless\[bot\]/);
    assert.match(allowed, /claude\[bot\]/);
  });

  it("keeps tracking comments enabled", function () {
    // track_progress is what surfaces review progress on the PR. The fix
    // trims what that mode pulls in, rather than turning the mode off.
    assert.equal(runClaude.with.track_progress, true);
  });
});
