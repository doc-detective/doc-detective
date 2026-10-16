// qualifyFiles dedups input files with a Set (O(n)) instead of an
// Array#indexOf scan per candidate (O(n²)). Pins what the swap must keep:
// first-seen order, one entry per resolved path across the explicit-file and
// directory branches, and the first entry's phase.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { detectTests } from "../dist/core/detectTests.js";
import { setConfig } from "../dist/core/config.js";

describe("detectTests qualifyFiles dedup keeps first-seen order", function () {
  this.timeout(30000);
  let tmpDir;
  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-detect-dedup-"));
  });
  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const spec = (url) => JSON.stringify({ tests: [{ steps: [{ goTo: url }] }] });

  it("keeps each resolved file once, in first-seen order, with its first phase", async function () {
    const dir = path.join(tmpDir, "docs");
    fs.mkdirSync(dir);
    for (const n of ["a", "b", "c"]) fs.writeFileSync(path.join(dir, `${n}.json`), spec(`https://${n}.com`));
    const c = path.join(dir, "c.json");
    const config = await setConfig({
      config: {
        logLevel: "silent",
        // c first (explicit, beforeAny), then the directory (a, b, c again),
        // then c via a relative spelling.
        beforeAny: [c],
        input: [dir, path.relative(process.cwd(), c)],
      },
    });
    const specs = await detectTests({ config });
    const got = specs.map((s) => [path.basename(s.specId), s._phase]);
    // c stays first with its first phase; a and b follow in readdir order,
    // which the OS decides.
    assert.deepEqual(got[0], ["c.json", "beforeAny"]);
    assert.deepEqual(
      got.slice(1).sort(),
      [
        ["a.json", "main"],
        ["b.json", "main"],
      ]
    );
  });

  it("dedups thousands of files without changing the result", async function () {
    const dir = path.join(tmpDir, "many");
    fs.mkdirSync(dir);
    const N = 3000;
    for (let i = 0; i < N; i++) fs.writeFileSync(path.join(dir, `f${i}.json`), spec(`https://x${i}.com`));
    const config = await setConfig({
      config: { logLevel: "silent", input: [dir, dir] },
    });
    const specs = await detectTests({ config });
    assert.equal(specs.length, N);
    assert.equal(new Set(specs.map((s) => s.specId)).size, N);
  });
});
