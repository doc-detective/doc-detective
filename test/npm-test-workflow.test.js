import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const callerPath = path.join(repoRoot, ".github", "workflows", "npm-test.yaml");
const matrixPath = path.join(repoRoot, ".github", "workflows", "test.yml");

// The contexts the `main` ruleset requires. A required check that never reports
// blocks a PR forever, which is exactly what happened to a docs-only PR: the
// matrix was path-filtered away, so these four never appeared. See ADR 01103.
const REQUIRED_CONTEXTS = [
  "Test (ubuntu-latest, node 22, shard 1)",
  "Test (ubuntu-latest, node 22, shard 2)",
  "Coverage ratchet (src/common)",
  "Coverage ratchet (root, cross-platform)",
];

describe("npm-test gate reports on every pull request", function () {
  let caller;
  let reusable;

  before(function () {
    caller = parseYaml(fs.readFileSync(callerPath, "utf8"));
    reusable = parseYaml(fs.readFileSync(matrixPath, "utf8"));
  });

  describe("code-change selector", function () {
    let selectTestMatrix;

    before(function () {
      selectTestMatrix = require(path.join(repoRoot, "scripts", "select-test-matrix.cjs"));
    });

    it("treats a docs-only change set as nothing to exercise", function () {
      assert.equal(
        selectTestMatrix.codePathsChanged([
          "docs/fern/pages/docs/actions/type.mdx",
          "docs/AGENTS.md",
        ]),
        false
      );
    });

    it("selects the matrix for product code and for tests", function () {
      assert.equal(selectTestMatrix.codePathsChanged(["src/core/tests.ts"]), true);
      assert.equal(selectTestMatrix.codePathsChanged(["test/core-core.test.js"]), true);
      assert.equal(
        selectTestMatrix.codePathsChanged(["src/common/src/validate.ts"]),
        true
      );
    });

    it("selects the matrix for build and dependency inputs", function () {
      for (const file of [
        "package.json",
        "package-lock.json",
        "coverage-thresholds.json",
        "bin/doc-detective.js",
        "scripts/run-test-shard.cjs",
        ".mocharc.yml",
        ".github/workflows/npm-test.yaml",
        ".github/workflows/test.yml",
        ".github/workflows/fixtures.yml",
      ]) {
        assert.equal(
          selectTestMatrix.codePathsChanged([file]),
          true,
          `${file} must run the matrix`
        );
      }
    });

    it("selects the matrix for a local composite action", function () {
      // test.yml runs ./.github/actions/dd-cache, so an action-only change is a
      // change to how every matrix cell sets itself up. The old `paths:` filter
      // missed this too; raised by CodeRabbit on #730.
      assert.equal(
        selectTestMatrix.codePathsChanged([".github/actions/dd-cache/action.yml"]),
        true
      );
    });

    it("selects the matrix when a rename moves code out of a code path", function () {
      // The workflow emits `previous_filename` alongside `filename`, so a rename
      // of src/core/utils.ts to docs/utils.ts arrives as BOTH paths. Seeing only
      // the destination would skip the matrix while a source file was deleted.
      assert.equal(
        selectTestMatrix.codePathsChanged(["docs/utils.ts", "src/core/utils.ts"]),
        true
      );
    });

    it("selects the matrix when a change set mixes docs and code", function () {
      // The old `paths:` filter ran on any match, so a mixed PR ran the matrix.
      // Losing that would let a code change ride in on a docs PR unexercised.
      assert.equal(
        selectTestMatrix.codePathsChanged([
          "docs/AGENTS.md",
          "src/core/utils.ts",
        ]),
        true
      );
    });

    it("fails safe to running the matrix on an empty or unusable list", function () {
      // Mirrors the fixture selector: an unreadable change set (API blip, no PR
      // context) must run everything rather than silently gate nothing.
      assert.equal(selectTestMatrix.codePathsChanged([]), true);
      assert.equal(selectTestMatrix.codePathsChanged(["", "   "]), true);
      assert.equal(selectTestMatrix.codePathsChanged(undefined), true);
    });
  });

  describe("caller wiring (.github/workflows/npm-test.yaml)", function () {
    it("carries no path filter, so the required contexts always report", function () {
      // The whole point of ADR 01103. A `paths:` filter here means the four
      // required `test / …` contexts never appear on a docs-only PR, and the
      // ruleset blocks the merge with nothing failing.
      const pr = caller.on.pull_request;
      assert.ok(pr, "pull_request trigger missing");
      assert.equal(pr.paths, undefined);
      assert.equal(pr["paths-ignore"], undefined);
    });

    it("decides whether code changed in its own job", function () {
      const changes = caller.jobs.changes;
      assert.ok(changes, "changes job missing");
      assert.ok(
        String(JSON.stringify(changes)).includes("select-test-matrix.cjs"),
        "the changes job must use the selector script"
      );
      assert.ok(changes.outputs && changes.outputs.code, "changes.code output missing");
    });

    it("reads a rename's source path, not just its destination", function () {
      // The files API reports a rename as `filename` (new) plus
      // `previous_filename` (old). Asking only for `filename` would see
      // "docs/utils.ts" for a move out of src/** and skip the matrix while a
      // source file was deleted. Raised by CodeRabbit on #730.
      const step = caller.jobs.changes.steps.find((s) => s.id === "decide");
      assert.ok(step, "decide step missing");
      assert.match(String(step.run), /previous_filename/);
    });

    it("treats a short file list as truncated and runs the matrix", function () {
      // The files API caps at 3000 entries, so a successful paginated call can
      // still be incomplete, and a missing code path would wrongly skip the
      // matrix. The job compares what it got against the PR's changed_files.
      const step = caller.jobs.changes.steps.find((s) => s.id === "decide");
      assert.match(String(step.run), /changed_files/);
    });

    it("passes the decision to the reusable matrix", function () {
      const test = caller.jobs.test;
      assert.ok(test, "test job missing");
      assert.equal(test.uses, "./.github/workflows/test.yml");
      assert.match(String(test.with["run-matrix"]), /needs\.changes\.outputs\.code/);
    });

    it("still reports the contexts when the changes job itself fails", function () {
      // `needs: changes` alone means a FAILED changes job (flaky checkout,
      // runner error, anything outside the bash step) skips `test`. A skipped
      // caller emits no nested check runs, so the four required contexts go
      // unreported and the PR blocks forever: the exact failure ADR 01103 fixes,
      // reintroduced by the fix for it. Raised on #730.
      const test = caller.jobs.test;
      assert.match(
        String(test.if),
        /!cancelled\(\)|always\(\)/,
        "the test job must run even when `changes` fails"
      );
      // And when it could not be told, it must run the real matrix.
      assert.match(String(test.with["run-matrix"]), /needs\.changes\.result/);
    });

    it("counts API records, not emitted paths, when checking for truncation", function () {
      // A rename emits two paths for one record, so counting paths lets a rename
      // mask a record lost to the API's 3000-entry cap: 3000 records including
      // one rename emit 3001 paths, which matches a changed_files of 3001
      // exactly and reads as complete. Raised by CodeRabbit on #730, after the
      // first version of this guard.
      const step = caller.jobs.changes.steps.find((s) => s.id === "decide");
      assert.match(String(step.run), /@tsv/, "records must be fetched one per line");
      assert.match(
        String(step.run),
        /got=\$\(printf '%s\\n' "\$records"/,
        "the count must come from the records, not from the expanded paths"
      );
    });

    it("runs the selector only on a trustworthy file list", function () {
      // `expected=$(… || echo 0)` made a FAILED metadata call look like zero
      // changed files, which skipped the truncation guard and fed a possibly
      // truncated list to the selector. Raised by CodeRabbit on #730.
      const step = caller.jobs.changes.steps.find((s) => s.id === "decide");
      assert.match(String(step.run), /could not read changed_files/);
      assert.doesNotMatch(
        String(step.run),
        /changed_files'\s*\|\|\s*echo 0/,
        "a failed metadata call must not read as zero changed files"
      );
    });

    it("keeps the fixture fan-out off a docs-only PR", function () {
      // The fixture selector fails safe to the FULL matrix when nothing
      // relevant matched, so dropping the path filter without this guard would
      // run every bundle, Android and iOS included, on a docs typo.
      const fixtures = caller.jobs.fixtures;
      assert.ok(fixtures, "fixtures job missing");
      assert.match(String(fixtures.if), /needs\.changes\.outputs\.code/);
    });
  });

  describe("reusable matrix (.github/workflows/test.yml)", function () {
    it("takes a run-matrix input that defaults to running", function () {
      // release.yml calls this workflow with no inputs, so the default decides
      // release behavior. It must be "run everything".
      const input = reusable.on.workflow_call.inputs["run-matrix"];
      assert.ok(input, "run-matrix input missing");
      assert.equal(input.type, "boolean");
      assert.equal(input.default, true);
      assert.notEqual(input.required, true);
    });

    it("keeps every job name templated, so a skipped job can't collide", function () {
      // A job skipped by `if:` still emits a check run, under its name with the
      // expressions UNEXPANDED. That is what keeps the skipped half of each pair
      // from reporting a required context: `Test (${{ matrix.os }}, …)` matches
      // nothing the ruleset requires. Give any job here a static name and its
      // skipped run lands on a required context instead, as a `skipped`
      // conclusion racing the other half's success. Caught on PR #730, where the
      // coverage placeholders did exactly that.
      for (const [id, job] of Object.entries(reusable.jobs)) {
        assert.ok(
          String(job.name).includes("${{"),
          `job "${id}" has the static name "${job.name}"; it must be templated`
        );
      }
    });

    it("reports every required context under both outcomes", function () {
      // Each required name must be produced whether or not the matrix runs,
      // once by the real job and once by its placeholder.
      const names = [];
      for (const job of Object.values(reusable.jobs)) {
        const include = job.strategy?.matrix?.include;
        if (job.name && job.name.includes("${{") && Array.isArray(include)) {
          for (const cell of include) {
            names.push(
              job.name
                .replace("${{ matrix.os }}", cell.os)
                .replace("${{ matrix.node }}", String(cell.node))
                .replace("${{ matrix.shard }}", String(cell.shard))
                .replace("${{ matrix.scope }}", String(cell.scope))
            );
          }
        } else if (job.name) {
          names.push(job.name);
        }
      }
      for (const context of REQUIRED_CONTEXTS) {
        assert.ok(
          names.filter((n) => n === context).length >= 2,
          `"${context}" must be produced by a real job and a placeholder, got ${names.filter((n) => n === context).length}`
        );
      }
    });

    it("never runs a real job and its placeholder together", function () {
      // Two check runs with one name would make the gate ambiguous, so the
      // conditions must be exact negations of each other.
      const real = Object.values(reusable.jobs).filter(
        (j) => String(j.if || "") === "${{ inputs.run-matrix }}"
      );
      const placeholders = Object.values(reusable.jobs).filter(
        (j) => String(j.if || "") === "${{ !inputs.run-matrix }}"
      );
      assert.ok(real.length >= 3, `expected the three real jobs to be gated, got ${real.length}`);
      assert.ok(
        placeholders.length >= 3,
        `expected three placeholder jobs, got ${placeholders.length}`
      );
    });
  });
});
