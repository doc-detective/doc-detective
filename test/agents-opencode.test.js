import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

describe("OpenCodeAdapter — identity", function () {
  let OpenCodeAdapter;
  before(async function () {
    ({ OpenCodeAdapter } = await import("../dist/agents/adapters/opencode.js"));
  });

  it("has expected id + displayName + scopes", function () {
    const a = new OpenCodeAdapter();
    assert.equal(a.id, "opencode");
    assert.equal(a.displayName, "OpenCode");
    assert.deepEqual(a.supportsScopes().sort(), ["global", "project"]);
  });
});

describe("OpenCodeAdapter.detect()", function () {
  let OpenCodeAdapter;
  before(async function () {
    ({ OpenCodeAdapter } = await import("../dist/agents/adapters/opencode.js"));
  });

  function makeAdapter(overrides) {
    return new OpenCodeAdapter({
      run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      existsSync: () => false,
      readFileSync: () => { throw new Error("not stubbed"); },
      readdirSync: () => [],
      mkdirSync: () => {},
      writeFileSync: () => {},
      rmSync: () => {},
      homedir: () => "/home/test",
      cwd: () => "/work/proj",
      fetchLatestVersion: async () => undefined,
      fetchZip: async () => { throw new Error("not stubbed"); },
      ...overrides,
    });
  }

  it("reports onPath=true with version from `opencode --version`", async function () {
    const adapter = makeAdapter({
      run: async (cmd, args) => {
        assert.equal(cmd, "opencode");
        assert.deepEqual(args, ["--version"]);
        return { stdout: "0.5.1", stderr: "", exitCode: 0 };
      },
    });
    const r = await adapter.detect();
    assert.equal(r.onPath, true);
    assert.equal(r.version, "0.5.1");
    assert.equal(r.present, true);
  });

  it("reports present=true via ~/.config/opencode when binary absent", async function () {
    const configDir = path.join("/home/test", ".config", "opencode");
    const adapter = makeAdapter({
      run: async () => { throw new Error("ENOENT"); },
      existsSync: (p) => p === configDir,
    });
    const r = await adapter.detect();
    assert.equal(r.onPath, false);
    assert.equal(r.present, true);
  });

  it("reports present=true via ~/.opencode (install dir) when binary absent", async function () {
    const installDir = path.join("/home/test", ".opencode");
    const adapter = makeAdapter({
      run: async () => { throw new Error("ENOENT"); },
      existsSync: (p) => p === installDir,
    });
    const r = await adapter.detect();
    assert.equal(r.present, true);
  });

  it("reports present=false when nothing detectable", async function () {
    const adapter = makeAdapter({
      run: async () => { throw new Error("no opencode"); },
      existsSync: () => false,
    });
    const r = await adapter.detect();
    assert.equal(r.present, false);
  });
});

describe("OpenCodeAdapter.getInstallState()", function () {
  let OpenCodeAdapter;
  before(async function () {
    ({ OpenCodeAdapter } = await import("../dist/agents/adapters/opencode.js"));
  });

  const GLOBAL_SKILL = path.join(
    "/home/test", ".config", "opencode", "skills", "doc-detective-init", "SKILL.md"
  );
  const PROJECT_SKILL = path.join(
    "/work/proj", ".opencode", "skills", "doc-detective-init", "SKILL.md"
  );
  const SKILL_CONTENT = (v) =>
    `---\nname: doc-detective-init\ndescription: init\nmetadata:\n  version: '${v}'\n---\nbody\n`;

  function makeAdapter(overrides) {
    return new OpenCodeAdapter({
      run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      existsSync: () => false,
      readFileSync: () => { throw new Error("not stubbed"); },
      readdirSync: () => [],
      mkdirSync: () => {},
      writeFileSync: () => {},
      rmSync: () => {},
      homedir: () => "/home/test",
      cwd: () => "/work/proj",
      fetchLatestVersion: async () => undefined,
      fetchZip: async () => { throw new Error("not stubbed"); },
      ...overrides,
    });
  }

  it("reports not-installed when the canonical SKILL.md is absent", async function () {
    const state = await makeAdapter({ existsSync: () => false }).getInstallState("global");
    assert.equal(state.installed, false);
  });

  it("reads version from ~/.config/opencode/skills/... for global scope", async function () {
    const adapter = makeAdapter({
      existsSync: (p) => p === GLOBAL_SKILL,
      readFileSync: (p) => p === GLOBAL_SKILL ? SKILL_CONTENT("1.3.0") : (() => { throw new Error("unexpected"); })(),
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, true);
    assert.equal(state.installedVersion, "1.3.0");
  });

  it("reads from ./.opencode/skills/... for project scope", async function () {
    const adapter = makeAdapter({
      existsSync: (p) => p === PROJECT_SKILL,
      readFileSync: (p) => p === PROJECT_SKILL ? SKILL_CONTENT("1.2.0") : (() => { throw new Error("unexpected"); })(),
    });
    const state = await adapter.getInstallState("project");
    assert.equal(state.installedVersion, "1.2.0");
  });

  it("marks upToDate=true when versions match", async function () {
    const adapter = makeAdapter({
      existsSync: (p) => p === GLOBAL_SKILL,
      readFileSync: () => SKILL_CONTENT("1.3.0"),
      fetchLatestVersion: async () => "1.3.0",
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.upToDate, true);
  });
});

describe("OpenCodeAdapter.install() — fetch + copy skills/plugins/hooks/agents", function () {
  let OpenCodeAdapter;
  let sourceRoot;
  let targetHome;
  let projectRoot;

  const SKILL_SRC = (name, version) =>
    `---\nname: ${name}\ndescription: test\nmetadata:\n  version: '${version}'\n---\nbody of ${name}\n`;

  before(async function () {
    ({ OpenCodeAdapter } = await import("../dist/agents/adapters/opencode.js"));
  });

  beforeEach(function () {
    sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-oc-src-"));
    targetHome = fs.mkdtempSync(path.join(os.tmpdir(), "dd-oc-home-"));
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-oc-proj-"));

    // Mirror the agent-tools layout under plugins/doc-detective/
    const pluginDir = path.join(sourceRoot, "plugins", "doc-detective");
    fs.mkdirSync(pluginDir, { recursive: true });

    // plugin file
    fs.writeFileSync(
      path.join(pluginDir, "opencode-plugin.mjs"),
      `export default async (ctx) => ({ "tool.execute.before": () => {} });\n`
    );

    // skills (doc-detective-* + one unrelated)
    const skillsDir = path.join(pluginDir, "skills");
    fs.mkdirSync(skillsDir, { recursive: true });
    for (const name of ["doc-detective-init", "doc-detective-test", "doc-detective-generate"]) {
      fs.mkdirSync(path.join(skillsDir, name), { recursive: true });
      fs.writeFileSync(path.join(skillsDir, name, "SKILL.md"), SKILL_SRC(name, "1.3.0"));
    }
    fs.mkdirSync(path.join(skillsDir, "other-skill"), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, "other-skill", "SKILL.md"), SKILL_SRC("other-skill", "9.9.9"));

    // hooks/scripts
    const hooksScripts = path.join(pluginDir, "hooks", "scripts");
    fs.mkdirSync(hooksScripts, { recursive: true });
    fs.writeFileSync(path.join(hooksScripts, "doc-detective-before.js"), "// before hook\n");
    fs.writeFileSync(path.join(hooksScripts, "doc-detective-after.js"), "// after hook\n");

    // agents
    const agentsDir = path.join(pluginDir, "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, "doc-detective.md"), "# Doc Detective agent\n");
  });

  afterEach(function () {
    for (const d of [sourceRoot, targetHome, projectRoot]) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
    }
  });

  function makeAdapter({
    homedir = targetHome,
    cwd = projectRoot,
    fetchLatestVersion = async () => undefined,
  } = {}) {
    let fetchZipCalled = 0;
    const deps = {
      run: async () => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); },
      existsSync: fs.existsSync,
      readFileSync: (p, enc = "utf8") => fs.readFileSync(p, enc),
      readdirSync: (p) => fs.readdirSync(p),
      mkdirSync: (p, opts) => fs.mkdirSync(p, opts),
      writeFileSync: (p, data) => fs.writeFileSync(p, data),
      rmSync: (p, opts) => fs.rmSync(p, opts),
      homedir: () => homedir,
      cwd: () => cwd,
      fetchLatestVersion,
      fetchZip: async (ref) => {
        fetchZipCalled++;
        return { tempDir: sourceRoot, ref, owned: false };
      },
    };
    return { adapter: new OpenCodeAdapter(deps), counts: { fetchZip: () => fetchZipCalled } };
  }

  const baseOpts = (over = {}) => ({
    scope: "global",
    force: false,
    dryRun: false,
    cwd: projectRoot,
    logger: () => {},
    ...over,
  });

  function globalScope() {
    return path.join(targetHome, ".config", "opencode");
  }
  function projectScope() {
    return path.join(projectRoot, ".opencode");
  }

  it("copies doc-detective-* skills, plugin file, hooks, and agents into ~/.config/opencode/", async function () {
    const { adapter } = makeAdapter();
    const report = await adapter.install(baseOpts({ scope: "global" }));

    const root = globalScope();
    // Skills
    for (const name of ["doc-detective-init", "doc-detective-test", "doc-detective-generate"]) {
      assert.equal(fs.existsSync(path.join(root, "skills", name, "SKILL.md")), true, name);
    }
    // Unrelated skill NOT copied
    assert.equal(fs.existsSync(path.join(root, "skills", "other-skill", "SKILL.md")), false);
    // Plugin file
    assert.equal(fs.existsSync(path.join(root, "plugins", "opencode-plugin.mjs")), true);
    // Hooks
    assert.equal(fs.existsSync(path.join(root, "hooks", "scripts", "doc-detective-before.js")), true);
    assert.equal(fs.existsSync(path.join(root, "hooks", "scripts", "doc-detective-after.js")), true);
    // Agents
    assert.equal(fs.existsSync(path.join(root, "agents", "doc-detective.md")), true);

    assert.equal(report.action, "installed");
    assert.equal(report.installedVersion, "1.3.0");
  });

  it("installs into ./.opencode/ for project scope", async function () {
    const { adapter } = makeAdapter();
    await adapter.install(baseOpts({ scope: "project" }));

    assert.equal(
      fs.existsSync(path.join(projectScope(), "skills", "doc-detective-init", "SKILL.md")),
      true
    );
    assert.equal(
      fs.existsSync(path.join(projectScope(), "plugins", "opencode-plugin.mjs")),
      true
    );
    // Global NOT touched
    assert.equal(fs.existsSync(globalScope()), false);
  });

  it("preserves unrelated skills already in the target dir", async function () {
    const root = globalScope();
    const usersSkillDir = path.join(root, "skills", "my-personal-skill");
    fs.mkdirSync(usersSkillDir, { recursive: true });
    fs.writeFileSync(path.join(usersSkillDir, "SKILL.md"), "---\nname: my-personal-skill\n---\nmine\n");

    const { adapter } = makeAdapter();
    await adapter.install(baseOpts({ scope: "global" }));

    // User's skill is still there
    assert.equal(fs.existsSync(path.join(usersSkillDir, "SKILL.md")), true);
    // Our skills landed too
    assert.equal(fs.existsSync(path.join(root, "skills", "doc-detective-init", "SKILL.md")), true);
  });

  it("is idempotent — re-run with same version returns already-up-to-date", async function () {
    const { adapter, counts } = makeAdapter({ fetchLatestVersion: async () => "1.3.0" });
    const first = await adapter.install(baseOpts());
    assert.equal(first.action, "installed");
    assert.equal(counts.fetchZip(), 1);

    const second = await adapter.install(baseOpts());
    assert.equal(second.action, "already-up-to-date");
    assert.equal(counts.fetchZip(), 1, "must not re-fetch when already up to date");
  });

  it("--force re-fetches and re-copies", async function () {
    const { adapter, counts } = makeAdapter({ fetchLatestVersion: async () => "1.3.0" });
    await adapter.install(baseOpts());
    const report = await adapter.install(baseOpts({ force: true }));
    assert.equal(counts.fetchZip(), 2);
    assert.equal(report.action, "forced");
  });

  it("--dry-run does not fetch or write anything", async function () {
    const { adapter, counts } = makeAdapter();
    const logged = [];
    const report = await adapter.install(baseOpts({ dryRun: true, logger: (m) => logged.push(m) }));
    assert.equal(counts.fetchZip(), 0);
    assert.equal(fs.existsSync(globalScope()), false);
    assert.equal(report.action, "dry-run");
    assert.ok(
      logged.some((l) => /doc-detective|skills|plugin|hooks/i.test(l)),
      `expected a log mentioning what would be copied; got: ${JSON.stringify(logged)}`
    );
  });

  it("surfaces a network-hint error when fetchZip fails", async function () {
    const { adapter } = makeAdapter();
    adapter.deps = Object.assign({}, adapter.deps, {
      fetchZip: async () => { throw new Error("ENOTFOUND codeload.github.com"); },
    });
    await assert.rejects(
      adapter.install(baseOpts()),
      /ENOTFOUND|network|fetch|github/i
    );
  });
});
