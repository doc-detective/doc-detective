import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import AdmZip from "adm-zip";

describe("fetchAgentToolsZip", function () {
  let fetchAgentToolsZip;

  before(async function () {
    ({ fetchAgentToolsZip } = await import("../dist/agents/fetcher.js"));
  });

  /**
   * Build an in-memory zip that mimics GitHub's codeload output: the archive
   * root is wrapped in a single directory named `agent-tools-<ref>/`.
   */
  function buildFakeZipBuffer(ref = "main") {
    const zip = new AdmZip();
    const prefix = `agent-tools-${ref}/`;
    zip.addFile(prefix + "README.md", Buffer.from("# agent-tools"));
    zip.addFile(
      prefix + "skills/doc-detective-init/SKILL.md",
      Buffer.from("---\nname: doc-detective-init\nmetadata:\n  version: '1.3.0'\n---\nbody\n")
    );
    zip.addFile(
      prefix + "skills/doc-detective-init/scripts/helper.sh",
      Buffer.from("#!/bin/sh\necho hi\n")
    );
    return zip.toBuffer();
  }

  it("downloads the zip via the injected `get` and extracts with wrapper stripped", async function () {
    const zipBuf = buildFakeZipBuffer("main");
    let requestedUrl;
    const result = await fetchAgentToolsZip("main", {
      get: async (url, opts) => {
        requestedUrl = url;
        assert.equal(opts?.responseType, "arraybuffer");
        return { data: zipBuf };
      },
    });
    try {
      assert.match(requestedUrl, /codeload\.github\.com\/doc-detective\/agent-tools\/zip\/main$/);
      assert.equal(fs.existsSync(result.tempDir), true);
      // Top-level `agent-tools-main/` must have been stripped — skills/ at the root.
      assert.equal(
        fs.existsSync(path.join(result.tempDir, "skills", "doc-detective-init", "SKILL.md")),
        true,
        `expected skills/doc-detective-init/SKILL.md at tempDir root; tempDir contents: ${fs.readdirSync(result.tempDir).join(", ")}`
      );
      const contents = fs.readFileSync(
        path.join(result.tempDir, "skills", "doc-detective-init", "SKILL.md"),
        "utf8"
      );
      assert.match(contents, /name: doc-detective-init/);
      assert.equal(result.ref, "main");
    } finally {
      try { fs.rmSync(result.tempDir, { recursive: true, force: true }); } catch {}
    }
  });

  it("supports arbitrary refs (branches/tags)", async function () {
    const zipBuf = buildFakeZipBuffer("v2.0.0");
    let requestedUrl;
    const result = await fetchAgentToolsZip("v2.0.0", {
      get: async (url) => {
        requestedUrl = url;
        return { data: zipBuf };
      },
    });
    try {
      assert.match(requestedUrl, /\/zip\/v2\.0\.0$/);
      assert.equal(result.ref, "v2.0.0");
    } finally {
      try { fs.rmSync(result.tempDir, { recursive: true, force: true }); } catch {}
    }
  });

  it("rejects when axios fails", async function () {
    await assert.rejects(
      fetchAgentToolsZip("main", {
        get: async () => { throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }); },
      }),
      /ENOTFOUND|fetch|network|download/i
    );
  });

  it("rejects zip entries that escape the extraction root (Zip Slip guard)", async function () {
    // Construct a zip where an entry's path traverses outside the root.
    // adm-zip normalizes traversal in addFile(), so we set entryName directly
    // after the fact to simulate a malicious zip built by a lower-level tool.
    const zip = new AdmZip();
    zip.addFile("agent-tools-main/ok.txt", Buffer.from("ok"));
    zip.addFile("placeholder.txt", Buffer.from("pwned"));
    const entries = zip.getEntries();
    entries[entries.length - 1].entryName = "../evil.txt";
    const zipBuf = zip.toBuffer();

    await assert.rejects(
      fetchAgentToolsZip("main", { get: async () => ({ data: zipBuf }) }),
      /outside|extraction|refus/i
    );
  });
});

describe("CodexAdapter — identity", function () {
  let CodexAdapter;
  before(async function () {
    ({ CodexAdapter } = await import("../dist/agents/adapters/codex.js"));
  });

  it("has expected id + displayName + scopes", function () {
    const a = new CodexAdapter();
    assert.equal(a.id, "codex");
    assert.equal(a.displayName, "Codex");
    assert.deepEqual(a.supportsScopes().sort(), ["global", "project"]);
  });
});

describe("CodexAdapter.detect()", function () {
  let CodexAdapter;
  before(async function () {
    ({ CodexAdapter } = await import("../dist/agents/adapters/codex.js"));
  });

  function makeAdapter(overrides) {
    return new CodexAdapter({
      run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      existsSync: () => false,
      readFileSync: () => { throw new Error("not stubbed"); },
      homedir: () => "/home/test",
      cwd: () => "/work/proj",
      fetchLatestVersion: async () => undefined,
      fetchZip: async () => { throw new Error("not stubbed"); },
      ...overrides,
    });
  }

  it("reports onPath=true when `codex --version` succeeds", async function () {
    const adapter = makeAdapter({
      run: async (cmd, args) => {
        assert.equal(cmd, "codex");
        assert.deepEqual(args, ["--version"]);
        return { stdout: "codex 0.6.0", stderr: "", exitCode: 0 };
      },
    });
    const r = await adapter.detect();
    assert.equal(r.onPath, true);
    assert.equal(r.version, "codex 0.6.0");
    assert.equal(r.present, true);
  });

  it("reports present=true via ~/.codex when binary absent", async function () {
    const codexHome = path.join("/home/test", ".codex");
    const adapter = makeAdapter({
      run: async () => { throw new Error("ENOENT"); },
      existsSync: (p) => p === codexHome,
    });
    const r = await adapter.detect();
    assert.equal(r.onPath, false);
    assert.equal(r.present, true);
  });

  it("reports present=false when nothing detectable", async function () {
    const adapter = makeAdapter({
      run: async () => { throw new Error("no codex"); },
      existsSync: () => false,
    });
    const r = await adapter.detect();
    assert.equal(r.present, false);
  });
});

describe("CodexAdapter.getInstallState()", function () {
  let CodexAdapter;
  before(async function () {
    ({ CodexAdapter } = await import("../dist/agents/adapters/codex.js"));
  });

  const GLOBAL_CANON_SKILL = path.join(
    "/home/test", ".agents", "skills", "doc-detective-init", "SKILL.md"
  );
  const PROJECT_CANON_SKILL = path.join(
    "/work/proj", ".agents", "skills", "doc-detective-init", "SKILL.md"
  );
  const SKILL_CONTENT = (v) =>
    `---\nname: doc-detective-init\ndescription: init\nmetadata:\n  version: '${v}'\n---\nbody\n`;

  function makeAdapter(overrides) {
    return new CodexAdapter({
      run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      existsSync: () => false,
      readFileSync: () => { throw new Error("not stubbed"); },
      homedir: () => "/home/test",
      cwd: () => "/work/proj",
      fetchLatestVersion: async () => undefined,
      fetchZip: async () => { throw new Error("not stubbed"); },
      ...overrides,
    });
  }

  it("reports not-installed when the canonical SKILL.md is absent", async function () {
    const adapter = makeAdapter({ existsSync: () => false });
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, false);
  });

  it("reads metadata.version from the YAML frontmatter of doc-detective-init/SKILL.md (global scope)", async function () {
    const adapter = makeAdapter({
      existsSync: (p) => p === GLOBAL_CANON_SKILL,
      readFileSync: (p) => {
        if (p === GLOBAL_CANON_SKILL) return SKILL_CONTENT("1.3.0");
        throw new Error("unexpected");
      },
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.installed, true);
    assert.equal(state.installedVersion, "1.3.0");
  });

  it("reads from ./.agents/skills/... for project scope", async function () {
    const adapter = makeAdapter({
      existsSync: (p) => p === PROJECT_CANON_SKILL,
      readFileSync: (p) => p === PROJECT_CANON_SKILL
        ? SKILL_CONTENT("1.2.0")
        : (() => { throw new Error("unexpected"); })(),
    });
    const state = await adapter.getInstallState("project");
    assert.equal(state.installedVersion, "1.2.0");
  });

  it("marks upToDate=true when versions match", async function () {
    const adapter = makeAdapter({
      existsSync: (p) => p === GLOBAL_CANON_SKILL,
      readFileSync: () => SKILL_CONTENT("1.3.0"),
      fetchLatestVersion: async () => "1.3.0",
    });
    const state = await adapter.getInstallState("global");
    assert.equal(state.upToDate, true);
    assert.equal(state.latestVersion, "1.3.0");
  });

  it("handles corrupt frontmatter (no version) gracefully", async function () {
    const adapter = makeAdapter({
      existsSync: (p) => p === GLOBAL_CANON_SKILL,
      readFileSync: () => "no frontmatter here",
    });
    const state = await adapter.getInstallState("global");
    // Present on disk but no parseable version.
    assert.equal(state.installed, true);
    assert.equal(state.installedVersion, undefined);
  });
});

describe("CodexAdapter.install() — fetch + copy skills into .agents/skills/", function () {
  let CodexAdapter;
  let sourceRoot;   // fake extracted tarball
  let targetHome;   // fake home dir where .agents/skills/ will be written
  let projectRoot;  // fake project dir

  const SKILL_SRC = (name, version) =>
    `---\nname: ${name}\ndescription: a test skill\nmetadata:\n  version: '${version}'\n---\nbody of ${name}\n`;

  before(async function () {
    ({ CodexAdapter } = await import("../dist/agents/adapters/codex.js"));
  });

  beforeEach(function () {
    sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-codex-src-"));
    targetHome = fs.mkdtempSync(path.join(os.tmpdir(), "dd-codex-home-"));
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-codex-proj-"));
    // Populate three doc-detective-* skills + one unrelated skill in source
    const skillsDir = path.join(sourceRoot, "skills");
    fs.mkdirSync(skillsDir, { recursive: true });
    for (const name of ["doc-detective-init", "doc-detective-test", "doc-detective-generate"]) {
      fs.mkdirSync(path.join(skillsDir, name), { recursive: true });
      fs.writeFileSync(path.join(skillsDir, name, "SKILL.md"), SKILL_SRC(name, "1.3.0"));
    }
    // Also a non-doc-detective skill — we should NOT copy this.
    fs.mkdirSync(path.join(skillsDir, "other-skill"), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, "other-skill", "SKILL.md"), SKILL_SRC("other-skill", "9.9.9"));
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
    fetchZip,
  } = {}) {
    let fetchZipCalled = 0;
    const defaultFetchZip = async (ref) => {
      fetchZipCalled++;
      // Point at our pre-built sourceRoot and mark it as NOT owned so the
      // adapter doesn't wipe the test fixture on cleanup.
      return { tempDir: sourceRoot, ref, owned: false };
    };
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
      fetchZip: fetchZip ?? defaultFetchZip,
    };
    const adapter = new CodexAdapter(deps);
    return { adapter, counts: { fetchZip: () => fetchZipCalled } };
  }

  const baseOpts = (over = {}) => ({
    scope: "global",
    force: false,
    dryRun: false,
    cwd: projectRoot,
    logger: () => {},
    ...over,
  });

  it("fresh install copies only doc-detective-* skills into ~/.agents/skills/", async function () {
    const { adapter } = makeAdapter();
    const report = await adapter.install(baseOpts({ scope: "global" }));
    const target = path.join(targetHome, ".agents", "skills");

    for (const name of ["doc-detective-init", "doc-detective-test", "doc-detective-generate"]) {
      const skillFile = path.join(target, name, "SKILL.md");
      assert.equal(fs.existsSync(skillFile), true, `expected ${skillFile} to exist`);
      const body = fs.readFileSync(skillFile, "utf8");
      assert.match(body, new RegExp(`name: ${name}`));
    }
    // Unrelated skill NOT copied
    assert.equal(
      fs.existsSync(path.join(target, "other-skill", "SKILL.md")),
      false,
      "adapter must not touch unrelated skills"
    );
    assert.equal(report.action, "installed");
    assert.equal(report.installedVersion, "1.3.0");
  });

  it("preserves unrelated skills already in the target dir", async function () {
    const target = path.join(targetHome, ".agents", "skills");
    const usersSkillDir = path.join(target, "my-personal-skill");
    fs.mkdirSync(usersSkillDir, { recursive: true });
    fs.writeFileSync(path.join(usersSkillDir, "SKILL.md"), "---\nname: my-personal-skill\n---\nmine\n");

    const { adapter } = makeAdapter();
    await adapter.install(baseOpts({ scope: "global" }));

    // User's skill is still there
    assert.equal(fs.existsSync(path.join(usersSkillDir, "SKILL.md")), true);
  });

  it("installs into ./.agents/skills/ for project scope", async function () {
    const { adapter } = makeAdapter();
    await adapter.install(baseOpts({ scope: "project" }));
    const skillFile = path.join(projectRoot, ".agents", "skills", "doc-detective-init", "SKILL.md");
    assert.equal(fs.existsSync(skillFile), true);
    // Global target NOT touched
    assert.equal(
      fs.existsSync(path.join(targetHome, ".agents", "skills", "doc-detective-init", "SKILL.md")),
      false
    );
  });

  it("is idempotent — re-run with same version returns already-up-to-date", async function () {
    const { adapter, counts } = makeAdapter({ fetchLatestVersion: async () => "1.3.0" });
    const first = await adapter.install(baseOpts());
    assert.equal(first.action, "installed");
    assert.equal(counts.fetchZip(), 1);

    // Second run: getInstallState finds the skill and matches latest — no fetch needed.
    const second = await adapter.install(baseOpts());
    assert.equal(second.action, "already-up-to-date");
    // A second fetch is NOT expected (we short-circuited).
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
    const report = await adapter.install(
      baseOpts({ dryRun: true, logger: (m) => logged.push(m) })
    );
    assert.equal(counts.fetchZip(), 0, "dry-run must not fetch");
    assert.equal(
      fs.existsSync(path.join(targetHome, ".agents", "skills", "doc-detective-init")),
      false
    );
    assert.equal(report.action, "dry-run");
    assert.ok(
      logged.some((l) => /doc-detective-|skills/.test(l)),
      `expected a log mentioning skills; got: ${JSON.stringify(logged)}`
    );
  });

  it("surfaces a network-hint error when fetchZip fails", async function () {
    const { adapter } = makeAdapter({
      fetchZip: async () => { throw new Error("ENOTFOUND codeload.github.com"); },
    });
    await assert.rejects(
      adapter.install(baseOpts()),
      /ENOTFOUND|network|fetch|github/i
    );
  });

  it("treats latest-version probe failure as already-up-to-date when installed (avoids re-fetch on offline re-runs)", async function () {
    // First: fresh install with a known latest version.
    const { adapter, counts } = makeAdapter({ fetchLatestVersion: async () => "1.3.0" });
    await adapter.install(baseOpts());
    assert.equal(counts.fetchZip(), 1);

    // Second run: simulate offline / GitHub unreachable. Without the
    // "latestUnknown → up-to-date" short-circuit this would re-fetch.
    adapter.depsRef.fetchLatestVersion = async () => { throw new Error("ENOTFOUND"); };
    const logged = [];
    const offline = await adapter.install(baseOpts({ logger: (m) => logged.push(m) }));
    assert.equal(offline.action, "already-up-to-date");
    assert.equal(counts.fetchZip(), 1, "must not re-fetch when latest version is unknown");
    assert.ok(
      logged.some((l) => /latest.*(?:version|codex)/i.test(l)),
      `expected a log explaining the latest-version probe failure; got: ${JSON.stringify(logged)}`
    );
  });
});
