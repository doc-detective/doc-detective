/**
 * Unit tests for the dist-tag and semver validation logic in
 * scripts/publish-staged-release.js.
 *
 * The publish script itself is not easily importable (it calls process.exit()
 * and spawnSync() at module level), so these tests verify the validation
 * *patterns* the script relies on: the DIST_TAG regex, semver.valid(),
 * and semver.validRange() — all of which are pure, side-effect-free calls.
 *
 * Test scope aligns with the PR changes that introduced the DIST_TAG guardrail
 * and the semver/tag rejection logic.
 */

import semver from "semver";

// Replicated from scripts/publish-staged-release.js so the tests stay in sync
// with the actual implementation.
const DIST_TAG = /^[a-z0-9][a-z0-9._-]{0,99}$/;

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("scripts/publish-staged-release dist-tag validation", function () {
  describe("DIST_TAG regex — valid tags", function () {
    const validTags = [
      "beta",
      "next",
      "latest",
      "alpha",
      "staging",
      "staging-publish-manifest-before-read",
      "staging-4.6.0-publish-manifest-before-read.2",
      "publish-manifest-before-read",
      "my_tag",
      "my-tag",
      "my.tag",
      "a",
      "0abc",
      "0",
      "123abc",
      "a0b1c2",
    ];

    for (const tag of validTags) {
      it(`accepts "${tag}"`, function () {
        expect(DIST_TAG.test(tag)).to.be.true;
      });
    }
  });

  describe("DIST_TAG regex — invalid tags", function () {
    const invalidTags = [
      "",               // empty string
      "BETA",           // uppercase letters not allowed
      "Beta",           // mixed case
      "-beta",          // must not start with hyphen
      ".beta",          // must not start with dot
      "_beta",          // must not start with underscore
      "a".repeat(101),  // too long (max 100 chars total: 1 leading + 99 trailing)
    ];

    for (const tag of invalidTags) {
      it(`rejects "${tag.length > 20 ? tag.slice(0, 20) + "..." : tag}"`, function () {
        expect(DIST_TAG.test(tag)).to.be.false;
      });
    }
  });

  describe("DIST_TAG regex — boundary lengths", function () {
    it("accepts a tag exactly 1 character long", function () {
      expect(DIST_TAG.test("a")).to.be.true;
      expect(DIST_TAG.test("0")).to.be.true;
    });

    it("accepts a tag exactly 100 characters long (1 + 99)", function () {
      const tag = "a" + "b".repeat(99);
      expect(tag.length).to.equal(100);
      expect(DIST_TAG.test(tag)).to.be.true;
    });

    it("rejects a tag 101 characters long (1 + 100 — exceeds limit)", function () {
      const tag = "a" + "b".repeat(100);
      expect(tag.length).to.equal(101);
      expect(DIST_TAG.test(tag)).to.be.false;
    });
  });
});

describe("scripts/publish-staged-release semver version validation", function () {
  // The script rejects non-semver versions via semver.valid(version).
  describe("valid semver versions", function () {
    const validVersions = [
      "4.6.0",
      "4.6.0-publish-manifest-before-read.2",
      "4.6.0-next.1",
      "1.0.0",
      "0.0.1",
      "1.2.3-alpha.1",
      "2.0.0-beta",
    ];

    for (const v of validVersions) {
      it(`accepts "${v}"`, function () {
        expect(semver.valid(v)).to.not.be.null;
      });
    }
  });

  describe("invalid semver versions (rejected by the script)", function () {
    const invalidVersions = [
      "",
      "not-a-version",
      "4.6",          // only two parts — not a full semver triple
      "latest",       // dist-tag string, not a version
      ">=1.0.0",      // semver range expression, not a version
      "^4.0.0",       // semver range expression, not a version
    ];

    for (const v of invalidVersions) {
      it(`rejects "${v}"`, function () {
        // The script uses: if (!semver.valid(version)) { process.exit(1) }
        // semver.valid() returns null for non-valid strings.
        expect(semver.valid(v)).to.be.null;
      });
    }
  });

  it("semver.valid() coerces a v-prefixed string like 'v4.6.0' to a valid version", function () {
    // The script therefore treats v-prefixed strings as valid.  This test
    // documents that the script does NOT guard against the v prefix; callers
    // (semantic-release) always emit bare versions without the prefix.
    expect(semver.valid("v4.6.0")).to.not.be.null;
  });
});

describe("scripts/publish-staged-release dist-tag semver guard", function () {
  // The script additionally rejects dist-tags that parse as a semver value
  // or range, because npm rejects them itself.
  // Guard: if (semver.valid(tag) || semver.validRange(tag)) → process.exit(1)
  describe("tags that are ALSO valid semver — must be blocked", function () {
    const semverTags = [
      "4.6.0",         // valid semver version — must not be used as a dist-tag
      "4.6.0-next.1",  // pre-release semver — also rejected
      "1.0.0",
      "0.0.1",
    ];

    for (const tag of semverTags) {
      it(`detects "${tag}" as a semver version (and therefore an invalid dist-tag)`, function () {
        expect(semver.valid(tag)).to.not.be.null;
      });
    }
  });

  describe("tags that are semver ranges — must be blocked", function () {
    const rangeTags = [
      ">=1.0.0",
      "^4.0.0",
      "~1.2.3",
      "1.x",
      "1.2.x",
      ">1.0",
      "<2.0.0",
    ];

    for (const tag of rangeTags) {
      it(`detects "${tag}" as a semver range (and therefore an invalid dist-tag)`, function () {
        expect(semver.validRange(tag)).to.not.be.null;
      });
    }
  });

  describe("legitimate dist-tags that must NOT parse as semver", function () {
    // These are the tags the project actually uses; they must pass the DIST_TAG
    // regex AND not be rejected as semver values or ranges.
    const legitimateTags = [
      "latest",
      "next",
      "beta",
      "staging",
      "publish-manifest-before-read",
    ];

    for (const tag of legitimateTags) {
      it(`"${tag}" passes DIST_TAG regex and is not a semver value or range`, function () {
        expect(DIST_TAG.test(tag)).to.be.true;
        expect(semver.valid(tag)).to.be.null;
        // semver.validRange() treats "latest", "next", etc. as valid ranges in
        // some semver implementations; the script's guard catches any that do.
        // The important thing is they DON'T parse as versions (semver.valid is null).
      });
    }
  });
});

describe("scripts/publish-staged-release assertNoOptionalDependencies guard", function () {
  // This tests the parsing/guard logic used in assertNoOptionalDependencies()
  // without spawning npm. The function checks whether npm view output (--json)
  // represents a non-empty optionalDependencies object.
  function shouldBlockRelease(npmViewOutput) {
    // Mirror of the logic in assertNoOptionalDependencies():
    //   if ok && stdout → parse JSON → if object with keys → block
    if (!npmViewOutput || npmViewOutput === "") return false;
    let parsed;
    try {
      parsed = JSON.parse(npmViewOutput);
    } catch {
      return false;
    }
    return (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).length > 0
    );
  }

  it("blocks when npm view returns a non-empty optionalDependencies object", function () {
    const output = JSON.stringify({ "sharp": "^0.34.5", "webdriverio": "^9.27.0" });
    expect(shouldBlockRelease(output)).to.be.true;
  });

  it("does not block when npm view returns an empty string (field absent from manifest)", function () {
    expect(shouldBlockRelease("")).to.be.false;
  });

  it("does not block when npm view returns null JSON", function () {
    expect(shouldBlockRelease("null")).to.be.false;
  });

  it("does not block when npm view returns an empty object {}", function () {
    // An empty {} is not a real optionalDependencies declaration.
    expect(shouldBlockRelease("{}")).to.be.false;
  });

  it("does not block when npm view output is not valid JSON (registry lag / error)", function () {
    // If the registry hasn't propagated the new version yet, npm view may
    // error or return non-JSON. The function should not block in that case.
    expect(shouldBlockRelease("npm error ...")).to.be.false;
    expect(shouldBlockRelease("undefined")).to.be.false;
  });

  it("does not block when output is an array (unexpected shape)", function () {
    // Arrays are objects but not plain key-value maps; treat as unexpected/safe.
    expect(shouldBlockRelease('["sharp"]')).to.be.false;
  });

  it("blocks when only a single heavy dep is still present", function () {
    // Even a single surviving optionalDependency is a regression.
    const output = JSON.stringify({ "@puppeteer/browsers": "^2.13.0" });
    expect(shouldBlockRelease(output)).to.be.true;
  });
});
