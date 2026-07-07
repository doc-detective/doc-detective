// Coverage-closing tests for src/core/detectTests.ts's qualifyFiles / processDitaMap
// error + not-found branches (compiled dist/core/detectTests.js).
//
// These paths are union-uncovered (the E2E suite doesn't feed dita maps, URL
// sources, or missing/heretto inputs), so covering them hermetically raises the
// cross-platform union directly. All offline:
//   - heretto:<name> with no matching integration -> warning + skip
//   - an unreachable http(s) source -> fetchFile errors -> warning + skip
//   - a nonexistent path -> statSync throws -> warning + skip
//   - a real .ditamap file with processDitaMaps enabled -> processDitaMap runs;
//     the `dita` CLI is not installed in the test env, so its `--version` probe
//     returns nonzero and processDitaMap returns null (the not-found branch).
//
// qualifyFiles isn't exported, so it's driven through the public detectTests.
// Every input here resolves to zero qualified files, so parseTests returns [].

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectTests } from "../dist/core/detectTests.js";

const baseConfig = () => ({ logLevel: "silent" });

describe("detectTests qualifyFiles coverage: skip/error branches", function () {
  let tmp;
  beforeEach(function () {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-detect-qualify-"));
  });
  afterEach(function () {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("skips a heretto: source with no matching integration", async function () {
    const specs = await detectTests({
      config: { ...baseConfig(), input: ["heretto:does-not-exist"] },
    });
    assert.deepEqual(specs, []);
  });

  it("skips an unreachable URL source (fetchFile error)", async function () {
    this.timeout(20000);
    // Connection-refused on a closed local port fails fast and offline.
    const specs = await detectTests({
      config: { ...baseConfig(), input: ["http://127.0.0.1:1/nope.md"] },
    });
    assert.deepEqual(specs, []);
  });

  it("skips a path that cannot be accessed", async function () {
    const specs = await detectTests({
      config: {
        ...baseConfig(),
        input: [path.join(tmp, "definitely", "missing", "x.md")],
      },
    });
    assert.deepEqual(specs, []);
  });

  it("runs processDitaMap for a .ditamap input and skips when `dita` is unavailable", async function () {
    this.timeout(20000);
    const ditamap = path.join(tmp, "map.ditamap");
    fs.writeFileSync(
      ditamap,
      '<?xml version="1.0"?>\n<map><topicref href="a.dita"/></map>\n'
    );
    const specs = await detectTests({
      config: {
        ...baseConfig(),
        input: [ditamap],
        processDitaMaps: true,
      },
    });
    // dita CLI isn't installed in the test env -> processDitaMap returns null ->
    // the ditamap contributes no files.
    assert.deepEqual(specs, []);
  });
});
