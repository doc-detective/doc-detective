import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Closes remaining coverage gaps in src/agents/adapters/gemini-cli.ts left by
// test/agents-gemini.test.js: unparseable `extensions list` JSON fallthrough,
// the manifest-file-missing / manifest-unparseable branches, and install()'s
// error branches (ENOENT-friendly message, generic rethrow, non-zero exit).
// See ADR 01017.
describe("GeminiCliAdapter — coverage gaps", function () {
  let GeminiCliAdapter, defaultGeminiCliDeps;
  before(async function () {
    ({ GeminiCliAdapter, defaultGeminiCliDeps } = await import("../dist/agents/adapters/gemini-cli.js"));
  });

  describe("defaultGeminiCliDeps() fs-backed closures", function () {
    it("exposes working existsSync/readFileSync/homedir closures against a real temp dir", function () {
      // Mirrors the pattern in test/agents-adapters-coverage.test.js's
      // exerciseFsDeps helper: exercise the real fs/os-backed closures
      // without touching the network. fetchLatestVersion is deliberately
      // NOT invoked here — it hits axios with no injectable seam within the
      // factory itself (see /* c8 ignore */ on that block in the source).
      const deps = defaultGeminiCliDeps();
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-gemini-deps-"));
      try {
        const file = path.join(dir, "note.txt");
        fs.writeFileSync(file, "hello");
        assert.equal(deps.existsSync(file), true);
        assert.equal(deps.readFileSync(file), "hello");
        assert.equal(deps.readFileSync(file, "utf8"), "hello");
        assert.equal(deps.existsSync(path.join(dir, "missing.txt")), false);
        assert.equal(typeof deps.homedir(), "string");
        assert.ok(deps.homedir().length > 0);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  const MANIFEST_PATH = path.join(
    "/home/test", ".gemini", "extensions", "doc-detective", "gemini-extension.json"
  );

  function makeAdapter(overrides) {
    return new GeminiCliAdapter({
      run: async () => ({ stdout: "[]", stderr: "", exitCode: 0 }),
      existsSync: () => false,
      readFileSync: () => { throw new Error("not stubbed"); },
      homedir: () => "/home/test",
      fetchLatestVersion: async () => undefined,
      ...overrides,
    });
  }

  describe("queryLocalInstallState() fallback paths", function () {
    it("falls back to manifest read when `extensions list` stdout is unparseable JSON", async function () {
      const adapter = makeAdapter({
        run: async () => ({ stdout: "not json{{{", stderr: "", exitCode: 0 }),
        existsSync: (p) => p === MANIFEST_PATH,
        readFileSync: (p) => {
          if (p === MANIFEST_PATH) return JSON.stringify({ name: "doc-detective", version: "1.4.0" });
          throw new Error("unexpected read");
        },
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, true);
      assert.equal(state.installedVersion, "1.4.0");
    });

    it("reports not-installed when `extensions list` is unparseable AND manifest file is absent", async function () {
      const adapter = makeAdapter({
        run: async () => ({ stdout: "not json{{{", stderr: "", exitCode: 0 }),
        existsSync: () => false,
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, false);
    });

    it("reports not-installed when CLI throws AND manifest file is absent", async function () {
      const adapter = makeAdapter({
        run: async () => { throw new Error("ENOENT"); },
        existsSync: () => false,
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, false);
    });

    it("reports not-installed when manifest file exists but contains unparseable JSON", async function () {
      const adapter = makeAdapter({
        run: async () => { throw new Error("ENOENT"); },
        existsSync: (p) => p === MANIFEST_PATH,
        readFileSync: (p) => {
          if (p === MANIFEST_PATH) return "not valid json{{{";
          throw new Error("unexpected read");
        },
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, false);
    });
  });

  describe("enrichWithLatest() error + undefined-installedVersion paths", function () {
    it("leaves latestVersion/upToDate undefined when fetchLatestVersion() throws", async function () {
      const listJson = JSON.stringify([{ name: "doc-detective", version: "1.0.0" }]);
      const adapter = makeAdapter({
        run: async () => ({ stdout: listJson, stderr: "", exitCode: 0 }),
        fetchLatestVersion: async () => { throw new Error("network down"); },
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, true);
      assert.equal(state.installedVersion, "1.0.0");
      assert.equal(state.latestVersion, undefined);
      assert.equal(state.upToDate, undefined);
    });

    it("leaves upToDate undefined when installedVersion is itself undefined", async function () {
      // Manifest fallback with a version-less entry yields installed=true,
      // installedVersion=undefined — exercise the ternary's false branch.
      const adapter = makeAdapter({
        run: async () => { throw new Error("ENOENT"); },
        existsSync: (p) => p === MANIFEST_PATH,
        readFileSync: (p) => {
          if (p === MANIFEST_PATH) return JSON.stringify({ name: "doc-detective" });
          throw new Error("unexpected read");
        },
        fetchLatestVersion: async () => "9.9.9",
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, true);
      assert.equal(state.installedVersion, undefined);
      assert.equal(state.latestVersion, "9.9.9");
      assert.equal(state.upToDate, undefined);
    });
  });

  describe("install() error branches", function () {
    const baseOpts = (over = {}) => ({
      scope: "global",
      force: false,
      dryRun: false,
      cwd: "/work/proj",
      logger: () => {},
      ...over,
    });

    it("throws a friendly message when run() rejects with ENOENT (gemini not on PATH)", async function () {
      const adapter = makeAdapter({
        run: async (cmd, args) => {
          if (args[0] === "extensions" && args[1] === "list") {
            return { stdout: "[]", stderr: "", exitCode: 0 };
          }
          const err = new Error("spawn gemini ENOENT");
          err.code = "ENOENT";
          throw err;
        },
      });
      await assert.rejects(
        () => adapter.install(baseOpts()),
        /Gemini CLI is not installed or not on PATH.*npm install -g @google\/gemini-cli/s
      );
    });

    it("rethrows non-ENOENT errors from run() unchanged", async function () {
      const adapter = makeAdapter({
        run: async (cmd, args) => {
          if (args[0] === "extensions" && args[1] === "list") {
            return { stdout: "[]", stderr: "", exitCode: 0 };
          }
          throw new Error("boom: permission denied");
        },
      });
      await assert.rejects(
        () => adapter.install(baseOpts()),
        /boom: permission denied/
      );
    });

    it("throws with stderr detail when the install command exits non-zero", async function () {
      const adapter = makeAdapter({
        run: async (cmd, args) => {
          if (args[0] === "extensions" && args[1] === "list") {
            return { stdout: "[]", stderr: "", exitCode: 0 };
          }
          return { stdout: "", stderr: "network unreachable", exitCode: 1 };
        },
      });
      await assert.rejects(
        () => adapter.install(baseOpts()),
        /exited with code 1: network unreachable/
      );
    });

    it("throws without a trailing colon-detail when exit is non-zero and stderr is empty", async function () {
      const adapter = makeAdapter({
        run: async (cmd, args) => {
          if (args[0] === "extensions" && args[1] === "list") {
            return { stdout: "[]", stderr: "", exitCode: 0 };
          }
          return { stdout: "", stderr: "", exitCode: 7 };
        },
      });
      await assert.rejects(
        (async () => {
          try {
            await adapter.install(baseOpts());
          } catch (err) {
            assert.equal(
              err.message,
              "`gemini extensions install https://github.com/doc-detective/agent-tools.git --auto-update --consent --skip-settings` exited with code 7"
            );
            throw err;
          }
        })(),
        /exited with code 7$/
      );
    });

    it("logs stdout at debug level when the mutating command produces output", async function () {
      const logged = [];
      const adapter = makeAdapter({
        run: async (cmd, args) => {
          if (args[0] === "extensions" && args[1] === "list") {
            return { stdout: "[]", stderr: "", exitCode: 0 };
          }
          return { stdout: "Installed successfully", stderr: "", exitCode: 0 };
        },
      });
      const report = await adapter.install(baseOpts({ logger: (msg, level) => logged.push([msg, level]) }));
      assert.equal(report.action, "installed");
      assert.ok(
        logged.some(([msg, level]) => msg === "Installed successfully" && level === "debug"),
        `expected stdout to be logged at debug; got: ${JSON.stringify(logged)}`
      );
    });
  });
});
