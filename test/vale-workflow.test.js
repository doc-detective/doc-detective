import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = path.join(repoRoot, ".github", "workflows", "vale.yml");

// Faithful re-implementation of how errata-ai/vale-action@d89dee9 (the SHA
// pinned in vale.yml) resolves its `files` input — see lib/input.js there.
// Two behaviors matter for the regression:
//   1. Inputs are read via @actions/core getInput(), which TRIMS whitespace,
//      so a `separator: " "` arrives as "" and the split branch never runs.
//   2. When no separator survives, the list must parse as a JSON array; on
//      failure the action silently falls back to linting the whole repo (".").
// See adrs/01087-vale-changed-files-as-json-array.md.
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

describe("vale workflow changed-file scoping", function () {
  describe("vale-action files-input contract", function () {
    it("legacy wiring (space-separated list + whitespace separator) falls back to whole-repo lint", function () {
      // The pre-#694 wiring: tj-actions' default space-separated output with
      // `separator: " "`. getInput() trims the separator to "", JSON.parse
      // throws on the list, and the action lints "." — the observed failure.
      const args = resolveValeFiles(
        "docs/fern/pages/docs/selectors/visual-matching.mdx docs/fern/pages/docs/actions/find.mdx",
        " ",
        repoRoot
      );
      assert.deepEqual(args, ["."]);
    });

    it("JSON-array wiring resolves to per-file arguments, including spaced paths", function () {
      const files = [
        "docs/fern/pages/docs/selectors/visual-matching.mdx",
        "docs/fern/pages/docs/actions/find.mdx",
        "docs/fern/pages/docs/with space.mdx",
      ];
      const args = resolveValeFiles(JSON.stringify(files), "", repoRoot);
      assert.deepEqual(args, files);
    });

    it("escaped JSON (escape_json: true output) falls back to whole-repo lint", function () {
      // tj-actions' escape_json default backslash-escapes the quotes, which
      // no longer parses as JSON — this is why escape_json: false in the
      // workflow is load-bearing.
      const escaped = '[\\"docs/fern/pages/docs/actions/find.mdx\\"]';
      assert.deepEqual(resolveValeFiles(escaped, "", repoRoot), ["."]);
    });
  });

  describe(".github/workflows/vale.yml wiring", function () {
    let changedFiles;
    let runVale;

    before(function () {
      const workflow = parseYaml(fs.readFileSync(workflowPath, "utf8"));
      const steps = workflow.jobs.vale.steps;
      changedFiles = steps.find((s) => s.id === "changed-files");
      runVale = steps.find((s) => s.name === "Run vale");
    });

    it("changed-files emits a real JSON array (json: true, escape_json: false)", function () {
      assert.ok(changedFiles, "changed-files step missing");
      assert.equal(changedFiles.with.json, true);
      assert.equal(changedFiles.with.escape_json, false);
    });

    it("vale step consumes the changed-file list without a whitespace separator", function () {
      assert.ok(runVale, "Run vale step missing");
      assert.match(
        String(runVale.with.files),
        /steps\.changed-files\.outputs\.all_changed_files/
      );
      const separator = runVale.with.separator;
      // No separator at all is the intended wiring; if one is ever
      // reintroduced it must survive getInput()'s trim, or the action
      // silently reverts to linting the entire repo.
      if (separator !== undefined) {
        assert.notEqual(
          String(separator).trim(),
          "",
          "whitespace-only separator is trimmed to '' by @actions/core getInput() and silently disables scoping"
        );
      }
      assert.match(String(runVale.if), /any_changed == 'true'/);
    });
  });
});
