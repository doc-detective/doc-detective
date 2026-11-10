// Guards the `tsc` bin link against the typescript-compiler-api alias.
//
// docs/.scripts/buildCliReference.js needs TypeScript 6's syntactic compiler
// API, which TypeScript 7 (the native port) no longer exports from
// `require("typescript")`. It gets it from a pinned alias,
// `typescript-compiler-api: npm:typescript@6.0.3`.
//
// That alias is a full typescript package, so it declares `bin: { tsc,
// tsserver }` and competes for `node_modules/.bin/tsc` with the repo's real
// `typescript`. npm resolves the collision in favour of the direct dependency
// — verified under both npm 10 (what the Node 22 workflows use) and npm 11 —
// but that tie-break is not a documented guarantee. If it ever flipped,
// `npm run compile` would silently build the whole project with TypeScript 6
// and nothing else would notice.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// npm materializes a bin either as a symlink to the target (POSIX) or as a
// shim script naming it (Windows). Read whichever exists and return its text,
// so the assertion works the same on both.
function binTarget(name) {
  const dir = path.join(repoRoot, "node_modules", ".bin");
  for (const file of [name, `${name}.cmd`, `${name}.ps1`]) {
    const candidate = path.join(dir, file);
    if (!fs.existsSync(candidate)) continue;
    const stat = fs.lstatSync(candidate);
    return stat.isSymbolicLink()
      ? fs.readlinkSync(candidate)
      : fs.readFileSync(candidate, "utf8");
  }
  return null;
}

describe("toolchain bin links", function () {
  it("resolves `tsc` to the repo's typescript, not the parser alias", function () {
    const target = binTarget("tsc");
    if (target === null) {
      // Dependencies aren't installed; nothing to guard.
      this.skip();
    }

    assert.equal(
      /typescript-compiler-api[/\\]/.test(target),
      false,
      "node_modules/.bin/tsc points at the typescript-compiler-api alias, so `npm run compile` would build with TypeScript 6 instead of the repo's TypeScript."
    );
    assert.equal(
      /(^|[/\\])typescript[/\\]/.test(target),
      true,
      `node_modules/.bin/tsc does not point at the typescript package; got: ${target.slice(0, 200)}`
    );
  });
});
