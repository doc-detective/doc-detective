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

// A directory entry that `fs.statSync` cannot resolve must not abort the run.
//
// Regression cover for the arm64 Docker build (ADR 01096): a foreign-arch
// chromedriver reached `execFile`, glibc's ENOEXEC fallback handed it to
// /bin/sh, and the shell, running in the input directory, interpreted the
// binary as a script and left a file behind whose name is not valid UTF-8.
// `fs.readdirSync` decodes such a name lossily (U+FFFD), so re-resolving it and
// calling `fs.statSync` throws ENOENT. That unguarded throw killed the whole
// run ("ENOENT: no such file or directory, stat '/app/<binary garbage>'")
// before a single spec was parsed.
//
// The driver-side fix is the real cure; this asserts the scan is resilient
// however an entry became unreadable. Two shapes are covered because no single
// one is buildable everywhere: an undecodable filename needs Linux (APFS and
// NTFS both reject one outright), and a dangling symlink needs privileges
// Windows doesn't grant by default. Each case skips where its filesystem
// refuses to build it rather than pretending to have run.
describe("detectTests qualifyFiles: unreadable directory entries", function () {
  let tmp;
  beforeEach(function () {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-detect-badentry-"));
  });
  afterEach(function () {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const writeGoodSpec = () =>
    fs.writeFileSync(
      path.join(tmp, "good.spec.json"),
      JSON.stringify({ tests: [{ steps: [{ wait: 1 }] }] })
    );

  const expectOnlyTheGoodSpec = async () => {
    const specs = await detectTests({
      config: { ...baseConfig(), input: [tmp], recursive: true },
    });
    assert.equal(specs.length, 1);
    assert.match(String(specs[0].specId), /good\.spec\.json/);
  };

  it("skips an entry whose name can't be round-tripped (the arm64 case)", async function () {
    writeGoodSpec();
    try {
      // Raw bytes that are not valid UTF-8 — the shape /bin/sh leaves behind
      // when it interprets an ELF image as a script in the input directory.
      fs.writeFileSync(
        Buffer.concat([
          Buffer.from(tmp + path.sep),
          Buffer.from([0xff, 0xfe, 0xfd]),
          Buffer.from("-side-effect"),
        ]),
        ""
      );
    } catch {
      // APFS raises EILSEQ and Windows rejects the name outright; only Linux
      // lets a non-UTF-8 filename exist, which is why the bug was Linux-only.
      this.skip();
    }
    await expectOnlyTheGoodSpec();
  });

  it("skips a dangling symlink", async function () {
    writeGoodSpec();
    try {
      fs.symlinkSync(
        path.join(tmp, "does-not-exist.json"),
        path.join(tmp, "dangling.spec.json")
      );
    } catch {
      // Windows needs Developer Mode or elevation to create a symlink.
      this.skip();
    }
    await expectOnlyTheGoodSpec();
  });
});
