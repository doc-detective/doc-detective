import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = path.join(repoRoot, ".github", "workflows", "vale.yml");

// Faithful re-implementation of how vale-action (the SHA pinned in vale.yml)
// resolves its `files` input — see lib/input.js there. Only the `all` branch
// matters now: the workflow passes the sentinel rather than a file list, so the
// JSON-array plumbing ADR 01089 documented is gone. See ADR 01101.
function resolveValeFiles(filesRaw, separatorRaw, dir) {
  const getInput = (v) => (v || "").trim();
  let args = [];
  const files = getInput(filesRaw);
  const delim = getInput(separatorRaw);
  if (files == "all") {
    args.push(".");
  } else if (fs.existsSync(path.resolve(dir, files))) {
    args.push(files);
  } else if (delim !== "") {
    args = args.concat(files.split(delim));
  } else {
    try {
      args = args.concat(JSON.parse(files));
    } catch (e) {
      args.push(".");
    }
  }
  return args;
}

describe("vale workflow whole-repo gate", function () {
  describe("vale-action files-input contract", function () {
    it("`all` resolves to the whole-repo argument", function () {
      assert.deepEqual(resolveValeFiles("all", "", repoRoot), ["."]);
    });

    it("a stray separator cannot change what `all` resolves to", function () {
      // The `all` branch runs before the separator branch, so leftover
      // separator plumbing could not silently narrow the lint.
      assert.deepEqual(resolveValeFiles("all", ",", repoRoot), ["."]);
    });
  });

  describe(".github/workflows/vale.yml wiring", function () {
    let workflow;
    let steps;
    let runVale;

    before(function () {
      workflow = parseYaml(fs.readFileSync(workflowPath, "utf8"));
      steps = workflow.jobs.vale.steps;
      runVale = steps.find((s) => s.name === "Run vale");
    });

    it("lints the whole repository", function () {
      assert.ok(runVale, "Run vale step missing");
      assert.equal(runVale.with.files, "all");
    });

    it("fails the check on an error-severity alert, unfiltered", function () {
      // The pair is the gate. reviewdog's default filter (`added`) reports only
      // alerts on lines the PR added, so under a whole-repo lint fail_on_error
      // would never trip for an error in an untouched file.
      assert.equal(runVale.with.fail_on_error, true);
      assert.equal(runVale.with.filter_mode, "nofilter");
    });

    it("keeps the generated schema pages out of the parse", function () {
      // mdx2vast has produced a hard E100 on those tables, which fail_on_error
      // cannot downgrade.
      assert.match(
        String(runVale.with.vale_flags),
        /docs\/fern\/pages\/reference\/schemas\/\*\*/
      );
      assert.match(String(runVale.with.vale_flags), /--config=docs\/\.vale\.ini/);
    });

    it("keeps Vale's own StylesPath out of the lint", function () {
      // Invoked from the repo root against ".", Vale walks its own
      // docs/.vale/styles tree as content and Direct.Length reads the
      // vocabulary word lists as one 252-word sentence. That failed the check
      // on ba882f8c before the exclusion landed.
      assert.match(String(runVale.with.vale_flags), /docs\/\.vale\/\*\*/);
    });

    it("emits only error-severity alerts", function () {
      // docs/.vale.ini sets MinAlertLevel = suggestion. Without this override,
      // whole-repo + nofilter would hand reviewdog every warning in the tree to
      // post as a PR comment.
      assert.match(String(runVale.with.vale_flags), /--minAlertLevel=error/);
    });

    it("carries no changed-file plumbing", function () {
      assert.equal(
        steps.find((s) => s.id === "changed-files"),
        undefined,
        "changed-files scoping was removed by ADR 01101"
      );
      assert.equal(
        runVale.with.separator,
        undefined,
        "separator belongs to the removed changed-file wiring"
      );
      assert.equal(
        runVale.if,
        undefined,
        "the Run vale step must not be conditional on a changed-file count"
      );
    });

    it("serializes runs so reviewdog cannot race itself", function () {
      // github-pr-review owns the comments it posts: each run deletes the ones
      // the current run no longer reports. Two runs pruning the same set
      // concurrently make the loser 404 on an already-deleted comment, which
      // reviewdog treats as fatal. That failed the check on c28bb334.
      assert.ok(workflow.concurrency, "concurrency block missing");
      assert.equal(workflow.concurrency["cancel-in-progress"], true);
      assert.match(
        String(workflow.concurrency.group),
        /pull_request\.number/,
        "the group must be per-PR, not per-workflow"
      );
    });

    it("runs on every pull request", function () {
      // A check that is skipped on some PRs cannot be a required status check.
      assert.ok("pull_request" in workflow.on, "pull_request trigger missing");
      // A bare `pull_request:` parses to null, which is the shape we want.
      const pr = workflow.on.pull_request;
      assert.ok(
        pr == null || pr.paths === undefined,
        "a paths filter would skip the gate on PRs that touch no Markdown"
      );
    });
  });
});
