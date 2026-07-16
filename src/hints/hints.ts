// Built-in hints registry.
//
// Hints live here as plain TypeScript so each predicate can be a real
// function with full access to the `HintContext`. Adding a hint is a
// one-file change: append a `{ id, markdown, when, priority? }` object.
//
// **Style guidelines** for hint authors are documented in `./AGENTS.md`.
// Read that before adding a new entry. Quick rules:
//   - Hint bodies are short — usually 2–6 lines.
//   - Use fenced ```bash``` (or ```yaml```, etc.) blocks for commands.
//   - Prefer linking the docs with a Markdown link when there's a
//     relevant page; single-flag / single-field hints can skip it.
//   - Ids are stable camelCase; do not rename existing ids.
//   - Priority bands: 10 (onboarding), 20 (current-run problems),
//     30 (output/reporting), 40 (feature discovery), 50 (advanced).
//     (All hints currently ship at priority 20 — a deliberate flat
//     start; bands stay as guidance for future re-prioritization.)
//   - Order entries alphabetically by id within this file.

import type { Hint } from "./types.js";
// Note: when re-enabling `useFileTypesForRst` below, also restore:
//   import { RST_EXTENSIONS } from "./context.js";

export const HINTS: Hint[] = [
  // ------------------------------------------------------------------
  // addConfigFile (onboarding)
  // ------------------------------------------------------------------
  {
    id: "addConfigFile",
    priority: 20,
    markdown: [
      "Save your settings instead of remembering CLI flags. Drop a `.doc-detective.json` next to your tests:",
      "",
      "```json",
      "{",
      "  \"$schema\": \"https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/config_v3.schema.json\",",
      "  \"input\": \"docs\",",
      "  \"output\": \"doc-detective-output\",",
      "  \"reporters\": [\"terminal\", \"json\", \"html\"]",
      "}",
      "```",
      "",
      "More: [doc-detective.com/docs/configuration](https://doc-detective.com/docs/get-started/configuration)",
    ].join("\n"),
    when: (ctx) => ctx.configPath === null,
  },

  // ------------------------------------------------------------------
  // addJsonReporterForCi (output & reporting)
  // ------------------------------------------------------------------
  {
    id: "addJsonReporterForCi",
    priority: 20,
    markdown: [
      "On GitHub? Add the JSON reporter so CI can upload structured results as a workflow artifact:",
      "",
      "```bash",
      "doc-detective --reporters terminal json",
      "```",
    ].join("\n"),
    when: (ctx) => {
      const reporters = ctx.config?.reporters;
      return (
        Array.isArray(reporters) &&
        !reporters.includes("json") &&
        ctx.isGitHubRepo
      );
    },
  },

  // ------------------------------------------------------------------
  // addNpmScript (onboarding)
  // ------------------------------------------------------------------
  {
    id: "addNpmScript",
    priority: 20,
    markdown: [
      "Wire Doc Detective into your `package.json` so the team can run docs tests with `npm run test:docs`:",
      "",
      "```json",
      "{",
      "  \"scripts\": {",
      "    \"test:docs\": \"doc-detective\"",
      "  }",
      "}",
      "```",
    ].join("\n"),
    // Only suggest the npm script when there's actually a package.json
    // to add it to. Non-Node projects shouldn't see this hint.
    when: (ctx) =>
      ctx.hasPackageJson === true && ctx.hasDocDetectiveNpmScript === false,
  },

  // ------------------------------------------------------------------
  // enableAutoRecord (feature discovery)
  // ------------------------------------------------------------------
  {
    id: "enableAutoRecord",
    priority: 40,
    markdown: [
      "Want a video of every run? Enable `--auto-record` to record each driver-based context end-to-end — browser and desktop app contexts capture the screen with the ffmpeg engine; Android/iOS contexts record the device screen.",
      "",
      "Videos are archived per run under `.doc-detective/runs/<runId>/` alongside test results, so you can replay exactly what happened.",
      "",
      "```bash",
      "doc-detective --auto-record",
      "```",
    ].join("\n"),
    // Browser contexts or app surfaces (startSurface) — autoRecord covers
    // desktop app and mobile device contexts too (phase A7).
    when: (ctx) =>
      (ctx.usedBrowserContexts.size > 0 ||
        ctx.usedStepTypes.has("startSurface")) &&
      !ctx.producedRecordings &&
      !ctx.config?.autoRecord,
  },

  // ------------------------------------------------------------------
  // enableAutoScreenshot (feature discovery)
  // ------------------------------------------------------------------
  {
    id: "enableAutoScreenshot",
    priority: 40,
    markdown: [
      "Want a visual record of every run? Enable `--auto-screenshot` to capture an image after each browser step.",
      "",
      "Screenshots are archived per run under `.doc-detective/runs/<runId>/` alongside test results. Diff two run folders to spot UI changes over time.",
      "",
      "```bash",
      "doc-detective --auto-screenshot",
      "```",
    ].join("\n"),
    when: (ctx) =>
      ctx.usedBrowserContexts.size > 0 &&
      !ctx.producedScreenshots &&
      !ctx.producedAutoScreenshots &&
      !ctx.config?.autoScreenshot,
  },

  // ------------------------------------------------------------------
  // enableDebugLog (current-run problem) — shipped in v1
  // ------------------------------------------------------------------
  {
    id: "enableDebugLog",
    priority: 20,
    markdown: [
      "Tests failed. Re-run with `--logLevel debug` for a full trace of every step:",
      "",
      "```bash",
      "doc-detective --logLevel debug",
      "```",
    ].join("\n"),
    when: (ctx) => ctx.failedCount > 0,
  },

  // ------------------------------------------------------------------
  // enableTelemetryUserIdForTeam (advanced)
  // ------------------------------------------------------------------
  {
    id: "enableTelemetryUserIdForTeam",
    priority: 20,
    markdown: [
      "Attribute Doc Detective usage to your team by setting `telemetry.userId` in `.doc-detective.json`.",
      "",
      "```json",
      "{",
      "  \"telemetry\": { \"send\": true, \"userId\": \"my-team\" }",
      "}",
      "```",
    ].join("\n"),
    when: (ctx) =>
      ctx.config?.telemetry?.send !== false &&
      !ctx.config?.telemetry?.userId &&
      ctx.isGitHubRepo,
  },

  // ------------------------------------------------------------------
  // extractAfterAllCleanup (advanced)
  // ------------------------------------------------------------------
  {
    id: "extractAfterAllCleanup",
    priority: 20,
    markdown: [
      "If most specs finish by cleaning up the test environment, pull that cleanup into a single `afterAll` spec. Doc Detective runs it once after the rest of the suite:",
      "",
      "```json",
      "{ \"afterAll\": \"./cleanup.spec.json\" }",
      "```",
    ].join("\n"),
    when: (ctx) =>
      ctx.totalSpecs >= 5 &&
      !ctx.config?.afterAll,
  },

  // ------------------------------------------------------------------
  // extractBeforeAnySharedSetup (advanced)
  // ------------------------------------------------------------------
  {
    id: "extractBeforeAnySharedSetup",
    priority: 20,
    markdown: [
      "Repeating the same setup across specs? Move it into a `beforeAny` spec — it runs once before the rest of the input:",
      "",
      "```json",
      "{ \"beforeAny\": \"./setup.spec.json\" }",
      "```",
    ].join("\n"),
    when: (ctx) =>
      ctx.totalSpecs >= 5 &&
      !ctx.config?.beforeAny,
  },

  // ------------------------------------------------------------------
  // gitignoreOutputDir (onboarding)
  // ------------------------------------------------------------------
  {
    id: "gitignoreOutputDir",
    priority: 20,
    markdown: [
      "Add your Doc Detective output directory to `.gitignore` so artifacts stay out of commits. Append your configured `output` (for example: `doc-detective-output/`) on its own line:",
      "",
      "```bash",
      "echo \"doc-detective-output/\" >> .gitignore",
      "```",
    ].join("\n"),
    when: (ctx) => {
      const output = ctx.config?.output;
      return (
        !ctx.outputDirGitignored &&
        typeof output === "string" &&
        output !== "." &&
        output !== "./"
      );
    },
  },

  // ------------------------------------------------------------------
  // installAgents (onboarding) — promoted aggressively
  // ------------------------------------------------------------------
  {
    id: "installAgents",
    priority: 20,
    markdown: [
      "Install the Doc Detective agent tools so your AI assistant can author and debug Doc Detective tests:",
      "",
      "```bash",
      "doc-detective install-agents",
      "```",
      "",
      "More: [doc-detective.com/docs/agents](https://doc-detective.com/docs/integrations/ai-agents)",
    ].join("\n"),
    // Fire when at least one detected agent does NOT have the adapter
    // installed. Earlier versions used `every(!hasAdapterInstalled)`,
    // which silenced the hint as soon as a single agent had the
    // adapter — even if the user also runs other agents that don't.
    // The intent is to over-promote installation, so we hint as long
    // as one of the user's agents is missing it.
    when: (ctx) =>
      ctx.agentDetections.some((d) => d.present && !d.hasAdapterInstalled),
  },

  // ------------------------------------------------------------------
  // installGithubAction (onboarding) — shipped in v1
  // ------------------------------------------------------------------
  {
    id: "installGithubAction",
    priority: 20,
    markdown: [
      "Add Doc Detective to your CI so docs are tested on every push. Save the snippet below as `.github/workflows/doc-detective.yml`:",
      "",
      "```yaml",
      "name: Doc Detective",
      "on: [push, pull_request]",
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@v4",
      "      - uses: actions/setup-node@v4",
      "        with: { node-version: 24 }",
      "      - run: npx doc-detective",
      "```",
      "",
      "More: [doc-detective.com/docs](https://doc-detective.com/docs/)",
    ].join("\n"),
    when: (ctx) => ctx.isGitHubRepo && !ctx.hasDocDetectiveWorkflow,
  },

  // ------------------------------------------------------------------
  // prebuildWebDriverAgent (optimization & advanced)
  // ------------------------------------------------------------------
  {
    id: "prebuildWebDriverAgent",
    priority: 50,
    markdown: [
      "This run drove an iOS simulator. The first iOS session on a cold environment compiles WebDriverAgent with `xcodebuild` — around 10 minutes. Prebuild it once and every later run (and every parallel job sharing the cache) skips that cost:",
      "",
      "```bash",
      "doc-detective install ios --yes",
      "```",
      "",
      "More: [doc-detective.com/reference/cli/install](https://doc-detective.com/reference/cli/install#install-ios)",
    ].join("\n"),
    when: (ctx) => ctx.ranIosContexts && !ctx.hasManagedWdaProducts,
  },

  // ------------------------------------------------------------------
  // recordConcurrently (optimization & advanced)
  // ------------------------------------------------------------------
  {
    id: "recordConcurrently",
    priority: 50,
    markdown: [
      "ffmpeg recordings in this run were serialized to protect the shared display (non-driver work still ran in parallel). To let the recordings run concurrently too, record the Chrome viewport with the browser engine, which captures just the browser window:",
      "",
      "```json",
      '{ "record": { "engine": "browser" } }',
      "```",
      "",
      "Recordings on Android/iOS contexts capture the device screen and always run concurrently — no engine change needed there.",
    ].join("\n"),
    when: (ctx) => ctx.recordingSerialized,
  },

  // ------------------------------------------------------------------
  // refreshStaleRecording (current-run problems)
  // ------------------------------------------------------------------
  {
    id: "refreshStaleRecording",
    priority: 20,
    markdown: [
      "A recording in this run appears stale: its checkpoint screenshots no longer match their committed baselines, but recording is skipped in headless mode so the video couldn't refresh itself.",
      "",
      "Re-run the affected test on a headed context (a visible display) to re-record it — with `overwrite: \"aboveVariation\"`, the recording and its baselines refresh together automatically.",
    ].join("\n"),
    when: (ctx) => ctx.hasStaleRecordings,
  },

  // ------------------------------------------------------------------
  // setConcurrentRunners (optimization & advanced)
  // ------------------------------------------------------------------
  {
    id: "setConcurrentRunners",
    priority: 50,
    markdown: [
      "This run executed several test contexts one at a time. Independent contexts can run in parallel with `concurrentRunners`:",
      "",
      "```json",
      '{ "concurrentRunners": true }',
      "```",
      "",
      "Or pass `--concurrent-runners 4` on the CLI. `true` uses your CPU core count (capped at 4). Keep it at `1` if your tests share variables across contexts. Recordings are safe to run concurrently: the `browser` engine records each context's own window, and Doc Detective auto-serializes `ffmpeg` recordings with other browser tests for you.",
    ].join("\n"),
    when: (ctx) =>
      ctx.totalContexts >= 5 &&
      ctx.config?.concurrentRunners !== true &&
      !(Number(ctx.config?.concurrentRunners) > 1) &&
      !ctx.producedRecordings,
  },

  // ------------------------------------------------------------------
  // setInputScope (advanced)
  // ------------------------------------------------------------------
  {
    id: "setInputScope",
    priority: 20,
    markdown: [
      "You're scanning 100+ specs. Scoping `input` to a directory or two is usually faster than recursing the whole repo:",
      "",
      "```json",
      "{ \"input\": [\"docs\", \"reference\"] }",
      "```",
    ].join("\n"),
    when: (ctx) => ctx.config?.recursive !== false && ctx.totalSpecs > 100,
  },

  // ------------------------------------------------------------------
  // setOriginForRelativeUrls (advanced)
  // ------------------------------------------------------------------
  {
    id: "setOriginForRelativeUrls",
    priority: 20,
    markdown: [
      "Your tests use relative URLs. Set `origin` once and stop hardcoding the host in every spec:",
      "",
      "```json",
      "{ \"origin\": \"https://staging.example.com\" }",
      "```",
    ].join("\n"),
    when: (ctx) =>
      !ctx.config?.origin &&
      ctx.usedStepTypes.has("goTo") &&
      ctx.hasRelativeUrls,
  },

  // ------------------------------------------------------------------
  // setOutputDir (output & reporting)
  // ------------------------------------------------------------------
  {
    id: "setOutputDir",
    priority: 20,
    markdown: [
      "Result artifacts are landing next to your source files. Set `output` in `.doc-detective.json` so they go somewhere predictable:",
      "",
      "```json",
      "{ \"output\": \"doc-detective-output\" }",
      "```",
    ].join("\n"),
    when: (ctx) => {
      const output = ctx.config?.output;
      return (
        (!output || output === "." || output === "./") &&
        ctx.totalSpecs > 0
      );
    },
  },

  // ------------------------------------------------------------------
  // setRunShellShell (current-run problems)
  // ------------------------------------------------------------------
  {
    id: "setRunShellShell",
    priority: 20,
    markdown: [
      "A `runShell` step failed on Windows. `runShell` runs commands in `bash` by default (for cross-platform consistency); if the command was written for a Windows shell, pick it explicitly:",
      "",
      "```json",
      '{ "runShell": { "command": "echo %CD%", "shell": "cmd" } }',
      "```",
      "",
      '`shell` accepts `bash`, `cmd`, or `powershell` per step, or set a project-wide default with `"shell"` in `.doc-detective.json`.',
    ].join("\n"),
    when: (ctx) =>
      ctx.platform === "win32" &&
      ctx.failedRunShellWithoutShell === true &&
      // Only when the bash default actually applied — a config-level `shell`
      // of cmd/powershell means the failed command already ran in the shell
      // this hint would suggest.
      (ctx.config?.shell ?? "bash") === "bash",
  },

  // ------------------------------------------------------------------
  // tryHtmlReporter (output & reporting) — shipped in v1
  // ------------------------------------------------------------------
  {
    id: "tryHtmlReporter",
    priority: 20,
    markdown: [
      "Generate a shareable HTML report alongside the terminal summary:",
      "",
      "```bash",
      "doc-detective --reporters terminal json html",
      "```",
    ].join("\n"),
    when: (ctx) => {
      const reporters = ctx.config?.reporters;
      return Array.isArray(reporters) && !reporters.includes("html");
    },
  },

  // ------------------------------------------------------------------
  // upgradeNodeVersion (current-run problem)
  // ------------------------------------------------------------------
  {
    id: "upgradeNodeVersion",
    priority: 20,
    markdown: [
      "You're on Node 19 or older. Doc Detective targets Node 20+ — older runtimes hit obscure bugs in the browser stack and the schema parser. Upgrade and retry:",
      "",
      "More: [Node.js release schedule](https://nodejs.org/en/about/previous-releases)",
    ].join("\n"),
    when: (ctx) => ctx.nodeMajor > 0 && ctx.nodeMajor < 20,
  },

  // ------------------------------------------------------------------
  // useAssertionsForOutputChecks (feature discovery)
  // ------------------------------------------------------------------
  {
    id: "useAssertionsForOutputChecks",
    priority: 40,
    markdown: [
      "Steps like `runShell`, `httpRequest`, and `runCode` pass when they execute — but you can also assert on what they produced. Add an `assertions` expression over `$$outputs.*` to check a specific value:",
      "",
      "```json",
      "{ \"runShell\": \"node --version\", \"assertions\": \"$$outputs.stdio.stdout contains v20\" }",
      "```",
      "",
      "A failed assertion fails the step (and the test) — turning \"it ran\" into \"it returned what I expected\". Pass an array of strings to require several.",
    ].join("\n"),
    when: (ctx) =>
      !ctx.usedCustomAssertions &&
      (ctx.usedStepTypes.has("runShell") ||
        ctx.usedStepTypes.has("httpRequest") ||
        ctx.usedStepTypes.has("runCode")),
  },

  // ------------------------------------------------------------------
  // useCheckLinkStep (feature discovery)
  // ------------------------------------------------------------------
  {
    id: "useCheckLinkStep",
    priority: 20,
    markdown: [
      "Catch dead doc links before readers do. Add a `checkLink` step:",
      "",
      "```json",
      "{ \"checkLink\": { \"url\": \"https://docs.example.com\", \"statusCodes\": [200] } }",
      "```",
    ].join("\n"),
    when: (ctx) =>
      !ctx.usedStepTypes.has("checkLink") && ctx.usedStepTypes.has("goTo"),
  },

  // ------------------------------------------------------------------
  // useDebugFlag (current-run problem)
  // ------------------------------------------------------------------
  {
    id: "useDebugFlag",
    priority: 20,
    markdown: [
      "Stuck on a setup problem? `doc-detective debug` captures your OS, Doc Detective version, browsers, tool versions, and any env vars referenced by your config:",
      "",
      "```bash",
      "doc-detective debug",
      "```",
      "",
      "Review the output before pasting into a bug report — secrets are best-effort-redacted by name and value shape, but values with novel names or shapes (custom URL-style connection strings, in-house token formats) may slip through. `--include-env` opts into a full `process.env` dump if you need it.",
    ].join("\n"),
    when: (ctx) => ctx.failedCount > 0,
  },

  // ------------------------------------------------------------------
  // useDryRunToDebugNoTests (current-run problem)
  // ------------------------------------------------------------------
  {
    id: "useDryRunToDebugNoTests",
    priority: 20,
    markdown: [
      "Found specs but no tests ran. `--dry-run` prints the resolved test plan as JSON so you can see what was filtered out:",
      "",
      "```bash",
      "doc-detective --dry-run",
      "```",
    ].join("\n"),
    when: (ctx) => ctx.totalTests === 0 && ctx.totalSpecs > 0,
  },

  // ------------------------------------------------------------------
  // useFileTypesForRst (advanced)
  //
  // Targets `.rst` only because `.mdx` and `.adoc` are already covered
  // by the default `markdown` / `asciidoc` file-type templates in
  // `src/core/config.ts`. `extensions` values use the no-dot form
  // because file detection in `src/common/src/detectTests.ts` compares
  // against `filePath.split('.').pop().toLowerCase()`.
  // ------------------------------------------------------------------
  // {
  //   id: "useFileTypesForRst",
  //   priority: 50,
  //   markdown: [
  //     "Doc Detective doesn't have a built-in `reStructuredText` (`.rst`) file type. Extend `fileTypes` so its detector picks them up:",
  //     "",
  //     "```json",
  //     "{",
  //     "  \"fileTypes\": [",
  //     "    \"markdown\", \"asciidoc\", \"html\", \"dita\",",
  //     "    { \"extends\": \"markdown\", \"extensions\": [\"rst\"] }",
  //     "  ]",
  //     "}",
  //     "```",
  //   ].join("\n"),
  //   when: (ctx) => {
  //     // Strip leading dots so "rst" (the schema/runtime form) and
  //     // ".rst" (the dotted form some authors might still write) both
  //     // count as a custom-extension declaration.
  //     const targetExtensions = RST_EXTENSIONS.map((e) =>
  //       e.startsWith(".") ? e.slice(1) : e
  //     );
  //     const declared = ctx.config?.fileTypes;
  //     const hasCustomExtensions = Array.isArray(declared)
  //       ? declared.some((entry: any) => {
  //           if (!entry || typeof entry !== "object") return false;
  //           const exts = entry.extensions;
  //           const normalize = (e: any): string =>
  //             typeof e === "string"
  //               ? (e.startsWith(".") ? e.slice(1) : e).toLowerCase()
  //               : "";
  //           if (typeof exts === "string") {
  //             return targetExtensions.includes(normalize(exts));
  //           }
  //           if (Array.isArray(exts)) {
  //             return exts.some((e: any) =>
  //               targetExtensions.includes(normalize(e))
  //             );
  //           }
  //           return false;
  //         })
  //       : false;
  //     return !hasCustomExtensions && ctx.hasRstFiles;
  //   },
  // },

  // ------------------------------------------------------------------
  // useHttpRequestStep (feature discovery)
  // ------------------------------------------------------------------
  {
    id: "useHttpRequestStep",
    priority: 20,
    markdown: [
      "Replace shelled-out `curl` with the typed `httpRequest` step. You get structured assertions on status codes, headers, and the JSON body:",
      "",
      "```json",
      "{",
      "  \"httpRequest\": {",
      "    \"url\": \"https://api.example.com/health\",",
      "    \"statusCodes\": [200],",
      "    \"response\": { \"body\": { \"$.status\": \"ok\" } }",
      "  }",
      "}",
      "```",
    ].join("\n"),
    when: (ctx) =>
      ctx.usedStepTypes.has("runShell") &&
      !ctx.usedStepTypes.has("httpRequest") &&
      ctx.hasCurlInRunShell,
  },

  // ------------------------------------------------------------------
  // useLoadCookieSaveCookie (feature discovery)
  // ------------------------------------------------------------------
  {
    id: "useLoadCookieSaveCookie",
    priority: 20,
    markdown: [
      "Tests that log in over and over slow your suite down. Capture the session once with `saveCookie` and reuse it with `loadCookie`:",
      "",
      "```json",
      "{ \"saveCookie\": { \"path\": \"./cookies.json\" } }",
      "{ \"loadCookie\": { \"path\": \"./cookies.json\" } }",
      "```",
    ].join("\n"),
    when: (ctx) =>
      ctx.usedBrowserContexts.size > 0 &&
      !ctx.usedStepTypes.has("loadCookie") &&
      ctx.usedStepTypes.has("loadVariables") &&
      ctx.usedStepTypes.has("type") &&
      ctx.usedStepTypes.has("click"),
  },

  // ------------------------------------------------------------------
  // useOpenApiValidation (feature discovery)
  // ------------------------------------------------------------------
  {
    id: "useOpenApiValidation",
    priority: 20,
    markdown: [
      "Have an OpenAPI schema? Wire it into `integrations.openApi` and validate every `httpRequest` step against the spec:",
      "",
      "```json",
      "{",
      "  \"integrations\": {",
      "    \"openApi\": [{ \"name\": \"main\", \"descriptionPath\": \"./openapi.yaml\" }]",
      "  }",
      "}",
      "```",
    ].join("\n"),
    when: (ctx) =>
      ctx.usedStepTypes.has("httpRequest") &&
      !ctx.config?.integrations?.openApi,
  },

  // ------------------------------------------------------------------
  // useRecordStepOnFailure (current-run problem)
  // ------------------------------------------------------------------
  {
    id: "useRecordStepOnFailure",
    priority: 20,
    markdown: [
      "Add a `record`/`stopRecord` pair around tricky tests so the next failure leaves a video behind:",
      "",
      "```json",
      "{ \"record\": { \"path\": \"failure.webm\", \"directory\": \"./artifacts\" } }",
      "// ...steps that might fail...",
      "{ \"stopRecord\": true }",
      "```",
    ].join("\n"),
    when: (ctx) =>
      ctx.failedCount > 0 &&
      !ctx.producedRecordings &&
      ctx.usedBrowserContexts.size > 0,
  },

  // ------------------------------------------------------------------
  // useRetryForTransientErrors (current-run problem)
  // ------------------------------------------------------------------
  {
    id: "useRetryForTransientErrors",
    priority: 20,
    markdown: [
      "A request returned a transient server error this run (a 429 rate-limit or a 5xx). `onFail` retry with exponential backoff re-runs the step before failing — the standard way to ride out rate limits and flaky upstreams:",
      "",
      "```json",
      "{ \"httpRequest\": \"https://api.example.com/data\", \"onFail\": [{ \"retry\": { \"limit\": 3, \"delay\": 1000, \"backoff\": \"exponential\" } }] }",
      "```",
      "",
      "The same `onFail` retry works on a `checkLink` step. Retry never changes the verdict — if the upstream is still erroring after the retries, the step still fails, so a real outage isn't masked.",
    ].join("\n"),
    when: (ctx) => ctx.failedTransientRequest && !ctx.usedRetry,
  },

  // ------------------------------------------------------------------
  // useRunBrowserScriptStep (feature discovery)
  // ------------------------------------------------------------------
  {
    id: "useRunBrowserScriptStep",
    priority: 40,
    markdown: [
      "Need to read computed page state or seed the app from a test? `runBrowserScript` runs JavaScript in the live page and captures the return value into `outputs.result`.",
      "",
      "Reach for it when an assertion depends on DOM or `window` state the built-in steps don't expose, or when you need to set up state like `localStorage` before continuing.",
      "",
      "```json",
      "{ \"runBrowserScript\": { \"script\": \"return document.title;\", \"output\": \"Welcome\" } }",
      "```",
      "",
      "More: [doc-detective.com/docs/runBrowserScript](https://doc-detective.com/docs/references/schemas/runbrowserscript)",
    ].join("\n"),
    when: (ctx) =>
      ctx.usedBrowserContexts.size > 0 &&
      ctx.usedStepTypes.has("find") &&
      !ctx.usedStepTypes.has("runBrowserScript"),
  },

  // ------------------------------------------------------------------
  // useRunCodeStep (feature discovery)
  // ------------------------------------------------------------------
  {
    id: "useRunCodeStep",
    priority: 20,
    markdown: [
      "Running `node` or `python` in `runShell`? Switch to `runCode` for inline snippets — no shell-quoting traps, and you can assert on the result directly:",
      "",
      "```json",
      "{ \"runCode\": { \"language\": \"node\", \"code\": \"console.log(1+1)\" } }",
      "```",
    ].join("\n"),
    when: (ctx) =>
      ctx.usedStepTypes.has("runShell") &&
      !ctx.usedStepTypes.has("runCode") &&
      ctx.hasNodeOrPythonInRunShell,
  },

  // ------------------------------------------------------------------
  // useScreenshotStep (feature discovery)
  // ------------------------------------------------------------------
  {
    id: "useScreenshotStep",
    priority: 20,
    markdown: [
      "Catch silent UI regressions: add a dedicated `screenshot` step after navigating. Doc Detective compares against the baseline on every run.",
      "",
      "```json",
      "{ \"goTo\": \"https://example.com\" },",
      "{ \"screenshot\": { \"path\": \"./home.png\" } }",
      "```",
    ].join("\n"),
    when: (ctx) =>
      ctx.totalTests >= 3 &&
      ctx.usedBrowserContexts.size > 0 &&
      !ctx.producedScreenshots,
  },

  // ------------------------------------------------------------------
  // useSpecFilterForIteration (advanced)
  // ------------------------------------------------------------------
  {
    id: "useSpecFilterForIteration",
    priority: 20,
    markdown: [
      "Iterating on one spec at a time? `--spec` and `--test` filter the run with case-insensitive regexes:",
      "",
      "```bash",
      "doc-detective --spec login",
      "doc-detective --test smoke,checkout",
      "```",
    ].join("\n"),
    // `?.length` is the right defense: an empty array passes
    // `!ctx.config?.specFilter`'s truthiness check (truthy: array is
    // an object), which would silence the hint even when no filter is
    // actually active.
    when: (ctx) =>
      ctx.totalSpecs >= 30 &&
      !ctx.config?.specFilter?.length &&
      !ctx.config?.testFilter?.length,
  },

  // ------------------------------------------------------------------
  // useStableFindingPatterns (current-run problem)
  // ------------------------------------------------------------------
  {
    id: "useStableFindingPatterns",
    priority: 20,
    markdown: [
      "Selectors are the #1 source of flaky doc tests. Prefer stable identifiers — display strings, accessible names, or `data-testid` — that outlive a redesign:",
      "",
      "```diff",
      "- find: { selector: \"#login button.primary\" }",
      "+ find: { elementText: \"Sign in\", elementAria: \"Sign in to your account\" }",
      "```",
      "",
      "More: [doc-detective.com/docs/find](https://doc-detective.com/docs/references/schemas/find)",
    ].join("\n"),
    when: (ctx) => ctx.failedCount > 0 && ctx.usedSelectorOnlyFinds,
  },
];

