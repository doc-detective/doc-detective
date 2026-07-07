// Coverage-closing tests for src/runtime/heavyDeps.ts's satisfiesRange (and its
// parseSemverCore/compareTuple helpers) plus the _resetCacheForTests seam
// (compiled dist/runtime/heavyDeps.js).
//
// Pure, hermetic, no I/O: satisfiesRange is a self-contained minimal semver
// range check. The existing runtime-heavy-deps suite covers the manifest
// resolution but not the range comparison, and the E2E union doesn't exercise
// it either, so these directly raise the union.

import assert from "node:assert/strict";
import {
  satisfiesRange,
  _resetCacheForTests,
} from "../dist/runtime/heavyDeps.js";

describe("heavyDeps satisfiesRange", function () {
  it("returns true when either range or installed is empty", function () {
    assert.equal(satisfiesRange("", "^1.0.0"), true);
    assert.equal(satisfiesRange("1.0.0", ""), true);
  });

  it("returns true when the installed version isn't a parseable semver core", function () {
    assert.equal(satisfiesRange("not-a-version", "^1.0.0"), true);
  });

  it("caret: same non-zero major, >= wanted passes; lower fails", function () {
    assert.equal(satisfiesRange("1.5.0", "^1.2.0"), true);
    assert.equal(satisfiesRange("1.1.0", "^1.2.0"), false);
  });

  it("caret: a different major fails", function () {
    assert.equal(satisfiesRange("2.0.0", "^1.2.0"), false);
  });

  it("caret with a 0 major pins the minor", function () {
    assert.equal(satisfiesRange("0.2.5", "^0.2.0"), true);
    assert.equal(satisfiesRange("0.3.0", "^0.2.0"), false);
  });

  it("caret: an unparseable wanted range degrades to true", function () {
    assert.equal(satisfiesRange("1.0.0", "^not.a.version"), true);
  });

  it("tilde: same major.minor with >= patch passes; otherwise fails", function () {
    assert.equal(satisfiesRange("1.2.5", "~1.2.0"), true);
    assert.equal(satisfiesRange("1.3.0", "~1.2.0"), false);
    assert.equal(satisfiesRange("1.2.0", "~1.2.5"), false);
  });

  it("tilde: an unparseable wanted range degrades to true", function () {
    assert.equal(satisfiesRange("1.0.0", "~not.a.version"), true);
  });

  it("exact version: equality only", function () {
    assert.equal(satisfiesRange("1.2.3", "1.2.3"), true);
    assert.equal(satisfiesRange("1.2.4", "1.2.3"), false);
  });

  it("non-simple ranges (>=, ||, *) degrade to true so callers don't false-positive", function () {
    assert.equal(satisfiesRange("1.0.0", ">=1.0.0"), true);
    assert.equal(satisfiesRange("1.0.0", "1.2.3 || 2.0.0"), true);
    assert.equal(satisfiesRange("1.0.0", "*"), true);
  });

  it("_resetCacheForTests runs without error", function () {
    _resetCacheForTests();
  });
});
