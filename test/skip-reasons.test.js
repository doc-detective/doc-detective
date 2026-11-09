// Every skip reason reads `Skipped: <reason>.` (CLAUDE.md, "Messages"). Most of
// them take a device, a missing toolchain, or a broken driver to reach, so this
// reads the source. Behavior tests pin the wording of the ones a test can reach.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../src/core");
const sources = fs
  .readdirSync(root, { recursive: true })
  .filter((file) => file.endsWith(".ts"))
  .map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]);

function matches(pattern) {
  return sources.flatMap(([file, text]) =>
    [...text.matchAll(pattern)].map((m) => `${file}: ${m[0].replace(/\s+/g, " ")}`)
  );
}

describe("skip reasons", function () {
  it("uses none of the old wording", function () {
    assert.deepEqual(
      matches(/Skipping (?:context|action|test |unsafe )[^\n]{0,40}|Skipped (?:because|due|—)[^\n]{0,40}/g),
      []
    );
  });

  it("starts every literal reason on a SKIPPED result with `Skipped: `", function () {
    assert.deepEqual(
      matches(
        /(?:status|result)\s*[:=]\s*"SKIPPED"[,;]\s*(?:\w+\.)?(?:description|resultDescription)\s*[:=]\s*[`"](?!Skipped: |\$\{)[^\n]{0,40}/g
      ),
      []
    );
  });
});
