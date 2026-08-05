// Guards the npm script graph against a Windows-only build failure.
//
// Every nested `npm run` prepends its own `node_modules/.bin` entries (plus a
// node-gyp-bin path) to PATH, and npm never de-duplicates them — measured at
// ~1 KB per level. cmd.exe truncates the environment past 8191 characters, and
// the first casualty is the tail of PATH, which is where the Node install
// lives. The symptom is the deepest script in the chain dying with
// `'node' is not recognized as an internal or external command`.
//
// `npm run build` used to nest five levels deep
// (build -> build:common -> common build -> compile -> clean), which overflowed
// on a developer machine with a ~3.9 KB baseline PATH while the shallower
// `npm run build:common` (four levels) still worked — the confusing part of the
// original bug report. Keeping the graph shallow is the fix; this test keeps it
// that way.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Four levels is the depth that was already working in the wild; three leaves
// roughly a kilobyte of headroom for a longer baseline PATH than ours.
const MAX_NPM_NESTING = 3;

function readScripts(relativeDir) {
  return (
    JSON.parse(
      fs.readFileSync(path.join(repoRoot, relativeDir, "package.json"), "utf8")
    ).scripts || {}
  );
}

const PACKAGES = {
  root: readScripts("."),
  common: readScripts(path.join("src", "common")),
};

// `npm run foo`, `npm run foo --silent`, `npm run-script foo`, and the `npm
// test` lifecycle alias — each spawns a script and costs a nesting level.
const NPM_RUN =
  /\bnpm\s+(?:run|run-script)\s+(?:--\S+\s+)*([\w:.-]+)|\bnpm\s+(test)\b/g;

// A script that cds into src/common hands the rest of the chain to that
// package's scripts, which is how the two package.json files connect.
function packageFor(command, current) {
  return /cd\s+src[/\\]common/.test(command) ? "common" : current;
}

function depth(scriptName, pkg, seen = []) {
  const command = PACKAGES[pkg][scriptName];
  if (typeof command !== "string") return 1;

  const key = `${pkg}:${scriptName}`;
  assert.equal(
    seen.includes(key),
    false,
    `npm script cycle: ${[...seen, key].join(" -> ")}`
  );

  const childPkg = packageFor(command, pkg);
  let deepest = 0;
  for (const match of command.matchAll(NPM_RUN)) {
    deepest = Math.max(deepest, depth(match[1] || match[2], childPkg, [...seen, key]));
  }
  return 1 + deepest;
}

describe("npm script graph", function () {
  it("keeps every script chain shallow enough to survive cmd.exe's PATH limit", function () {
    const offenders = [];
    for (const [pkg, scripts] of Object.entries(PACKAGES)) {
      for (const name of Object.keys(scripts)) {
        const d = depth(name, pkg);
        if (d > MAX_NPM_NESTING) offenders.push(`${pkg}:${name} (${d} levels)`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `these chains nest more than ${MAX_NPM_NESTING} npm levels, which overflows PATH on Windows: ${offenders.join(
        ", "
      )}`
    );
  });

  it("keeps the build chain's inlined steps in sync with their standalone scripts", function () {
    // `build` and `compile` inline these commands rather than shelling out to
    // the named script, to save a nesting level. The named scripts stay for
    // standalone use, so assert the two can't drift apart.
    const inlined = [
      ["common", "build", "dereferenceSchemas"],
      ["common", "build", "generate:types"],
      ["common", "build", "compile"],
      ["common", "compile", "clean"],
    ];
    for (const [pkg, composite, alias] of inlined) {
      const compositeCommand = PACKAGES[pkg][composite];
      const aliasCommand = PACKAGES[pkg][alias];
      assert.ok(aliasCommand, `${pkg}:${alias} should still exist`);
      assert.ok(
        compositeCommand.includes(aliasCommand),
        `${pkg}:${composite} should inline the exact command from ${pkg}:${alias}\n  ${composite}: ${compositeCommand}\n  ${alias}: ${aliasCommand}`
      );
    }
  });
});
