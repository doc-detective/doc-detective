import {
  verifiedDate,
  shieldsBadge,
  parseVerifiedMarkers,
  applyVerifiedToContent,
  resolveVerifiedId,
} from "../dist/core/utils.js";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("Last Verified On — pure helpers", function () {
  describe("verifiedDate()", function () {
    it("formats a Date as zero-padded YYYY-MM-DD (UTC)", function () {
      expect(verifiedDate(new Date("2026-06-26T12:34:56Z"))).to.equal("2026-06-26");
      expect(verifiedDate(new Date("2026-01-05T00:00:00Z"))).to.equal("2026-01-05");
    });
  });

  describe("shieldsBadge()", function () {
    it("markdown image with shields.io dash-doubling", function () {
      expect(shieldsBadge("markdown", "2026-06-26")).to.equal(
        "![Last verified 2026-06-26](https://img.shields.io/badge/Last_verified-2026--06--26-brightgreen)"
      );
    });
    it("asciidoc image macro", function () {
      expect(shieldsBadge("asciidoc", "2026-06-26")).to.equal(
        "image:https://img.shields.io/badge/Last_verified-2026--06--26-brightgreen[Last verified 2026-06-26]"
      );
    });
    it("html img tag", function () {
      expect(shieldsBadge("html", "2026-06-26")).to.equal(
        '<img src="https://img.shields.io/badge/Last_verified-2026--06--26-brightgreen" alt="Last verified 2026-06-26">'
      );
    });
    it("dita image element", function () {
      expect(shieldsBadge("dita", "2026-06-26")).to.equal(
        '<image href="https://img.shields.io/badge/Last_verified-2026--06--26-brightgreen"><alt>Last verified 2026-06-26</alt></image>'
      );
    });
  });

  describe("parseVerifiedMarkers()", function () {
    it("captures HTML-comment data-only markers in markdown", function () {
      const markers = parseVerifiedMarkers(
        "# Title\n<!-- verified id=spec.md~abc date=2026-06-01 -->\n",
        "markdown"
      );
      expect(markers).to.have.length(1);
      expect(markers[0]).to.include({ id: "spec.md~abc", badge: false, date: "2026-06-01" });
    });
    it("captures JSX-comment (MDX) and badge flag", function () {
      const markers = parseVerifiedMarkers("{/* verified id=x badge */}", "markdown");
      expect(markers).to.have.length(1);
      expect(markers[0]).to.include({ id: "x", badge: true });
      expect(markers[0].date).to.be.undefined;
    });
    it("captures link-label comment form", function () {
      const markers = parseVerifiedMarkers("[comment]: # (verified id=y date=2026-01-02)", "markdown");
      expect(markers[0]).to.include({ id: "y", date: "2026-01-02" });
    });
    it("captures asciidoc form", function () {
      const markers = parseVerifiedMarkers("// (verified id=z)", "asciidoc");
      expect(markers[0]).to.include({ id: "z", badge: false });
    });
    it("ignores markers without an id", function () {
      expect(parseVerifiedMarkers("<!-- verified badge -->", "markdown")).to.have.length(0);
    });
  });

  describe("applyVerifiedToContent() — data-only", function () {
    const dates = new Map([["a", "2026-06-26"]]);
    it("inserts a date when absent", function () {
      expect(applyVerifiedToContent("<!-- verified id=a -->", "markdown", dates)).to.equal(
        "<!-- verified id=a date=2026-06-26 -->"
      );
    });
    it("updates an existing date in place", function () {
      expect(
        applyVerifiedToContent("<!-- verified id=a date=2026-01-01 -->", "markdown", dates)
      ).to.equal("<!-- verified id=a date=2026-06-26 -->");
    });
    it("is idempotent", function () {
      const once = applyVerifiedToContent("<!-- verified id=a -->", "markdown", dates);
      expect(applyVerifiedToContent(once, "markdown", dates)).to.equal(once);
    });
    it("leaves markers whose id is not in the date map untouched (ages)", function () {
      const input = "<!-- verified id=b date=2025-01-01 -->";
      expect(applyVerifiedToContent(input, "markdown", dates)).to.equal(input);
    });
    it("preserves the MDX JSX comment form (never emits <!-- -->)", function () {
      const out = applyVerifiedToContent("{/* verified id=a date=2026-01-01 */}", "markdown", dates);
      expect(out).to.equal("{/* verified id=a date=2026-06-26 */}");
      expect(out).to.not.contain("<!--");
    });
  });

  describe("applyVerifiedToContent() — badge", function () {
    const dates = new Map([["a", "2026-06-26"]]);
    it("inserts the shields.io image line on first run and updates the date", function () {
      const out = applyVerifiedToContent("<!-- verified id=a badge -->\n", "markdown", dates);
      expect(out).to.contain("<!-- verified id=a badge date=2026-06-26 -->");
      expect(out).to.contain(
        "![Last verified 2026-06-26](https://img.shields.io/badge/Last_verified-2026--06--26-brightgreen)"
      );
    });
    it("is idempotent across re-runs (no duplicate image, no drift)", function () {
      const once = applyVerifiedToContent("<!-- verified id=a badge -->\n", "markdown", dates);
      const twice = applyVerifiedToContent(once, "markdown", dates);
      expect(twice).to.equal(once);
    });
    it("replaces a stale badge image in place", function () {
      const stale =
        "<!-- verified id=a badge date=2025-01-01 -->\n" +
        "![Last verified 2025-01-01](https://img.shields.io/badge/Last_verified-2025--01--01-brightgreen)\n";
      const out = applyVerifiedToContent(stale, "markdown", dates);
      expect(out).to.contain("Last_verified-2026--06--26-brightgreen");
      expect(out).to.not.contain("2025--01--01");
    });
  });

  describe("resolveVerifiedId()", function () {
    const results = {
      specs: [
        { specId: "s1", result: "PASS", tests: [{ testId: "t1", result: "PASS" }, { testId: "t2", result: "FAIL" }] },
      ],
    };
    it("resolves a spec id", function () {
      expect(resolveVerifiedId(results, "s1")).to.equal("PASS");
    });
    it("resolves a test id", function () {
      expect(resolveVerifiedId(results, "t2")).to.equal("FAIL");
    });
    it("returns null for an unknown id", function () {
      expect(resolveVerifiedId(results, "nope")).to.equal(null);
    });
    it("returns null for null / non-array-specs inputs", function () {
      expect(resolveVerifiedId(null, "x")).to.equal(null);
      expect(resolveVerifiedId({}, "x")).to.equal(null);
      expect(resolveVerifiedId({ specs: [{ specId: "s", tests: [] }] }, "x")).to.equal(null);
    });
    it("gives specId precedence over a same-named testId", function () {
      const r = { specs: [{ specId: "dup", result: "PASS", tests: [{ testId: "dup", result: "FAIL" }] }] };
      expect(resolveVerifiedId(r, "dup")).to.equal("PASS");
    });
  });

  describe("branch & edge coverage", function () {
    it("shieldsBadge honors a custom label and color", function () {
      expect(shieldsBadge("markdown", "2026-06-26", { label: "Verified", color: "green" })).to.equal(
        "![Verified 2026-06-26](https://img.shields.io/badge/Verified-2026--06--26-green)"
      );
    });
    it("shieldsBadge escapes a color containing a hyphen", function () {
      expect(shieldsBadge("markdown", "2026-06-26", { color: "ff0000-x" })).to.contain("-ff0000--x)");
    });
    it("parseVerifiedMarkers falls back to markdown patterns for an unknown format", function () {
      const m = parseVerifiedMarkers("<!-- verified id=a -->", "totally-unknown");
      expect(m).to.have.length(1);
      expect(m[0].id).to.equal("a");
    });
    it("parseVerifiedAttrs handles badge=false, quoted values, and bare non-attr tokens", function () {
      const m = parseVerifiedMarkers('<!-- verified extra id="a" badge=false -->', "markdown");
      expect(m[0]).to.include({ id: "a", badge: false });
    });
    it("applyVerifiedToContent badge uses the markdown image body for an unknown format", function () {
      const out = applyVerifiedToContent(
        "<!-- verified id=a badge -->\n",
        "unknown",
        new Map([["a", "2026-06-26"]])
      );
      expect(out).to.contain("![Last verified 2026-06-26](https://img.shields.io/badge/");
    });
    it("applyVerifiedToContent is a no-op when no marker id is in the date map", function () {
      const input = "<!-- verified id=other date=2025-01-01 -->";
      expect(applyVerifiedToContent(input, "markdown", new Map([["a", "2026-06-26"]]))).to.equal(input);
    });
  });
});
