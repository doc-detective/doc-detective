import assert from "node:assert/strict";
import path from "node:path";

describe("GeminiCliAdapter — identity", function () {
  let GeminiCliAdapter;
  before(async function () {
    ({ GeminiCliAdapter } = await import("../dist/agents/adapters/gemini-cli.js"));
  });

  it("has expected id + displayName + scopes", function () {
    const a = new GeminiCliAdapter();
    assert.equal(a.id, "gemini-cli");
    assert.equal(a.displayName, "Gemini CLI");
    assert.deepEqual(a.supportsScopes(), ["global"]);
  });
});

describe("GeminiCliAdapter.detect()", function () {
  let GeminiCliAdapter;
  before(async function () {
    ({ GeminiCliAdapter } = await import("../dist/agents/adapters/gemini-cli.js"));
  });

  function makeAdapter(overrides) {
    return new GeminiCliAdapter({
      run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      existsSync: () => false,
      readFileSync: () => { throw new Error("not stubbed"); },
      homedir: () => "/home/test",
      fetchLatestVersion: async () => undefined,
      ...overrides,
    });
  }

  it("reports onPath=true with version from `gemini --version`", async function () {
    const adapter = makeAdapter({
      run: async (cmd, args) => {
        assert.equal(cmd, "gemini");
        assert.deepEqual(args, ["--version"]);
        return { stdout: "0.8.2", stderr: "", exitCode: 0 };
      },
    });
    const result = await adapter.detect();
    assert.equal(result.onPath, true);
    assert.equal(result.version, "0.8.2");
    assert.equal(result.present, true);
  });

  it("reports present=true via ~/.gemini when binary absent", async function () {
    const geminiHome = path.join("/home/test", ".gemini");
    const adapter = makeAdapter({
      run: async () => { throw new Error("no gemini"); },
      existsSync: (p) => p === geminiHome,
    });
    const result = await adapter.detect();
    assert.equal(result.onPath, false);
    assert.equal(result.present, true);
  });

  it("reports present=false when nothing detectable", async function () {
    const adapter = makeAdapter({
      run: async () => { throw new Error("nope"); },
      existsSync: () => false,
    });
    const result = await adapter.detect();
    assert.equal(result.present, false);
  });
});

describe("GeminiCliAdapter.getInstallState()", function () {
  let GeminiCliAdapter;
  before(async function () {
    ({ GeminiCliAdapter } = await import("../dist/agents/adapters/gemini-cli.js"));
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

  it("reports not-installed when extensions list is empty", async function () {
    const adapter = makeAdapter({
      run: async (cmd, args) => {
        assert.equal(cmd, "gemini");
        assert.deepEqual(args, ["extensions", "list", "--output-format", "json"]);
        return { stdout: "[]", stderr: "", exitCode: 0 };
      },
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, false);
  });

  it("reports installed + version from `extensions list --output-format json`", async function () {
    const listJson = JSON.stringify([
      {
        name: "doc-detective",
        version: "1.3.0",
        isActive: true,
        installMetadata: { source: "https://github.com/doc-detective/agent-tools.git", type: "git", autoUpdate: true },
      },
      { name: "other-ext", version: "0.1.0" },
    ]);
    const adapter = makeAdapter({
      run: async () => ({ stdout: listJson, stderr: "", exitCode: 0 }),
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, true);
    assert.equal(state.installedVersion, "1.3.0");
  });

  it("falls back to reading gemini-extension.json when CLI is unavailable", async function () {
    const adapter = makeAdapter({
      run: async () => { throw new Error("ENOENT"); },
      existsSync: (p) => p === MANIFEST_PATH,
      readFileSync: (p) => {
        if (p === MANIFEST_PATH) return JSON.stringify({ name: "doc-detective", version: "1.2.0" });
        throw new Error("unexpected read");
      },
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, true);
    assert.equal(state.installedVersion, "1.2.0");
  });

  it("marks upToDate when versions match", async function () {
    const listJson = JSON.stringify([{ name: "doc-detective", version: "1.3.0" }]);
    const adapter = makeAdapter({
      run: async () => ({ stdout: listJson, stderr: "", exitCode: 0 }),
      fetchLatestVersion: async () => "1.3.0",
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.upToDate, true);
    assert.equal(state.latestVersion, "1.3.0");
  });

  it("defensively handles non-array JSON output", async function () {
    const adapter = makeAdapter({
      run: async () => ({ stdout: '{"error":"not logged in"}', stderr: "", exitCode: 0 }),
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, false);
  });
});

describe("GeminiCliAdapter.install()", function () {
  let GeminiCliAdapter;
  before(async function () {
    ({ GeminiCliAdapter } = await import("../dist/agents/adapters/gemini-cli.js"));
  });

  function makeSpyAdapter({ listJson = "[]", latest = undefined } = {}) {
    const calls = [];
    const deps = {
      run: async (cmd, args) => {
        calls.push([cmd, ...args]);
        if (args[0] === "extensions" && args[1] === "list") {
          return { stdout: listJson, stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      },
      existsSync: () => false,
      readFileSync: () => { throw new Error("not stubbed"); },
      homedir: () => "/home/test",
      fetchLatestVersion: async () => latest,
    };
    return { adapter: new GeminiCliAdapter(deps), calls };
  }

  const baseOpts = (over = {}) => ({
    scope: "global",
    force: false,
    dryRun: false,
    cwd: "/work/proj",
    logger: () => {},
    ...over,
  });

  const mutating = (c) =>
    c[0] === "gemini" &&
    c[1] === "extensions" &&
    (c[2] === "install" || c[2] === "update");

  it("fresh install runs `extensions install <url> --auto-update --consent --skip-settings`", async function () {
    const { adapter, calls } = makeSpyAdapter({ listJson: "[]" });
    const report = await adapter.install(baseOpts());
    const installs = calls.filter(mutating);
    assert.deepEqual(installs, [
      [
        "gemini", "extensions", "install",
        "https://github.com/doc-detective/agent-tools.git",
        "--auto-update", "--consent", "--skip-settings",
      ],
    ]);
    assert.equal(report.action, "installed");
  });

  it("update path runs `extensions update doc-detective`", async function () {
    const listJson = JSON.stringify([{ name: "doc-detective", version: "1.0.0" }]);
    const { adapter, calls } = makeSpyAdapter({ listJson, latest: "1.1.0" });
    const report = await adapter.install(baseOpts());
    const updates = calls.filter(mutating);
    assert.deepEqual(updates, [["gemini", "extensions", "update", "doc-detective"]]);
    assert.equal(report.action, "updated");
    assert.equal(report.installedVersion, "1.1.0");
  });

  it("returns already-up-to-date when installed version matches remote", async function () {
    const listJson = JSON.stringify([{ name: "doc-detective", version: "2.0.0" }]);
    const { adapter, calls } = makeSpyAdapter({ listJson, latest: "2.0.0" });
    const report = await adapter.install(baseOpts());
    const updates = calls.filter(mutating);
    assert.deepEqual(updates, []);
    assert.equal(report.action, "already-up-to-date");
  });

  it("--force on current install still runs update", async function () {
    const listJson = JSON.stringify([{ name: "doc-detective", version: "2.0.0" }]);
    const { adapter, calls } = makeSpyAdapter({ listJson, latest: "2.0.0" });
    const report = await adapter.install(baseOpts({ force: true }));
    const updates = calls.filter(mutating);
    assert.ok(updates.length > 0);
    assert.equal(report.action, "forced");
  });

  it("--dry-run logs planned command and performs no spawns", async function () {
    const { adapter, calls } = makeSpyAdapter({ listJson: "[]" });
    const logged = [];
    const report = await adapter.install(baseOpts({ dryRun: true, logger: (m) => logged.push(m) }));
    const muts = calls.filter(mutating);
    assert.deepEqual(muts, []);
    assert.equal(report.action, "dry-run");
    assert.ok(
      logged.some((l) => /extensions install.*agent-tools/.test(l)),
      `expected logged install command; got: ${JSON.stringify(logged)}`
    );
  });
});
