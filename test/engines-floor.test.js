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
// `semver.subset` is conservative — on some unions it answers `false` for a
// pair that is genuinely a subset (`yargs` is one such case). It therefore errs
// toward "tighten `engines`" and never toward a false pass, which is the safe
// direction here. Read a failure as "prove this is still compatible".
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
//
// Returns the declared range, or null when the package declares no `engines`.
// Throws when the package cannot be read at all — the caller decides whether
// that is fatal, which depends on whether the dependency is optional.
function installedEngines(name) {
  return readJson("node_modules", ...name.split("/"), "package.json").engines
    ?.node ?? null;
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
    // The whole suite runs against an installed tree; if there isn't one there
    // is nothing to compare against. This is the ONLY skip condition — a
    // dependency missing from an otherwise-installed tree is a real failure
    // below, not a reason to pass quietly.
    if (!fs.existsSync(path.join(repoRoot, "node_modules"))) {
      this.skip();
    }

    const required = Object.keys(manifest.dependencies ?? {}).sort();
    // Optional dependencies are legitimately absent when npm skips them for
    // this platform, so only those may go uninspected.
    const optional = Object.keys(manifest.optionalDependencies ?? {}).sort();

    const violations = [];
    const unreadable = [];
    let inspected = 0;

    for (const name of [...required, ...optional]) {
      let range;
      try {
        range = installedEngines(name);
      } catch (error) {
        if (required.includes(name)) {
          unreadable.push(`  ${name} (${error.code ?? error.message})`);
        }
        continue; // optional dep not installed on this platform
      }
      if (!range || !semver.validRange(range)) continue;
      inspected += 1;
      if (!semver.subset(declared, range)) {
        violations.push(`  ${name} supports "${range}"`);
      }
    }

    assert.deepEqual(
      unreadable,
      [],
      `these non-optional dependencies could not be read from node_modules, so their engines went unchecked:\n${unreadable.join(
        "\n"
      )}\nReinstall (npm ci) before trusting this test.`
    );

    assert.deepEqual(
      violations,
      [],
      `engines.node is "${declared}", which admits node versions these dependencies do not support:\n${violations.join(
        "\n"
      )}\nEither raise engines.node or hold the dependency back.`
    );

    // A tree where nothing declares engines would pass both assertions above
    // while proving nothing.
    assert.ok(
      inspected > 0,
      "no installed production dependency declared engines.node; the comparison above was vacuous"
    );
  });
});
