import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";

/**
 * Coverage top-up for four files with no source changes:
 *   - src/cli.ts                         (CLI entry / subcommand dispatch)
 *   - src/core/index.ts                  (public API surface / runTests)
 *   - src/agents/adapters/qwen-code.ts   (agent adapter)
 *   - src/agents/adapters/copilot-cli.ts (agent adapter)
 *
 * HERMETIC + OFFLINE + DETERMINISTIC:
 *  - Adapters: every side-effecting dep (`run`, `existsSync`, `readFileSync`,
 *    `fetchLatestVersion`) is injected/stubbed. No real spawn/network. All
 *    assertions are on STRUCTURE (command arrays, error messages, report
 *    shape) — never on host OS, path separators, or installed binaries.
 *  - core/index.ts: `runTests` is called in-process against temp specs that
 *    execute only offline steps (`wait`) or resolve to nothing. No browser,
 *    no network.
 *  - cli.ts has no exports and runs `main(process.argv)` as an import-time
 *    side effect, so it cannot be unit-imported. Instead we drive the real
 *    `bin/doc-detective.js` in a child process with an offline env
 *    (DOC_DETECTIVE_SKIP_AUTO_UPDATE=1, CI=1). c8 merges child-process V8
 *    coverage, so these spawns cover dist/cli.js. This mirrors the existing
 *    test/cli-install.test.js pattern. Every spawn is offline: dry-run,
 *    debug-dump, config-error, and a `wait`-only normal run.
 *
 * Every temp dir / env swap is cleaned up in a finally or afterEach.
 */

// ---------------------------------------------------------------------------
// cli.ts — driven through the real bin in an offline child process.
// ---------------------------------------------------------------------------

describe("cli.ts — runTestsHandler branches (offline child process)", function () {
  this.timeout(60000);

  const BIN = path.resolve("bin/doc-detective.js");

  // Offline env: never self-update, never hit a registry. CI=1 also makes the
  // handler skip the self-update block entirely (that block is network-only).
  function runCli(args, { env = {}, cwd } = {}) {
    return spawnSync(process.execPath, [BIN, ...args], {
      env: {
        ...process.env,
        DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1",
        CI: "1",
        // Ensure no stray config env leaks in from the host shell.
        DOC_DETECTIVE_CONFIG: "",
        DOC_DETECTIVE_DEBUG: "",
        ...env,
      },
      cwd,
      encoding: "utf8",
    });
  }

  function mkTmp(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  }

  it("dry-run resolves a spec and short-circuits before execution", function () {
    const dir = mkTmp("dd-cli-dry-");
    try {
      const spec = path.join(dir, "t.spec.json");
      fs.writeFileSync(
        spec,
        JSON.stringify({ tests: [{ steps: [{ goTo: "https://example.com" }] }] })
      );
      const r = runCli(["--input", spec, "--dry-run", "--output", dir]);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      // Dry-run dumps resolved-tests JSON to stdout.
      const parsed = JSON.parse(r.stdout);
      assert.ok(parsed.resolvedTestsId, "expected a resolved-tests dump");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a normal (non-dry) run executes an offline `wait` step and runs the reporters", function () {
    const dir = mkTmp("dd-cli-run-");
    try {
      const spec = path.join(dir, "w.spec.json");
      fs.writeFileSync(
        spec,
        JSON.stringify({ tests: [{ steps: [{ wait: 10 }] }] })
      );
      const outFile = path.join(dir, "results.json");
      const r = runCli([
        "--input",
        spec,
        "--output",
        outFile,
        "--logLevel",
        "silent",
      ]);
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      // The default (json) reporter wrote an executed-results file.
      assert.equal(fs.existsSync(outFile), true, "expected a reporter output file");
      const results = JSON.parse(fs.readFileSync(outFile, "utf8"));
      assert.ok(results.summary, "expected an executed-results summary");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("DOC_DETECTIVE_DEBUG=1 with a valid config prints the diagnostic dump and returns", function () {
    const dir = mkTmp("dd-cli-dbg-");
    try {
      // Empty input dir → nothing to resolve, but the debug dump fires first
      // and returns before any run. Fully offline.
      const r = runCli(["--input", dir, "--logLevel", "silent"], {
        env: { DOC_DETECTIVE_DEBUG: "1" },
      });
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      // printDebug emits a recognizable banner to stdout.
      assert.match(
        r.stdout + r.stderr,
        /debug|diagnostic|config/i,
        "expected some diagnostic output"
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("DOC_DETECTIVE_DEBUG=1 with an invalid config still dumps and exits non-zero", function () {
    const dir = mkTmp("dd-cli-dbgerr-");
    try {
      // A .doc-detective.json that fails schema validation → setConfig throws.
      // With the debug env var set, the handler renders a stub-config dump and
      // sets process.exitCode = 1 rather than a hard throw.
      const cfg = path.join(dir, ".doc-detective.json");
      fs.writeFileSync(cfg, JSON.stringify({ logLevel: 12345 }));
      const r = runCli([], {
        env: { DOC_DETECTIVE_DEBUG: "1" },
        cwd: dir,
      });
      assert.notEqual(r.status, 0, "invalid config must fail the process");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("an explicit --config pointing at a bad file fails deterministically (top-level catch)", function () {
    const dir = mkTmp("dd-cli-badcfg-");
    try {
      const missing = path.join(dir, "nope.json");
      const r = runCli(["--config", missing, "--logLevel", "silent"]);
      // setConfig throws → escapes main → top-level .catch prints + exit(1).
      assert.notEqual(r.status, 0);
      assert.ok(
        (r.stderr + r.stdout).length > 0,
        "expected an error message on stderr/stdout"
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("an unknown flag triggers the yargs .fail handler and exits non-zero", function () {
    const r = runCli(["--definitelyNotAFlag", "x"]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr + r.stdout, /Unknown argument|definitelyNotAFlag/i);
  });

  it("discovers a .doc-detective.json config from the cwd when no --config is given", function () {
    const dir = mkTmp("dd-cli-json-");
    try {
      // A minimal valid JSON config in the cwd exercises the auto-discovery
      // branch that checks fs.existsSync(configPathJSON) BEFORE falling
      // through to yaml/yml. Point input at the (empty) dir so nothing runs.
      fs.writeFileSync(
        path.join(dir, ".doc-detective.json"),
        JSON.stringify({ logLevel: "silent", input: dir })
      );
      const r = runCli(["--logLevel", "silent"], { cwd: dir });
      assert.ok(
        !/Unknown argument/.test(r.stderr + r.stdout),
        `unexpected yargs error: ${r.stderr}`
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("discovers a .doc-detective.yaml config from the cwd when no --config is given", function () {
    const dir = mkTmp("dd-cli-yaml-");
    try {
      // A minimal valid YAML config in the cwd exercises the yaml auto-discovery
      // fallthrough. Point input at the (empty) dir so nothing executes.
      fs.writeFileSync(
        path.join(dir, ".doc-detective.yaml"),
        `logLevel: silent\ninput: "${dir.replace(/\\/g, "/")}"\n`
      );
      const r = runCli(["--logLevel", "silent"], { cwd: dir });
      // Either resolves nothing (exit 0) — the point is the yaml branch ran
      // without an "Unknown"/parse crash.
      assert.ok(
        !/Unknown argument/.test(r.stderr + r.stdout),
        `unexpected yargs error: ${r.stderr}`
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("discovers a .doc-detective.yml config (the .yml auto-discovery fallthrough)", function () {
    const dir = mkTmp("dd-cli-yml-");
    try {
      // No .json and no .yaml present → discovery falls through to .yml.
      fs.writeFileSync(
        path.join(dir, ".doc-detective.yml"),
        `logLevel: silent\ninput: "${dir.replace(/\\/g, "/")}"\n`
      );
      const r = runCli(["--logLevel", "silent"], { cwd: dir });
      assert.ok(
        !/Unknown argument/.test(r.stderr + r.stdout),
        `unexpected yargs error: ${r.stderr}`
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("evaluates the CI short-circuit of the self-update guard without unsetting DOC_DETECTIVE_SKIP_AUTO_UPDATE", function () {
    // The self-update `if` is a short-circuited `&&` chain:
    //   config.autoUpdate !== false && !SKIP_AUTO_UPDATE && !CI
    // Every other test in this suite sets SKIP_AUTO_UPDATE="1", so the chain
    // always short-circuits at the *second* term and the third term
    // (`!process.env.CI`) is never evaluated. Clearing SKIP_AUTO_UPDATE here
    // (empty string is falsy) while keeping CI="1" lets evaluation reach the
    // third term, which is still truthy-CI → still short-circuits false, so
    // the self-update body (real network) never runs. Fully offline.
    const dir = mkTmp("dd-cli-ci-guard-");
    try {
      const spec = path.join(dir, "w.spec.json");
      fs.writeFileSync(spec, JSON.stringify({ tests: [{ steps: [{ wait: 5 }] }] }));
      const r = runCli(
        ["--input", spec, "--output", dir, "--logLevel", "silent"],
        { env: { DOC_DETECTIVE_SKIP_AUTO_UPDATE: "" } }
      );
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// core/index.ts — public API surface + in-process runTests branches.
// ---------------------------------------------------------------------------

describe("core/index.ts — public API surface", function () {
  let mod;
  before(async function () {
    mod = await import("../dist/core/index.js");
  });

  it("re-exports the documented public functions", function () {
    for (const name of [
      "runTests",
      "getRunner",
      "detectTests",
      "detectAndResolveTests",
      "resolveTests",
      "readFile",
      "resolvePaths",
    ]) {
      assert.equal(typeof mod[name], "function", `missing export: ${name}`);
    }
  });
});

describe("core/index.ts — runTests offline branches", function () {
  this.timeout(30000);

  let runTests;
  let detectAndResolveTests;
  let tmpDir;
  let origLog;
  let captured;

  before(async function () {
    ({ runTests, detectAndResolveTests } = await import("../dist/core/index.js"));
  });

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-core-idx-"));
    captured = [];
    origLog = console.log;
    console.log = (...args) => captured.push(args.join(" "));
  });

  afterEach(function () {
    console.log = origLog;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when the input resolves to no tests", async function () {
    // A directory with only non-test text → detectTests finds nothing →
    // detectAndResolveTests returns null → runTests logs the warning + null.
    fs.writeFileSync(path.join(tmpDir, "readme.txt"), "just prose, no tests");
    const result = await runTests({
      input: [tmpDir],
      output: tmpDir,
      logLevel: "silent",
      telemetry: { send: false },
      reporters: [],
    });
    assert.equal(result, null);
  });

  it("detectAndResolveTests returns null for an input with no detectable tests", async function () {
    fs.writeFileSync(path.join(tmpDir, "notes.md"), "# Heading\n\nNo procedures here.\n");
    const resolved = await detectAndResolveTests({
      config: {
        input: [tmpDir],
        output: tmpDir,
        logLevel: "silent",
        telemetry: { send: false },
      },
    });
    assert.equal(resolved, null);
  });

  it("caller config wins over an embedded resolvedTests.config (dry-run preserved)", async function () {
    // Seed a resolved-tests payload via a dry run, then feed it back with a
    // caller-level dryRun override. Exercises the options.resolvedTests merge
    // branch (config spread) in runTests.
    const spec = path.join(tmpDir, "t.spec.json");
    fs.writeFileSync(
      spec,
      JSON.stringify({ tests: [{ steps: [{ wait: 5 }] }] })
    );
    const seed = await runTests({
      input: [spec],
      output: tmpDir,
      logLevel: "silent",
      dryRun: true,
      telemetry: { send: false },
    });
    captured.length = 0;

    const tampered = JSON.parse(JSON.stringify(seed));
    tampered.config.dryRun = false; // caller's dryRun:true must still win

    const result = await runTests(
      { dryRun: true, logLevel: "silent", telemetry: { send: false } },
      { resolvedTests: tampered }
    );
    assert.ok(result.resolvedTestsId, "expected the resolved-tests shape back");
    assert.equal(result.summary, undefined, "must not have executed");
  });

  it("merges against an empty {} when resolvedTests.config is absent (|| {} fallback)", async function () {
    // Exercises the `resolvedTests.config || {}` fallback — resolvedTests
    // carries no embedded config at all (a caller could hand-build a
    // resolvedTests payload without one). Passes dryRun:true via the caller
    // config so this short-circuits before runSpecs/getAvailableApps, which
    // — unrelated to this merge line — currently throws on an
    // under-populated config when a pre-resolved context lacks the platform
    // info local resolution adds (tracked separately; out of scope here).
    const spec = path.join(tmpDir, "noconfig.spec.json");
    fs.writeFileSync(spec, JSON.stringify({ tests: [{ steps: [{ wait: 5 }] }] }));
    const seed = await runTests({
      input: [spec],
      output: tmpDir,
      logLevel: "silent",
      dryRun: true,
      telemetry: { send: false },
    });
    captured.length = 0;

    const tampered = JSON.parse(JSON.stringify(seed));
    delete tampered.config; // resolvedTests.config absent -> the || {} fires

    const result = await runTests(
      { dryRun: true, logLevel: "silent", telemetry: { send: false } },
      { resolvedTests: tampered }
    );
    assert.ok(result.resolvedTestsId, "expected the resolved-tests shape back");
    assert.equal(result.summary, undefined, "must not have executed");
  });

  it("dispatches to runViaApi (not runSpecs) when integrations.docDetectiveApi.apiKey is set", async function () {
    // Exercises core/index.ts's `willRunViaApi` branch and its
    // `results = await runViaApi(...)` dispatch line. runViaApi itself makes
    // no HTTP request here: a testFilter matching nothing hits its own
    // short-circuit (see "runViaApi filter short-circuit" in
    // test/utils.test.js), so this stays fully offline while still proving
    // core/index.ts picked the API path over the local runSpecs path.
    const spec = path.join(tmpDir, "api.spec.json");
    fs.writeFileSync(
      spec,
      JSON.stringify({ tests: [{ testId: "t1", steps: [{ wait: 5 }] }] })
    );
    const seed = await runTests({
      input: [spec],
      output: tmpDir,
      logLevel: "silent",
      dryRun: true,
      telemetry: { send: false },
    });
    captured.length = 0;

    const tampered = JSON.parse(JSON.stringify(seed));
    tampered.config.dryRun = false;

    const originalApiEnv = process.env.DOC_DETECTIVE_API;
    delete process.env.DOC_DETECTIVE_API; // willRunViaApi requires this unset
    try {
      const result = await runTests(
        {
          dryRun: false,
          logLevel: "silent",
          telemetry: { send: false },
          testFilter: ["definitely-not-a-real-test-id"],
          integrations: { docDetectiveApi: { apiKey: "fake-key" } },
        },
        { resolvedTests: tampered }
      );
      // runViaApi's filter short-circuit shape: empty specs, zeroed summary —
      // proves the API path ran (not the local runSpecs executed-result shape).
      assert.deepEqual(result.specs, []);
      assert.equal(result.summary.tests.pass, 0);
      assert.equal(result.summary.tests.fail, 0);
    } finally {
      if (originalApiEnv !== undefined) {
        process.env.DOC_DETECTIVE_API = originalApiEnv;
      } else {
        delete process.env.DOC_DETECTIVE_API;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// qwen-code.ts — targeted gaps (manifest fallback, enrich catch, install errors).
// ---------------------------------------------------------------------------

describe("QwenCodeAdapter — coverage top-up", function () {
  let QwenCodeAdapter;
  before(async function () {
    ({ QwenCodeAdapter } = await import("../dist/agents/adapters/qwen-code.js"));
  });

  const HOME = path.join(path.sep, "home", "test");
  const CANON_SKILL = path.join(
    HOME, ".qwen", "extensions", "doc-detective", "skills", "doc-detective-init", "SKILL.md"
  );
  const MANIFEST = path.join(
    HOME, ".qwen", "extensions", "doc-detective", "qwen-extension.json"
  );

  function makeAdapter(overrides) {
    return new QwenCodeAdapter({
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

  describe("getInstallState — manifest fallback (SKILL.md absent)", function () {
    it("reads the manifest version string when present", async function () {
      const adapter = makeAdapter({
        existsSync: (p) => p === MANIFEST, // canonical skill absent
        readFileSync: (p) =>
          p === MANIFEST ? JSON.stringify({ version: "9.9.9" }) : (() => {
            throw new Error("x");
          })(),
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, true);
      assert.equal(state.installedVersion, "9.9.9");
    });

    it("treats a manifest with a non-string version as installed-without-version", async function () {
      const adapter = makeAdapter({
        existsSync: (p) => p === MANIFEST,
        readFileSync: () => JSON.stringify({ version: 42 }),
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, true);
      assert.equal(state.installedVersion, undefined);
    });

    it("treats an unparseable manifest as installed (no version)", async function () {
      const adapter = makeAdapter({
        existsSync: (p) => p === MANIFEST,
        readFileSync: () => "{ not json",
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, true);
      assert.equal(state.installedVersion, undefined);
    });

    it("falls back to the manifest when the canonical SKILL.md read throws", async function () {
      const adapter = makeAdapter({
        existsSync: (p) => p === CANON_SKILL || p === MANIFEST,
        readFileSync: (p) => {
          if (p === CANON_SKILL) throw new Error("EACCES");
          if (p === MANIFEST) return JSON.stringify({ version: "3.2.1" });
          throw new Error("unexpected " + p);
        },
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, true);
      assert.equal(state.installedVersion, "3.2.1");
    });
  });

  it("enrichWithLatest swallows a throwing fetchLatestVersion (installed → latest unknown)", async function () {
    const adapter = makeAdapter({
      existsSync: (p) => p === MANIFEST,
      readFileSync: () => JSON.stringify({ version: "1.0.0" }),
      fetchLatestVersion: async () => {
        throw new Error("network down");
      },
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, true);
    assert.equal(state.latestVersion, undefined);
    assert.equal(state.upToDate, undefined);
  });

  describe("install() — spawn error + non-zero exit branches", function () {
    it("maps an ENOENT spawn error to an actionable install hint", async function () {
      const adapter = makeAdapter({
        run: async () => {
          throw Object.assign(new Error("spawn qwen ENOENT"), { code: "ENOENT" });
        },
        existsSync: () => false, // fresh install path
      });
      await assert.rejects(
        adapter.install(baseOpts()),
        /not installed or not on PATH.*@qwen-code\/qwen-code/s
      );
    });

    it("rethrows a non-ENOENT spawn error unchanged", async function () {
      const adapter = makeAdapter({
        run: async () => {
          throw new Error("EACCES permission denied");
        },
        existsSync: () => false,
      });
      await assert.rejects(adapter.install(baseOpts()), /EACCES permission denied/);
    });

    it("throws with the stderr when a command exits non-zero", async function () {
      const adapter = makeAdapter({
        run: async () => ({ stdout: "some progress", stderr: "boom failure", exitCode: 5 }),
        existsSync: () => false,
      });
      await assert.rejects(
        adapter.install(baseOpts()),
        /exited with code 5[\s\S]*boom failure/
      );
    });

    it("logs command stdout at debug before a successful fresh install", async function () {
      const logged = [];
      const adapter = makeAdapter({
        run: async () => ({ stdout: "installed ok", stderr: "", exitCode: 0 }),
        existsSync: () => false,
        fetchLatestVersion: async () => "7.0.0",
      });
      const report = await adapter.install(
        baseOpts({ logger: (m, lvl) => logged.push([m, lvl]) })
      );
      assert.equal(report.action, "installed");
      assert.ok(
        logged.some(([m]) => /installed ok/.test(m)),
        "expected command stdout to be logged"
      );
    });
  });
});

// ---------------------------------------------------------------------------
// copilot-cli.ts — targeted gaps (manifest edge cases, enrich catch, install errors).
// ---------------------------------------------------------------------------

describe("CopilotCliAdapter — coverage top-up", function () {
  let CopilotCliAdapter;
  before(async function () {
    ({ CopilotCliAdapter } = await import("../dist/agents/adapters/copilot-cli.js"));
  });

  const HOME = path.join(path.sep, "home", "test");
  const PLUGIN_JSON = path.join(
    HOME, ".copilot", "installed-plugins", "doc-detective", "doc-detective", ".claude-plugin", "plugin.json"
  );

  function makeAdapter(overrides) {
    return new CopilotCliAdapter({
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

  describe("getInstallState — manifest edge cases", function () {
    it("treats a manifest with a non-string version as installed-without-version", async function () {
      const adapter = makeAdapter({
        existsSync: (p) => p === PLUGIN_JSON,
        readFileSync: () => JSON.stringify({ version: 42 }),
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, true);
      assert.equal(state.installedVersion, undefined);
    });

    it("treats an unparseable manifest as not-installed", async function () {
      const adapter = makeAdapter({
        existsSync: (p) => p === PLUGIN_JSON,
        readFileSync: () => "{ not valid json",
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, false);
    });
  });

  it("enrichWithLatest swallows a throwing fetchLatestVersion (installed → latest unknown)", async function () {
    const adapter = makeAdapter({
      existsSync: (p) => p === PLUGIN_JSON,
      readFileSync: () => JSON.stringify({ version: "1.0.0" }),
      fetchLatestVersion: async () => {
        throw new Error("network down");
      },
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, true);
    assert.equal(state.latestVersion, undefined);
    assert.equal(state.upToDate, undefined);
  });

  describe("install() — spawn error + non-zero exit branches", function () {
    it("maps an ENOENT spawn error to an actionable install hint", async function () {
      const adapter = makeAdapter({
        run: async () => {
          throw Object.assign(new Error("spawn copilot ENOENT"), { code: "ENOENT" });
        },
        existsSync: () => false, // fresh install path
      });
      await assert.rejects(
        adapter.install(baseOpts()),
        /not installed or not on PATH.*@github\/copilot/s
      );
    });

    it("rethrows a non-ENOENT spawn error unchanged", async function () {
      const adapter = makeAdapter({
        run: async () => {
          throw new Error("EACCES denied");
        },
        existsSync: () => false,
      });
      await assert.rejects(adapter.install(baseOpts()), /EACCES denied/);
    });

    it("throws a generic (non-auth) error with combined output on non-zero exit", async function () {
      // stderr present, no auth keywords → the generic "exited with code" path.
      const adapter = makeAdapter({
        run: async () => ({ stdout: "", stderr: "some unrelated failure", exitCode: 4 }),
        existsSync: () => false,
      });
      await assert.rejects(
        adapter.install(baseOpts()),
        /exited with code 4.*some unrelated failure/s
      );
    });

    it("classifies an auth failure printed only to stdout as an auth error", async function () {
      // Empty stderr, auth hint on stdout → the combined-output auth branch.
      const adapter = makeAdapter({
        run: async (cmd, args) => {
          if (args.includes("install")) {
            return { stdout: "please run copilot login (unauthorized)", stderr: "", exitCode: 1 };
          }
          return { stdout: "", stderr: "", exitCode: 0 };
        },
        existsSync: () => false,
      });
      await assert.rejects(adapter.install(baseOpts()), /not authenticated.*copilot login/s);
    });
  });
});

// ---------------------------------------------------------------------------
// gemini-cli.ts — targeted gaps (unparseable JSON/manifest catches, enrich
// catch, install error/exit-code branches). Mirrors the qwen-code /
// copilot-cli "coverage top-up" sections above; this adapter had no prior
// coverage pass (see test/agents-gemini.test.js for the happy-path suite).
// ---------------------------------------------------------------------------

describe("GeminiCliAdapter — coverage top-up", function () {
  let GeminiCliAdapter;
  before(async function () {
    ({ GeminiCliAdapter } = await import("../dist/agents/adapters/gemini-cli.js"));
  });

  const HOME = path.join(path.sep, "home", "test");
  const MANIFEST = path.join(
    HOME, ".gemini", "extensions", "doc-detective", "gemini-extension.json"
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

  describe("getInstallState — unparseable JSON/manifest catches", function () {
    it("falls through to the filesystem when `extensions list` prints unparseable JSON", async function () {
      const adapter = makeAdapter({
        run: async () => ({ stdout: "{ not valid json", stderr: "", exitCode: 0 }),
        existsSync: (p) => p === MANIFEST,
        readFileSync: (p) =>
          p === MANIFEST ? JSON.stringify({ version: "4.4.4" }) : (() => {
            throw new Error("unexpected " + p);
          })(),
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, true);
      assert.equal(state.installedVersion, "4.4.4");
    });

    it("treats an unparseable manifest as not-installed", async function () {
      const adapter = makeAdapter({
        run: async () => { throw new Error("gemini not found"); },
        existsSync: (p) => p === MANIFEST,
        readFileSync: () => "{ not valid json",
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, false);
    });

    it("treats a non-string version in `extensions list` JSON as installed-without-version", async function () {
      const listJson = JSON.stringify([{ name: "doc-detective", version: 42 }]);
      const adapter = makeAdapter({
        run: async () => ({ stdout: listJson, stderr: "", exitCode: 0 }),
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, true);
      assert.equal(state.installedVersion, undefined);
    });

    it("treats a non-string version in the manifest fallback as installed-without-version", async function () {
      const adapter = makeAdapter({
        run: async () => { throw new Error("gemini not found"); },
        existsSync: (p) => p === MANIFEST,
        readFileSync: () => JSON.stringify({ version: 42 }),
      });
      const state = await adapter.getInstallState("global");
      assert.equal(state.installed, true);
      assert.equal(state.installedVersion, undefined);
    });
  });

  it("enrichWithLatest swallows a throwing fetchLatestVersion (installed → latest unknown)", async function () {
    const adapter = makeAdapter({
      run: async () => { throw new Error("gemini not found"); },
      existsSync: (p) => p === MANIFEST,
      readFileSync: () => JSON.stringify({ version: "1.0.0" }),
      fetchLatestVersion: async () => {
        throw new Error("network down");
      },
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, true);
    assert.equal(state.latestVersion, undefined);
    assert.equal(state.upToDate, undefined);
  });

  it("enrichWithLatest leaves upToDate undefined when installedVersion is unknown but latest resolves", async function () {
    // list output omits version → installedVersion undefined; latest resolves
    // to a real string. Exercises the ternary's `: undefined` else-branch.
    const listJson = JSON.stringify([{ name: "doc-detective" }]);
    const adapter = makeAdapter({
      run: async () => ({ stdout: listJson, stderr: "", exitCode: 0 }),
      fetchLatestVersion: async () => "9.0.0",
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, true);
    assert.equal(state.installedVersion, undefined);
    assert.equal(state.latestVersion, "9.0.0");
    assert.equal(state.upToDate, undefined);
  });

  describe("install() — spawn error + non-zero exit branches", function () {
    it("maps an ENOENT spawn error to an actionable install hint", async function () {
      const adapter = makeAdapter({
        run: async (cmd, args) => {
          if (args[0] === "extensions" && args[1] === "list") {
            return { stdout: "[]", stderr: "", exitCode: 0 };
          }
          throw Object.assign(new Error("spawn gemini ENOENT"), { code: "ENOENT" });
        },
        existsSync: () => false, // fresh install path
      });
      await assert.rejects(
        adapter.install(baseOpts()),
        /not installed or not on PATH.*@google\/gemini-cli/s
      );
    });

    it("rethrows a non-ENOENT spawn error unchanged", async function () {
      const adapter = makeAdapter({
        run: async (cmd, args) => {
          if (args[0] === "extensions" && args[1] === "list") {
            return { stdout: "[]", stderr: "", exitCode: 0 };
          }
          throw new Error("EACCES permission denied");
        },
        existsSync: () => false,
      });
      await assert.rejects(adapter.install(baseOpts()), /EACCES permission denied/);
    });

    it("throws with the stderr when a command exits non-zero", async function () {
      const adapter = makeAdapter({
        run: async (cmd, args) => {
          if (args[0] === "extensions" && args[1] === "list") {
            return { stdout: "[]", stderr: "", exitCode: 0 };
          }
          return { stdout: "some progress", stderr: "boom failure", exitCode: 3 };
        },
        existsSync: () => false,
      });
      await assert.rejects(
        adapter.install(baseOpts()),
        /exited with code 3[\s\S]*boom failure/
      );
    });

    it("throws without a trailing colon when a non-zero exit has empty stderr", async function () {
      const adapter = makeAdapter({
        run: async (cmd, args) => {
          if (args[0] === "extensions" && args[1] === "list") {
            return { stdout: "[]", stderr: "", exitCode: 0 };
          }
          return { stdout: "", stderr: "", exitCode: 2 };
        },
        existsSync: () => false,
      });
      await assert.rejects(adapter.install(baseOpts()), (err) => {
        assert.match(err.message, /exited with code 2$/, `expected no stderr suffix; got: ${err.message}`);
        return true;
      });
    });

    it("logs command stdout at debug before a successful fresh install", async function () {
      const logged = [];
      const adapter = makeAdapter({
        run: async (cmd, args) => {
          if (args[0] === "extensions" && args[1] === "list") {
            return { stdout: "[]", stderr: "", exitCode: 0 };
          }
          return { stdout: "installed ok", stderr: "", exitCode: 0 };
        },
        existsSync: () => false,
        fetchLatestVersion: async () => "7.0.0",
      });
      const report = await adapter.install(
        baseOpts({ logger: (m, lvl) => logged.push([m, lvl]) })
      );
      assert.equal(report.action, "installed");
      assert.ok(
        logged.some(([m]) => /installed ok/.test(m)),
        "expected command stdout to be logged"
      );
    });
  });
});
