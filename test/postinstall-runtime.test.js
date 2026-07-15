import {
  isRuntimeInstallOptedOut,
  isProgressLine,
  isNpmNoiseLine,
  isDocDetectiveLspCommand,
  isLspInvocation,
  readAncestorCommandLines,
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

  describe("isDocDetectiveLspCommand", function () {
    it("matches doc-detective lsp invocations across forms", function () {
      for (const cmd of [
        "npx doc-detective lsp",
        '"C:/x/node.exe" npx-cli.js --yes doc-detective lsp --stdio',
        "node /usr/lib/node_modules/doc-detective/bin/doc-detective.js lsp",
        "doc-detective lsp",
      ]) {
        expect(isDocDetectiveLspCommand(cmd), cmd).to.equal(true);
      }
    });

    it("does not match other subcommands or lookalikes", function () {
      for (const cmd of [
        "npx doc-detective runTests",
        "npm install doc-detective",
        "node doc-detective.js lsp-helper", // lsp not standalone
        "npx some-other-tool lsp", // no doc-detective
        "doc-detective --help",
        "",
      ]) {
        expect(isDocDetectiveLspCommand(cmd), cmd).to.equal(false);
      }
    });

    it("tolerates non-string input", function () {
      expect(isDocDetectiveLspCommand(undefined)).to.equal(false);
      expect(isDocDetectiveLspCommand(null)).to.equal(false);
    });
  });

  describe("isLspInvocation", function () {
    it("is false for a non-npx (plain install) command, without walking the tree", function () {
      // No ancestorLines passed; must short-circuit on npm_command before any
      // process-tree read.
      expect(isLspInvocation({ npm_command: "install" })).to.equal(false);
      expect(isLspInvocation({})).to.equal(false);
    });

    it("is true only when an npx ancestor is a doc-detective lsp command", function () {
      expect(
        isLspInvocation({ npm_command: "exec" }, ["npx doc-detective lsp --stdio"])
      ).to.equal(true);
    });

    it("is false for an npx invocation of a different subcommand", function () {
      expect(
        isLspInvocation({ npm_command: "exec" }, ["npx doc-detective runTests"])
      ).to.equal(false);
    });

    it("ignores lsp ancestry when the command is not npx", function () {
      expect(
        isLspInvocation({ npm_command: "install" }, ["npx doc-detective lsp"])
      ).to.equal(false);
    });
  });

  describe("readAncestorCommandLines", function () {
    it("walks the parent chain via an injected process table", function () {
      const table = new Map([
        [100, { ppid: 50, cmd: "node postinstall.js" }],
        [50, { ppid: 20, cmd: "npm exec doc-detective lsp" }],
        [20, { ppid: 0, cmd: "bash" }],
      ]);
      const lines = readAncestorCommandLines({
        pid: 100,
        platform: "test",
        readProcessTable: () => table,
      });
      expect(lines).to.deep.equal([
        "node postinstall.js",
        "npm exec doc-detective lsp",
        "bash",
      ]);
    });

    it("is cycle-guarded and returns [] on a reader failure", function () {
      const cyclic = new Map([
        [1, { ppid: 2, cmd: "a" }],
        [2, { ppid: 1, cmd: "b" }],
      ]);
      expect(
        readAncestorCommandLines({ pid: 1, readProcessTable: () => cyclic })
      ).to.deep.equal(["a", "b"]);
      expect(
        readAncestorCommandLines({
          readProcessTable: () => {
            throw new Error("nope");
          },
        })
      ).to.deep.equal([]);
    });
  });
});
