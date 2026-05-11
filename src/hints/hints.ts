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
//   - Always link the docs with a Markdown link.
//   - Ids are stable camelCase; do not rename existing ids.
//   - Priority bands: 10 (onboarding), 20 (current-run problems),
//     30 (output/reporting), 40 (feature discovery), 50 (advanced).
//   - Order entries alphabetically by id within this file.

import type { Hint } from "./types.js";
import { RST_EXTENSIONS } from "./context.js";

export const HINTS: Hint[] = [
  // ------------------------------------------------------------------
  // addConfigFile (onboarding)
  // ------------------------------------------------------------------
  {
    id: "addConfigFile",
    priority: 10,
    markdown: [
      "Save your runner settings instead of remembering CLI flags. Drop a",
      "`.doc-detective.json` next to your tests:",
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
    priority: 30,
    markdown: [
      "On GitHub? Add the JSON reporter so CI can upload structured results",
      "as a workflow artifact:",
      "",
      "```bash",
      "doc-detective --reporters terminal json",
      "```",
    ].join("\n"),
    when: (ctx) =>
      Array.isArray(ctx.config?.reporters) &&
      !ctx.config.reporters.includes("json") &&
      ctx.isGitHubRepo,
  },

  // ------------------------------------------------------------------
  // addNpmScript (onboarding)
  // ------------------------------------------------------------------
  {
    id: "addNpmScript",
    priority: 10,
    markdown: [
      "Wire Doc Detective into your `package.json` so the team can run docs",
      "tests with `npm run test:docs`:",
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
  // enableDebugLog (current-run problem) — shipped in v1
  // ------------------------------------------------------------------
  {
    id: "enableDebugLog",
    priority: 20,
    markdown: [
      "Tests failed. Re-run with `--logLevel debug` for a full trace of every",
      "step:",
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
    priority: 50,
    markdown: [
      "Attribute Doc Detective usage to your team by setting",
      "`telemetry.userId` in `.doc-detective.json`. The id is opaque to us; it",
      "only appears in your telemetry dashboard.",
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
    priority: 50,
    markdown: [
      "If most specs finish by saving cookies for reuse, pull that cleanup",
      "into a single `afterAll` spec. Doc Detective runs it once after the",
      "rest of the suite:",
      "",
      "```json",
      "{ \"afterAll\": \"./cleanup.spec.json\" }",
      "```",
    ].join("\n"),
    when: (ctx) =>
      ctx.totalSpecs >= 5 &&
      !ctx.config?.afterAll &&
      ctx.usedStepTypes.has("saveCookie"),
  },

  // ------------------------------------------------------------------
  // extractBeforeAnySharedSetup (advanced)
  // ------------------------------------------------------------------
  {
    id: "extractBeforeAnySharedSetup",
    priority: 50,
    markdown: [
      "Repeating the same setup across specs? Move it into a `beforeAny`",
      "spec — it runs once before the rest of the input:",
      "",
      "```json",
      "{ \"beforeAny\": \"./setup.spec.json\" }",
      "```",
    ].join("\n"),
    when: (ctx) =>
      ctx.totalSpecs >= 5 &&
      !ctx.config?.beforeAny &&
      ctx.usedStepTypes.has("loadVariables"),
  },

  // ------------------------------------------------------------------
  // gitignoreOutputDir (onboarding)
  // ------------------------------------------------------------------
  {
    id: "gitignoreOutputDir",
    priority: 10,
    markdown: [
      "Add your Doc Detective output directory to `.gitignore` so artifacts",
      "stay out of commits. Append your configured `output` (for example:",
      "`doc-detective-output/`) on its own line:",
      "",
      "```bash",
      "echo \"doc-detective-output/\" >> .gitignore",
      "```",
    ].join("\n"),
    when: (ctx) =>
      !ctx.outputDirGitignored &&
      typeof ctx.config?.output === "string" &&
      ctx.config.output !== "." &&
      ctx.config.output !== "./",
  },

  // ------------------------------------------------------------------
  // installAgents (onboarding) — promoted aggressively
  // ------------------------------------------------------------------
  {
    id: "installAgents",
    priority: 10,
    markdown: [
      "Detected coding agents on this machine but no Doc Detective adapter",
      "installed. Add the adapter so your AI assistant can author and debug",
      "Doc Detective tests:",
      "",
      "```bash",
      "npx doc-detective install-agents",
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
    priority: 10,
    markdown: [
      "Add Doc Detective to your CI so docs are tested on every push. Save the",
      "snippet below as `.github/workflows/doc-detective.yml`:",
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
      "        with: { node-version: 20 }",
      "      - run: npx doc-detective",
      "```",
      "",
      "More: [doc-detective.com/docs](https://doc-detective.com/docs/)",
    ].join("\n"),
    when: (ctx) => ctx.isGitHubRepo && !ctx.hasDocDetectiveWorkflow,
  },

  // ------------------------------------------------------------------
  // setInputScope (advanced)
  // ------------------------------------------------------------------
  {
    id: "setInputScope",
    priority: 50,
    markdown: [
      "You're scanning 100+ specs. Scoping `input` to a directory or two is",
      "usually faster than recursing the whole repo:",
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
    priority: 50,
    markdown: [
      "Your tests use relative URLs. Set `origin` once and stop hardcoding",
      "the host in every spec:",
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
    priority: 30,
    markdown: [
      "Result artifacts are landing next to your source files. Set `output`",
      "in `.doc-detective.json` so they go somewhere predictable:",
      "",
      "```json",
      "{ \"output\": \"doc-detective-output\" }",
      "```",
    ].join("\n"),
    when: (ctx) =>
      (!ctx.config?.output || ctx.config.output === "." || ctx.config.output === "./") &&
      ctx.totalSpecs > 0,
  },

  // ------------------------------------------------------------------
  // tryHtmlReporter (output & reporting) — shipped in v1
  // ------------------------------------------------------------------
  {
    id: "tryHtmlReporter",
    priority: 30,
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
      "You're on Node 18 or older. Doc Detective targets Node 20+ — older",
      "runtimes hit obscure bugs in the browser stack and the schema parser.",
      "Upgrade and retry:",
      "",
      "More: [Node.js release schedule](https://nodejs.org/en/about/previous-releases)",
    ].join("\n"),
    when: (ctx) => ctx.nodeMajor > 0 && ctx.nodeMajor < 20,
  },

  // ------------------------------------------------------------------
  // useCheckLinkStep (feature discovery)
  // ------------------------------------------------------------------
  {
    id: "useCheckLinkStep",
    priority: 40,
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
  // useDryRunToDebugNoTests (current-run problem)
  // ------------------------------------------------------------------
  {
    id: "useDryRunToDebugNoTests",
    priority: 20,
    markdown: [
      "Found specs but no tests ran. `--dry-run` prints the resolved test",
      "plan as JSON so you can see what was filtered out:",
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
  {
    id: "useFileTypesForRst",
    priority: 50,
    markdown: [
      "Doc Detective doesn't have a built-in `reStructuredText` (`.rst`) file",
      "type. Extend `fileTypes` so its detector picks them up:",
      "",
      "```json",
      "{",
      "  \"fileTypes\": [",
      "    \"markdown\", \"asciidoc\", \"html\", \"dita\",",
      "    { \"extends\": \"markdown\", \"extensions\": [\"rst\"] }",
      "  ]",
      "}",
      "```",
    ].join("\n"),
    when: (ctx) => {
      // Strip leading dots so "rst" (the schema/runtime form) and
      // ".rst" (the dotted form some authors might still write) both
      // count as a custom-extension declaration.
      const targetExtensions = RST_EXTENSIONS.map((e) =>
        e.startsWith(".") ? e.slice(1) : e
      );
      const declared = ctx.config?.fileTypes;
      const hasCustomExtensions = Array.isArray(declared)
        ? declared.some((entry: any) => {
            if (!entry || typeof entry !== "object") return false;
            const exts = entry.extensions;
            const normalize = (e: any): string =>
              typeof e === "string"
                ? (e.startsWith(".") ? e.slice(1) : e).toLowerCase()
                : "";
            if (typeof exts === "string") {
              return targetExtensions.includes(normalize(exts));
            }
            if (Array.isArray(exts)) {
              return exts.some((e: any) =>
                targetExtensions.includes(normalize(e))
              );
            }
            return false;
          })
        : false;
      return !hasCustomExtensions && ctx.hasRstFiles;
    },
  },

  // ------------------------------------------------------------------
  // useHttpRequestStep (feature discovery)
  // ------------------------------------------------------------------
  {
    id: "useHttpRequestStep",
    priority: 40,
    markdown: [
      "Replace shelled-out `curl` with the typed `httpRequest` step. You get",
      "structured assertions on status codes, headers, and the JSON body:",
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
    priority: 40,
    markdown: [
      "Tests that log in over and over slow your suite down. Capture the",
      "session once with `saveCookie` and reuse it with `loadCookie`:",
      "",
      "```json",
      "{ \"saveCookie\": { \"path\": \"./cookies.json\" } }",
      "{ \"loadCookie\": { \"path\": \"./cookies.json\" } }",
      "```",
    ].join("\n"),
    when: (ctx) =>
      ctx.usedBrowserContexts.size > 0 &&
      !ctx.usedStepTypes.has("loadCookie") &&
      ctx.usedStepTypes.has("type") &&
      ctx.usedStepTypes.has("click"),
  },

  // ------------------------------------------------------------------
  // useOpenApiValidation (feature discovery)
  // ------------------------------------------------------------------
  {
    id: "useOpenApiValidation",
    priority: 40,
    markdown: [
      "Have an OpenAPI schema? Wire it into `integrations.openApi` and every",
      "`httpRequest` step gets validated against the spec automatically:",
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
      "Add a `record`/`stopRecord` pair around tricky tests so the next",
      "failure leaves a video behind:",
      "",
      "```json",
      "{ \"record\": { \"path\": \"./failure.webm\" } }",
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
  // useRunCodeStep (feature discovery)
  // ------------------------------------------------------------------
  {
    id: "useRunCodeStep",
    priority: 40,
    markdown: [
      "Running `node` or `python` in `runShell`? Switch to `runCode` for",
      "inline snippets — no shell-quoting traps and you can assert on the",
      "result directly:",
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
    priority: 40,
    markdown: [
      "Catch silent UI regressions: add a dedicated `screenshot` step after",
      "navigating. Doc Detective compares against the baseline on every run.",
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
    priority: 50,
    markdown: [
      "Iterating on one spec at a time? `--spec` and `--test` filter the run",
      "with case-insensitive regexes:",
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
      "Selectors are the #1 source of flaky doc tests. Prefer stable",
      "identifiers — accessible labels, ARIA roles, or `data-testid` — that",
      "outlive a redesign:",
      "",
      "```diff",
      "- find: { selector: \"#login button.primary\" }",
      "+ find: { elementText: \"Sign in\", elementAria: \"button\" }",
      "```",
      "",
      "More: [doc-detective.com/docs/find](https://doc-detective.com/docs/references/schemas/find)",
    ].join("\n"),
    when: (ctx) => ctx.failedCount > 0 && ctx.usedSelectorOnlyFinds,
  },
];

