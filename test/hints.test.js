// Tests for the post-run hints system.
//
// Imports from the compiled output (`dist/hints/...`), matching the
// pattern used by `test/utils.test.js`. Re-run `npm run compile` after
// editing any `src/hints/*.ts` file before running these tests.

import { renderMarkdown, supportsOsc8 } from "../dist/hints/render.js";
import {
  buildHintContext,
  parseOriginUrl,
  readGitOriginUrl,
  detectDocDetectiveWorkflow,
  walkResults,
  readNpmScripts,
  detectOutputDirGitignored,
  gitignoreCovers,
  parseNodeMajor,
  detectMdxRstFiles,
} from "../dist/hints/context.js";
import { maybeShowHint, pickByPriority } from "../dist/hints/index.js";
import { HINTS } from "../dist/hints/hints.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const CLI = path.join(REPO_ROOT, "bin", "doc-detective.js");

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

// Create an isolated tmpdir for fixture filesystems used by context tests.
// Each describe block that needs one creates its own to avoid cross-talk.
function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dd-hints-"));
}

function rmTmpDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

describe("hints/render", function () {
  describe("renderMarkdown", function () {
    it("renders **bold** with the SGR bold code and a reset", function () {
      const out = renderMarkdown("hello **world** end", { osc8: false });
      expect(out).to.include("\x1b[1mworld\x1b[0m");
      expect(out).to.include("hello ");
      expect(out).to.include(" end");
    });

    it("renders _italic_ with the SGR italic code", function () {
      const out = renderMarkdown("an _italic_ word", { osc8: false });
      expect(out).to.include("\x1b[3mitalic\x1b[0m");
    });

    it("does not treat snake_case as italic", function () {
      const out = renderMarkdown("call my_helper_function here", { osc8: false });
      expect(out).to.equal("call my_helper_function here");
    });

    it("renders `inline code` in cyan", function () {
      const out = renderMarkdown("run `npm test` now", { osc8: false });
      expect(out).to.include("\x1b[36mnpm test\x1b[0m");
    });

    it("does not interpret markdown inside inline code", function () {
      // The asterisks inside backticks must not become bold.
      const out = renderMarkdown("use `**not bold**` here", { osc8: false });
      expect(out).to.include("\x1b[36m**not bold**\x1b[0m");
      expect(out).to.not.include("\x1b[1m");
    });

    it("renders fenced code blocks with each line indented and cyan", function () {
      const md = "before\n```\nline-one\nline-two\n```\nafter";
      const out = renderMarkdown(md, { osc8: false });
      const lines = out.split("\n");
      expect(lines[0]).to.equal("before");
      expect(lines[1]).to.equal(`  \x1b[36mline-one\x1b[0m`);
      expect(lines[2]).to.equal(`  \x1b[36mline-two\x1b[0m`);
      expect(lines[3]).to.equal("after");
    });

    it("renders [text](url) as text (cyan url) when osc8 is false", function () {
      const out = renderMarkdown("see [the docs](https://x.example) ok", {
        osc8: false,
      });
      expect(out).to.include("the docs (\x1b[36mhttps://x.example\x1b[0m)");
    });

    it("renders [text](url) as an OSC 8 hyperlink when osc8 is true", function () {
      const out = renderMarkdown("see [the docs](https://x.example) ok", {
        osc8: true,
      });
      expect(out).to.include(
        "\x1b]8;;https://x.example\x07the docs\x1b]8;;\x07"
      );
    });

    it("renders '- ' and '* ' list items as bulleted lines", function () {
      const md = "- first\n* second";
      const out = renderMarkdown(md, { osc8: false });
      const lines = out.split("\n");
      expect(lines[0]).to.equal("  • first");
      expect(lines[1]).to.equal("  • second");
    });

    it("applies inline formatting inside list items", function () {
      const out = renderMarkdown("- run `npm test`", { osc8: false });
      expect(out).to.include("• run \x1b[36mnpm test\x1b[0m");
    });
  });

  describe("supportsOsc8", function () {
    it("returns false when NO_COLOR is set", function () {
      expect(supportsOsc8({ NO_COLOR: "1", TERM_PROGRAM: "iTerm.app" })).to.be
        .false;
    });

    it("returns false when TERM is dumb", function () {
      expect(supportsOsc8({ TERM: "dumb", TERM_PROGRAM: "iTerm.app" })).to.be
        .false;
    });

    it("returns true for known-good terminals", function () {
      expect(supportsOsc8({ TERM_PROGRAM: "iTerm.app" })).to.be.true;
      expect(supportsOsc8({ TERM_PROGRAM: "vscode" })).to.be.true;
      expect(supportsOsc8({ WT_SESSION: "abc" })).to.be.true;
    });

    it("returns false for unknown terminals", function () {
      expect(supportsOsc8({})).to.be.false;
    });
  });
});

describe("hints/context", function () {
  describe("parseOriginUrl", function () {
    it("returns the origin url from a typical .git/config", function () {
      const cfg = [
        "[core]",
        "\trepositoryformatversion = 0",
        "[remote \"origin\"]",
        "\turl = https://github.com/foo/bar.git",
        "\tfetch = +refs/heads/*:refs/remotes/origin/*",
      ].join("\n");
      expect(parseOriginUrl(cfg)).to.equal("https://github.com/foo/bar.git");
    });

    it("ignores comments before reaching origin", function () {
      const cfg = [
        "# a comment",
        "[remote \"origin\"]",
        "\turl = git@github.com:foo/bar.git ; trailing semicolon comment",
      ].join("\n");
      expect(parseOriginUrl(cfg)).to.equal("git@github.com:foo/bar.git");
    });

    it("returns null when no origin section exists", function () {
      const cfg = [
        "[remote \"upstream\"]",
        "\turl = https://example.com/x/y.git",
      ].join("\n");
      expect(parseOriginUrl(cfg)).to.equal(null);
    });

    it("returns null on empty input", function () {
      expect(parseOriginUrl("")).to.equal(null);
    });
  });

  describe("readGitOriginUrl", function () {
    it("walks up to find .git/config", function () {
      const root = makeTmpDir();
      try {
        const nested = path.join(root, "a", "b", "c");
        fs.mkdirSync(nested, { recursive: true });
        fs.mkdirSync(path.join(root, ".git"), { recursive: true });
        fs.writeFileSync(
          path.join(root, ".git", "config"),
          "[remote \"origin\"]\n\turl = https://github.com/foo/bar.git\n"
        );
        expect(readGitOriginUrl(nested)).to.equal(
          "https://github.com/foo/bar.git"
        );
      } finally {
        rmTmpDir(root);
      }
    });

    it("returns null when no .git is found", function () {
      const root = makeTmpDir();
      try {
        // No .git anywhere in the tree.
        expect(readGitOriginUrl(root)).to.equal(null);
      } finally {
        rmTmpDir(root);
      }
    });
  });

  describe("detectDocDetectiveWorkflow", function () {
    it("returns false when .github/workflows does not exist", function () {
      const root = makeTmpDir();
      try {
        expect(detectDocDetectiveWorkflow(root)).to.equal(false);
      } finally {
        rmTmpDir(root);
      }
    });

    it("returns true when a workflow uses a doc-detective/* action", function () {
      const root = makeTmpDir();
      try {
        const dir = path.join(root, ".github", "workflows");
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, "docs.yml"),
          [
            "name: docs",
            "on: [push]",
            "jobs:",
            "  test:",
            "    runs-on: ubuntu-latest",
            "    steps:",
            "      - uses: actions/checkout@v4",
            "      - uses: doc-detective/run-action@v1",
          ].join("\n")
        );
        expect(detectDocDetectiveWorkflow(root)).to.equal(true);
      } finally {
        rmTmpDir(root);
      }
    });

    it("returns true when a step runs a doc-detective command", function () {
      const root = makeTmpDir();
      try {
        const dir = path.join(root, ".github", "workflows");
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, "docs.yaml"),
          [
            "jobs:",
            "  t:",
            "    runs-on: ubuntu-latest",
            "    steps:",
            "      - run: npx doc-detective runTests",
          ].join("\n")
        );
        expect(detectDocDetectiveWorkflow(root)).to.equal(true);
      } finally {
        rmTmpDir(root);
      }
    });

    it("returns false when doc-detective only appears in YAML comments", function () {
      const root = makeTmpDir();
      try {
        const dir = path.join(root, ".github", "workflows");
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, "docs.yml"),
          [
            "# We could use doc-detective here someday",
            "jobs:",
            "  t:",
            "    runs-on: ubuntu-latest",
            "    steps:",
            "      # - uses: doc-detective/run-action@v1",
            "      - uses: actions/checkout@v4",
          ].join("\n")
        );
        expect(detectDocDetectiveWorkflow(root)).to.equal(false);
      } finally {
        rmTmpDir(root);
      }
    });

    it("does not false-positive on similarly named tools", function () {
      const root = makeTmpDir();
      try {
        const dir = path.join(root, ".github", "workflows");
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, "x.yml"),
          [
            "jobs:",
            "  t:",
            "    steps:",
            "      - run: my-doc-detective-fork --help",
          ].join("\n")
        );
        expect(detectDocDetectiveWorkflow(root)).to.equal(false);
      } finally {
        rmTmpDir(root);
      }
    });

    it("returns false on malformed YAML without throwing", function () {
      const root = makeTmpDir();
      try {
        const dir = path.join(root, ".github", "workflows");
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "broken.yml"), ":\n  - oops [\n");
        expect(detectDocDetectiveWorkflow(root)).to.equal(false);
      } finally {
        rmTmpDir(root);
      }
    });
  });

  describe("walkResults", function () {
    it("collects step types, browsers, screenshot/recording flags from a typical results shape", function () {
      const data = walkResults({
        specs: [
          {
            tests: [
              {
                contexts: [
                  {
                    browser: { name: "chrome" },
                    steps: [
                      { goTo: "https://example.com" },
                      { click: { selector: "#go" } },
                      { screenshot: true },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
      expect([...data.usedStepTypes].sort()).to.deep.equal([
        "click",
        "goTo",
        "screenshot",
      ]);
      expect([...data.usedBrowserContexts]).to.deep.equal(["chrome"]);
      expect(data.producedScreenshots).to.equal(true);
      expect(data.producedRecordings).to.equal(false);
    });

    it("flags usedSelectorOnlyFinds when find uses selector with no stable sibling", function () {
      const data = walkResults({
        specs: [{ tests: [{ contexts: [{ steps: [{ find: { selector: "#x" } }] }] }] }],
      });
      expect(data.usedSelectorOnlyFinds).to.equal(true);
    });

    it("does NOT flag usedSelectorOnlyFinds when a stable sibling is present", function () {
      const data = walkResults({
        specs: [
          {
            tests: [
              {
                contexts: [
                  {
                    steps: [
                      { find: { selector: "#x", elementText: "Sign in" } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
      expect(data.usedSelectorOnlyFinds).to.equal(false);
    });

    it("flags hasRelativeUrls for goTo with a path-only URL", function () {
      const data = walkResults({
        specs: [{ tests: [{ contexts: [{ steps: [{ goTo: "/login" }] }] }] }],
      });
      expect(data.hasRelativeUrls).to.equal(true);
    });

    it("does NOT flag hasRelativeUrls for fully-qualified https URLs", function () {
      const data = walkResults({
        specs: [
          {
            tests: [
              {
                contexts: [
                  { steps: [{ goTo: "https://example.com/login" }] },
                ],
              },
            ],
          },
        ],
      });
      expect(data.hasRelativeUrls).to.equal(false);
    });

    it("flags hasCurlInRunShell when a runShell command contains curl", function () {
      const data = walkResults({
        specs: [
          {
            tests: [
              {
                contexts: [
                  {
                    steps: [
                      { runShell: { command: "curl -sS https://x" } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
      expect(data.hasCurlInRunShell).to.equal(true);
    });

    it("flags hasNodeOrPythonInRunShell on `node` or `python` commands", function () {
      const data = walkResults({
        specs: [
          {
            tests: [
              {
                contexts: [
                  {
                    steps: [
                      { runShell: { command: "node ./script.js" } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
      expect(data.hasNodeOrPythonInRunShell).to.equal(true);
    });

    it("returns empty data on null / malformed results", function () {
      const data = walkResults(null);
      expect(data.usedStepTypes.size).to.equal(0);
      expect(data.usedBrowserContexts.size).to.equal(0);
      expect(data.producedScreenshots).to.equal(false);
    });
  });

  describe("readNpmScripts", function () {
    it("returns true when any script value contains doc-detective", function () {
      const root = makeTmpDir();
      try {
        fs.writeFileSync(
          path.join(root, "package.json"),
          JSON.stringify({
            scripts: { "test:docs": "doc-detective --logLevel info" },
          })
        );
        expect(readNpmScripts(root)).to.equal(true);
      } finally {
        rmTmpDir(root);
      }
    });

    it("returns false when no script mentions doc-detective", function () {
      const root = makeTmpDir();
      try {
        fs.writeFileSync(
          path.join(root, "package.json"),
          JSON.stringify({ scripts: { test: "mocha" } })
        );
        expect(readNpmScripts(root)).to.equal(false);
      } finally {
        rmTmpDir(root);
      }
    });

    it("returns false when package.json is missing or malformed", function () {
      const root = makeTmpDir();
      try {
        expect(readNpmScripts(root)).to.equal(false);
        fs.writeFileSync(path.join(root, "package.json"), "{ not json");
        expect(readNpmScripts(root)).to.equal(false);
      } finally {
        rmTmpDir(root);
      }
    });
  });

  describe("gitignoreCovers / detectOutputDirGitignored", function () {
    it("matches a directory pattern with trailing slash", function () {
      expect(gitignoreCovers("doc-detective-output/\n", "doc-detective-output")).to.equal(true);
    });

    it("matches an exact directory name", function () {
      expect(gitignoreCovers("dist\n", "dist")).to.equal(true);
    });

    it("ignores comments and negation", function () {
      expect(gitignoreCovers("# dist\n!dist\n", "dist")).to.equal(false);
    });

    it("returns false when output is the cwd or absent", function () {
      const root = makeTmpDir();
      try {
        expect(detectOutputDirGitignored(root, ".")).to.equal(false);
        expect(detectOutputDirGitignored(root, "")).to.equal(false);
        expect(detectOutputDirGitignored(root, undefined)).to.equal(false);
      } finally {
        rmTmpDir(root);
      }
    });

    it("returns true when output dir matches a .gitignore line", function () {
      const root = makeTmpDir();
      try {
        fs.writeFileSync(path.join(root, ".gitignore"), "node_modules\nbuild/\n");
        expect(detectOutputDirGitignored(root, "build")).to.equal(true);
      } finally {
        rmTmpDir(root);
      }
    });
  });

  describe("detectMdxRstFiles", function () {
    it("returns false when no candidate extensions present", function () {
      const root = makeTmpDir();
      try {
        fs.writeFileSync(path.join(root, "readme.md"), "# md");
        expect(detectMdxRstFiles(root)).to.equal(false);
      } finally {
        rmTmpDir(root);
      }
    });

    it("returns true when an .mdx file exists in a nested directory", function () {
      const root = makeTmpDir();
      try {
        const sub = path.join(root, "docs", "guides");
        fs.mkdirSync(sub, { recursive: true });
        fs.writeFileSync(path.join(sub, "intro.mdx"), "x");
        expect(detectMdxRstFiles(root)).to.equal(true);
      } finally {
        rmTmpDir(root);
      }
    });

    it("ignores node_modules and dotfiles", function () {
      const root = makeTmpDir();
      try {
        const nm = path.join(root, "node_modules", "pkg");
        const dot = path.join(root, ".cache");
        fs.mkdirSync(nm, { recursive: true });
        fs.mkdirSync(dot, { recursive: true });
        fs.writeFileSync(path.join(nm, "x.mdx"), "x");
        fs.writeFileSync(path.join(dot, "y.rst"), "x");
        expect(detectMdxRstFiles(root)).to.equal(false);
      } finally {
        rmTmpDir(root);
      }
    });
  });

  describe("parseNodeMajor", function () {
    it("extracts the major version", function () {
      expect(parseNodeMajor("20.11.0")).to.equal(20);
      expect(parseNodeMajor("18.0.0")).to.equal(18);
      expect(parseNodeMajor("v22.1.0")).to.equal(0); // we expect bare digits per process.versions.node shape
    });
    it("returns 0 on garbage input", function () {
      expect(parseNodeMajor("")).to.equal(0);
      expect(parseNodeMajor("nope")).to.equal(0);
    });
  });

  describe("buildHintContext", function () {
    it("composes all probes with no errors when nothing exists", async function () {
      const root = makeTmpDir();
      try {
        const ctx = await buildHintContext({
          cwd: root,
          isTTY: true,
          platform: "linux",
          adapters: [],
        });
        expect(ctx.gitRemoteUrl).to.equal(null);
        expect(ctx.isGitHubRepo).to.equal(false);
        expect(ctx.hasDocDetectiveWorkflow).to.equal(false);
        expect(ctx.isTTY).to.equal(true);
        expect(ctx.platform).to.equal("linux");
        expect(ctx.failedCount).to.equal(0);
        expect(ctx.totalSpecs).to.equal(0);
        expect(ctx.usedStepTypes).to.be.an.instanceof(Set);
        expect(ctx.agentDetections).to.deep.equal([]);
        expect(ctx.hasDocDetectiveNpmScript).to.equal(false);
        expect(ctx.outputDirGitignored).to.equal(false);
        expect(ctx.nodeMajor).to.be.a("number").and.greaterThan(0);
      } finally {
        rmTmpDir(root);
      }
    });

    it("flags isGitHubRepo when the remote is on github.com", async function () {
      const root = makeTmpDir();
      try {
        fs.mkdirSync(path.join(root, ".git"), { recursive: true });
        fs.writeFileSync(
          path.join(root, ".git", "config"),
          "[remote \"origin\"]\n\turl = git@github.com:foo/bar.git\n"
        );
        const ctx = await buildHintContext({
          cwd: root,
          isTTY: true,
          adapters: [],
        });
        expect(ctx.gitRemoteUrl).to.equal("git@github.com:foo/bar.git");
        expect(ctx.isGitHubRepo).to.equal(true);
      } finally {
        rmTmpDir(root);
      }
    });

    it("counts failures and totals from results.summary", async function () {
      const ctx = await buildHintContext({
        cwd: makeTmpDir(),
        adapters: [],
        results: {
          summary: {
            specs: { pass: 5, fail: 1 },
            tests: { pass: 10, fail: 2 },
            steps: { pass: 30, fail: 3 },
          },
        },
      });
      expect(ctx.failedCount).to.equal(6);
      expect(ctx.totalSpecs).to.equal(6);
      expect(ctx.totalTests).to.equal(12);
      expect(ctx.totalSteps).to.equal(33);
    });

    it("uses 0 for failedCount when results is missing or malformed", async function () {
      const cwd = makeTmpDir();
      try {
        const ctx1 = await buildHintContext({ cwd, results: null, adapters: [] });
        expect(ctx1.failedCount).to.equal(0);
        const ctx2 = await buildHintContext({ cwd, results: {}, adapters: [] });
        expect(ctx2.failedCount).to.equal(0);
        const ctx3 = await buildHintContext({
          cwd,
          results: { summary: { specs: "nope" } },
          adapters: [],
        });
        expect(ctx3.failedCount).to.equal(0);
      } finally {
        rmTmpDir(cwd);
      }
    });

    it("populates agentDetections from injected adapters", async function () {
      const fakeAdapters = [
        {
          id: "alpha",
          displayName: "Alpha",
          detect: async () => ({ present: true, onPath: true, configPaths: {} }),
          supportsScopes: () => ["project"],
          getInstallState: async () => ({ installed: false }),
          install: async () => ({ adapterId: "alpha", scope: "project", action: "installed" }),
        },
        {
          id: "beta",
          displayName: "Beta",
          detect: async () => ({ present: false, onPath: false, configPaths: {} }),
          supportsScopes: () => ["project"],
          getInstallState: async () => ({ installed: false }),
          install: async () => ({ adapterId: "beta", scope: "project", action: "installed" }),
        },
        {
          id: "gamma",
          displayName: "Gamma",
          detect: async () => ({ present: true, onPath: true, configPaths: {} }),
          supportsScopes: () => ["project", "global"],
          getInstallState: async (scope) =>
            scope === "global" ? { installed: true } : { installed: false },
          install: async () => ({ adapterId: "gamma", scope: "project", action: "installed" }),
        },
      ];
      const ctx = await buildHintContext({
        cwd: makeTmpDir(),
        adapters: fakeAdapters,
        agentProbeTimeoutMs: 0,
      });
      expect(ctx.agentDetections.map((d) => d.adapterId)).to.deep.equal([
        "alpha",
        "beta",
        "gamma",
      ]);
      expect(ctx.agentDetections.find((d) => d.adapterId === "alpha"))
        .to.include({ present: true, hasAdapterInstalled: false });
      expect(ctx.agentDetections.find((d) => d.adapterId === "beta"))
        .to.include({ present: false, hasAdapterInstalled: false });
      expect(ctx.agentDetections.find((d) => d.adapterId === "gamma"))
        .to.include({ present: true, hasAdapterInstalled: true });
    });

    it("a hung adapter does not stall the post-run summary", async function () {
      const hung = {
        id: "hung",
        displayName: "Hung",
        detect: () => new Promise(() => {}), // never resolves
        supportsScopes: () => ["project"],
        getInstallState: async () => ({ installed: false }),
        install: async () => ({ adapterId: "hung", scope: "project", action: "installed" }),
      };
      const start = Date.now();
      const ctx = await buildHintContext({
        cwd: makeTmpDir(),
        adapters: [hung],
        agentProbeTimeoutMs: 50,
      });
      const elapsed = Date.now() - start;
      expect(elapsed).to.be.below(500); // way under the test timeout
      // Hung adapter is dropped (probeOneAdapter returned null).
      expect(ctx.agentDetections).to.deep.equal([]);
    });
  });
});

describe("hints/index (maybeShowHint)", function () {
  // Helper: minimal context override so we can drive the predicate path
  // independent of the real cwd / git / workflow probes.
  function ctxOverride(partial = {}) {
    return {
      config: {},
      results: null,
      isTTY: true,
      gitRemoteUrl: null,
      isGitHubRepo: false,
      hasDocDetectiveWorkflow: false,
      platform: "linux",
      failedCount: 0,
      ...partial,
    };
  }

  function captureLines() {
    const lines = [];
    return {
      lines,
      print: (line) => lines.push(line),
    };
  }

  const oneHint = [
    {
      id: "always",
      markdown: "**always** fires",
      when: () => true,
    },
  ];

  it("prints the hint with prefix and footer when everything aligns", async function () {
    const cap = captureLines();
    await maybeShowHint(
      { logLevel: "info" },
      null,
      {
        hints: oneHint,
        contextOverride: ctxOverride(),
        random: () => 0,
        print: cap.print,
      }
    );
    expect(cap.lines.length).to.equal(4); // blank, prefix, body, footer
    expect(cap.lines[0]).to.equal("");
    expect(cap.lines[1]).to.include("Hint:");
    expect(cap.lines[2]).to.include("always");
    expect(cap.lines[3]).to.include("Hide hints");
  });

  it("rule 1: skips when config.hints.enabled === false", async function () {
    const cap = captureLines();
    await maybeShowHint(
      { logLevel: "info", hints: { enabled: false } },
      null,
      { hints: oneHint, contextOverride: ctxOverride(), print: cap.print }
    );
    expect(cap.lines).to.deep.equal([]);
  });

  it("rule 2: skips when isTTY is false", async function () {
    const cap = captureLines();
    await maybeShowHint(
      { logLevel: "info" },
      null,
      {
        hints: oneHint,
        contextOverride: ctxOverride({ isTTY: false }),
        print: cap.print,
      }
    );
    expect(cap.lines).to.deep.equal([]);
  });

  it("rule 3: skips at every non-info logLevel", async function () {
    for (const level of ["silent", "error", "warning", "debug"]) {
      const cap = captureLines();
      await maybeShowHint(
        { logLevel: level },
        null,
        { hints: oneHint, contextOverride: ctxOverride(), print: cap.print }
      );
      expect(cap.lines, `level=${level}`).to.deep.equal([]);
    }
  });

  it("rule 3: shows when logLevel is undefined (defaults to info)", async function () {
    const cap = captureLines();
    await maybeShowHint(
      {}, // no logLevel set
      null,
      { hints: oneHint, contextOverride: ctxOverride(), print: cap.print }
    );
    expect(cap.lines.length).to.equal(4);
  });

  it("rule 4: skips when no predicate matches", async function () {
    const cap = captureLines();
    await maybeShowHint(
      { logLevel: "info" },
      null,
      {
        hints: [{ id: "never", markdown: "x", when: () => false }],
        contextOverride: ctxOverride(),
        print: cap.print,
      }
    );
    expect(cap.lines).to.deep.equal([]);
  });

  it("rule 5: a throwing predicate is caught and the rest of the registry still runs", async function () {
    const cap = captureLines();
    await maybeShowHint(
      { logLevel: "info" },
      null,
      {
        hints: [
          { id: "boom", markdown: "x", when: () => { throw new Error("nope"); } },
          { id: "ok", markdown: "**ok**", when: () => true },
        ],
        contextOverride: ctxOverride(),
        random: () => 0,
        print: cap.print,
      }
    );
    expect(cap.lines.length).to.equal(4);
    expect(cap.lines[2]).to.include("ok");
  });

  it("does not throw if Math.random returns 1 (boundary)", async function () {
    const cap = captureLines();
    // Math.random() < 1 always per spec, but be defensive.
    await maybeShowHint(
      { logLevel: "info" },
      null,
      {
        hints: oneHint,
        contextOverride: ctxOverride(),
        random: () => 0.9999999,
        print: cap.print,
      }
    );
    expect(cap.lines.length).to.equal(4);
  });

  it("never throws even if a print call throws", async function () {
    let threw = false;
    try {
      await maybeShowHint(
        { logLevel: "info" },
        null,
        {
          hints: oneHint,
          contextOverride: ctxOverride(),
          print: () => { throw new Error("boom"); },
        }
      );
    } catch {
      threw = true;
    }
    expect(threw).to.equal(false);
  });
});

// Helper to build a baseline HintContext for predicate tests. Override
// only the fields that matter for the hint under test.
function fakeCtx(partial = {}) {
  return {
    config: {},
    results: null,
    isTTY: true,
    gitRemoteUrl: null,
    isGitHubRepo: false,
    hasDocDetectiveWorkflow: false,
    platform: "linux",
    failedCount: 0,
    configPath: ".doc-detective.json",
    totalSpecs: 0,
    totalTests: 0,
    totalSteps: 0,
    usedStepTypes: new Set(),
    usedBrowserContexts: new Set(),
    producedScreenshots: false,
    producedRecordings: false,
    usedSelectorOnlyFinds: false,
    agentDetections: [],
    hasDocDetectiveNpmScript: true,
    outputDirGitignored: true,
    nodeMajor: 22,
    hasRelativeUrls: false,
    hasCurlInRunShell: false,
    hasNodeOrPythonInRunShell: false,
    hasMdxRstFiles: false,
    ...partial,
  };
}

function findHint(id) {
  const hint = HINTS.find((h) => h.id === id);
  if (!hint) throw new Error(`hint not found: ${id}`);
  return hint;
}

describe("hints/index pickByPriority", function () {
  it("returns the only hint when there is exactly one eligible", function () {
    const h = { id: "x", markdown: "x", when: () => true, priority: 50 };
    expect(pickByPriority([h], () => 0).id).to.equal("x");
  });

  it("filters to the lowest priority value before random-picking", function () {
    const onboarding = { id: "a", markdown: "a", when: () => true, priority: 10 };
    const advanced = { id: "b", markdown: "b", when: () => true, priority: 50 };
    // No matter what random returns, only the priority-10 hint is a candidate.
    for (const r of [0, 0.49, 0.99]) {
      expect(pickByPriority([advanced, onboarding], () => r).id).to.equal("a");
    }
  });

  it("treats missing priority as 50 (default)", function () {
    const advanced = { id: "a", markdown: "a", when: () => true };
    const fallback = { id: "b", markdown: "b", when: () => true, priority: 50 };
    // Both default to 50 → tied → random pick across both.
    expect(["a", "b"]).to.include(
      pickByPriority([advanced, fallback], () => 0).id
    );
  });
});

describe("hints/hints (registry)", function () {
  it("every hint has stable id, body, predicate, and a numeric priority when set", function () {
    expect(HINTS.length).to.equal(26);
    const ids = new Set();
    // Ids start with a lowercase letter and use kebab-case. Embedded
    // camelCase tokens are allowed *only* when they reference a
    // doc-detective API/schema name (e.g. `httpRequest`, `loadCookie`),
    // since matching the literal API name makes hints grep-able.
    for (const h of HINTS) {
      expect(h.id, `bad id shape: ${h.id}`)
        .to.be.a("string")
        .and.match(/^[a-z][a-zA-Z0-9-]*$/);
      expect(ids.has(h.id), `duplicate id: ${h.id}`).to.equal(false);
      ids.add(h.id);
      expect(h.markdown).to.be.a("string").and.have.length.greaterThan(0);
      expect(h.when).to.be.a("function");
      if (h.priority !== undefined) expect(h.priority).to.be.a("number");
    }
  });

  it("entries are sorted alphabetically by id", function () {
    const ids = HINTS.map((h) => h.id);
    const sorted = [...ids].sort();
    expect(ids).to.deep.equal(sorted);
  });

  // ----- onboarding (priority 10) -----

  it("install-github-action: fires on a github repo with no workflow", function () {
    const h = findHint("install-github-action");
    expect(h.priority).to.equal(10);
    expect(h.when(fakeCtx({ isGitHubRepo: true, hasDocDetectiveWorkflow: false }))).to.equal(true);
    expect(h.when(fakeCtx({ isGitHubRepo: true, hasDocDetectiveWorkflow: true }))).to.equal(false);
    expect(h.when(fakeCtx({ isGitHubRepo: false }))).to.equal(false);
  });

  it("add-config-file: fires when no config file is loaded", function () {
    const h = findHint("add-config-file");
    expect(h.priority).to.equal(10);
    expect(h.when(fakeCtx({ configPath: null }))).to.equal(true);
    expect(h.when(fakeCtx({ configPath: ".doc-detective.json" }))).to.equal(false);
  });

  it("add-npm-script: fires when no doc-detective npm script exists", function () {
    const h = findHint("add-npm-script");
    expect(h.priority).to.equal(10);
    expect(h.when(fakeCtx({ hasDocDetectiveNpmScript: false }))).to.equal(true);
    expect(h.when(fakeCtx({ hasDocDetectiveNpmScript: true }))).to.equal(false);
  });

  it("gitignore-output-dir: fires when output is set, non-cwd, and not ignored", function () {
    const h = findHint("gitignore-output-dir");
    expect(h.priority).to.equal(10);
    expect(
      h.when(fakeCtx({ config: { output: "out" }, outputDirGitignored: false }))
    ).to.equal(true);
    expect(
      h.when(fakeCtx({ config: { output: "out" }, outputDirGitignored: true }))
    ).to.equal(false);
    expect(
      h.when(fakeCtx({ config: { output: "." }, outputDirGitignored: false }))
    ).to.equal(false);
  });

  it("install-agents: fires when an agent is present and none has the adapter installed", function () {
    const h = findHint("install-agents");
    expect(h.priority).to.equal(10);
    expect(
      h.when(
        fakeCtx({
          agentDetections: [
            { adapterId: "a", displayName: "A", present: true, hasAdapterInstalled: false },
          ],
        })
      )
    ).to.equal(true);
    // At least one agent already has the adapter -> skip.
    expect(
      h.when(
        fakeCtx({
          agentDetections: [
            { adapterId: "a", displayName: "A", present: true, hasAdapterInstalled: true },
            { adapterId: "b", displayName: "B", present: true, hasAdapterInstalled: false },
          ],
        })
      )
    ).to.equal(false);
    // No agents present -> skip.
    expect(h.when(fakeCtx({ agentDetections: [] }))).to.equal(false);
  });

  // ----- current-run problems (priority 20) -----

  it("enable-debug-log: fires only when failedCount > 0", function () {
    const h = findHint("enable-debug-log");
    expect(h.priority).to.equal(20);
    expect(h.when(fakeCtx({ failedCount: 0 }))).to.equal(false);
    expect(h.when(fakeCtx({ failedCount: 3 }))).to.equal(true);
  });

  it("use-record-step-on-failure: fires only on failure with a browser run and no recordings produced", function () {
    const h = findHint("use-record-step-on-failure");
    expect(h.priority).to.equal(20);
    expect(
      h.when(
        fakeCtx({
          failedCount: 1,
          producedRecordings: false,
          usedBrowserContexts: new Set(["chrome"]),
        })
      )
    ).to.equal(true);
    expect(
      h.when(
        fakeCtx({
          failedCount: 1,
          producedRecordings: true,
          usedBrowserContexts: new Set(["chrome"]),
        })
      )
    ).to.equal(false);
    expect(h.when(fakeCtx({ failedCount: 0 }))).to.equal(false);
  });

  it("use-stable-finding-patterns: fires only on failure with selector-only finds", function () {
    const h = findHint("use-stable-finding-patterns");
    expect(h.priority).to.equal(20);
    expect(
      h.when(fakeCtx({ failedCount: 2, usedSelectorOnlyFinds: true }))
    ).to.equal(true);
    expect(
      h.when(fakeCtx({ failedCount: 2, usedSelectorOnlyFinds: false }))
    ).to.equal(false);
    expect(
      h.when(fakeCtx({ failedCount: 0, usedSelectorOnlyFinds: true }))
    ).to.equal(false);
  });

  it("use-dry-run-to-debug-no-tests: fires when specs found but tests = 0", function () {
    const h = findHint("use-dry-run-to-debug-no-tests");
    expect(h.priority).to.equal(20);
    expect(h.when(fakeCtx({ totalSpecs: 5, totalTests: 0 }))).to.equal(true);
    expect(h.when(fakeCtx({ totalSpecs: 5, totalTests: 5 }))).to.equal(false);
    expect(h.when(fakeCtx({ totalSpecs: 0, totalTests: 0 }))).to.equal(false);
  });

  it("upgrade-node-version: fires when nodeMajor < 20 (and nonzero)", function () {
    const h = findHint("upgrade-node-version");
    expect(h.priority).to.equal(20);
    expect(h.when(fakeCtx({ nodeMajor: 18 }))).to.equal(true);
    expect(h.when(fakeCtx({ nodeMajor: 20 }))).to.equal(false);
    expect(h.when(fakeCtx({ nodeMajor: 22 }))).to.equal(false);
    expect(h.when(fakeCtx({ nodeMajor: 0 }))).to.equal(false);
  });

  // ----- output & reporting (priority 30) -----

  it("try-html-reporter: fires only when html is not already configured", function () {
    const h = findHint("try-html-reporter");
    expect(h.priority).to.equal(30);
    expect(h.when(fakeCtx({ config: { reporters: ["terminal", "json"] } }))).to.equal(true);
    expect(h.when(fakeCtx({ config: { reporters: ["terminal", "html"] } }))).to.equal(false);
  });

  it("reporters-include-json-for-ci: fires on github when json is missing", function () {
    const h = findHint("reporters-include-json-for-ci");
    expect(h.priority).to.equal(30);
    expect(
      h.when(
        fakeCtx({ config: { reporters: ["terminal"] }, isGitHubRepo: true })
      )
    ).to.equal(true);
    expect(
      h.when(
        fakeCtx({ config: { reporters: ["terminal", "json"] }, isGitHubRepo: true })
      )
    ).to.equal(false);
    expect(
      h.when(
        fakeCtx({ config: { reporters: ["terminal"] }, isGitHubRepo: false })
      )
    ).to.equal(false);
  });

  it("output-dir-not-set: fires when output is missing or '.' and specs ran", function () {
    const h = findHint("output-dir-not-set");
    expect(h.priority).to.equal(30);
    expect(h.when(fakeCtx({ config: {}, totalSpecs: 1 }))).to.equal(true);
    expect(h.when(fakeCtx({ config: { output: "." }, totalSpecs: 1 }))).to.equal(true);
    expect(h.when(fakeCtx({ config: { output: "out" }, totalSpecs: 1 }))).to.equal(false);
    expect(h.when(fakeCtx({ config: {}, totalSpecs: 0 }))).to.equal(false);
  });

  // ----- feature discovery (priority 40) -----

  it("use-screenshot-step: fires when 3+ tests use a browser but no screenshot was produced", function () {
    const h = findHint("use-screenshot-step");
    expect(h.priority).to.equal(40);
    expect(
      h.when(
        fakeCtx({
          totalTests: 5,
          usedBrowserContexts: new Set(["chrome"]),
          producedScreenshots: false,
        })
      )
    ).to.equal(true);
    expect(
      h.when(
        fakeCtx({
          totalTests: 5,
          usedBrowserContexts: new Set(["chrome"]),
          producedScreenshots: true,
        })
      )
    ).to.equal(false);
    expect(
      h.when(
        fakeCtx({ totalTests: 5, usedBrowserContexts: new Set() })
      )
    ).to.equal(false);
  });

  it("use-checkLink-step: fires when goTo is used but checkLink isn't", function () {
    const h = findHint("use-checkLink-step");
    expect(h.priority).to.equal(40);
    expect(h.when(fakeCtx({ usedStepTypes: new Set(["goTo"]) }))).to.equal(true);
    expect(
      h.when(fakeCtx({ usedStepTypes: new Set(["goTo", "checkLink"]) }))
    ).to.equal(false);
  });

  it("use-httpRequest-step: fires when runShell is used with curl and no httpRequest", function () {
    const h = findHint("use-httpRequest-step");
    expect(h.priority).to.equal(40);
    expect(
      h.when(
        fakeCtx({
          usedStepTypes: new Set(["runShell"]),
          hasCurlInRunShell: true,
        })
      )
    ).to.equal(true);
    expect(
      h.when(
        fakeCtx({
          usedStepTypes: new Set(["runShell", "httpRequest"]),
          hasCurlInRunShell: true,
        })
      )
    ).to.equal(false);
    expect(
      h.when(
        fakeCtx({
          usedStepTypes: new Set(["runShell"]),
          hasCurlInRunShell: false,
        })
      )
    ).to.equal(false);
  });

  it("use-runCode-step: fires when runShell drives node/python and runCode isn't used", function () {
    const h = findHint("use-runCode-step");
    expect(h.priority).to.equal(40);
    expect(
      h.when(
        fakeCtx({
          usedStepTypes: new Set(["runShell"]),
          hasNodeOrPythonInRunShell: true,
        })
      )
    ).to.equal(true);
    expect(
      h.when(
        fakeCtx({
          usedStepTypes: new Set(["runShell", "runCode"]),
          hasNodeOrPythonInRunShell: true,
        })
      )
    ).to.equal(false);
  });

  it("use-loadCookie-saveCookie: fires when login pattern likely (browser + type + click) and no loadCookie", function () {
    const h = findHint("use-loadCookie-saveCookie");
    expect(h.priority).to.equal(40);
    expect(
      h.when(
        fakeCtx({
          usedBrowserContexts: new Set(["chrome"]),
          usedStepTypes: new Set(["type", "click"]),
        })
      )
    ).to.equal(true);
    expect(
      h.when(
        fakeCtx({
          usedBrowserContexts: new Set(["chrome"]),
          usedStepTypes: new Set(["type", "click", "loadCookie"]),
        })
      )
    ).to.equal(false);
    expect(
      h.when(
        fakeCtx({
          usedBrowserContexts: new Set(),
          usedStepTypes: new Set(["type", "click"]),
        })
      )
    ).to.equal(false);
  });

  it("use-openApi-validation: fires on httpRequest usage without openApi integration", function () {
    const h = findHint("use-openApi-validation");
    expect(
      h.when(fakeCtx({ usedStepTypes: new Set(["httpRequest"]), config: {} }))
    ).to.equal(true);
    expect(
      h.when(
        fakeCtx({
          usedStepTypes: new Set(["httpRequest"]),
          config: { integrations: { openApi: [{ name: "x" }] } },
        })
      )
    ).to.equal(false);
  });

  // ----- advanced / setup (priority 50) -----

  it("use-spec-filter-for-iteration: fires when 30+ specs and no filter active", function () {
    const h = findHint("use-spec-filter-for-iteration");
    expect(h.priority).to.equal(50);
    expect(h.when(fakeCtx({ totalSpecs: 30 }))).to.equal(true);
    expect(h.when(fakeCtx({ totalSpecs: 30, config: { specFilter: ["x"] } }))).to.equal(false);
    expect(h.when(fakeCtx({ totalSpecs: 5 }))).to.equal(false);
  });

  it("recursive-might-be-too-broad: fires only when recursive (default) and 100+ specs", function () {
    const h = findHint("recursive-might-be-too-broad");
    expect(h.priority).to.equal(50);
    expect(h.when(fakeCtx({ totalSpecs: 101 }))).to.equal(true);
    expect(h.when(fakeCtx({ totalSpecs: 101, config: { recursive: false } }))).to.equal(false);
    expect(h.when(fakeCtx({ totalSpecs: 50 }))).to.equal(false);
  });

  it("extract-beforeAny-shared-setup: fires on ≥5 specs with loadVariables and no beforeAny", function () {
    const h = findHint("extract-beforeAny-shared-setup");
    expect(
      h.when(
        fakeCtx({ totalSpecs: 6, usedStepTypes: new Set(["loadVariables"]) })
      )
    ).to.equal(true);
    expect(
      h.when(
        fakeCtx({
          totalSpecs: 6,
          usedStepTypes: new Set(["loadVariables"]),
          config: { beforeAny: "./setup.spec.json" },
        })
      )
    ).to.equal(false);
  });

  it("extract-afterAll-cleanup: fires on ≥5 specs that produced cookies but have no afterAll", function () {
    const h = findHint("extract-afterAll-cleanup");
    expect(
      h.when(
        fakeCtx({ totalSpecs: 6, usedStepTypes: new Set(["saveCookie"]) })
      )
    ).to.equal(true);
    expect(
      h.when(
        fakeCtx({
          totalSpecs: 6,
          usedStepTypes: new Set(["saveCookie"]),
          config: { afterAll: "./cleanup.spec.json" },
        })
      )
    ).to.equal(false);
    // No saveCookie usage => skip.
    expect(
      h.when(fakeCtx({ totalSpecs: 6, usedStepTypes: new Set() }))
    ).to.equal(false);
  });

  it("set-origin-for-relative-urls: fires on goTo + relative URL with no origin set", function () {
    const h = findHint("set-origin-for-relative-urls");
    expect(
      h.when(
        fakeCtx({
          usedStepTypes: new Set(["goTo"]),
          hasRelativeUrls: true,
        })
      )
    ).to.equal(true);
    expect(
      h.when(
        fakeCtx({
          usedStepTypes: new Set(["goTo"]),
          hasRelativeUrls: true,
          config: { origin: "https://x" },
        })
      )
    ).to.equal(false);
    expect(
      h.when(
        fakeCtx({
          usedStepTypes: new Set(["goTo"]),
          hasRelativeUrls: false,
        })
      )
    ).to.equal(false);
  });

  it("use-fileTypes-for-mdx-rst: fires when MDX/RST files exist and fileTypes lacks them", function () {
    const h = findHint("use-fileTypes-for-mdx-rst");
    expect(h.when(fakeCtx({ hasMdxRstFiles: true, config: {} }))).to.equal(true);
    // Already declared as a custom extension -> skip.
    expect(
      h.when(
        fakeCtx({
          hasMdxRstFiles: true,
          config: {
            fileTypes: [
              { extends: "markdown", extensions: [".mdx"] },
            ],
          },
        })
      )
    ).to.equal(false);
    // No matching files -> skip.
    expect(h.when(fakeCtx({ hasMdxRstFiles: false }))).to.equal(false);
  });

  it("enable-telemetry-user-id-for-team: fires for github repos with telemetry on but userId missing", function () {
    const h = findHint("enable-telemetry-user-id-for-team");
    expect(
      h.when(
        fakeCtx({
          isGitHubRepo: true,
          config: { telemetry: { send: true } },
        })
      )
    ).to.equal(true);
    expect(
      h.when(
        fakeCtx({
          isGitHubRepo: true,
          config: { telemetry: { send: true, userId: "team" } },
        })
      )
    ).to.equal(false);
    expect(
      h.when(
        fakeCtx({
          isGitHubRepo: false,
          config: { telemetry: { send: true } },
        })
      )
    ).to.equal(false);
    expect(
      h.when(
        fakeCtx({
          isGitHubRepo: true,
          config: { telemetry: { send: false } },
        })
      )
    ).to.equal(false);
  });
});

describe("hints CLI wiring", function () {
  // Spawn the real CLI in --help mode. This proves three things in one
  // shot, none of which the unit tests can prove on their own:
  //   1. `import { maybeShowHint } from "./hints/index.js"` in src/cli.ts
  //      resolves through the compiled dist/ tree (no broken type or
  //      ESM-extension issue).
  //   2. The --hints / --no-hints flag is actually registered on the
  //      yargs builder used by the bin entry point (not just on a stale
  //      copy in dist/).
  //   3. yargs accepts --no-hints without erroring out.
  //
  // We don't run an actual test spec — that would slow this suite down a
  // lot for a marginal extra signal. The maybeShowHint logic is fully
  // exercised by the unit tests above.
  this.timeout(20000);

  it("--help advertises the --hints flag", function () {
    const r = spawnSync(process.execPath, [CLI, "--help"], {
      encoding: "utf8",
    });
    expect(r.status, `stderr: ${r.stderr}`).to.equal(0);
    expect(r.stdout).to.include("--hints");
  });

  it("accepts --no-hints without erroring (parses through to runTests)", function () {
    // We just want to confirm yargs accepts the flag. Pass --version too so
    // we exit before doing any actual work.
    const r = spawnSync(process.execPath, [CLI, "--no-hints", "--version"], {
      encoding: "utf8",
    });
    expect(r.status, `stderr: ${r.stderr}`).to.equal(0);
    expect(r.stdout.trim()).to.match(/^\d+\.\d+\.\d+/);
  });
});
