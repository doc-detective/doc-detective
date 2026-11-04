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
  "input": "Path to test specifications and documentation source files. May be paths to specific files or to directories to scan for files. `-` reads a spec or document from stdin. Comma-separate multiple values.",
  "output": "Path of the JSON results file. It's overwritten on each run. `-` prints the results to stdout, the same as `--json`. A folder isn't valid here: use `--output-dir`.",
  "plain": "Print one tab-separated line per test.",
  "output-dir": "Path of the folder that holds the run folder (`.doc-detective/runs/<runId>/`) and the html, junit, and markdown reports.",
  "allow-unsafe": "Allow execution of potentially unsafe tests",
  "dry-run": "Resolve tests fully (file detection, inline-test extraction, config merge) and emit the resolved test plan as JSON, but do not execute any steps.",
  "reporters": "Reporters to use for output. Built-in reporters: terminal, json, html, runFolder (archives results in <output>/.doc-detective/runs/<runId>/, beside any screenshots from the run), junit (JUnit XML written as junit.xml in the output directory, or beside <output> when it names a file), markdown (a run summary written as doc-detective-summary.md in the output directory, or beside <output> when it names a file). Custom reporters registered via registerReporter() can also be referenced by name. Pass multiple values after the flag (e.g. --reporters terminal html) or repeat the flag (e.g. -r terminal -r html).",
  "test": "Run only tests whose testId matches the given regex (case-insensitive). Comma-separate multiple patterns; a test passes if any pattern matches.",
  "spec": "Run only specs whose specId matches the given regex (case-insensitive). Comma-separate multiple patterns; a spec passes if any pattern matches.",
  "hints": "After a test run, show one applicable post-run hint with code samples and links. Some hints intentionally fire on failures (e.g. enableDebugLog). Disable with --no-hints.",
  "verification": "What to write back into source files after a run: `existing` (default) fills only the verified-by entries and badge tests a page declares, `true` also declares them on passing pages and inline tests, `false` writes nothing back. Overrides `verification.write`.",
  "auto-screenshot": "Capture a screenshot after every browser-based step. Images are saved in the per-run artifact folder (<output>/.doc-detective/runs/<runId>/) under the nested resource tree specs/<specId>/tests/<testId>/contexts/<contextId>/screenshots/, named with each step's order, action, and ID, so the same step lands on the same relative path in every run's folder for run-over-run comparison. Use --no-auto-screenshot to override a config file that enables it.",
  "auto-record": "Record a video of every browser-based test context, in addition to any explicit record steps. The recording wraps the whole context and always uses the ffmpeg engine. Videos are saved in the per-run artifact folder (<output>/.doc-detective/runs/<runId>/) under the nested resource tree specs/<specId>/tests/<testId>/contexts/<contextId>/recordings/, so the same context lands on the same relative path in every run's folder for run-over-run comparison. Use --no-auto-record to override a config file that enables it.",
  "auto-update": "Check the npm registry on startup for a newer doc-detective and self-update before running. Use --no-auto-update (or set autoUpdate: false in config) to pin to the installed version.",
  "cache-dir": "Directory for lazy-installed runtime assets (heavy npm packages, browser binaries, ffmpeg). Defaults to ~/.doc-detective/. Also overridable via DOC_DETECTIVE_CACHE_DIR.",
  "concurrent-runners": "Number of test contexts to run concurrently (default 1). Pass a number (for example, --concurrent-runners 4), or `auto` to use the CPU core count (capped at 4). With more than 1 runner, log lines from different contexts interleave and cross-context variable dependencies are unsupported.",
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
  "no-exit-on-fail": "Exit `0` even when tests fail or nothing was tested, and skip invalid specs with a warning. Usage errors, invalid config, and crashes still exit `2`. `WARNING` and `SKIPPED` results never fail a run."
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
  return description.split(/
s*Examples:/)[0].replace(/s*
s*/g, " ").trim();
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
    "     src/utils.ts, src/lsp, src/debug, and src/runtime); run-flag defaults come",
    "     from the config_v3 schema; the editorial prose lives in the generator itself.",
    "     Change the relevant source, then run `npm run docs:build-cli-ref`. */}",
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
    "A bare invocation with no command runs tests; the available commands are `install`, `lsp`, and `debug`. Use `--version` to print the installed version, and `--help` or `-h` to print usage. The CLI is strict: unknown flags cause an error instead of being ignored.",
    ""
  );

  // Run and global flags.
  parts.push(
    "## Run and global flags",
    "",
    "These flags apply to the default run command. Each has a config-file equivalent; see [Configuration precedence](#configuration-precedence).",
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
    "- `--json`, `--plain`, and `--output -`: stdout holds only results, and everything else goes to stderr.",
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
    "With no command, `doc-detective` runs tests and takes no positional arguments; control its behavior with the flags in the [Run and global flags](#run-and-global-flags) section.",
    "",
    "```bash",
    "npx doc-detective --input ./docs",
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
    "| `0` | All specs passed, warned, or were skipped |",
    "| `1` | At least one spec failed |",
    "| `2` | Nothing valid was tested, or the CLI couldn't proceed: a usage error, invalid config, no specs, an invalid spec, a declined install, or a crash |",
    "| `130`, `143` | Interrupted by `SIGINT` or `SIGTERM` |",
    "",
    "`--no-exit-on-fail` and `exitOnFail: false` turn failed and empty runs into `0`, and skip invalid specs with a warning. Usage errors, invalid config, and crashes still exit `2`. `WARNING` and `SKIPPED` results never fail a run.",
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
    "Doc Detective merges configuration in this order:",
    "",
    "1. CLI flags.",
    "2. The shell's environment, including `DOC_DETECTIVE_CONFIG`.",
    "3. A `.env` file in the current directory, unless you pass `--no-env-file`.",
    "4. The project's `.doc-detective.*` file, or the file `--config` names.",
    "5. Your user config, at `$XDG_CONFIG_HOME/doc-detective/config.json` (`%APPDATA%\\\\doc-detective\\\\config.json` on Windows).",
    "",
    "Config files and `DOC_DETECTIVE_CONFIG` are validated against the [`config_v3` schema](/reference/schemas/config).",
    "",
    "CLI flags override the validated config; they don't bypass it, and every flag maps to a camelCase config key.",
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
    'npx doc-detective --input ./docs --test "smoke" --reporters terminal json',
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

  // `debug` also accepts the run flags, which are documented once, above.
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
      `(${runFlags.length} run/global flags, ${installSubcommands.length} install subcommands)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
