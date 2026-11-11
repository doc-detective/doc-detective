// Generates the CLI reference page at fern/pages/reference/cli.mdx from the
// doc-detective CLI definitions. This page is GENERATED — do not edit it by
// hand. To change it, update the CLI source (src/cliOptions.ts, the command
// builders in src/cliProgram.ts, src/lsp, src/debug, and src/runtime) or the
// config_v3 schema, then re-run `npm run compile` and
// `npm run docs:build-cli-ref`.
//
// Sibling of docs/.scripts/buildSchemaReferencesV4.js (which generates the
// reference/schemas/*.mdx pages). It reads the compiled commander tree from
// dist/cliProgram.js, so the page can't drift from what the CLI accepts.
// Run-flag defaults come from the committed config_v3 schema bundle (the same
// source of truth the schema generator uses), because the CLI declares no flag
// defaults: it overlays flags onto the schema-validated config.

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const repoRoot = path.resolve(__dirname, "../..");
const outputFile = path.resolve(
  __dirname,
  "../fern/pages/reference/cli.mdx"
);

// ---------------------------------------------------------------------------
// Source of truth: the config_v3 schema bundle (for run-flag defaults).
// ---------------------------------------------------------------------------

function loadConfigSchema() {
  const localBundle = path.resolve(
    __dirname,
    "../../src/common/src/schemas/schemas.json"
  );
  const schemas = fs.existsSync(localBundle)
    ? require(localBundle)
    : require("doc-detective-common").schemas;
  return schemas.config_v3 || {};
}

// Resolve a (possibly dotted) config key to its schema-declared default.
// `hints.enabled` reads the nested boolean; a bare key reads its own default.
function schemaDefault(configSchema, dottedKey) {
  const props = configSchema.properties || {};
  const [head, ...rest] = dottedKey.split(".");
  const prop = props[head];
  if (!prop) return undefined;
  if (rest.length === 0) return prop.default;
  // One level of nesting is all the CLI needs (hints.enabled). Read the nested
  // property default first, then fall back to a value nested in the parent's
  // object default (config_v3 declares `hints` default as `{ enabled: true }`).
  const nestedProp = (prop.properties || {})[rest[0]];
  if (nestedProp && nestedProp.default !== undefined) return nestedProp.default;
  if (prop.default && typeof prop.default === "object") {
    return prop.default[rest[0]];
  }
  return undefined;
}

// Map a kebab-case flag name to its config_v3 key. Most flags map by
// camelCasing the flag name; the exceptions are spelled out. Flags with no
// config-key entry (config, test, spec) have no schema default and render a
// blank Default cell.
const FLAG_CONFIG_KEY_OVERRIDES = {
  "allow-unsafe": "allowUnsafeSteps",
  hints: "hints.enabled",
  verification: "verification.write",
};
const FLAGS_WITHOUT_SCHEMA_DEFAULT = new Set(["config", "test", "spec"]);

function kebabToCamel(name) {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function configKeyForFlag(flagName) {
  if (FLAG_CONFIG_KEY_OVERRIDES[flagName]) {
    return FLAG_CONFIG_KEY_OVERRIDES[flagName];
  }
  if (FLAGS_WITHOUT_SCHEMA_DEFAULT.has(flagName)) return null;
  return kebabToCamel(flagName);
}

// ---------------------------------------------------------------------------
// Reading the commander tree.
// ---------------------------------------------------------------------------

// Help text is short and points here, so the reference carries the detail.
// A flag not listed uses its help text.
const REFERENCE_DESCRIPTIONS = {
  "config": "Path to a `config.json` or `config.yaml` file.",
  "input": "Path to test specifications and documentation source files. May be paths to specific files or to directories to scan for files. `-` reads a spec or document from stdin. Give one comma-separated list, once. Repeating the flag is a usage error.",
  "output": "Path of the JSON results file. It's overwritten on each run. `-` prints the results to stdout, the same as `--json`. Beats config `output`. With `--dry-run`, the file gets the test plan. A folder isn't valid here: use `--output-dir`.",
  "plain": "Print one line per test context, with four tab-separated columns: result, spec ID, test ID, and platform and browser, such as `linux/chrome`.",
  "output-dir": "Path of the folder that holds the run folder (`.doc-detective/runs/<runId>/`) and the html, junit, and markdown reports.",
  "allow-unsafe": "Allow execution of potentially unsafe tests",
  "dry-run": "Resolve tests fully (file detection, inline-test extraction, config merge) and emit the resolved test plan as JSON, but do not execute any steps.",
  "reporters": "Reporters to use for output. Built-in reporters: terminal, json, html, runFolder (archives results in <outputDir>/.doc-detective/runs/<runId>/, beside any screenshots from the run), junit (JUnit XML written as junit.xml in the output directory, or beside <output> when it names a file), markdown (a run summary written as doc-detective-summary.md in the output directory, or beside <output> when it names a file). Give one comma-separated list, once (e.g. --reporters terminal,html). Repeating the flag is a usage error.",
  "test": "Run only tests whose testId matches the given regex (case-insensitive). Give one comma-separated list of patterns, once; a test passes if any pattern matches.",
  "spec": "Run only specs whose specId matches the given regex (case-insensitive). Give one comma-separated list of patterns, once; a spec passes if any pattern matches.",
  "hints": "After a test run, show one applicable post-run hint with code samples and links. Some hints intentionally fire on failures (e.g. enableDebugLog). Disable with --no-hints.",
  "verification": "What to write back into source files after a run: `existing` (default) fills only the verified-by entries and badge tests a page declares, `true` also declares them on passing pages and inline tests, `false` writes nothing back. Overrides `verification.write`.",
  "auto-screenshot": "On by default. Capture a screenshot after every step that drives a browser, native app, or device. Images are saved in the per-run artifact folder (<output>/.doc-detective/runs/<runId>/) under the nested resource tree specs/<specId>/tests/<testId>/contexts/<contextId>/screenshots/, named with each step's order, action, and ID, so the same step lands on the same relative path in every run's folder for run-over-run comparison. While it's on, the runFolder reporter runs even if --reporters leaves it out. Use --no-auto-screenshot to turn it off; it sets the config level, so a spec's or test's autoScreenshot: true still wins.",
  "auto-record": "On by default. Record a video of every context that drives a browser, native app, or device, in addition to any explicit record steps: headless Chrome with the browser engine, headed browsers and desktop apps with the ffmpeg engine, and Android and iOS devices on the device. Headless Firefox runs headed so it can be recorded, when the host can capture the screen. Passing --auto-record makes it strict: a recording the host can't make is SKIPPED, and one that fails to start fails. Videos are saved in the per-run artifact folder (<output>/.doc-detective/runs/<runId>/) under specs/<specId>/tests/<testId>/contexts/<contextId>/recordings/. While it's on, the runFolder reporter runs even if --reporters leaves it out. Use --no-auto-record to turn it off; it sets the config level, so a spec's or test's autoRecord: true still wins.",
  "auto-update": "Check the npm registry on startup for a newer doc-detective and self-update before running. Use --no-auto-update (or set autoUpdate: false in config) to pin to the installed version.",
  "cache-dir": "Directory for lazy-installed runtime assets (heavy npm packages, browser binaries, ffmpeg). Beats `DOC_DETECTIVE_CACHE_DIR` and config `cacheDir`. Defaults to `$XDG_CACHE_HOME/doc-detective` (`%LOCALAPPDATA%\\doc-detective` on Windows), or an existing `~/.doc-detective`.",
  "concurrent-runners": "Number of test contexts to run concurrently (default 1). Pass a number (for example, --concurrent-runners 4), or `auto` (or `true`, as in config) to use the CPU core count (capped at 4). With more than 1 runner, log lines from different contexts interleave and cross-context variable dependencies are unsupported.",
  "browser-fallback": "How to handle a context whose browser cannot start a driver session. auto (default): fall back to any other available browser (a fallback away from an explicitly requested browser reports WARNING). explicit: fall back only for auto-selected browsers; a broken explicitly-requested browser is skipped with a diagnostic reason. off: never fall back across browsers. Drivers are validated by execution, so a present-but-broken driver (e.g. a partially downloaded geckodriver) no longer silently skips coverage.",
  "shell": "Default shell for runShell steps: bash (default), cmd, or powershell. cmd and powershell only work on Windows. Steps can override this value with their own `shell` field.",
  "exit-on-fail": "Exit `1` when any spec's result is `FAIL`. [deprecated: now the default]",
  "quiet": "Show only errors and a one-line verdict.",
  "debug": "Show debugging output. Also DEBUG and DOC_DETECTIVE_DEBUG.",
  "log-level": "Detail level of logging events. Accepted values: silent, error, warning, info (default), debug",
  "logLevel": "Detail level of logging events. [deprecated: use --log-level]",
  "json": "Print one JSON document to stdout.",
  "no-color": "Turn off color. Also NO_COLOR.",
  "no-env-file": "Don't load a `.env` file from the current directory. Variables already set in the shell always win over `.env`.",
  "no-telemetry": "Don't send anonymous usage data for this run. `DO_NOT_TRACK` and `telemetry.send: false` do the same.",
  "no-hints": "Don't show a post-run hint. Hints are on by default, and show one applicable tip with code samples and links after a run in an interactive shell.",
  "no-auto-update": "Don't check the npm registry on startup for a newer 5.x and self-update before running. Self-update never crosses a major version, and never runs in CI.",
  "no-exit-on-fail": "Exit `0` even when tests fail or nothing was tested, including when every spec skipped, and skip invalid specs with a warning. Usage errors, invalid config, and crashes still exit `2`."
};

// A commander Option in the shape the tables below render. Hidden options (the
// `--no-` forms and alternate spellings) aren't documented as rows.
function readOption(option) {
  const name = option.long.replace(/^--/, "");
  return {
    name,
    alias: option.short ? option.short.replace(/^-/, "") : undefined,
    type: option.required || option.optional ? "string" : "boolean",
    array: option.variadic,
    description: REFERENCE_DESCRIPTIONS[name] ?? option.description,
    default: option.defaultValue,
  };
}

function readOptions(command, { except = new Set() } = {}) {
  return command.options
    .filter(
      (option) =>
        !option.hidden && option.long !== "--version" && !except.has(option.long)
    )
    .map(readOption);
}

// A command's help description, without the examples and line breaks that are
// laid out for a terminal.
function prose(description) {
  return description.split(/\n\s*Examples:/)[0].replace(/\s*\n\s*/g, " ").trim();
}

function subcommand(command, name) {
  const found = command.commands.find((c) => c.name() === name);
  if (!found) throw new Error(`${name} command not found in the CLI`);
  return found;
}

// ---------------------------------------------------------------------------
// Formatting helpers (ported from buildSchemaReferencesV4.js so the two
// generators render tables identically).
// ---------------------------------------------------------------------------

// Fern parses `{...}` as a JS expression and `<...>` as a JSX tag in MDX, so a
// literal brace or angle bracket in prose breaks the build (e.g. a flag
// description mentioning `<os.tmpdir()>/doc-detective/` — the `(` after a
// tag-like token is a hard MDX parse error). Escape braces and angle brackets
// to HTML entities, but leave backtick code spans untouched so inline code
// still renders verbatim.
function escapeMdxBraces(text) {
  return String(text)
    .split(/(`[^`]*`)/)
    .map((part) =>
      part.startsWith("`")
        ? part
        : part
            .replace(/\{/g, "&#123;")
            .replace(/\}/g, "&#125;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
    )
    .join("");
}

// Render a description cell: escape braces and collapse newlines to <br/> so a
// multi-line option description doesn't break the markdown table row.
function descriptionCell(desc) {
  return escapeMdxBraces(desc || "No description provided.")
    .replace(/\r?\n/g, "<br/>")
    .trim();
}

// Render a flag's type for the Type column. A variadic string option renders
// as "string (array)".
function typeCell(opt) {
  const base = opt.type || "string";
  return opt.array ? `${base} (array)` : base;
}

// Render a default value in code font. Objects/arrays use double backticks so
// inner backticks/pipes are safe; a blank cell when there is no default.
function defaultCell(value) {
  if (value === undefined) return "";
  if (typeof value === "object") return `\`\`${JSON.stringify(value)}\`\``;
  return `\`${value}\``;
}

// A backtick-wrapped `--flag` (kebab name), plus `-x` alias when present.
function flagName(name) {
  return `\`--${name}\``;
}
function aliasCell(alias) {
  if (!alias) return "";
  const list = Array.isArray(alias) ? alias : [alias];
  return list.map((a) => `\`-${a}\``).join(", ");
}

// ---------------------------------------------------------------------------
// Page assembly.
// ---------------------------------------------------------------------------

function runFlagsTable(flags, configSchema) {
  const rows = [
    "| Option | Alias | Type | Default | Description |",
    "|--------|-------|------|---------|-------------|",
  ];
  for (const opt of flags) {
    const key = configKeyForFlag(opt.name);
    const def = key ? schemaDefault(configSchema, key) : undefined;
    rows.push(
      `| ${flagName(opt.name)} | ${aliasCell(opt.alias)} | ${typeCell(
        opt
      )} | ${defaultCell(def)} | ${descriptionCell(opt.description)} |`
    );
  }
  return rows.join("\n");
}

function optionTable(options) {
  const rows = [
    "| Option | Type | Default | Description |",
    "|--------|------|---------|-------------|",
  ];
  for (const opt of options) {
    rows.push(
      `| ${flagName(opt.name)} | ${typeCell(opt)} | ${defaultCell(
        opt.default
      )} | ${descriptionCell(opt.describe || opt.description)} |`
    );
  }
  return rows.join("\n");
}

// Boolean run flags whose description documents a `--no-` negation form.
function negatableFlags(flags) {
  return flags
    .filter(
      (opt) =>
        opt.type === "boolean" &&
        /--no-/.test(String(opt.description || ""))
    )
    .map((opt) => `\`--no-${opt.name}\``);
}

// Join a list with commas and a serial "and" before the last item:
// [a] -> "a"; [a,b] -> "a and b"; [a,b,c] -> "a, b, and c".
function serialJoin(items) {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function installSummary(subcommands) {
  const names = serialJoin(subcommands.map((s) => `\`${s.name}\``));
  const lines = [
    "### install",
    "",
    "The `install` command group manages Doc Detective's lazy-installed runtime assets—npm packages, browser binaries, ffmpeg, agent tools, and mobile toolchains. Its subcommands are " +
      names +
      ". For every subcommand, option, and example, see the [install reference](/reference/reference/cli/install).",
    "",
  ];
  return lines.join("\n");
}

function buildPage(data) {
  const { runFlags, lsp, debug, installSubcommands, configSchema } = data;

  const negatable = negatableFlags(runFlags);

  const parts = [];

  // Frontmatter (Fern shape — no H1) + generated banner.
  parts.push(
    "---",
    "title: CLI commands and flags",
    'description: "Reference for the doc-detective command line: commands and every flag."',
    "---",
    "",
    "{/* Generated by docs/.scripts/buildCliReference.js. Do not edit by hand — a CI",
    "     drift check fails if this page and the source disagree. Flag and command",
    "     descriptions come from the CLI source (the `.option()` descriptions in",
    "     src/cliOptions.ts, src/lsp, src/debug, and src/runtime); run-flag defaults come",
    "     from the config_v3 schema; the editorial prose lives in the generator itself.",
    "     Change the relevant source, run `npm run compile`, then run `npm run docs:build-cli-ref`. */}",
    ""
  );

  // Intro.
  parts.push(
    "This page documents every Doc Detective command and flag. The primary invocation is `npx doc-detective`.",
    ""
  );

  // Synopsis.
  parts.push(
    "## Synopsis",
    "",
    "```bash",
    "npx doc-detective [command] [options]",
    "```",
    "",
    "A bare invocation with no command runs tests; the available commands are `run`, `install`, `lsp`, `debug`, and `help`. Use `--version` to print the installed version, and `--help` or `-h` to print usage. For one command's usage, add `--help` after it or name it after `help`, including nested commands (for example, `npx doc-detective help install browsers`). The CLI is strict: unknown flags cause an error instead of being ignored.",
    ""
  );

  // Run flags.
  parts.push(
    "## Run flags",
    "",
    "These flags apply when you run tests, with no command or with `run`. Each has a config-file equivalent; see [Configuration precedence](#configuration-precedence).",
    "",
    "The global flags `--quiet`, `--debug`, `--log-level`, `--json`, `--no-color`, and `--no-input` work with every command except `lsp`. Other commands take only their own flags and the global flags, and reject anything else with an `unknown option` error. `lsp` speaks the language server protocol on stdout, so it takes only `--stdio`.",
    "",
    runFlagsTable(runFlags, configSchema),
    ""
  );

  if (negatable.length > 0) {
    parts.push(
      "### Negating boolean flags",
      "",
      "Boolean run flags can be negated with `--no-`, which overrides a config file. The ones you'll typically reach for are: " +
        serialJoin(negatable) +
        ".",
      ""
    );
  }

  // Editorial cross-links and caveats (not derivable from CLI metadata).
  parts.push(
    "Notes on individual flags:",
    "",
    "- `--reporters`: see [reporters and artifacts](/docs/ci/reporters-and-artifacts) for the `runFolder` reporter and the built-in output formats.",
    "- `--cache-dir`: see the [cache directory guidance](/reference/reference/cli/install#cache-directory).",
    "- `--shell`: [`runShell`](/docs/actions/runshell) documents its steps, and [shell selection](/docs/actions/runshell#shell-selection) covers how the default is chosen.",
    "- `--dry-run`: the resolved test plan is printed to stdout, so you can pipe it (for example, `npx doc-detective --dry-run | jq`).",
    "- `--json`, `--plain`, and `--output -`: stdout holds only results, and everything else goes to stderr. Only one mode can write stdout, so `--plain` with `--json`, `--output -`, or `--dry-run` exits `2`.",
    "- `--no-input`: also available as `DOC_DETECTIVE_NO_INPUT=1`.",
    "- `--auto-update`: skipped automatically when the `CI` environment variable is set, which GitHub Actions, GitLab CI, CircleCI, and most CI systems do—so CI pipelines usually don't need `--no-auto-update`. To pin the version deterministically everywhere (including runners that don't set `CI`), set `autoUpdate: false` in config or pass `--no-auto-update`.",
    "- `--test` and `--spec`: patterns match if they appear anywhere in the ID; anchor a pattern with `^` and `$` to require an exact `testId` or `specId` match. Each value is split on commas *before* the parts are compiled as regexes, so a pattern can't contain a literal comma (for example, `--test \"step{1,3}\"` is split into `step{1` and `3}`).",
    "",
    "There is no flag to select the platform, browser, or headless mode for a run—those are [contexts](/docs/test-docs/platforms-and-browsers) defined in your config (`--browser-fallback` only controls what happens when a selected browser can't start). For containerized and headless runs, see [Docker and headless runs](/docs/ci/docker-and-headless).",
    ""
  );

  // Commands.
  parts.push("## Commands", "");
  parts.push(
    "Doc Detective runs tests when you invoke it without a command, and exposes named commands for setup, editor integration, and diagnostics.",
    ""
  );

  // Default command.
  parts.push(
    "### Default (run tests)",
    "",
    "With no command, `doc-detective` runs tests and takes no positional arguments; control its behavior with the flags in the [Run flags](#run-flags) section. To pass file and folder paths as arguments, use [`run`](#run).",
    "",
    "```bash",
    "npx doc-detective --input ./docs",
    "```",
    ""
  );

  // run.
  parts.push(
    "### run",
    "",
    "Run tests as the bare command does, with file and folder paths as arguments. The paths are added to any `--input` values. A `-` argument reads a spec or document from stdin. `runTests` and `runtests` still work, but print a deprecation warning on stderr, which `--quiet`, `-l error`, and `-l silent` hide. Replace them with `run`.",
    "",
    "```bash",
    "npx doc-detective run ./docs a.spec.json",
    "cat a.spec.json | npx doc-detective run -",
    "```",
    ""
  );

  // install (summary + deep link).
  parts.push(installSummary(installSubcommands));

  // lsp.
  parts.push(
    "### lsp",
    "",
    lsp.describe ? escapeMdxBraces(lsp.describe) : "Start the Doc Detective language server.",
    "",
    "This is distinct from `install agents`: the language server (`lsp`) exposes editor and AI-agent integrations over the LSP protocol, while `install agents` installs the Agent Skills and slash commands documented in the [agent tools overview](/ai/ai-agents/overview).",
    ""
  );
  if (lsp.options.length > 0) {
    parts.push(optionTable(lsp.options), "");
  }
  parts.push(
    "```bash",
    "npx doc-detective lsp",
    "```",
    ""
  );

  // debug.
  parts.push(
    "### debug",
    "",
    debug.describe
      ? escapeMdxBraces(debug.describe)
      : "Print diagnostic information about the runtime environment and exit without running tests.",
    "",
    "`debug` also accepts `--config`, `--input`, `--no-env-file`, and the global flags.",
    ""
  );
  if (debug.options.length > 0) {
    parts.push(optionTable(debug.options), "");
  }
  parts.push(
    "```bash",
    "npx doc-detective debug --include-env",
    "```",
    ""
  );

  // Exit codes.
  parts.push(
    "## Exit codes",
    "",
    "| Code | Meaning |",
    "|------|---------|",
    "| `0` | No spec failed, and at least one passed or warned |",
    "| `1` | At least one spec failed |",
    "| `2` | Nothing valid was tested, or the CLI couldn't proceed: a usage error, invalid config, no specs, every spec skipped, an invalid spec, a declined install, or a crash |",
    "| `130`, `143` | Interrupted by `SIGINT` or `SIGTERM` |",
    "",
    "`--no-exit-on-fail` and `exitOnFail: false` turn failed, empty, and all-skipped runs into `0`, and skip invalid specs with a warning. Usage errors, invalid config, and crashes still exit `2`. A `WARNING` result never fails a run. Neither does a `SKIPPED` result, unless every spec skipped, which exits `2` without these options.",
    ""
  );

  // Configuration.
  parts.push(
    "## Configuration",
    "",
    "### Config auto-discovery",
    "",
    "When you omit `--config`, the CLI looks for a config file in the current directory in this order: `.doc-detective.json`, then `.doc-detective.yaml`, then `.doc-detective.yml`. If none exists, it runs with defaults. When you pass `--config`, that path is authoritative—a mistyped path fails rather than falling back.",
    "",
    "### Configuration precedence",
    "",
    "Doc Detective layers configuration in one order. A higher layer wins. Where a layer merges deeply, objects merge key by key and arrays replace.",
    "",
    "| # | Layer (highest first) | Merge |",
    "|---|---|---|",
    "| 1 | Flags, such as `--cache-dir`, `-l`, `-q`, and `-d` | Replace |",
    "| 2 | The shell's environment: `DOC_DETECTIVE_CONFIG`, then the single-purpose variables `DOC_DETECTIVE_CACHE_DIR` (`cacheDir`), `DOC_DETECTIVE_DEBUG` and `DEBUG` (`logLevel: debug`), `DO_NOT_TRACK` (`telemetry.send: false`), and `DOC_DETECTIVE_SKIP_AUTO_UPDATE` (`autoUpdate: false`), which win over it | Deep |",
    "| 3 | A `.env` file in the current directory. It only fills variables the shell left unset. `--no-env-file` skips it | — |",
    "| 4 | The project config: the file `--config` names, or else the first of `.doc-detective.json`, `.doc-detective.yaml`, and `.doc-detective.yml`. A config-level `loadVariables` file also only fills unset variables | Deep |",
    "| 5 | Your user config, at `$XDG_CONFIG_HOME/doc-detective/config.json` (`%APPDATA%\\doc-detective\\config.json` on Windows) | Deep |",
    "| 6 | Schema defaults | — |",
    "",
    "A `loadVariables` step still replaces variables that are already set, because a step sets them on purpose.",
    "",
    "A relative path resolves against the source that set it. That covers every path key, such as `input`, `output`, `outputDir`, `cacheDir`, `loadVariables`, `beforeAll`, `afterAll`, `apiKeyFile`, and `apiTokenFile`:",
    "",
    "| Source | A relative path resolves against |",
    "|---|---|",
    "| The project config | Its folder. With `relativePathBase: \"cwd\"`, or for a config loaded from a URL, the current directory |",
    "| Your user config | Its folder, even with `relativePathBase: \"cwd\"` |",
    "| `DOC_DETECTIVE_CONFIG` and `DOC_DETECTIVE` | The current directory |",
    "| Flags and single-purpose variables | The current directory |",
    "",
    "A path no source sets, such as the default `input` and `outputDir` of `.`, resolves the way the project config's paths do, or against the current directory without one.",
    "",
    "Each config source is validated against the [`config_v3` schema](/reference/schemas/config) on its own, and an invalid one exits `2` with an error that names it. Flags override the validated config; they don't bypass it.",
    "",
    "`DOC_DETECTIVE` is a deprecated spelling of `DOC_DETECTIVE_CONFIG`. Its `config` object still applies, just below `DOC_DETECTIVE_CONFIG`, and Doc Detective warns until you move it. Its other keys, such as `container`, do nothing.",
    "",
    "## Environment variables",
    "",
    "Boolean variables are on for `1`, `true`, `yes`, or `on`, and off when unset, empty, or `0`, `false`, `no`, or `off`, in any case. Doc Detective ignores any other value, and warns once.",
    "",
    "| Variable | Values | Default | What it does |",
    "|---|---|---|---|",
    "| `DOC_DETECTIVE_CONFIG` | A JSON config object | Unset | Config, above the project config. See [Configuration precedence](#configuration-precedence). |",
    "| `DOC_DETECTIVE_CACHE_DIR` | A path | `$XDG_CACHE_HOME/doc-detective`, `%LOCALAPPDATA%\\doc-detective` on Windows, or an existing `~/.doc-detective` | Where browsers and runtime dependencies are installed. Sets `cacheDir`. `--cache-dir` beats it. |",
    "| `DOC_DETECTIVE_DEBUG` | Boolean | Off | Shows debugging output, like `-d`. |",
    "| `DEBUG` | `1`, `true`, `*`, or a comma-separated list with `doc-detective` or `doc-detective:*` | Unset | Shows debugging output, like `-d`. A pattern for another package leaves it off. |",
    "| `DOC_DETECTIVE_SKIP_AUTO_UPDATE` | Boolean | Off | Sets `autoUpdate: false`. `--auto-update` beats it. |",
    "| `DO_NOT_TRACK` | Any value | Unset | Sets `telemetry.send: false`. |",
    "| `DOC_DETECTIVE_NO_COLOR` | Boolean | Off | Turns off color, like `--no-color`. `NO_COLOR` and `FORCE_COLOR` keep their usual meaning. |",
    "| `DOC_DETECTIVE_NO_INPUT` | Boolean | Off | Never prompts, like `--no-input`. |",
    "| `DOC_DETECTIVE_ALLOW_LOCAL_URLS` | Boolean | Off | Lets a public screenshot reference image or OpenAPI description redirect or refer to a private or loopback address. Local URLs work without it. Setting it with `DOC_DETECTIVE_BLOCK_LOCAL_URLS` exits `2`. See [Refuse local URLs on shared runners](/docs/ci/docker-and-headless#refuse-local-urls-on-shared-runners). |",
    "| `DOC_DETECTIVE_BLOCK_LOCAL_URLS` | Boolean | Off | Refuses every private and loopback address for screenshot reference images and OpenAPI `$ref`s, including direct ones. For shared runners. |",
    "| `DOC_DETECTIVE_REUSE_APPIUM` | Boolean | Off | Keeps the Appium server running after a run, so the next run with the same setup skips its startup. |",
    "| `DOC_DETECTIVE_NO_ANDROID_AUTOINSTALL` | Boolean | Off | Skips an Android context instead of installing the Android toolchain on first use. |",
    "| `DOC_DETECTIVE_AUTOINSTALL` | Boolean | On | Off stops `npm install` from also installing browsers and runtime dependencies. |",
    "| `DOC_DETECTIVE_SKIP_AGENT_PROMPT` | Boolean | Off | Stops `npm install` from asking to install agent tools. |",
    "| `XDG_CONFIG_HOME`, `XDG_CACHE_HOME` | Paths | Platform defaults | Where the user config and the cache live. |",
    "| `DOC_DETECTIVE` | `{\"config\": {...}}` | Unset | Deprecated: use `DOC_DETECTIVE_CONFIG`. |",
    "| `DOC_DETECTIVE_RUNTIME_DEBUG` | Boolean | Off | Deprecated: use `DOC_DETECTIVE_DEBUG`. Setting both, with either one on, exits `2`. |",
    ""
  );

  // Invocation.
  parts.push(
    "## Invocation",
    "",
    "- `npx doc-detective ...` is the primary invocation.",
    "- Global or local install: install with npm, then call `doc-detective ...`. See [installation](/docs/get-started/installation).",
    "- Docker: the images use the entrypoint `npx doc-detective`, so `docker run <image> --input ...` passes flags straight to the default run command. See [Docker and headless runs](/docs/ci/docker-and-headless).",
    ""
  );

  // Examples.
  parts.push(
    "## Examples",
    "",
    "Run tests over a directory:",
    "",
    "```bash",
    "npx doc-detective --input ./docs",
    "```",
    "",
    "Preview the resolved plan without running:",
    "",
    "```bash",
    "npx doc-detective --input ./docs --dry-run",
    "```",
    "",
    "Run a filtered subset with specific reporters:",
    "",
    "```bash",
    'npx doc-detective --input ./docs --test "smoke" --reporters terminal,json',
    "```",
    "",
    "Start the language server:",
    "",
    "```bash",
    "npx doc-detective lsp",
    "```"
  );

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

async function main() {
  const configSchema = loadConfigSchema();

  const { buildProgram } = await import(
    pathToFileURL(path.join(repoRoot, "dist", "cliProgram.js")).href
  );
  const program = buildProgram({ runTests: () => {} });
  const runFlags = readOptions(program);
  const runFlagNames = new Set(program.options.map((option) => option.long));

  const lspCommand = subcommand(program, "lsp");
  const lsp = {
    describe: prose(lspCommand.description()),
    options: readOptions(lspCommand),
  };

  // `debug` shares --config, --input, and the global flags with the run
  // commands, which are documented once, above.
  const debugCommand = subcommand(program, "debug");
  const debug = {
    describe: prose(debugCommand.description()),
    options: readOptions(debugCommand, { except: runFlagNames }),
  };

  const installSubcommands = subcommand(program, "install")
    .commands.map((command) => ({ name: command.name() }));

  const content =
    buildPage({
      runFlags,
      lsp,
      debug,
      installSubcommands,
      configSchema,
    })
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\s+$/, "") + "\n";

  fs.writeFileSync(outputFile, content);
  console.log(
    `Generated CLI reference: ${path.relative(repoRoot, outputFile)} ` +
      `(${runFlags.length} run flags, ${installSubcommands.length} install subcommands)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
