import {
  isRuntimeInstallOptedOut,
  isProgressLine,
  isNpmNoiseLine,
} from "../scripts/postinstall.js";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("scripts/postinstall runtime auto-install helpers", function () {
  describe("isRuntimeInstallOptedOut", function () {
    it("installs by default (env unset)", function () {
      expect(isRuntimeInstallOptedOut({})).to.equal(false);
    });

    it("opts out on 0/false/no/off (case-insensitive)", function () {
      for (const v of ["0", "false", "FALSE", "No", "off", " off "]) {
        expect(
          isRuntimeInstallOptedOut({ DOC_DETECTIVE_AUTOINSTALL: v }),
          v
        ).to.equal(true);
      }
    });

    it("installs for any other value", function () {
      for (const v of ["1", "true", "yes", "", "anything"]) {
        expect(
          isRuntimeInstallOptedOut({ DOC_DETECTIVE_AUTOINSTALL: v }),
          v
        ).to.equal(false);
      }
    });
  });

  describe("isProgressLine", function () {
    it("surfaces the installer's own progress lines", function () {
      expect(isProgressLine("Installing runtime…")).to.equal(true);
      expect(isProgressLine("Installing browsers…")).to.equal(true);
      expect(isProgressLine("  [npm] webdriverio — installed @ 9.27.0")).to.equal(true);
      expect(isProgressLine("  [browser] chrome — installed")).to.equal(true);
    });

    it("does not surface npm noise", function () {
      expect(isProgressLine("npm warn deprecated glob@10.5.0: …")).to.equal(false);
      expect(isProgressLine("npm notice")).to.equal(false);
      expect(isProgressLine("added 93 packages in 4s")).to.equal(false);
    });
  });

  describe("isNpmNoiseLine", function () {
    it("flags npm deprecation/funding/notice lines and blanks", function () {
      expect(isNpmNoiseLine("npm warn deprecated glob@10.5.0: …")).to.equal(true);
      expect(isNpmNoiseLine("npm warn deprecated whatwg-encoding@3.1.1: …")).to.equal(true);
      expect(isNpmNoiseLine("npm notice New version available")).to.equal(true);
      expect(isNpmNoiseLine("npm fund packages are looking for funding")).to.equal(true);
      expect(isNpmNoiseLine("   ")).to.equal(true);
    });

    it("keeps the installer's own output and real errors", function () {
      expect(isNpmNoiseLine("  [npm] webdriverio — installed")).to.equal(false);
      expect(isNpmNoiseLine("Error: ENOSPC: no space left on device")).to.equal(false);
    });
  });
});
