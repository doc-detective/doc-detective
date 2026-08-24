// Keeps `engines.node` honest against what the production dependency tree
// actually supports.
//
// `engines` is the only machine-readable statement of which Node versions
// Doc Detective supports, and npm surfaces it at install time (ADR 00166). It
// is written by hand, while the dependency floors that back it move whenever a
// dependency is bumped — so the declaration silently rots. It did: the tree
// required node >=22.22.0 for several releases while `engines` still advertised
// >=22.12.0, so users on 22.12-22.21 installed against an EBADENGINE warning
// storm that the manifest said should not happen.
//
// The assertion is subset, not "floor >= floor": a dependency range like
// `^20.19.0 || ^22.12.0 || >=24.0.0` excludes the whole Node 23 line, and a
// naive minimum comparison would not notice. Every version our `engines` admits
// must be a version the dependency admits.
//
// Only `dependencies` and `optionalDependencies` count. devDependencies do not
// reach consumers, and their engines routinely outrun ours (semantic-release in
// particular) without saying anything about what the published package needs.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(...segments) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, ...segments), "utf8"));
}

// The installed copy is the source of truth for a dependency's engines: the
// manifest only records a range, and which version that resolves to is the
// lockfile's business.
function installedEngines(name) {
  try {
    return readJson("node_modules", ...name.split("/"), "package.json").engines
      ?.node;
  } catch {
    return undefined; // not installed (optional dep skipped on this platform)
  }
}

describe("engines.node", function () {
  const manifest = readJson("package.json");
  const declared = manifest.engines?.node;

  it("declares a node range", function () {
    assert.ok(declared, "package.json must declare engines.node");
    assert.ok(
      semver.validRange(declared),
      `engines.node is not a valid semver range: "${declared}"`
    );
  });

  it("admits only node versions every production dependency supports", function () {
    const names = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    ].sort();

    const checked = [];
    const violations = [];

    for (const name of names) {
      const range = installedEngines(name);
      if (!range || !semver.validRange(range)) continue;
      checked.push(name);
      if (!semver.subset(declared, range)) {
        violations.push(`  ${name} supports "${range}"`);
      }
    }

    if (checked.length === 0) {
      // Dependencies aren't installed; nothing to compare against.
      this.skip();
    }

    assert.deepEqual(
      violations,
      [],
      `engines.node is "${declared}", which admits node versions these dependencies do not support:\n${violations.join(
        "\n"
      )}\nEither raise engines.node or hold the dependency back.`
    );
  });
});
