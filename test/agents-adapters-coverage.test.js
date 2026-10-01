import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { Readable, Writable } from "node:stream";
import sinon from "sinon";

/**
 * Phase 12 coverage top-up for the agent adapter + prompt builders.
 *
 * HERMETIC + OFFLINE: no real LLM/process spawns/network. The `run` and
 * `fetchZip`/`fetchLatestVersion` deps are always stubbed. The interactive
 * inquirer prompts are driven by a fake in-memory TTY (see withFakeTTY) so no
 * real stdin is read and nothing blocks. All assertions are on structure —
 * never on host OS, path separators, real timing, or installed binaries.
 */

// ---------------------------------------------------------------------------
// prompts.ts
// ---------------------------------------------------------------------------

class FakeInput extends Readable {
  constructor() {
    super();
    this.isTTY = true;
  }
  _read() {}
  setRawMode() {
    return this;
  }
}
class FakeOutput extends Writable {
  constructor() {
    super();
    this.isTTY = true;
    this.columns = 80;
    this.rows = 24;
  }
  _write(_chunk, _enc, cb) {
    cb();
  }
}

/**
 * Run an inquirer-backed prompt against an in-memory fake TTY, feeding the
 * given keystrokes so it resolves instead of blocking on real stdin. Restores
 * process.stdin/stdout in a finally so mocha's own output is untouched.
 */
async function withFakeTTY(run, keys = ["\r"]) {
  const origIn = Object.getOwnPropertyDescriptor(process, "stdin");
  const origOut = Object.getOwnPropertyDescriptor(process, "stdout");
  const input = new FakeInput();
  const output = new FakeOutput();
  Object.defineProperty(process, "stdin", { value: input, configurable: true });
  Object.defineProperty(process, "stdout", { value: output, configurable: true });
  try {
    const promise = run();
    let delay = 40;
    for (const key of keys) {
      setTimeout(() => input.push(key), delay);
      delay += 40;
    }
    return await promise;
  } finally {
    Object.defineProperty(process, "stdin", origIn);
    Object.defineProperty(process, "stdout", origOut);
  }
}

describe("prompts.ts", function () {
  let prompts;
  before(async function () {
    prompts = await import("../dist/agents/prompts.js");
  });

  describe("assertTTY guard", function () {
    let origIn;
    beforeEach(function () {
      origIn = Object.getOwnPropertyDescriptor(process, "stdin");
    });
    afterEach(function () {
      Object.defineProperty(process, "stdin", origIn);
    });

    function setTTY(value) {
      Object.defineProperty(process, "stdin", {
        value: { isTTY: value },
        configurable: true,
      });
    }

    it("pickAgents throws when there is no TTY", async function () {
      setTTY(false);
      await assert.rejects(
        prompts.pickAgents([{ id: "claude", displayName: "Claude Code" }]),
        /No TTY detected/
      );
    });

    it("pickScope throws when there is no TTY", async function () {
      setTTY(false);
      await assert.rejects(prompts.pickScope(["global", "project"]), /No TTY detected/);
    });

    it("confirmForce throws when there is no TTY", async function () {
      setTTY(false);
      await assert.rejects(prompts.confirmForce([]), /No TTY detected/);
    });
  });

  describe("pickAgents", function () {
    it("returns [] without prompting when the list is empty (TTY present)", async function () {
      const result = await withFakeTTY(() => prompts.pickAgents([]));
      assert.deepEqual(result, []);
    });

    it("prompts a checkbox and returns the selected agent ids", async function () {
      const agents = [
        { id: "claude", displayName: "Claude Code" },
        { id: "codex", displayName: "Codex" },
      ];
      // Default keystroke (Enter) accepts the pre-checked choices.
      const result = await withFakeTTY(() => prompts.pickAgents(agents));
      assert.deepEqual(result.sort(), ["claude", "codex"]);
    });
  });

  describe("pickScope", function () {
    it("short-circuits and returns the only supported scope without prompting", async function () {
      const result = await withFakeTTY(() => prompts.pickScope(["project"]));
      assert.equal(result, "project");
    });

    it("prompts a select and returns the chosen scope (defaults to project)", async function () {
      const result = await withFakeTTY(() => prompts.pickScope(["global", "project"]));
      // The default is "project" when project is supported; Enter accepts it.
      assert.equal(result, "project");
    });

    it("defaults to the first supported scope when project is not offered", async function () {
      const result = await withFakeTTY(() => prompts.pickScope(["global"]));
      // Single-scope short-circuit path.
      assert.equal(result, "global");
    });
  });

  describe("confirmForce", function () {
    it("prints modified files and resolves true when confirmed", async function () {
      const logSpy = sinon.stub(console, "log");
      try {
        const result = await withFakeTTY(
          () => prompts.confirmForce(["a.txt", "b.txt"]),
          ["y", "\r"]
        );
        assert.equal(result, true);
        assert.ok(
          logSpy.getCalls().some((c) => /Locally modified files/.test(String(c.args[0]))),
          "expected the modified-files banner to be logged"
        );
      } finally {
        logSpy.restore();
      }
    });

    it("resolves false by default when no files are modified (no banner)", async function () {
      const logSpy = sinon.stub(console, "log");
      try {
        const result = await withFakeTTY(() => prompts.confirmForce([]), ["\r"]);
        assert.equal(result, false);
        assert.ok(
          !logSpy.getCalls().some((c) => /Locally modified files/.test(String(c.args[0]))),
          "must not print the banner when nothing is modified"
        );
      } finally {
        logSpy.restore();
      }
    });
  });

  describe("createPrompts", function () {
    it("returns an object exposing pickAgents + pickScope", function () {
      const factory = prompts.createPrompts();
      assert.equal(typeof factory.pickAgents, "function");
      assert.equal(typeof factory.pickScope, "function");
    });
  });
});

// ---------------------------------------------------------------------------
// Shared helpers for adapter default-deps coverage.
// ---------------------------------------------------------------------------

/**
 * Exercise the concrete fs-backed closures returned by a `default*Deps()`
 * factory against a real temp dir. Covers the readFileSync/readdirSync/
 * writeFileSync/mkdirSync/rmSync closures without touching the network
 * (fetchLatestVersion is deliberately NOT invoked — it hits axios).
 */
function exerciseFsDeps(deps, { hasRm } = { hasRm: true }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-deps-"));
  try {
    const sub = path.join(dir, "nested", "deep");
    deps.mkdirSync(sub, { recursive: true });
    assert.equal(fs.existsSync(sub), true);

    const file = path.join(sub, "note.txt");
    deps.writeFileSync(file, "hello");
    assert.equal(deps.existsSync(file), true);
    assert.equal(deps.readFileSync(file), "hello");
    assert.equal(deps.readFileSync(file, "utf8"), "hello");

    // Buffer input path for the codex/opencode writeFileSync closure.
    if (deps.writeFileSync) {
      const bin = path.join(sub, "bin.dat");
      deps.writeFileSync(bin, Buffer.from([1, 2, 3]));
      assert.equal(fs.existsSync(bin), true);
    }

    const names = deps.readdirSync(sub);
    assert.ok(names.includes("note.txt"));

    assert.equal(typeof deps.homedir(), "string");
    assert.equal(typeof deps.cwd(), "string");

    if (hasRm && deps.rmSync) {
      deps.rmSync(sub, { recursive: true, force: true });
      assert.equal(fs.existsSync(sub), false);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// claude-code.ts — targeted gaps
// ---------------------------------------------------------------------------

describe("ClaudeCodeAdapter — coverage top-up", function () {
  let mod;
  before(async function () {
    mod = await import("../dist/agents/adapters/claude-code.js");
  });

  const HOME = path.join(path.sep, "home", "test");
  const CWD = path.join(path.sep, "work", "proj");

  function baseDeps(overrides = {}) {
    return {
      run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      existsSync: () => false,
      readFileSync: () => {
        throw new Error("not stubbed");
      },
      readdirSync: () => [],
      writeFileSync: () => {},
      mkdirSync: () => {},
      renameSync: () => {},
      homedir: () => HOME,
      cwd: () => CWD,
      fetchLatestVersion: async () => undefined,
      ...overrides,
    };
  }

  it("defaultClaudeCodeDeps exposes working fs-backed closures", function () {
    const deps = mod.defaultClaudeCodeDeps();
    // rename closure is fs.renameSync; exercise it explicitly.
    exerciseFsDeps(deps, { hasRm: false });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cc-rename-"));
    try {
      const from = path.join(dir, "a.txt");
      const to = path.join(dir, "b.txt");
      deps.writeFileSync(from, "x");
      deps.renameSync(from, to);
      assert.equal(fs.existsSync(to), true);
      assert.equal(fs.existsSync(from), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("enrichWithLatest swallows a throwing fetchLatestVersion (installed → latest unknown)", async function () {
    // Binary present, plugin listed as installed, but the remote probe throws.
    const adapter = new mod.ClaudeCodeAdapter(
      baseDeps({
        run: async (cmd, args) => {
          if (args.includes("--version")) return { stdout: "1.0.0", stderr: "", exitCode: 0 };
          return {
            stdout: JSON.stringify([
              { id: "doc-detective@doc-detective", version: "1.0.0", scope: "user", enabled: true },
            ]),
            stderr: "",
            exitCode: 0,
          };
        },
        fetchLatestVersion: async () => {
          throw new Error("network down");
        },
      })
    );
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, true);
    assert.equal(state.latestVersion, undefined);
    assert.equal(state.upToDate, undefined);
  });

  it("enrichWithLatest leaves upToDate undefined when installedVersion is unknown", async function () {
    // plugin list omits version → installedVersion undefined, but latest resolves.
    const adapter = new mod.ClaudeCodeAdapter(
      baseDeps({
        run: async (cmd, args) => {
          if (args.includes("--version")) return { stdout: "1.0.0", stderr: "", exitCode: 0 };
          return {
            stdout: JSON.stringify([
              { id: "doc-detective@doc-detective", scope: "user", enabled: true },
            ]),
            stderr: "",
            exitCode: 0,
          };
        },
        fetchLatestVersion: async () => "2.0.0",
      })
    );
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, true);
    assert.equal(state.installedVersion, undefined);
    assert.equal(state.latestVersion, "2.0.0");
    assert.equal(state.upToDate, undefined);
  });

  it("queryMarketplaceList treats a non-zero exit as binary-available-but-empty", async function () {
    // exitCode !== 0 → binaryAvailable true, installed false → not-installed.
    const adapter = new mod.ClaudeCodeAdapter(
      baseDeps({
        run: async (cmd, args) => {
          if (args.includes("--version")) return { stdout: "1.0.0", stderr: "", exitCode: 0 };
          return { stdout: "", stderr: "boom", exitCode: 3 };
        },
      })
    );
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, false);
  });

  it("queryMarketplaceList tolerates non-JSON stdout from the CLI", async function () {
    const adapter = new mod.ClaudeCodeAdapter(
      baseDeps({
        run: async (cmd, args) => {
          if (args.includes("--version")) return { stdout: "1.0.0", stderr: "", exitCode: 0 };
          return { stdout: "not json at all", stderr: "", exitCode: 0 };
        },
      })
    );
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, false);
  });

  it("toPluginListArray accepts the object-wrapper shape ({ plugins: [...] })", async function () {
    const adapter = new mod.ClaudeCodeAdapter(
      baseDeps({
        run: async (cmd, args) => {
          if (args.includes("--version")) return { stdout: "1.0.0", stderr: "", exitCode: 0 };
          return {
            stdout: JSON.stringify({
              plugins: [
                { id: "doc-detective@doc-detective", version: "3.1.0", scope: "user", enabled: true },
              ],
            }),
            stderr: "",
            exitCode: 0,
          };
        },
        fetchLatestVersion: async () => undefined,
      })
    );
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, true);
    assert.equal(state.installedVersion, "3.1.0");
  });

  describe("findInstalledVersionFromCache (via installed-without-version + cache snoop)", function () {
    const cacheDir = path.join(HOME, ".claude", "plugins", "cache", "doc-detective", "doc-detective");

    function installedButNoVersionRun(cmd, args) {
      if (args.includes("--version")) return { stdout: "1.0.0", stderr: "", exitCode: 0 };
      // Installed, but the list entry has no `version` field → forces the
      // cache-dir fallback in queryLocalInstallState.
      return {
        stdout: JSON.stringify([
          { id: "doc-detective@doc-detective", scope: "user", enabled: true },
        ]),
        stderr: "",
        exitCode: 0,
      };
    }

    it("picks the highest semver-ish cache entry and reads its plugin.json version", async function () {
      const chosen = "1.10.0"; // must beat 1.2.0 numerically, not lexically
      const pluginJson = path.join(cacheDir, chosen, ".claude-plugin", "plugin.json");
      const adapter = new mod.ClaudeCodeAdapter(
        baseDeps({
          run: installedButNoVersionRun,
          existsSync: (p) => p === cacheDir || p === pluginJson,
          readdirSync: (p) => (p === cacheDir ? ["1.2.0", "1.10.0"] : []),
          readFileSync: (p) => {
            if (p === pluginJson) return JSON.stringify({ version: "1.10.0" });
            throw new Error("unexpected read " + p);
          },
        })
      );
      const state = await adapter.getInstallState("global");
      assert.equal(state.installedVersion, "1.10.0");
    });

    it("falls back to the chosen directory name when plugin.json is unreadable", async function () {
      const chosen = "2.5.0";
      const adapter = new mod.ClaudeCodeAdapter(
        baseDeps({
          run: installedButNoVersionRun,
          existsSync: (p) => p === cacheDir, // plugin.json absent
          readdirSync: (p) => (p === cacheDir ? [chosen] : []),
          readFileSync: () => {
            throw new Error("no plugin.json");
          },
        })
      );
      const state = await adapter.getInstallState("global");
      assert.equal(state.installedVersion, chosen);
    });

    it("returns undefined version when the cache dir is empty", async function () {
      const adapter = new mod.ClaudeCodeAdapter(
        baseDeps({
          run: installedButNoVersionRun,
          existsSync: (p) => p === cacheDir,
          readdirSync: () => [],
        })
      );
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, true);
      assert.equal(state.installedVersion, undefined);
    });

    it("returns undefined version when readdirSync on the cache dir throws", async function () {
      const adapter = new mod.ClaudeCodeAdapter(
        baseDeps({
          run: installedButNoVersionRun,
          existsSync: (p) => p === cacheDir,
          readdirSync: () => {
            throw new Error("EACCES");
          },
        })
      );
      const state = await adapter.getInstallState("global");
      assert.equal(state.installedVersion, undefined);
    });

    it("compareSemverish falls back to localeCompare for non-numeric entries", async function () {
      // Pre-release tags aren't numeric tuples → localeCompare branch.
      const chosen = ["1.0.0-beta", "1.0.0-alpha"].sort((a, b) => a.localeCompare(b)).reverse()[0];
      const pluginJson = path.join(cacheDir, chosen, ".claude-plugin", "plugin.json");
      const adapter = new mod.ClaudeCodeAdapter(
        baseDeps({
          run: installedButNoVersionRun,
          existsSync: (p) => p === cacheDir || p === pluginJson,
          readdirSync: (p) => (p === cacheDir ? ["1.0.0-alpha", "1.0.0-beta"] : []),
          readFileSync: (p) =>
            p === pluginJson ? JSON.stringify({ version: "1.0.0-beta" }) : (() => {
              throw new Error("x");
            })(),
        })
      );
      const state = await adapter.getInstallState("global");
      // Whatever the ordering resolves to, a defined version is produced.
      assert.equal(typeof state.installedVersion, "string");
    });
  });

  it("toPluginListArray returns [] for an object without a known plugins key", async function () {
    // Object shape but none of plugins/installedPlugins/items → empty array →
    // treated as not-installed.
    const adapter = new mod.ClaudeCodeAdapter(
      baseDeps({
        run: async (cmd, args) => {
          if (args.includes("--version")) return { stdout: "1.0.0", stderr: "", exitCode: 0 };
          return { stdout: JSON.stringify({ somethingElse: [1, 2, 3] }), stderr: "", exitCode: 0 };
        },
      })
    );
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, false);
  });

  it("toPluginListArray accepts the alternate 'items' wrapper key", async function () {
    const adapter = new mod.ClaudeCodeAdapter(
      baseDeps({
        run: async (cmd, args) => {
          if (args.includes("--version")) return { stdout: "1.0.0", stderr: "", exitCode: 0 };
          return {
            stdout: JSON.stringify({
              items: [
                { id: "doc-detective@doc-detective", version: "4.0.0", scope: "user", enabled: true },
              ],
            }),
            stderr: "",
            exitCode: 0,
          };
        },
      })
    );
    const state = await adapter.getInstallState("global");
    assert.equal(state.installedVersion, "4.0.0");
  });

  it("compareSemverish handles equal + unequal-length version dir names", async function () {
    // Two component-wise-equal names ("1.0" vs "1.00" → [1,0] each) exercise
    // the `return 0` path; the differing lengths exercise the `pa[i] ?? ''`
    // nullish fill. Whatever wins, a defined version comes back.
    const cacheDir = path.join(HOME, ".claude", "plugins", "cache", "doc-detective", "doc-detective");
    const adapter = new mod.ClaudeCodeAdapter(
      baseDeps({
        run: async (cmd, args) => {
          if (args.includes("--version")) return { stdout: "1.0.0", stderr: "", exitCode: 0 };
          return {
            stdout: JSON.stringify([
              { id: "doc-detective@doc-detective", scope: "user", enabled: true },
            ]),
            stderr: "",
            exitCode: 0,
          };
        },
        existsSync: (p) => p === cacheDir,
        readdirSync: (p) => (p === cacheDir ? ["1.0", "1.00", "1"] : []),
        readFileSync: () => {
          throw new Error("no plugin.json → fall back to dir name");
        },
      })
    );
    const state = await adapter.getInstallState("global");
    assert.equal(typeof state.installedVersion, "string");
  });

  it("readSettingsFile rejects invalid JSON with a repair hint (Path B install)", async function () {
    const settingsPath = path.join(HOME, ".claude", "settings.json");
    const adapter = new mod.ClaudeCodeAdapter(
      baseDeps({
        // Binary absent so install() takes the settings-file path.
        run: async () => {
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        },
        existsSync: (p) => p === settingsPath,
        readFileSync: () => "{ not valid json",
      })
    );
    await assert.rejects(
      adapter.install({ scope: "global", force: false, dryRun: false, logger: () => {} }),
      /not valid JSON/
    );
  });

  it("writeSettingsFile cleans up the temp file and rethrows when rename fails", async function () {
    const settingsPath = path.join(HOME, ".claude", "settings.json");
    let unlinked = false;
    const writes = [];
    const adapter = new mod.ClaudeCodeAdapter(
      baseDeps({
        run: async () => {
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        },
        // settings.json doesn't exist yet (fresh write), but the tmp file does
        // after write → drives the unlink-on-failure cleanup.
        existsSync: (p) => p !== settingsPath,
        mkdirSync: () => {},
        writeFileSync: (p, data) => {
          writes.push(p);
        },
        renameSync: () => {
          throw new Error("EPERM rename");
        },
      })
    );
    // fs.unlinkSync is the real cleanup call; stub it so no real file is touched.
    const unlinkStub = sinon.stub(fs, "unlinkSync").callsFake(() => {
      unlinked = true;
    });
    try {
      await assert.rejects(
        adapter.install({ scope: "global", force: false, dryRun: false, logger: () => {} }),
        /EPERM rename/
      );
      assert.ok(writes.length > 0, "should have written a temp file before renaming");
      assert.equal(unlinked, true, "should best-effort unlink the temp file on rename failure");
    } finally {
      unlinkStub.restore();
    }
  });

  it("installViaCli logs stdout and throws on a non-zero command exit", async function () {
    // Fresh install (not installed) so it runs the marketplace add + install
    // commands; make the first one emit stdout, the second fail.
    let call = 0;
    const logged = [];
    const adapter = new mod.ClaudeCodeAdapter(
      baseDeps({
        run: async (cmd, args) => {
          if (args.includes("--version")) return { stdout: "1.0.0", stderr: "", exitCode: 0 };
          if (args[0] === "plugin" && args[1] === "list") {
            return { stdout: "[]", stderr: "", exitCode: 0 };
          }
          call++;
          if (call === 1) return { stdout: "added marketplace", stderr: "", exitCode: 0 };
          return { stdout: "", stderr: "install blew up", exitCode: 7 };
        },
      })
    );
    await assert.rejects(
      adapter.install({
        scope: "project",
        force: false,
        dryRun: false,
        logger: (m, lvl) => logged.push([m, lvl]),
      }),
      /exited with code 7[\s\S]*install blew up/
    );
    assert.ok(
      logged.some(([m]) => /added marketplace/.test(m)),
      "expected the first command's stdout to be logged at debug"
    );
  });
});

// ---------------------------------------------------------------------------
// codex.ts — targeted gaps
// ---------------------------------------------------------------------------

describe("CodexAdapter — coverage top-up", function () {
  let mod;
  before(async function () {
    mod = await import("../dist/agents/adapters/codex.js");
  });

  it("defaultCodexDeps exposes working fs-backed closures (incl. Buffer writes)", function () {
    exerciseFsDeps(mod.defaultCodexDeps());
  });

  it("detect() reports a project .agents dir when present but the binary is absent", async function () {
    const projectAgents = path.join(path.sep, "work", "proj", ".agents");
    const adapter = new mod.CodexAdapter({
      run: async () => {
        throw new Error("ENOENT");
      },
      existsSync: (p) => p === projectAgents,
      readFileSync: () => {
        throw new Error("unused");
      },
      homedir: () => path.join(path.sep, "home", "test"),
      cwd: () => path.join(path.sep, "work", "proj"),
      fetchLatestVersion: async () => undefined,
      fetchZip: async () => {
        throw new Error("unused");
      },
    });
    const r = await adapter.detect();
    assert.equal(r.onPath, false);
    assert.equal(r.present, true);
    assert.equal(r.configPaths.project, projectAgents);
    assert.ok((r.notes ?? []).some((n) => /not on PATH/.test(n)));
  });

  it("getInstallState marks upToDate=false when the installed version differs from latest", async function () {
    const canonical = path.join(
      path.sep,
      "home",
      "test",
      ".agents",
      "skills",
      "doc-detective-init",
      "SKILL.md"
    );
    const adapter = new mod.CodexAdapter({
      run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      existsSync: (p) => p === canonical,
      readFileSync: () => "---\nmetadata:\n  version: '1.0.0'\n---\nbody\n",
      homedir: () => path.join(path.sep, "home", "test"),
      cwd: () => path.join(path.sep, "work", "proj"),
      fetchLatestVersion: async () => "2.0.0",
      fetchZip: async () => {
        throw new Error("unused");
      },
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.installedVersion, "1.0.0");
    assert.equal(state.latestVersion, "2.0.0");
    assert.equal(state.upToDate, false);
  });

  describe("parseMetadataVersion", function () {
    it("returns undefined when there is no frontmatter", function () {
      assert.equal(mod.parseMetadataVersion("just a body, no dashes"), undefined);
    });

    it("returns undefined when frontmatter lacks metadata.version", function () {
      assert.equal(
        mod.parseMetadataVersion("---\nname: x\ndescription: y\n---\nbody\n"),
        undefined
      );
    });

    it("returns the version string when present", function () {
      assert.equal(
        mod.parseMetadataVersion("---\nmetadata:\n  version: '4.2.0'\n---\nbody\n"),
        "4.2.0"
      );
    });

    it("returns undefined (never throws) on malformed YAML frontmatter", function () {
      // Unbalanced/invalid YAML inside the fence → YAML.parse throws → caught.
      const bad = "---\n\tmetadata: : : [unclosed\n---\nbody\n";
      assert.equal(mod.parseMetadataVersion(bad), undefined);
    });
  });

  it("queryLocalInstallState treats a readFileSync error as not-installed", async function () {
    const canonical = path.join(
      path.sep,
      "home",
      "test",
      ".agents",
      "skills",
      "doc-detective-init",
      "SKILL.md"
    );
    const adapter = new mod.CodexAdapter({
      run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      existsSync: (p) => p === canonical,
      readFileSync: () => {
        throw new Error("EACCES");
      },
      homedir: () => path.join(path.sep, "home", "test"),
      cwd: () => path.join(path.sep, "work", "proj"),
      fetchLatestVersion: async () => undefined,
      fetchZip: async () => {
        throw new Error("unused");
      },
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, false);
  });

  it("getInstallState leaves upToDate undefined when installed version is unparseable but latest resolves", async function () {
    const canonical = path.join(
      path.sep,
      "home",
      "test",
      ".agents",
      "skills",
      "doc-detective-init",
      "SKILL.md"
    );
    const adapter = new mod.CodexAdapter({
      run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      existsSync: (p) => p === canonical,
      readFileSync: () => "no frontmatter, unparseable version",
      homedir: () => path.join(path.sep, "home", "test"),
      cwd: () => path.join(path.sep, "work", "proj"),
      fetchLatestVersion: async () => "2.0.0",
      fetchZip: async () => {
        throw new Error("unused");
      },
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, true);
    assert.equal(state.installedVersion, undefined);
    assert.equal(state.latestVersion, "2.0.0");
    assert.equal(state.upToDate, undefined);
  });

  describe("install() error + fallback branches", function () {
    let sourceRoot;
    let home;
    let proj;

    const SKILL_SRC = (name, version) =>
      `---\nname: ${name}\nmetadata:\n  version: '${version}'\n---\nbody of ${name}\n`;

    beforeEach(function () {
      sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-codex-cov-src-"));
      home = fs.mkdtempSync(path.join(os.tmpdir(), "dd-codex-cov-home-"));
      proj = fs.mkdtempSync(path.join(os.tmpdir(), "dd-codex-cov-proj-"));
    });
    afterEach(function () {
      for (const d of [sourceRoot, home, proj]) {
        try {
          fs.rmSync(d, { recursive: true, force: true });
        } catch {}
      }
    });

    function fullFsDeps(overrides = {}) {
      return {
        run: async () => {
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        },
        existsSync: fs.existsSync,
        readFileSync: (p, enc = "utf8") => fs.readFileSync(p, enc),
        readdirSync: (p) => fs.readdirSync(p),
        mkdirSync: (p, opts) => fs.mkdirSync(p, opts),
        writeFileSync: (p, data) => fs.writeFileSync(p, data),
        rmSync: (p, opts) => fs.rmSync(p, opts),
        homedir: () => home,
        cwd: () => proj,
        fetchLatestVersion: async () => undefined,
        fetchZip: async (ref) => ({ tempDir: sourceRoot, ref, owned: false }),
        ...overrides,
      };
    }

    const opts = (over = {}) => ({
      scope: "global",
      force: false,
      dryRun: false,
      logger: () => {},
      ...over,
    });

    it("throws when the fetched archive has no skills/ directory", async function () {
      // sourceRoot is empty → no skills/.
      const adapter = new mod.CodexAdapter(fullFsDeps());
      await assert.rejects(adapter.install(opts()), /no skills\/ directory/);
    });

    it("throws when skills/ has no doc-detective-* entries", async function () {
      fs.mkdirSync(path.join(sourceRoot, "skills", "unrelated"), { recursive: true });
      fs.writeFileSync(
        path.join(sourceRoot, "skills", "unrelated", "SKILL.md"),
        SKILL_SRC("unrelated", "1.0.0")
      );
      const adapter = new mod.CodexAdapter(fullFsDeps());
      await assert.rejects(adapter.install(opts()), /no doc-detective-\* skills/);
    });

    it("cleans up a pre-existing tmp dir and copies nested skill directories", async function () {
      // Build a skill with a nested subdir + file to exercise copyDir recursion.
      const skillDir = path.join(sourceRoot, "skills", "doc-detective-init");
      fs.mkdirSync(path.join(skillDir, "scripts"), { recursive: true });
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), SKILL_SRC("doc-detective-init", "5.0.0"));
      fs.writeFileSync(path.join(skillDir, "scripts", "helper.sh"), "#!/bin/sh\necho hi\n");

      const target = path.join(home, ".agents", "skills");
      fs.mkdirSync(target, { recursive: true });

      // Pre-create a stale tmp sibling so the "rm tmpDst if exists" branch runs.
      // We can't know the exact suffix, but pre-populate a matching-prefix dir
      // AND intercept existsSync to claim the very first tmpDst already exists.
      let firstTmpSeen = null;
      const deps = fullFsDeps({
        existsSync: (p) => {
          if (
            p.includes(".install.tmp.") &&
            firstTmpSeen === null &&
            !fs.existsSync(p)
          ) {
            firstTmpSeen = p;
            return true; // force the pre-clean rmSync path
          }
          return fs.existsSync(p);
        },
        rmSync: (p, o) => {
          // Guard: the forced-existing tmp doesn't really exist; swallow ENOENT.
          try {
            fs.rmSync(p, o);
          } catch {}
        },
      });
      const adapter = new mod.CodexAdapter(deps);
      const report = await adapter.install(opts());
      assert.equal(report.action, "installed");
      assert.equal(
        fs.existsSync(path.join(target, "doc-detective-init", "scripts", "helper.sh")),
        true
      );
    });

    it("wraps a copyDir failure in a network-hinted install error", async function () {
      fs.mkdirSync(path.join(sourceRoot, "skills", "doc-detective-init"), { recursive: true });
      fs.writeFileSync(
        path.join(sourceRoot, "skills", "doc-detective-init", "SKILL.md"),
        SKILL_SRC("doc-detective-init", "1.0.0")
      );
      // Make writeFileSync throw during the copy → copyDir fails → cleanup +
      // rethrow wrapped as "Failed to install Codex skills".
      const deps = fullFsDeps({
        writeFileSync: () => {
          throw new Error("disk full");
        },
      });
      const adapter = new mod.CodexAdapter(deps);
      await assert.rejects(adapter.install(opts()), /Failed to install Codex skills.*disk full/);
    });

    it("owned tempDir is cleaned up via the injected rmSync after install", async function () {
      const ownedTemp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-codex-owned-"));
      fs.mkdirSync(path.join(ownedTemp, "skills", "doc-detective-init"), { recursive: true });
      fs.writeFileSync(
        path.join(ownedTemp, "skills", "doc-detective-init", "SKILL.md"),
        SKILL_SRC("doc-detective-init", "1.0.0")
      );
      let rmTargets = [];
      const deps = fullFsDeps({
        fetchZip: async (ref) => ({ tempDir: ownedTemp, ref, owned: true }),
        rmSync: (p, o) => {
          rmTargets.push(p);
          fs.rmSync(p, o);
        },
      });
      const adapter = new mod.CodexAdapter(deps);
      const report = await adapter.install(opts());
      assert.equal(report.action, "installed");
      assert.ok(
        rmTargets.includes(ownedTemp),
        "owned tempDir should be removed on cleanup"
      );
      assert.equal(fs.existsSync(ownedTemp), false);
    });

    it("mkdirp + copyDir fall back to module fs when no injected fs helpers are given", async function () {
      // Omit mkdirSync/writeFileSync/rmSync so the internal fs fallbacks run.
      fs.mkdirSync(path.join(sourceRoot, "skills", "doc-detective-init"), { recursive: true });
      fs.writeFileSync(
        path.join(sourceRoot, "skills", "doc-detective-init", "SKILL.md"),
        SKILL_SRC("doc-detective-init", "1.0.0")
      );
      const deps = {
        run: async () => {
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        },
        existsSync: fs.existsSync,
        readFileSync: (p, enc = "utf8") => fs.readFileSync(p, enc),
        readdirSync: (p) => fs.readdirSync(p),
        // mkdirSync/writeFileSync/rmSync intentionally omitted.
        homedir: () => home,
        cwd: () => proj,
        fetchLatestVersion: async () => undefined,
        fetchZip: async (ref) => ({ tempDir: sourceRoot, ref, owned: false }),
      };
      const adapter = new mod.CodexAdapter(deps);
      const report = await adapter.install(opts());
      assert.equal(report.action, "installed");
      assert.equal(
        fs.existsSync(path.join(home, ".agents", "skills", "doc-detective-init", "SKILL.md")),
        true
      );
    });

    it("owned cleanup uses the fs.rmSync fallback when no rmSync is injected", async function () {
      // owned:true + no injected rmSync → the `?? fs.rmSync` fallback removes
      // the temp dir. Use a throwaway owned dir so the real fs.rmSync runs.
      const ownedTemp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-codex-ownedfb-"));
      fs.mkdirSync(path.join(ownedTemp, "skills", "doc-detective-init"), { recursive: true });
      fs.writeFileSync(
        path.join(ownedTemp, "skills", "doc-detective-init", "SKILL.md"),
        SKILL_SRC("doc-detective-init", "1.0.0")
      );
      const deps = {
        run: async () => {
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        },
        existsSync: fs.existsSync,
        readFileSync: (p, enc = "utf8") => fs.readFileSync(p, enc),
        readdirSync: (p) => fs.readdirSync(p),
        mkdirSync: (p, o) => fs.mkdirSync(p, o),
        writeFileSync: (p, data) => fs.writeFileSync(p, data),
        // rmSync omitted → both the copy-loop and cleanup use fs.rmSync fallback.
        homedir: () => home,
        cwd: () => proj,
        fetchLatestVersion: async () => undefined,
        fetchZip: async (ref) => ({ tempDir: ownedTemp, ref, owned: true }),
      };
      const adapter = new mod.CodexAdapter(deps);
      const report = await adapter.install(opts());
      assert.equal(report.action, "installed");
      assert.equal(fs.existsSync(ownedTemp), false);
    });
  });
});

// ---------------------------------------------------------------------------
// opencode.ts — targeted gaps
// ---------------------------------------------------------------------------

describe("OpenCodeAdapter — coverage top-up", function () {
  let mod;
  before(async function () {
    mod = await import("../dist/agents/adapters/opencode.js");
  });

  it("defaultOpenCodeDeps exposes working fs-backed closures (incl. Buffer writes)", function () {
    exerciseFsDeps(mod.defaultOpenCodeDeps());
  });

  it("detect() reports a project .opencode dir when present but the binary is absent", async function () {
    const projectDir = path.join(path.sep, "work", "proj", ".opencode");
    const adapter = new mod.OpenCodeAdapter({
      run: async () => {
        throw new Error("ENOENT");
      },
      existsSync: (p) => p === projectDir,
      readFileSync: () => {
        throw new Error("unused");
      },
      readdirSync: () => [],
      homedir: () => path.join(path.sep, "home", "test"),
      cwd: () => path.join(path.sep, "work", "proj"),
      fetchLatestVersion: async () => undefined,
      fetchZip: async () => {
        throw new Error("unused");
      },
    });
    const r = await adapter.detect();
    assert.equal(r.present, true);
    assert.equal(r.configPaths.project, projectDir);
    assert.ok((r.notes ?? []).some((n) => /not on PATH/.test(n)));
  });

  it("getInstallState marks upToDate=false when the installed version differs from latest", async function () {
    const canonical = path.join(
      path.sep,
      "home",
      "test",
      ".config",
      "opencode",
      "skills",
      "doc-detective-init",
      "SKILL.md"
    );
    const adapter = new mod.OpenCodeAdapter({
      run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      existsSync: (p) => p === canonical,
      readFileSync: () => "---\nmetadata:\n  version: '1.0.0'\n---\nbody\n",
      readdirSync: () => [],
      homedir: () => path.join(path.sep, "home", "test"),
      cwd: () => path.join(path.sep, "work", "proj"),
      fetchLatestVersion: async () => "2.0.0",
      fetchZip: async () => {
        throw new Error("unused");
      },
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.upToDate, false);
  });

  it("queryLocalInstallState treats a readFileSync error as not-installed", async function () {
    const canonical = path.join(
      path.sep,
      "home",
      "test",
      ".config",
      "opencode",
      "skills",
      "doc-detective-init",
      "SKILL.md"
    );
    const adapter = new mod.OpenCodeAdapter({
      run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      existsSync: (p) => p === canonical,
      readFileSync: () => {
        throw new Error("EACCES");
      },
      readdirSync: () => [],
      homedir: () => path.join(path.sep, "home", "test"),
      cwd: () => path.join(path.sep, "work", "proj"),
      fetchLatestVersion: async () => undefined,
      fetchZip: async () => {
        throw new Error("unused");
      },
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, false);
  });

  it("getInstallState leaves upToDate undefined when installed version is unparseable but latest resolves", async function () {
    const canonical = path.join(
      path.sep,
      "home",
      "test",
      ".config",
      "opencode",
      "skills",
      "doc-detective-init",
      "SKILL.md"
    );
    const adapter = new mod.OpenCodeAdapter({
      run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      existsSync: (p) => p === canonical,
      readFileSync: () => "no frontmatter here",
      readdirSync: () => [],
      homedir: () => path.join(path.sep, "home", "test"),
      cwd: () => path.join(path.sep, "work", "proj"),
      fetchLatestVersion: async () => "2.0.0",
      fetchZip: async () => {
        throw new Error("unused");
      },
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, true);
    assert.equal(state.installedVersion, undefined);
    assert.equal(state.latestVersion, "2.0.0");
    assert.equal(state.upToDate, undefined);
  });

  describe("install() error + fallback branches", function () {
    let sourceRoot;
    let home;
    let proj;

    const SKILL_SRC = (name, version) =>
      `---\nname: ${name}\nmetadata:\n  version: '${version}'\n---\nbody of ${name}\n`;

    /** Populate a full agent-tools plugin tree under sourceRoot. */
    function seedFullTree() {
      const pluginDir = path.join(sourceRoot, "plugins", "doc-detective");
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(
        path.join(pluginDir, "opencode-plugin.mjs"),
        "export default async () => ({});\n"
      );
      const skillsDir = path.join(pluginDir, "skills");
      fs.mkdirSync(path.join(skillsDir, "doc-detective-init", "scripts"), { recursive: true });
      fs.writeFileSync(
        path.join(skillsDir, "doc-detective-init", "SKILL.md"),
        SKILL_SRC("doc-detective-init", "1.0.0")
      );
      fs.writeFileSync(
        path.join(skillsDir, "doc-detective-init", "scripts", "run.sh"),
        "#!/bin/sh\necho ok\n"
      );
      return pluginDir;
    }

    beforeEach(function () {
      sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-oc-cov-src-"));
      home = fs.mkdtempSync(path.join(os.tmpdir(), "dd-oc-cov-home-"));
      proj = fs.mkdtempSync(path.join(os.tmpdir(), "dd-oc-cov-proj-"));
    });
    afterEach(function () {
      for (const d of [sourceRoot, home, proj]) {
        try {
          fs.rmSync(d, { recursive: true, force: true });
        } catch {}
      }
    });

    function fullFsDeps(overrides = {}) {
      return {
        run: async () => {
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        },
        existsSync: fs.existsSync,
        readFileSync: (p, enc = "utf8") => fs.readFileSync(p, enc),
        readdirSync: (p) => fs.readdirSync(p),
        mkdirSync: (p, o) => fs.mkdirSync(p, o),
        writeFileSync: (p, data) => fs.writeFileSync(p, data),
        rmSync: (p, o) => fs.rmSync(p, o),
        homedir: () => home,
        cwd: () => proj,
        fetchLatestVersion: async () => undefined,
        fetchZip: async (ref) => ({ tempDir: sourceRoot, ref, owned: false }),
        ...overrides,
      };
    }

    const opts = (over = {}) => ({
      scope: "global",
      force: false,
      dryRun: false,
      logger: () => {},
      ...over,
    });

    it("throws when plugins/doc-detective/ is missing from the archive", async function () {
      const adapter = new mod.OpenCodeAdapter(fullFsDeps());
      await assert.rejects(adapter.install(opts()), /no plugins\/doc-detective\/ directory/);
    });

    it("throws when the plugin dir has no skills/ subdirectory", async function () {
      const pluginDir = path.join(sourceRoot, "plugins", "doc-detective");
      fs.mkdirSync(pluginDir, { recursive: true });
      const adapter = new mod.OpenCodeAdapter(fullFsDeps());
      await assert.rejects(adapter.install(opts()), /no plugins\/doc-detective\/skills\/ directory/);
    });

    it("throws when skills/ has no doc-detective-* entries", async function () {
      const skillsDir = path.join(sourceRoot, "plugins", "doc-detective", "skills");
      fs.mkdirSync(path.join(skillsDir, "unrelated"), { recursive: true });
      fs.writeFileSync(
        path.join(skillsDir, "unrelated", "SKILL.md"),
        SKILL_SRC("unrelated", "1.0.0")
      );
      const adapter = new mod.OpenCodeAdapter(fullFsDeps());
      await assert.rejects(adapter.install(opts()), /no OpenCode doc-detective-\* skills/);
    });

    it("throws when the opencode-plugin.mjs file is missing", async function () {
      // Skills present but plugin file absent.
      const skillsDir = path.join(sourceRoot, "plugins", "doc-detective", "skills");
      fs.mkdirSync(path.join(skillsDir, "doc-detective-init"), { recursive: true });
      fs.writeFileSync(
        path.join(skillsDir, "doc-detective-init", "SKILL.md"),
        SKILL_SRC("doc-detective-init", "1.0.0")
      );
      const adapter = new mod.OpenCodeAdapter(fullFsDeps());
      await assert.rejects(adapter.install(opts()), /no OpenCode plugin file/);
    });

    it("copies hooks/ and agents/, pruning pre-existing doc-detective files (recursively)", async function () {
      const pluginDir = seedFullTree();
      // hooks with nested scripts + agents
      fs.mkdirSync(path.join(pluginDir, "hooks", "scripts"), { recursive: true });
      fs.writeFileSync(
        path.join(pluginDir, "hooks", "scripts", "doc-detective-before.js"),
        "// before\n"
      );
      fs.mkdirSync(path.join(pluginDir, "agents"), { recursive: true });
      fs.writeFileSync(path.join(pluginDir, "agents", "doc-detective.md"), "# agent\n");

      // Pre-populate the destination hooks/agents with a stale doc-detective
      // file (nested) AND an unrelated user file → prune keeps the user file.
      const root = path.join(home, ".config", "opencode");
      const dstHooksScripts = path.join(root, "hooks", "scripts");
      fs.mkdirSync(dstHooksScripts, { recursive: true });
      fs.writeFileSync(path.join(dstHooksScripts, "doc-detective-stale.js"), "// stale\n");
      fs.writeFileSync(path.join(dstHooksScripts, "user-hook.js"), "// user\n");
      const dstAgents = path.join(root, "agents");
      fs.mkdirSync(dstAgents, { recursive: true });
      fs.writeFileSync(path.join(dstAgents, "doc-detective-old.md"), "# old\n");
      fs.writeFileSync(path.join(dstAgents, "user-agent.md"), "# mine\n");

      const adapter = new mod.OpenCodeAdapter(fullFsDeps());
      const report = await adapter.install(opts());
      assert.equal(report.action, "installed");

      // Fresh doc-detective files copied in.
      assert.equal(
        fs.existsSync(path.join(dstHooksScripts, "doc-detective-before.js")),
        true
      );
      assert.equal(fs.existsSync(path.join(dstAgents, "doc-detective.md")), true);
      // Stale doc-detective files pruned.
      assert.equal(fs.existsSync(path.join(dstHooksScripts, "doc-detective-stale.js")), false);
      assert.equal(fs.existsSync(path.join(dstAgents, "doc-detective-old.md")), false);
      // Unrelated user files preserved.
      assert.equal(fs.existsSync(path.join(dstHooksScripts, "user-hook.js")), true);
      assert.equal(fs.existsSync(path.join(dstAgents, "user-agent.md")), true);
      // Report carries the restart note.
      assert.ok(
        (report.notes ?? []).some((n) => /auto-discovers/.test(n)),
        "expected the restart note"
      );
    });

    it("wraps a copyDir failure in a network-hinted install error", async function () {
      seedFullTree();
      const deps = fullFsDeps({
        writeFileSync: () => {
          throw new Error("disk full");
        },
      });
      const adapter = new mod.OpenCodeAdapter(deps);
      await assert.rejects(
        adapter.install(opts()),
        /Failed to install OpenCode tools.*disk full/
      );
    });

    it("owned tempDir is cleaned up via the injected rmSync after install", async function () {
      // Move the seeded tree into an 'owned' temp dir.
      const ownedTemp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-oc-owned-"));
      const prevSource = sourceRoot;
      sourceRoot = ownedTemp;
      seedFullTree();
      sourceRoot = prevSource;

      let rmTargets = [];
      const deps = fullFsDeps({
        fetchZip: async (ref) => ({ tempDir: ownedTemp, ref, owned: true }),
        rmSync: (p, o) => {
          rmTargets.push(p);
          fs.rmSync(p, o);
        },
      });
      const adapter = new mod.OpenCodeAdapter(deps);
      const report = await adapter.install(opts());
      assert.equal(report.action, "installed");
      assert.ok(rmTargets.includes(ownedTemp), "owned tempDir should be removed on cleanup");
      assert.equal(fs.existsSync(ownedTemp), false);
    });

    it("mkdirp + copyDir fall back to module fs when no injected fs helpers are given", async function () {
      seedFullTree();
      const deps = {
        run: async () => {
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        },
        existsSync: fs.existsSync,
        readFileSync: (p, enc = "utf8") => fs.readFileSync(p, enc),
        readdirSync: (p) => fs.readdirSync(p),
        // mkdirSync/writeFileSync/rmSync omitted → fs fallbacks.
        homedir: () => home,
        cwd: () => proj,
        fetchLatestVersion: async () => undefined,
        fetchZip: async (ref) => ({ tempDir: sourceRoot, ref, owned: false }),
      };
      const adapter = new mod.OpenCodeAdapter(deps);
      const report = await adapter.install(opts());
      assert.equal(report.action, "installed");
      assert.equal(
        fs.existsSync(
          path.join(home, ".config", "opencode", "skills", "doc-detective-init", "SKILL.md")
        ),
        true
      );
    });

    it("project scope installs under ./.opencode/ and clears a pre-existing tmp dir", async function () {
      seedFullTree();
      let firstTmpSeen = null;
      const deps = fullFsDeps({
        existsSync: (p) => {
          if (p.includes(".install.tmp.") && firstTmpSeen === null && !fs.existsSync(p)) {
            firstTmpSeen = p;
            return true;
          }
          return fs.existsSync(p);
        },
        rmSync: (p, o) => {
          try {
            fs.rmSync(p, o);
          } catch {}
        },
      });
      const adapter = new mod.OpenCodeAdapter(deps);
      const report = await adapter.install(opts({ scope: "project" }));
      assert.equal(report.action, "installed");
      assert.equal(
        fs.existsSync(
          path.join(proj, ".opencode", "skills", "doc-detective-init", "SKILL.md")
        ),
        true
      );
    });
  });
});
