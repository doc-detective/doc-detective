// Unit tests for the runShell shell-selection helpers (ADR: configurable
// shell with bash default). Everything here is hermetic except the
// spawnCommand plumbing checks, which spawn a trivial `echo` through an
// explicitly resolved shell for the current platform.
import assert from "node:assert/strict";
import {
  resolveShellName,
  resolveShellExecutable,
  shellSpawnEnv,
  spawnCommand,
} from "../dist/core/utils.js";

describe("shell resolution", function () {
  describe("resolveShellName", function () {
    it("defaults to bash when neither step nor config set a shell", function () {
      assert.equal(resolveShellName({ config: {}, step: {} }), "bash");
      assert.equal(resolveShellName({}), "bash");
    });

    it("uses the config-level shell when the step doesn't set one", function () {
      assert.equal(
        resolveShellName({
          config: { shell: "powershell" },
          step: { runShell: { command: "echo hi" } },
        }),
        "powershell"
      );
    });

    it("lets the step shell win over the config shell", function () {
      assert.equal(
        resolveShellName({
          config: { shell: "powershell" },
          step: { runShell: { command: "echo hi", shell: "cmd" } },
        }),
        "cmd"
      );
    });
  });

  describe("resolveShellExecutable", function () {
    it("resolves bash to the PATH lookup on POSIX when bash is runnable", async function () {
      const executable = await resolveShellExecutable("bash", {
        platform: "linux",
        probePosixBash: async () => true,
      });
      assert.equal(executable, "bash");
    });

    it("rejects with an actionable error on bash-less POSIX systems", async function () {
      await assert.rejects(
        resolveShellExecutable("bash", {
          platform: "linux",
          probePosixBash: async () => false,
        }),
        /Install bash/
      );
    });

    it("resolves bash through the Windows bash resolver on win32", async function () {
      const executable = await resolveShellExecutable("bash", {
        platform: "win32",
        resolveWindowsBash: async () =>
          "C:\\Program Files\\Git\\bin\\bash.exe",
      });
      assert.equal(executable, "C:\\Program Files\\Git\\bin\\bash.exe");
    });

    it("resolves cmd to ComSpec (or cmd.exe) on win32", async function () {
      assert.equal(
        await resolveShellExecutable("cmd", {
          platform: "win32",
          env: { ComSpec: "C:\\Windows\\system32\\cmd.exe" },
        }),
        "C:\\Windows\\system32\\cmd.exe"
      );
      assert.equal(
        await resolveShellExecutable("cmd", { platform: "win32", env: {} }),
        "cmd.exe"
      );
    });

    it("resolves powershell to powershell.exe on win32", async function () {
      assert.equal(
        await resolveShellExecutable("powershell", { platform: "win32" }),
        "powershell.exe"
      );
    });

    it("rejects cmd and powershell off Windows with an actionable message", async function () {
      for (const shell of ["cmd", "powershell"]) {
        await assert.rejects(
          resolveShellExecutable(shell, { platform: "darwin" }),
          (error) => {
            assert.match(error.message, /only supported on Windows/);
            assert.match(error.message, new RegExp(shell));
            return true;
          }
        );
      }
    });

    it("rejects an unsupported shell name defensively", async function () {
      await assert.rejects(
        resolveShellExecutable("zsh", { platform: "linux" }),
        /Unsupported shell/
      );
    });
  });

  describe("shellSpawnEnv", function () {
    it("prepends the bash directory to PATH for an absolute Windows bash", function () {
      const env = shellSpawnEnv(
        "C:\\cache\\tools\\git-bash\\2.55.0.2\\usr\\bin\\bash.exe",
        { platform: "win32", env: { Path: "C:\\Windows\\System32" } }
      );
      assert.ok(env, "expected an env object");
      assert.ok(
        env.Path.startsWith("C:\\cache\\tools\\git-bash\\2.55.0.2\\usr\\bin"),
        env.Path
      );
      assert.ok(env.Path.includes("C:\\Windows\\System32"), env.Path);
    });

    it("returns undefined for non-bash shells, bare names, and POSIX", function () {
      assert.equal(
        shellSpawnEnv("C:\\Windows\\system32\\cmd.exe", {
          platform: "win32",
          env: {},
        }),
        undefined
      );
      assert.equal(
        shellSpawnEnv("bash", { platform: "win32", env: {} }),
        undefined
      );
      assert.equal(
        shellSpawnEnv("/usr/bin/bash", { platform: "linux", env: {} }),
        undefined
      );
      assert.equal(shellSpawnEnv(undefined, { platform: "win32" }), undefined);
    });
  });

  describe("spawnCommand with an explicit shell", function () {
    it("runs the command through the provided shell executable", async function () {
      this.timeout(15000);
      if (process.platform === "win32") {
        // cmd expands %VAR%; if the shell option weren't honored the literal
        // would come back (or bash would leave it untouched).
        const result = await spawnCommand("echo %PROCESSOR_ARCHITECTURE%", [], {
          shell: process.env.ComSpec || "cmd.exe",
        });
        assert.equal(result.exitCode, 0);
        assert.ok(!result.stdout.includes("%"), result.stdout);
      } else {
        // Under `bash -c`, $0 is the shell itself.
        const result = await spawnCommand("echo $0", [], { shell: "bash" });
        assert.equal(result.exitCode, 0);
        assert.match(result.stdout, /bash/);
      }
    });

    it("keeps the platform default shell when no shell option is provided", async function () {
      this.timeout(15000);
      const result = await spawnCommand("echo plumbing-intact");
      assert.equal(result.exitCode, 0);
      assert.match(result.stdout, /plumbing-intact/);
    });
  });
});
