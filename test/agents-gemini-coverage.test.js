import assert from "node:assert/strict";
import path from "node:path";

/**
 * Coverage top-up for src/agents/adapters/gemini-cli.ts. Extends the identity
 * + detect() + getInstallState() + install() coverage already in
 * test/agents-gemini.test.js with the remaining gaps:
 *   - queryLocalInstallState(): manifest JSON.parse catch (unparseable
 *     gemini-extension.json → treated as not-installed).
 *   - enrichWithLatest(): fetchLatestVersion() throwing is swallowed.
 *   - install(): ENOENT spawn error mapped to an actionable hint, a
 *     non-ENOENT spawn error rethrown unchanged, and a non-zero exit code
 *     thrown with stdout logged first.
 *
 * HERMETIC: every dep (`run`, `existsSync`, `readFileSync`, `homedir`,
 * `fetchLatestVersion`) is injected. No real spawn/network.
 */

describe("GeminiCliAdapter — coverage top-up", function () {
  let GeminiCliAdapter;
  before(async function () {
    ({ GeminiCliAdapter } = await import("../dist/agents/adapters/gemini-cli.js"));
  });

  const HOME = path.join(path.sep, "home", "test");
  const MANIFEST_PATH = path.join(
    HOME,
    ".gemini",
    "extensions",
    "doc-detective",
    "gemini-extension.json"
  );

  function makeAdapter(overrides) {
    return new GeminiCliAdapter({
      run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      existsSync: () => false,
      readFileSync: () => {
        throw new Error("not stubbed");
      },
      homedir: () => HOME,
      fetchLatestVersion: async () => undefined,
      ...overrides,
    });
  }

  const baseOpts = (over = {}) => ({
    scope: "global",
    force: false,
    dryRun: false,
    logger: () => {},
    ...over,
  });

  describe("queryLocalInstallState — extensions-list JSON parse gaps", function () {
    it("falls back to the manifest when `extensions list` stdout is unparseable JSON", async function () {
      const listedVersion = "0.9.0";
      const adapter = makeAdapter({
        run: async (cmd, args) => {
          if (args[0] === "extensions" && args[1] === "list") {
            // Non-empty but invalid JSON → JSON.parse throws → caught,
            // falls through to the manifest-file fallback below.
            return { stdout: "{ this is not json", stderr: "", exitCode: 0 };
          }
          return { stdout: "", stderr: "", exitCode: 0 };
        },
        existsSync: (p) => p === MANIFEST_PATH,
        readFileSync: (p) =>
          p === MANIFEST_PATH
            ? JSON.stringify({ name: "doc-detective", version: listedVersion })
            : (() => {
                throw new Error("unexpected read " + p);
              })(),
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, true);
      assert.equal(state.installedVersion, listedVersion);
    });
  });

  describe("queryLocalInstallState — manifest fallback", function () {
    it("treats an unparseable gemini-extension.json as not-installed", async function () {
      const adapter = makeAdapter({
        // `extensions list` fails (binary unavailable), forcing the manifest
        // fallback; the manifest exists but contains invalid JSON.
        run: async () => {
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        },
        existsSync: (p) => p === MANIFEST_PATH,
        readFileSync: (p) => (p === MANIFEST_PATH ? "{ not valid json" : (() => {
          throw new Error("unexpected read " + p);
        })()),
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, false);
    });
  });

  describe("enrichWithLatest — throwing fetchLatestVersion", function () {
    it("swallows a throwing fetchLatestVersion (installed → latest unknown)", async function () {
      const listJson = JSON.stringify([{ name: "doc-detective", version: "1.0.0" }]);
      const adapter = makeAdapter({
        run: async () => ({ stdout: listJson, stderr: "", exitCode: 0 }),
        fetchLatestVersion: async () => {
          throw new Error("network down");
        },
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, true);
      assert.equal(state.latestVersion, undefined);
      assert.equal(state.upToDate, undefined);
    });
  });

  describe("install() — spawn error + non-zero exit branches", function () {
    it("maps an ENOENT spawn error to an actionable install hint", async function () {
      const adapter = makeAdapter({
        run: async () => {
          throw Object.assign(new Error("spawn gemini ENOENT"), { code: "ENOENT" });
        },
      });
      await assert.rejects(
        adapter.install(baseOpts()),
        /Gemini CLI is not installed or not on PATH.*npm install -g @google\/gemini-cli/
      );
    });

    it("rethrows a non-ENOENT spawn error unchanged", async function () {
      const adapter = makeAdapter({
        run: async (cmd, args) => {
          if (args[0] === "extensions" && args[1] === "list") {
            return { stdout: "[]", stderr: "", exitCode: 0 };
          }
          throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
        },
      });
      await assert.rejects(adapter.install(baseOpts()), /EACCES: permission denied/);
    });

    it("throws with stderr when a command exits non-zero, after logging stdout", async function () {
      const logged = [];
      const adapter = makeAdapter({
        run: async (cmd, args) => {
          if (args[0] === "extensions" && args[1] === "list") {
            return { stdout: "[]", stderr: "", exitCode: 0 };
          }
          return { stdout: "installing...", stderr: "boom", exitCode: 3 };
        },
      });
      await assert.rejects(
        adapter.install(baseOpts({ logger: (m, lvl) => logged.push([m, lvl]) })),
        /exited with code 3[\s\S]*boom/
      );
      assert.ok(
        logged.some(([m]) => /installing\.\.\./.test(m)),
        `expected the command's stdout to be logged at debug; got: ${JSON.stringify(logged)}`
      );
    });

    it("throws with a generic 'exit code N' message when stderr is empty", async function () {
      const adapter = makeAdapter({
        run: async (cmd, args) => {
          if (args[0] === "extensions" && args[1] === "list") {
            return { stdout: "[]", stderr: "", exitCode: 0 };
          }
          return { stdout: "", stderr: "", exitCode: 5 };
        },
      });
      await assert.rejects(adapter.install(baseOpts()), /exited with code 5/);
    });
  });
});
