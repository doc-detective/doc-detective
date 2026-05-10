// Type definitions for the post-run hints system.
//
// A `Hint` is a single piece of advice that may be shown to the user after a
// test run completes (pass or fail — some hints intentionally fire on
// failures, like `enable-debug-log` and `use-record-step-on-failure`).
// Each hint is gated by a synchronous predicate (`when`) that evaluates a
// `HintContext` describing the current machine, repo, and run. Predicates
// must be cheap and side-effect-free — they may be invoked for every hint
// on every run.

/**
 * Information about a single coding-agent adapter, gathered from
 * `src/agents/registry.ts`. Used by the `install-agents` hint.
 */
export interface AgentDetection {
  /** Adapter id (e.g. "claude-code"). */
  adapterId: string;
  /** Human-readable name, surfaced in hint markdown. */
  displayName: string;
  /** True when the agent itself appears installed on the user's machine. */
  present: boolean;
  /**
   * True when doc-detective's adapter is already registered with this agent
   * (in either project or global scope). Adapters whose install state probe
   * times out or errors are conservatively treated as `false` — we'd rather
   * over-promote install-agents than miss an opportunity.
   */
  hasAdapterInstalled: boolean;
}

export interface HintContext {
  /** The merged config object passed to the runner. */
  config: any;
  /** The results object returned by `runTests()`. */
  results: any;
  /** True when stdout is attached to a TTY. False when piped or redirected. */
  isTTY: boolean;
  /**
   * The remote URL recorded in the nearest `.git/config` walking up from
   * `process.cwd()`, or `null` if no git repo or no `[remote "origin"]`
   * section was found.
   */
  gitRemoteUrl: string | null;
  /** True when `gitRemoteUrl` resolves to a github.com origin. */
  isGitHubRepo: boolean;
  /**
   * True when `.github/workflows/*.{yml,yaml}` contains at least one job
   * step that uses `doc-detective/...` (action) or runs a command starting
   * with `doc-detective`. Parsed YAML — not a string match — to avoid
   * false positives on commented-out steps.
   */
  hasDocDetectiveWorkflow: boolean;
  /** Result of `os.platform()`. */
  platform: NodeJS.Platform;
  /**
   * Sum of failure counts across `results.summary.specs.fail`,
   * `results.summary.tests.fail`, and `results.summary.steps.fail`. A
   * single broken assertion typically increments all three layers, so
   * this is "is anything wrong" rather than a precise failed-test
   * count — predicates should treat any positive value as "failures
   * occurred".
   */
  failedCount: number;

  // ------------------------------------------------------------------
  // v2 expansion fields (added for the larger hint catalog).
  // ------------------------------------------------------------------

  /** Path to the loaded `.doc-detective.{json,yaml,yml}` file, or null. */
  configPath: string | null;
  /** Total spec count from `results.summary.specs` (pass+fail+warning+skipped). */
  totalSpecs: number;
  /** Total test count. */
  totalTests: number;
  /** Total step count. */
  totalSteps: number;
  /**
   * Set of v3 step-action keys seen at least once across the run.
   * Mirrors the `step_v3` schema's action discriminators: `checkLink`,
   * `click`, `dragAndDrop`, `find`, `goTo`, `httpRequest`,
   * `loadCookie`, `loadVariables`, `record`, `runCode`, `runShell`,
   * `saveCookie`, `screenshot`, `stopRecord`, `type`, `wait`.
   */
  usedStepTypes: Set<string>;
  /** Browser names seen across `results.specs[].tests[].contexts[]`. */
  usedBrowserContexts: Set<string>;
  /** True if any step produced a screenshot. */
  producedScreenshots: boolean;
  /** True if any step produced a recording. */
  producedRecordings: boolean;
  /**
   * True if any `find` step (top-level or nested inside click/type/etc.)
   * used a `selector` without a sibling stable identifier
   * (`elementText`, `elementAria`, `elementTestId`, `elementId`,
   * `elementClass`, `elementAttribute`).
   */
  usedSelectorOnlyFinds: boolean;
  /** Per-adapter detection result. Empty array on probe failure. */
  agentDetections: AgentDetection[];
  /**
   * True if `<cwd>/package.json` exists. Hints that suggest editing
   * `package.json` (like `add-npm-script`) gate on this so non-Node
   * projects don't see them.
   */
  hasPackageJson: boolean;
  /**
   * True if `<cwd>/package.json` exists and any `scripts[*]` value contains
   * the literal substring `doc-detective`.
   */
  hasDocDetectiveNpmScript: boolean;
  /**
   * True if `config.output` is a non-cwd path *and* it appears in the
   * nearest `.gitignore`. False when no `.gitignore` is found, when output
   * is the cwd (`.`), or when the path is not matched.
   */
  outputDirGitignored: boolean;
  /** Major Node.js version (e.g. 20 for Node 20.11.0). */
  nodeMajor: number;
  /**
   * True if the cwd (or a parent up to the repo root) contains at
   * least one `.rst` (reStructuredText) file. `.mdx` and `.adoc` are
   * intentionally not part of this signal because they are already
   * covered by the default `markdown` and `asciidoc` file-type
   * templates in `src/core/config.ts`. Recursive scan capped at 100
   * files to bound worst-case cost per `./AGENTS.md`. Powers
   * `use-fileTypes-for-rst`.
   */
  hasRstFiles: boolean;
  /**
   * True if any goTo/checkLink step in the run used a relative URL — i.e.
   * a value that did not begin with `http://`, `https://`, `file://`, or
   * `data:`. Powers `set-origin-for-relative-urls`.
   */
  hasRelativeUrls: boolean;
  /**
   * True if any runShell step's `command` contains the literal substring
   * `curl`. Powers `use-httpRequest-step`.
   */
  hasCurlInRunShell: boolean;
  /**
   * True if any runShell step's `command` starts with `node ` or `python `
   * (after trim). Powers `use-runCode-step`.
   */
  hasNodeOrPythonInRunShell: boolean;
}

export interface Hint {
  /**
   * Stable kebab-case identifier. Surfaced only in debug logs today; will
   * become user-visible if a per-hint disable list is added later — so
   * existing ids should not change once shipped.
   */
  id: string;
  /** Markdown body. Rendered through `src/hints/render.ts`. */
  markdown: string;
  /** Predicate. Hint is eligible iff this returns true. */
  when: (ctx: HintContext) => boolean;
  /**
   * Lower = more important. After eligibility filtering, only hints tied
   * for the lowest priority are candidates for random selection. Defaults
   * to 50 if omitted, so newly-added hints surface but don't drown out
   * onboarding ones.
   *
   * Conventional bands:
   *   10 — onboarding (CI, config file, npm script, install-agents)
   *   20 — current-run problems (failures, env mismatches, no-tests-found)
   *   30 — output & reporting
   *   40 — feature discovery
   *   50 — optimization & advanced
   */
  priority?: number;
}
