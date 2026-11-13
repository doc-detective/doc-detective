import assert from "node:assert/strict";

// ADR 01164: `install agents` reads agent-tools at the ref pinned to the CLI's
// major (AGENT_TOOLS_REF), never the default branch.
describe("agent-tools ref pin (AGENT_TOOLS_REF)", function () {
  let AGENT_TOOLS_REF;
  let fetchAgentToolsZip;
  before(async function () {
    ({ AGENT_TOOLS_REF, fetchAgentToolsZip } = await import("../dist/agents/fetcher.js"));
  });

  // The only assertion on the ref's value; every other agent test reads the
  // constant. CLI 5 pins agent-tools' floating v2 tag, which agent-tools'
  // release moves to each 2.x release.
  it("is agent-tools' v2 tag", function () {
    assert.equal(AGENT_TOOLS_REF, "v2");
  });

  it("fetchAgentToolsZip defaults to the pinned ref", async function () {
    let url;
    await assert.rejects(
      fetchAgentToolsZip(undefined, {
        get: async (u) => { url = u; throw new Error("stop"); },
      })
    );
    assert.equal(url, `https://codeload.github.com/doc-detective/agent-tools/zip/${AGENT_TOOLS_REF}`);
  });

  describe("every adapter's latest-version check reads the pinned ref", function () {
    let axios;
    let origGet;
    let urls;
    before(async function () {
      axios = (await import("axios")).default;
    });
    beforeEach(function () {
      origGet = axios.get;
      urls = [];
      axios.get = async (url) => { urls.push(url); return { data: "" }; };
    });
    afterEach(function () {
      axios.get = origGet;
    });

    for (const [file, factory] of [
      ["claude-code", "defaultClaudeCodeDeps"],
      ["codex", "defaultCodexDeps"],
      ["copilot-cli", "defaultCopilotCliDeps"],
      ["gemini-cli", "defaultGeminiCliDeps"],
      ["opencode", "defaultOpenCodeDeps"],
      ["qwen-code", "defaultQwenCodeDeps"],
    ]) {
      it(file, async function () {
        const mod = await import(`../dist/agents/adapters/${file}.js`);
        await mod[factory]().fetchLatestVersion().catch(() => {});
        assert.equal(urls.length, 1);
        const prefix = `https://raw.githubusercontent.com/doc-detective/agent-tools/${AGENT_TOOLS_REF}/`;
        assert.ok(urls[0].startsWith(prefix), `${urls[0]} should start with ${prefix}`);
      });
    }
  });

  for (const [file, cls] of [
    ["codex", "CodexAdapter"],
    ["opencode", "OpenCodeAdapter"],
  ]) {
    it(`${cls} installs from the pinned ref`, async function () {
      const mod = await import(`../dist/agents/adapters/${file}.js`);
      const factory = Object.keys(mod).find((k) => /^default\w*Deps$/.test(k));
      let ref;
      const adapter = new mod[cls]({
        ...mod[factory](),
        existsSync: () => false,
        fetchLatestVersion: async () => undefined,
        fetchZip: async (r) => { ref = r; throw new Error("stop"); },
      });
      await assert.rejects(
        adapter.install({ scope: "global", force: true, dryRun: false, cwd: process.cwd(), logger: () => {} })
      );
      assert.equal(ref, AGENT_TOOLS_REF);
    });
  }
});
