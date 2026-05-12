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
  detectRstFiles,
  runInvokesDocDetective,
} from "../dist/hints/context.js";
import { maybeShowHint, pickByPriority, priorityWeight } from "../dist/hints/index.js";
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

    it("does NOT match `run: echo doc-detective` or similar non-command mentions", function () {
      // Regression for over-eager run-string matching that would
      // suppress installGithubAction onboarding hints when a workflow
      // merely *mentions* doc-detective (e.g. in echo, grep, comments).
      const root = makeTmpDir();
      try {
        const dir = path.join(root, ".github", "workflows");
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, "noise.yml"),
          [
            "jobs:",
            "  t:",
            "    runs-on: ubuntu-latest",
            "    steps:",
            "      - run: echo doc-detective is a tool",
            "      - run: grep doc-detective package.json",
          ].join("\n")
        );
        expect(detectDocDetectiveWorkflow(root)).to.equal(false);
      } finally {
        rmTmpDir(root);
      }
    });

    it("walks up to find .github/workflows defined at the repo root", function () {
      // doc-detective run from a subdirectory should still detect a
      // workflow that lives at the repo root.
      const root = makeTmpDir();
      try {
        const wfDir = path.join(root, ".github", "workflows");
        fs.mkdirSync(wfDir, { recursive: true });
        fs.writeFileSync(
          path.join(wfDir, "docs.yml"),
          ["jobs:", "  t:", "    steps:", "      - run: npx doc-detective"].join("\n")
        );
        const subdir = path.join(root, "packages", "docs-site");
        fs.mkdirSync(subdir, { recursive: true });
        expect(detectDocDetectiveWorkflow(subdir)).to.equal(true);
      } finally {
        rmTmpDir(root);
      }
    });
  });

  describe("runInvokesDocDetective", function () {
    // Positive cases: doc-detective is an actual command invocation.
    const matches = [
      "doc-detective",
      "doc-detective --logLevel info",
      "npx doc-detective",
      "npx -y doc-detective",
      "npx --silent doc-detective --version",
      "yarn doc-detective",
      "pnpm doc-detective",
      "pnpm dlx doc-detective",
      "bunx doc-detective",
      "cd docs && doc-detective",
      "cd docs && npx doc-detective",
      "echo starting; doc-detective",
      "doc-detective || echo failed",
      "cmd1 \n cmd2 \n doc-detective",
    ];
    for (const cmd of matches) {
      it(`matches: ${cmd}`, function () {
        expect(runInvokesDocDetective(cmd)).to.equal(true);
      });
    }

    // Negative cases: doc-detective is mentioned but not invoked.
    const nonMatches = [
      "echo doc-detective",
      "echo \"using doc-detective\"",
      "grep doc-detective package.json",
      "echo 'doc-detective is a tool'",
      "doc-detective-helper --run", // word boundary
      "my-doc-detective-fork",
      "",
      "cd packages",
    ];
    for (const cmd of nonMatches) {
      it(`does NOT match: ${cmd || "(empty)"}`, function () {
        expect(runInvokesDocDetective(cmd)).to.equal(false);
      });
    }

    it("returns false on non-string input", function () {
      expect(runInvokesDocDetective(undefined)).to.equal(false);
      expect(runInvokesDocDetective(null)).to.equal(false);
      expect(runInvokesDocDetective(42)).to.equal(false);
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

    // Regression: v3 `screenshot` and `record` step fields accept
    // `true`, a string path, OR an object. The earlier helper
    // (`truthyOrObject`) only counted boolean+object, silently
    // missing the string form — so suites that wrote
    // `screenshot: "home.png"` would still trigger `useScreenshotStep`
    // even though they're already using screenshots. Each form gets a
    // positive test below; the `false` opt-out gets a negative test.
    for (const screenshotValue of [true, "home.png", { path: "x.png" }]) {
      it(`producedScreenshots is true for ${JSON.stringify(screenshotValue)}`, function () {
        const data = walkResults({
          specs: [{ tests: [{ contexts: [{ steps: [{ screenshot: screenshotValue }] }] }] }],
        });
        expect(data.producedScreenshots).to.equal(true);
      });
    }
    for (const recordValue of [true, "run.webm", { path: "x.mp4", directory: "out" }]) {
      it(`producedRecordings is true for ${JSON.stringify(recordValue)}`, function () {
        const data = walkResults({
          specs: [{ tests: [{ contexts: [{ steps: [{ record: recordValue }] }] }] }],
        });
        expect(data.producedRecordings).to.equal(true);
      });
    }
    it("producedScreenshots is false when screenshot is explicitly disabled", function () {
      // `false` is the explicit opt-out form; treat it as non-producing.
      const data = walkResults({
        specs: [{ tests: [{ contexts: [{ steps: [{ screenshot: false }] }] }] }],
      });
      expect(data.producedScreenshots).to.equal(false);
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

    // Each interpreter prefix the `/^python3?\s+/` and `/^node\s+/`
    // regexes match. Iterating instead of duplicating three near-
    // identical test bodies.
    for (const cmd of [
      "node ./script.js",
      "python ./script.py",
      "python3 ./script.py",
      "  node ./script.js", // leading whitespace tolerated
    ]) {
      it(`flags hasNodeOrPythonInRunShell on \`${cmd.trim()}\``, function () {
        const data = walkResults({
          specs: [
            {
              tests: [
                {
                  contexts: [
                    { steps: [{ runShell: { command: cmd } }] },
                  ],
                },
              ],
            },
          ],
        });
        expect(data.hasNodeOrPythonInRunShell).to.equal(true);
      });
    }

    it("does NOT flag hasNodeOrPythonInRunShell on python2 or unrelated commands", function () {
      // The implementation only matches `python` and `python3`, not
      // `python2` (EOL since 2020) and certainly not unrelated tools.
      for (const cmd of ["python2 ./old.py", "deno run ./x.ts", "rm -rf /"]) {
        const data = walkResults({
          specs: [
            {
              tests: [
                {
                  contexts: [
                    { steps: [{ runShell: { command: cmd } }] },
                  ],
                },
              ],
            },
          ],
        });
        expect(data.hasNodeOrPythonInRunShell, cmd).to.equal(false);
      }
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

    it("walks up to find a doc-detective script in a parent package.json", function () {
      // doc-detective run from a subdirectory should still see a
      // doc-detective script in the repo's root package.json.
      const root = makeTmpDir();
      try {
        fs.writeFileSync(
          path.join(root, "package.json"),
          JSON.stringify({
            scripts: { "test:docs": "doc-detective --logLevel info" },
          })
        );
        const subdir = path.join(root, "packages", "docs-site");
        fs.mkdirSync(subdir, { recursive: true });
        expect(readNpmScripts(subdir)).to.equal(true);
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

    it("relativizes absolute output paths before matching .gitignore", function () {
      // setConfig() resolves args.output to an absolute path; the matcher
      // must convert back to repo-relative before comparing against
      // .gitignore patterns or the hint never resolves to "ignored".
      const root = makeTmpDir();
      try {
        fs.writeFileSync(path.join(root, ".gitignore"), "doc-detective-output/\n");
        const absoluteOut = path.join(root, "doc-detective-output");
        expect(detectOutputDirGitignored(root, absoluteOut)).to.equal(true);
      } finally {
        rmTmpDir(root);
      }
    });

    it("returns false when an absolute output is outside the gitignore root", function () {
      const root = makeTmpDir();
      const elsewhere = makeTmpDir();
      try {
        fs.writeFileSync(path.join(root, ".gitignore"), "build/\n");
        const absoluteOut = path.join(elsewhere, "build");
        expect(detectOutputDirGitignored(root, absoluteOut)).to.equal(false);
      } finally {
        rmTmpDir(root);
        rmTmpDir(elsewhere);
      }
    });
  });

  describe("detectRstFiles", function () {
    it("returns false when no .rst files present", function () {
      const root = makeTmpDir();
      try {
        fs.writeFileSync(path.join(root, "readme.md"), "# md");
        fs.writeFileSync(path.join(root, "guide.mdx"), "# mdx");
        // .mdx and .adoc are NOT scanned: they're already covered by
        // the default markdown / asciidoc file types in core config.
        fs.writeFileSync(path.join(root, "spec.adoc"), "= adoc");
        expect(detectRstFiles(root)).to.equal(false);
      } finally {
        rmTmpDir(root);
      }
    });

    it("returns true when an .rst file exists in a nested directory", function () {
      const root = makeTmpDir();
      try {
        const sub = path.join(root, "docs", "guides");
        fs.mkdirSync(sub, { recursive: true });
        fs.writeFileSync(path.join(sub, "intro.rst"), "Title\n=====\n");
        expect(detectRstFiles(root)).to.equal(true);
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
        fs.writeFileSync(path.join(nm, "x.rst"), "x");
        fs.writeFileSync(path.join(dot, "y.rst"), "x");
        expect(detectRstFiles(root)).to.equal(false);
      } finally {
        rmTmpDir(root);
      }
    });

    it("walks up to the repo root and scans from there", function () {
      // Doc Detective run from a subdirectory of a repo should still
      // see `.rst` files in sibling packages. Mirrors the walk-up
      // behavior of detectDocDetectiveWorkflow and
      // findPackageJsonUpward.
      const root = makeTmpDir();
      try {
        // Repo root marker.
        fs.mkdirSync(path.join(root, ".git"), { recursive: true });
        // Sibling package with the .rst file.
        const sibling = path.join(root, "packages", "manual");
        fs.mkdirSync(sibling, { recursive: true });
        fs.writeFileSync(path.join(sibling, "intro.rst"), "Title\n=====\n");
        // Where doc-detective is invoked from.
        const cwd = path.join(root, "packages", "site");
        fs.mkdirSync(cwd, { recursive: true });
        expect(detectRstFiles(cwd)).to.equal(true);
      } finally {
        rmTmpDir(root);
      }
    });

    it("falls back to cwd when no .git is found in any parent", function () {
      const root = makeTmpDir();
      try {
        fs.writeFileSync(path.join(root, "spec.rst"), "");
        expect(detectRstFiles(root)).to.equal(true);
      } finally {
        rmTmpDir(root);
      }
    });

    it("enforces the 100-file budget even on a flat directory", function () {
      // Regression for the per-recursion vs per-entry budget bug. With
      // the broken per-recursion counter, a flat dir of 200 files would
      // be fully walked. With the per-entry counter, the scan must
      // bail out before reaching a .rst file placed past entry 100.
      const root = makeTmpDir();
      try {
        // 150 non-matching files, then a .rst at the end. With a
        // working budget, the .rst is never reached.
        for (let i = 0; i < 150; i++) {
          fs.writeFileSync(path.join(root, `pad-${i}.md`), "");
        }
        fs.writeFileSync(path.join(root, "zzz-late.rst"), "");
        expect(detectRstFiles(root)).to.equal(false);
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
        expect(ctx.hasPackageJson).to.equal(false);
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
      const cwd = makeTmpDir();
      try {
        const ctx = await buildHintContext({
          cwd,
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
      } finally {
        rmTmpDir(cwd);
      }
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
      const cwd = makeTmpDir();
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
      try {
        const ctx = await buildHintContext({
          cwd,
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
      } finally {
        rmTmpDir(cwd);
      }
    });

    it("a hung adapter does not stall the post-run summary", async function () {
      const cwd = makeTmpDir();
      const hung = {
        id: "hung",
        displayName: "Hung",
        detect: () => new Promise(() => {}), // never resolves
        supportsScopes: () => ["project"],
        getInstallState: async () => ({ installed: false }),
        install: async () => ({ adapterId: "hung", scope: "project", action: "installed" }),
      };
      try {
        const start = Date.now();
        const ctx = await buildHintContext({
          cwd,
          adapters: [hung],
          agentProbeTimeoutMs: 50,
        });
        const elapsed = Date.now() - start;
        expect(elapsed).to.be.below(500); // way under the test timeout
        // Hung adapter is dropped (probeOneAdapter returned null).
        expect(ctx.agentDetections).to.deep.equal([]);
      } finally {
        rmTmpDir(cwd);
      }
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

  it("prints the hint with prefix on the same line for a single-line body", async function () {
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
    // Single-line hint body collapses to two prints: a leading blank
    // and a combined prefix + body line. No footer.
    expect(cap.lines.length).to.equal(2);
    expect(cap.lines[0]).to.equal("");
    expect(cap.lines[1]).to.include("Hint:");
    expect(cap.lines[1]).to.include("always");
  });

  it("emits multi-line body as a second print after the prefix line", async function () {
    // Multi-line markdown should still keep its line shape — the
    // renderer's output goes through one print call after the prefix.
    const cap = captureLines();
    const multiLineHint = [
      {
        id: "multi",
        markdown: "first line\nsecond line\nthird line",
        when: () => true,
      },
    ];
    await maybeShowHint(
      { logLevel: "info" },
      null,
      {
        hints: multiLineHint,
        contextOverride: ctxOverride(),
        random: () => 0,
        print: cap.print,
      }
    );
    expect(cap.lines.length).to.equal(3); // blank, prefix+first, rest
    expect(cap.lines[0]).to.equal("");
    expect(cap.lines[1]).to.include("Hint:");
    expect(cap.lines[1]).to.include("first line");
    expect(cap.lines[2]).to.equal("second line\nthird line");
  });

  it("does not emit the 'Hide hints' footer", async function () {
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
    for (const line of cap.lines) {
      expect(line).to.not.include("Hide hints");
    }
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

  it("rule 3: never prints a hint at any non-info logLevel", async function () {
    // silent / error / warning / debug all suppress the printed hint.
    // (debug additionally runs the predicate eval so error logs
    // surface; that's covered by the dedicated debug-eval test below.)
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

  it("rule 3 (debug): evaluates predicates so predicate errors can be logged", async function () {
    // Earlier versions returned at `logLevel !== "info"`, which meant
    // any `log(err, "debug", ...)` inside an error handler never
    // executed — predicate failures were unobservable even at debug.
    // The fix: run eval at debug too, just don't print. This test
    // proves the predicate is invoked at debug level.
    const cap = captureLines();
    let calls = 0;
    const trackingHint = {
      id: "always",
      markdown: "x",
      when: () => {
        calls += 1;
        return true;
      },
    };
    await maybeShowHint(
      { logLevel: "debug" },
      null,
      { hints: [trackingHint], contextOverride: ctxOverride(), print: cap.print }
    );
    expect(calls, "predicate was not evaluated at debug level").to.equal(1);
    expect(cap.lines, "should not print at debug level").to.deep.equal([]);
  });

  it("silent / error / warning: skip eval entirely (cheap path)", async function () {
    // At these levels the user has narrowed output to errors / nothing
    // — running eval (which costs file reads + agent probes) would be
    // wasted work. Predicates must NOT be called.
    for (const level of ["silent", "error", "warning"]) {
      let calls = 0;
      const trackingHint = {
        id: "always",
        markdown: "x",
        when: () => {
          calls += 1;
          return true;
        },
      };
      const cap = captureLines();
      await maybeShowHint(
        { logLevel: level },
        null,
        { hints: [trackingHint], contextOverride: ctxOverride(), print: cap.print }
      );
      expect(calls, `predicate ran at level=${level} but shouldn't have`).to.equal(0);
      expect(cap.lines, `printed at level=${level}`).to.deep.equal([]);
    }
  });

  it("rule 3: shows when logLevel is undefined (defaults to info)", async function () {
    const cap = captureLines();
    await maybeShowHint(
      {}, // no logLevel set
      null,
      { hints: oneHint, contextOverride: ctxOverride(), print: cap.print }
    );
    // Single-line oneHint: blank + prefix+body
    expect(cap.lines.length).to.equal(2);
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
    expect(cap.lines.length).to.equal(2);
    // Prefix+body line carries the surviving hint's content.
    expect(cap.lines[1]).to.include("ok");
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
    expect(cap.lines.length).to.equal(2);
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
    hasPackageJson: true,
    hasDocDetectiveNpmScript: true,
    outputDirGitignored: true,
    nodeMajor: 22,
    hasRelativeUrls: false,
    hasCurlInRunShell: false,
    hasNodeOrPythonInRunShell: false,
    hasRstFiles: false,
    ...partial,
  };
}

function findHint(id) {
  const hint = HINTS.find((h) => h.id === id);
  if (!hint) throw new Error(`hint not found: ${id}`);
  return hint;
}

describe("hints/index pickByPriority + priorityWeight", function () {
  it("returns the only hint when there is exactly one eligible", function () {
    const h = { id: "x", markdown: "x", when: () => true, priority: 50 };
    expect(pickByPriority([h], () => 0).id).to.equal("x");
  });

  it("priorityWeight maps tiers to the documented 5:4:3:2:1 ramp", function () {
    expect(priorityWeight(10)).to.equal(5);
    expect(priorityWeight(20)).to.equal(4);
    expect(priorityWeight(30)).to.equal(3);
    expect(priorityWeight(40)).to.equal(2);
    expect(priorityWeight(50)).to.equal(1);
    // Off-band values clamp.
    expect(priorityWeight(0)).to.equal(5);
    expect(priorityWeight(100)).to.equal(1);
    // Undefined falls through to the default tier (50).
    expect(priorityWeight(undefined)).to.equal(1);
  });

  it("biases toward lower-priority tiers without filtering them out", function () {
    // The old algorithm filtered hard to the lowest tier — the
    // priority-10 hint always won. The new weighted algorithm gives
    // lower tiers a chance: at random=0.99 (drawing from the tail of
    // the weighted distribution) a lower-tier hint can be picked.
    const onboarding = { id: "a", markdown: "a", when: () => true, priority: 10 };
    const advanced = { id: "b", markdown: "b", when: () => true, priority: 50 };
    // Weights: onboarding=5, advanced=1, total=6. r=0 → pick first
    // (onboarding, 5/6 of the range). r=0.99 → consumes 5.94 of the
    // weight space, the last 0.06 lands in the advanced bucket.
    expect(pickByPriority([onboarding, advanced], () => 0).id).to.equal("a");
    expect(pickByPriority([onboarding, advanced], () => 0.99).id).to.equal("b");
  });

  it("respects total weight across many eligible hints", function () {
    // Three tiers represented. Total weight = 5 + 3 + 1 = 9.
    // r=0 → first eligible (tier-10, weight 5)
    // r=5/9 (just past 5) → second eligible (tier-30, weight 3)
    // r=8/9 (just past 8) → third eligible (tier-50, weight 1)
    const tier10 = { id: "ten", markdown: "x", when: () => true, priority: 10 };
    const tier30 = { id: "thirty", markdown: "x", when: () => true, priority: 30 };
    const tier50 = { id: "fifty", markdown: "x", when: () => true, priority: 50 };
    const eligible = [tier10, tier30, tier50];
    expect(pickByPriority(eligible, () => 0).id).to.equal("ten");
    expect(pickByPriority(eligible, () => 0.6).id).to.equal("thirty");
    expect(pickByPriority(eligible, () => 0.95).id).to.equal("fifty");
  });

  it("treats missing priority as the default (weight 1)", function () {
    const noPriority = { id: "a", markdown: "a", when: () => true };
    const fallback = { id: "b", markdown: "b", when: () => true, priority: 50 };
    // Both are weight 1 → 50/50 split.
    expect(["a", "b"]).to.include(
      pickByPriority([noPriority, fallback], () => 0).id
    );
    expect(["a", "b"]).to.include(
      pickByPriority([noPriority, fallback], () => 0.99).id
    );
  });
});

describe("hints/hints (registry)", function () {
  it("every hint has stable id, body, predicate, and a numeric priority when set", function () {
    // 25 active hints. `useFileTypesForRst` is commented out in the
    // registry but the `RST_EXTENSIONS` constant, the
    // `detectRstFiles` helper, and the `hasRstFiles` context field
    // are kept in place so the hint can be re-enabled without
    // re-plumbing.
    expect(HINTS.length).to.equal(25);
    const ids = new Set();
    // Ids are camelCase, matching the convention used everywhere else
    // in the project (step names like `goTo`, config fields like
    // `concurrentRunners`). No hyphens, no underscores. The regex
    // rejects ids with `-` so the convention can't drift on a future
    // hint addition.
    for (const h of HINTS) {
      expect(h.id, `bad id shape: ${h.id}`)
        .to.be.a("string")
        .and.match(/^[a-z][a-zA-Z0-9]*$/);
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

  it("installGithubAction: fires on a github repo with no workflow", function () {
    const h = findHint("installGithubAction");
    expect(h.priority).to.equal(10);
    expect(h.when(fakeCtx({ isGitHubRepo: true, hasDocDetectiveWorkflow: false }))).to.equal(true);
    expect(h.when(fakeCtx({ isGitHubRepo: true, hasDocDetectiveWorkflow: true }))).to.equal(false);
    expect(h.when(fakeCtx({ isGitHubRepo: false }))).to.equal(false);
  });

  it("addConfigFile: fires when no config file is loaded", function () {
    const h = findHint("addConfigFile");
    expect(h.priority).to.equal(10);
    expect(h.when(fakeCtx({ configPath: null }))).to.equal(true);
    expect(h.when(fakeCtx({ configPath: ".doc-detective.json" }))).to.equal(false);
  });

  it("addNpmScript: fires only when package.json exists and lacks a doc-detective script", function () {
    const h = findHint("addNpmScript");
    expect(h.priority).to.equal(10);
    // package.json exists, no doc-detective script -> fire
    expect(
      h.when(
        fakeCtx({ hasPackageJson: true, hasDocDetectiveNpmScript: false })
      )
    ).to.equal(true);
    // package.json exists with a doc-detective script -> skip
    expect(
      h.when(
        fakeCtx({ hasPackageJson: true, hasDocDetectiveNpmScript: true })
      )
    ).to.equal(false);
    // No package.json -> non-Node project, never hint
    expect(
      h.when(
        fakeCtx({ hasPackageJson: false, hasDocDetectiveNpmScript: false })
      )
    ).to.equal(false);
  });

  it("gitignoreOutputDir: fires when output is set, non-cwd, and not ignored", function () {
    const h = findHint("gitignoreOutputDir");
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

  it("installAgents: fires when ANY present agent lacks the adapter (over-promote)", function () {
    const h = findHint("installAgents");
    expect(h.priority).to.equal(10);
    // One present agent, no adapter -> fire
    expect(
      h.when(
        fakeCtx({
          agentDetections: [
            { adapterId: "a", displayName: "A", present: true, hasAdapterInstalled: false },
          ],
        })
      )
    ).to.equal(true);
    // Mixed: A has adapter, B does not -> still fire (B is missing it)
    expect(
      h.when(
        fakeCtx({
          agentDetections: [
            { adapterId: "a", displayName: "A", present: true, hasAdapterInstalled: true },
            { adapterId: "b", displayName: "B", present: true, hasAdapterInstalled: false },
          ],
        })
      )
    ).to.equal(true);
    // Both present agents have the adapter -> skip
    expect(
      h.when(
        fakeCtx({
          agentDetections: [
            { adapterId: "a", displayName: "A", present: true, hasAdapterInstalled: true },
            { adapterId: "b", displayName: "B", present: true, hasAdapterInstalled: true },
          ],
        })
      )
    ).to.equal(false);
    // No agents present -> skip
    expect(h.when(fakeCtx({ agentDetections: [] }))).to.equal(false);
    // Agent recorded but not present (adapterId in registry but absent on machine) -> skip
    expect(
      h.when(
        fakeCtx({
          agentDetections: [
            { adapterId: "a", displayName: "A", present: false, hasAdapterInstalled: false },
          ],
        })
      )
    ).to.equal(false);
  });

  // ----- current-run problems (priority 20) -----

  it("enableDebugLog: fires only when failedCount > 0", function () {
    const h = findHint("enableDebugLog");
    expect(h.priority).to.equal(20);
    expect(h.when(fakeCtx({ failedCount: 0 }))).to.equal(false);
    expect(h.when(fakeCtx({ failedCount: 3 }))).to.equal(true);
  });

  it("useRecordStepOnFailure: fires only on failure with a browser run and no recordings produced", function () {
    const h = findHint("useRecordStepOnFailure");
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

  it("useStableFindingPatterns: fires only on failure with selector-only finds", function () {
    const h = findHint("useStableFindingPatterns");
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

  it("useDryRunToDebugNoTests: fires when specs found but tests = 0", function () {
    const h = findHint("useDryRunToDebugNoTests");
    expect(h.priority).to.equal(20);
    expect(h.when(fakeCtx({ totalSpecs: 5, totalTests: 0 }))).to.equal(true);
    expect(h.when(fakeCtx({ totalSpecs: 5, totalTests: 5 }))).to.equal(false);
    expect(h.when(fakeCtx({ totalSpecs: 0, totalTests: 0 }))).to.equal(false);
  });

  it("upgradeNodeVersion: fires when nodeMajor < 20 (and nonzero)", function () {
    const h = findHint("upgradeNodeVersion");
    expect(h.priority).to.equal(20);
    expect(h.when(fakeCtx({ nodeMajor: 18 }))).to.equal(true);
    // Node 19 is in the < 20 range too — included as a regression
    // anchor so the hint body's "19 or older" stays in sync with the
    // predicate. If the predicate ever narrows to < 19, this test
    // should be updated alongside the hint markdown.
    expect(h.when(fakeCtx({ nodeMajor: 19 }))).to.equal(true);
    expect(h.when(fakeCtx({ nodeMajor: 20 }))).to.equal(false);
    expect(h.when(fakeCtx({ nodeMajor: 22 }))).to.equal(false);
    expect(h.when(fakeCtx({ nodeMajor: 0 }))).to.equal(false);
  });

  // ----- output & reporting (priority 30) -----

  it("tryHtmlReporter: fires only when html is not already configured", function () {
    const h = findHint("tryHtmlReporter");
    expect(h.priority).to.equal(30);
    expect(h.when(fakeCtx({ config: { reporters: ["terminal", "json"] } }))).to.equal(true);
    expect(h.when(fakeCtx({ config: { reporters: ["terminal", "html"] } }))).to.equal(false);
  });

  it("addJsonReporterForCi: fires on github when json is missing", function () {
    const h = findHint("addJsonReporterForCi");
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

  it("setOutputDir: fires when output is missing or '.' and specs ran", function () {
    const h = findHint("setOutputDir");
    expect(h.priority).to.equal(30);
    expect(h.when(fakeCtx({ config: {}, totalSpecs: 1 }))).to.equal(true);
    expect(h.when(fakeCtx({ config: { output: "." }, totalSpecs: 1 }))).to.equal(true);
    expect(h.when(fakeCtx({ config: { output: "out" }, totalSpecs: 1 }))).to.equal(false);
    expect(h.when(fakeCtx({ config: {}, totalSpecs: 0 }))).to.equal(false);
  });

  // ----- feature discovery (priority 40) -----

  it("useScreenshotStep: fires when 3+ tests use a browser but no screenshot was produced", function () {
    const h = findHint("useScreenshotStep");
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

  it("useCheckLinkStep: fires when goTo is used but checkLink isn't", function () {
    const h = findHint("useCheckLinkStep");
    expect(h.priority).to.equal(40);
    expect(h.when(fakeCtx({ usedStepTypes: new Set(["goTo"]) }))).to.equal(true);
    expect(
      h.when(fakeCtx({ usedStepTypes: new Set(["goTo", "checkLink"]) }))
    ).to.equal(false);
  });

  it("useHttpRequestStep: fires when runShell is used with curl and no httpRequest", function () {
    const h = findHint("useHttpRequestStep");
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

  it("useRunCodeStep: fires when runShell drives node/python and runCode isn't used", function () {
    const h = findHint("useRunCodeStep");
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

  it("useLoadCookieSaveCookie: fires only on browser + loadVariables + type + click and no loadCookie", function () {
    const h = findHint("useLoadCookieSaveCookie");
    expect(h.priority).to.equal(40);
    // Positive case: every required step type plus a browser.
    expect(
      h.when(
        fakeCtx({
          usedBrowserContexts: new Set(["chrome"]),
          usedStepTypes: new Set(["loadVariables", "type", "click"]),
        })
      )
    ).to.equal(true);
    // Already using loadCookie -> skip.
    expect(
      h.when(
        fakeCtx({
          usedBrowserContexts: new Set(["chrome"]),
          usedStepTypes: new Set(["loadVariables", "type", "click", "loadCookie"]),
        })
      )
    ).to.equal(false);
    // No browser -> skip (not a login-driven flow).
    expect(
      h.when(
        fakeCtx({
          usedBrowserContexts: new Set(),
          usedStepTypes: new Set(["loadVariables", "type", "click"]),
        })
      )
    ).to.equal(false);
    // Missing loadVariables -> skip (the user's revised predicate
    // requires loadVariables as a stronger signal of an env-driven
    // login flow).
    expect(
      h.when(
        fakeCtx({
          usedBrowserContexts: new Set(["chrome"]),
          usedStepTypes: new Set(["type", "click"]),
        })
      )
    ).to.equal(false);
  });

  it("useOpenApiValidation: fires on httpRequest usage without openApi integration", function () {
    const h = findHint("useOpenApiValidation");
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

  it("useSpecFilterForIteration: fires when 30+ specs and no filter active", function () {
    const h = findHint("useSpecFilterForIteration");
    expect(h.priority).to.equal(50);
    expect(h.when(fakeCtx({ totalSpecs: 30 }))).to.equal(true);
    expect(h.when(fakeCtx({ totalSpecs: 30, config: { specFilter: ["x"] } }))).to.equal(false);
    expect(h.when(fakeCtx({ totalSpecs: 30, config: { testFilter: ["x"] } }))).to.equal(false);
    expect(h.when(fakeCtx({ totalSpecs: 5 }))).to.equal(false);
    // Empty arrays are not active filters — must not silence the hint.
    expect(
      h.when(fakeCtx({ totalSpecs: 30, config: { specFilter: [], testFilter: [] } }))
    ).to.equal(true);
  });

  it("setInputScope: fires only when recursive (default) and 100+ specs", function () {
    const h = findHint("setInputScope");
    expect(h.priority).to.equal(50);
    expect(h.when(fakeCtx({ totalSpecs: 101 }))).to.equal(true);
    expect(h.when(fakeCtx({ totalSpecs: 101, config: { recursive: false } }))).to.equal(false);
    expect(h.when(fakeCtx({ totalSpecs: 50 }))).to.equal(false);
  });

  it("extractBeforeAnySharedSetup: fires on ≥5 specs without beforeAny regardless of step types", function () {
    const h = findHint("extractBeforeAnySharedSetup");
    // Predicate is `totalSpecs >= 5 && !config.beforeAny` — the
    // earlier `usedStepTypes.has("loadVariables")` gate was dropped in
    // a manual edit because the setup-extraction advice applies
    // broadly, not just to env-driven suites.
    expect(
      h.when(
        fakeCtx({ totalSpecs: 6, usedStepTypes: new Set(["loadVariables"]) })
      )
    ).to.equal(true);
    expect(
      h.when(fakeCtx({ totalSpecs: 6, usedStepTypes: new Set() }))
    ).to.equal(true);
    // Already has beforeAny => skip.
    expect(
      h.when(
        fakeCtx({
          totalSpecs: 6,
          usedStepTypes: new Set(["loadVariables"]),
          config: { beforeAny: "./setup.spec.json" },
        })
      )
    ).to.equal(false);
    // Under the spec-count threshold => skip.
    expect(
      h.when(fakeCtx({ totalSpecs: 4, usedStepTypes: new Set() }))
    ).to.equal(false);
  });

  it("extractAfterAllCleanup: fires on ≥5 specs without afterAll regardless of step types", function () {
    const h = findHint("extractAfterAllCleanup");
    // The current predicate is `totalSpecs >= 5 && !config.afterAll`
    // — the earlier `usedStepTypes.has("saveCookie")` gate was
    // dropped in a manual edit because the cleanup advice applies
    // broadly, not just to cookie-saving suites.
    expect(
      h.when(
        fakeCtx({ totalSpecs: 6, usedStepTypes: new Set(["saveCookie"]) })
      )
    ).to.equal(true);
    expect(
      h.when(fakeCtx({ totalSpecs: 6, usedStepTypes: new Set() }))
    ).to.equal(true);
    // Already has afterAll => skip.
    expect(
      h.when(
        fakeCtx({
          totalSpecs: 6,
          usedStepTypes: new Set(["saveCookie"]),
          config: { afterAll: "./cleanup.spec.json" },
        })
      )
    ).to.equal(false);
    // Under the spec-count threshold => skip.
    expect(
      h.when(fakeCtx({ totalSpecs: 4, usedStepTypes: new Set() }))
    ).to.equal(false);
  });

  it("setOriginForRelativeUrls: fires on goTo + relative URL with no origin set", function () {
    const h = findHint("setOriginForRelativeUrls");
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

  // Skipped while the `useFileTypesForRst` hint is commented out in
  // the registry. Re-enable both together — the test body still
  // exercises the (preserved) `hasRstFiles` context field and the
  // custom-extension normalization logic.
  it.skip("useFileTypesForRst: fires when .rst files exist and fileTypes lacks them", function () {
    const h = findHint("useFileTypesForRst");
    expect(h.when(fakeCtx({ hasRstFiles: true, config: {} }))).to.equal(true);
    // Already declared as a custom extension (no-dot form, matching the
    // schema/runtime convention) -> skip.
    expect(
      h.when(
        fakeCtx({
          hasRstFiles: true,
          config: {
            fileTypes: [
              { extends: "markdown", extensions: ["rst"] },
            ],
          },
        })
      )
    ).to.equal(false);
    // Author wrote ".rst" with a leading dot — also recognized as a
    // custom-extension declaration (defensive normalization).
    expect(
      h.when(
        fakeCtx({
          hasRstFiles: true,
          config: {
            fileTypes: [
              { extends: "markdown", extensions: [".rst"] },
            ],
          },
        })
      )
    ).to.equal(false);
    // No matching files -> skip.
    expect(h.when(fakeCtx({ hasRstFiles: false }))).to.equal(false);
  });

  it("enableTelemetryUserIdForTeam: fires for github repos with telemetry on but userId missing", function () {
    const h = findHint("enableTelemetryUserIdForTeam");
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
