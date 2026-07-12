// Type definitions for the post-run hints system.
//
// A `Hint` is a single piece of advice that may be shown to the user after a
// test run completes (pass or fail — some hints intentionally fire on
// failures, like `enableDebugLog` and `useRecordStepOnFailure`).
// Each hint is gated by a synchronous predicate (`when`) that evaluates a
// `HintContext` describing the current machine, repo, and run. Predicates
// must be cheap and side-effect-free — they may be invoked for every hint
// on every run.

/**
 * Information about a single coding-agent adapter, gathered from
 * `src/agents/registry.ts`. Used by the `installAgents` hint.
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
   * over-promote `installAgents` than miss an opportunity.
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
   * step that either:
   *   - `uses:` an action with the `doc-detective/` owner, or
   *   - has a `run:` script in which doc-detective appears as an actual
   *     command invocation. "Command invocation" means at the start of
   *     the script or after a shell separator (`&&`, `||`, `;`, `|`,
   *     newline), optionally prefixed by a runner like `npx`, `yarn`,
   *     `pnpm`, `pnpm dlx`, or `bunx` (with any dash-flags they take).
   *
   * Mentions of doc-detective in non-command positions (e.g.
   * `echo doc-detective`, `grep doc-detective package.json`) do NOT
   * match. YAML is parsed — not string-matched — so commented-out
   * steps are also ignored.
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
  /**
   * Total context count from `results.summary.contexts`
   * (pass+fail+warning+skipped). Cheap — read from the in-memory summary.
   */
  totalContexts: number;
  /** Total step count. */
  totalSteps: number;
  /**
   * Set of v3 step-action keys seen at least once across the run.
   * Mirrors the `step_v3` schema's action discriminators — the
   * authoritative list is `STEP_ACTION_KEYS` in `context.ts`, kept in
   * sync with `step_v3.schema.json`'s anyOf branches.
   */
  usedStepTypes: Set<string>;
  /** Browser names seen across `results.specs[].tests[].contexts[]`. */
  usedBrowserContexts: Set<string>;
  /** True if any step produced a screenshot. */
  producedScreenshots: boolean;
  /**
   * True if any step produced an auto screenshot (the `--auto-screenshot` /
   * config/spec/test `autoScreenshot` feature), which lands in the separate
   * `step.autoScreenshot` result field rather than `step.screenshot`.
   */
  producedAutoScreenshots: boolean;
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
   * `package.json` (like `addNpmScript`) gate on this so non-Node
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
   * `useFileTypesForRst`.
   */
  hasRstFiles: boolean;
  /**
   * True if any goTo/checkLink step in the run used a relative URL — i.e.
   * a value that did not begin with `http://`, `https://`, `file://`, or
   * `data:`. Powers `setOriginForRelativeUrls`.
   */
  hasRelativeUrls: boolean;
  /**
   * True if any runShell step's `command` contains the literal substring
   * `curl`. Powers `useHttpRequestStep`.
   */
  hasCurlInRunShell: boolean;
  /**
   * True if any runShell step's `command` (after trim) starts with
   * `node `, `python `, or `python3 ` — i.e. invokes Node or
   * Python as a top-level interpreter. Powers `useRunCodeStep`.
   */
  hasNodeOrPythonInRunShell: boolean;
  /**
   * True when the runner serialized the run's ffmpeg recordings on the shared
   * display (recordings queue on a "display" resource mutex while other
   * contexts run in parallel) because the platform lacks per-runner virtual
   * displays. Read directly from `results.recordingSerialized`. Powers
   * `recordConcurrently`.
   */
  recordingSerialized: boolean;
  /**
   * True if any step report carried a `source: "custom"` assertion record —
   * i.e. the user authored a `step.assertions` condition. (Every step also has
   * `source: "implicit"` records under the unified model, so this specifically
   * detects user-authored assertions.) Powers `useAssertionsForOutputChecks`.
   * Sourced from the `walkResults` step pass.
   */
  usedCustomAssertions: boolean;
  /**
   * True if any step's routing handler (`onPass`/`onFail`/`onWarning`/`onSkip`)
   * contained a `retry` entry — i.e. the user already uses routing retry.
   * Powers `useRetryForTransientErrors`. Sourced from the `walkResults` step
   * pass (the report spreads the authored step, so handlers are present).
   */
  usedRetry: boolean;
  /**
   * True if any request step (`httpRequest`/`checkLink`) FAILed this run with a
   * TRANSIENT server-side status — a 429 (rate limit) or any 5xx. A 4xx like
   * 404 is excluded (not transient — retry won't help). Powers
   * `useRetryForTransientErrors`. Sourced from the `walkResults` step pass
   * (`outputs.response.statusCode` for httpRequest, `outputs.statusCode` for
   * checkLink).
   */
  failedTransientRequest: boolean;
  /**
   * True if any runShell step FAILed without an explicit `shell` field —
   * on Windows that's often a cmd-flavored command now running under the
   * cross-platform `bash` default. Powers `setRunShellShell`. Sourced from
   * the `walkResults` step pass.
   */
  failedRunShellWithoutShell: boolean;
}

export interface Hint {
  /**
   * Stable camelCase identifier. Surfaced only in debug logs today; will
   * become user-visible if a per-hint disable list is added later — so
   * existing ids should not change once shipped.
   */
  id: string;
  /** Markdown body. Rendered through `src/hints/render.ts`. */
  markdown: string;
  /** Predicate. Hint is eligible iff this returns true. */
  when: (ctx: HintContext) => boolean;
  /**
   * Lower = more important. All eligible hints stay in the selection
   * pool; priority is mapped to a selection weight (5:4:3:2:1 across
   * the bands below — `priorityWeight` in `./index.ts` is the source
   * of truth), so a priority-10 hint is roughly 5× more likely than
   * a priority-50 one when both are eligible, but neither is
   * exclusive. Defaults to 50 if omitted, so newly-added hints
   * surface but don't drown out onboarding ones.
   *
   * Conventional bands:
   *   10 — onboarding (CI, config file, npm script, installAgents)
   *   20 — current-run problems (failures, env mismatches, no-tests-found)
   *   30 — output & reporting
   *   40 — feature discovery
   *   50 — optimization & advanced
   */
  priority?: number;
}
