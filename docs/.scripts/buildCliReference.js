// Generates the CLI reference page at fern/pages/reference/cli.mdx from the
// doc-detective CLI definitions. This page is GENERATED — do not edit it by
// hand. To change it, update the CLI source (buildYargs() in src/utils.ts, the
// command modules in src/lsp, src/debug, and src/runtime, and the command
// registrations in src/cli.ts) or the config_v3 schema, then re-run
// `npm run docs:build-cli-ref`.
//
// Sibling of docs/.scripts/buildSchemaReferencesV4.js (which generates the
// reference/schemas/*.md pages). Like that script it is build-free: it reads
// the TypeScript sources statically with the compiler API rather than
// executing the compiled CLI, so it needs no `npm run build` and no heavy
// runtime import graph. Flag/command metadata comes from the yargs `.option()`
// and `.command()` descriptors; run-flag defaults come from the committed
// config_v3 schema bundle (the same source of truth the schema generator uses),
// because buildYargs() itself declares no `default:` values — the CLI overlays
// flags onto the schema-validated config, so the schema is where the defaults
// live.

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "../..");
const srcDir = path.join(repoRoot, "src");
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
// camelCasing the flag name; the two exceptions are spelled out. Flags with no
// config-key entry (config, test, spec) have no schema default and render a
// blank Default cell.
const FLAG_CONFIG_KEY_OVERRIDES = {
  "allow-unsafe": "allowUnsafeSteps",
  hints: "hints.enabled",
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
// Static AST extraction of yargs `.option()` and `.command()` descriptors.
// ---------------------------------------------------------------------------

function sourceFile(relPath) {
  const abs = path.join(srcDir, relPath);
  const text = fs.readFileSync(abs, "utf8");
  return ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true);
}

// Evaluate a node as a static literal. Returns undefined for anything that
// isn't a plain literal (e.g. `require("../package.json").version`), which is
// how we detect and skip non-static option fields.
function literalValue(node, sf) {
  if (!node) return undefined;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((el) => literalValue(el, sf));
  }
  return undefined;
}

function readObjectLiteral(objNode, sf) {
  const obj = {};
  for (const prop of objNode.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = prop.name.getText(sf).replace(/['"]/g, "");
    obj[key] = literalValue(prop.initializer, sf);
  }
  return obj;
}

// Collect every `.option(name, {...})` call within a node subtree, preserving
// declaration order. yargs chains (`.option(a).option(b)`) parse so that the
// outermost call — the last `.option()` written — is visited first, so we
// reverse to recover source order.
function collectOptions(rootNode, sf) {
  const options = [];
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.getText(sf) === "option" &&
      node.arguments.length >= 2 &&
      ts.isObjectLiteralExpression(node.arguments[1])
    ) {
      const name = literalValue(node.arguments[0], sf);
      if (typeof name === "string") {
        options.push({ name, ...readObjectLiteral(node.arguments[1], sf) });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(rootNode);
  return options.reverse();
}

// Find a top-level function declaration by name.
function findFunction(sf, name) {
  let found = null;
  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      node.name.getText(sf) === name
    ) {
      found = node;
    }
    if (!found) ts.forEachChild(node, visit);
  }
  visit(sf);
  return found;
}

// Extract the value of a top-level `command`/`describe` property from an
// exported CommandModule object literal (e.g. `export const lspCommand = {...}`).
function extractCommandModule(sf, exportName) {
  let result = null;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(sf) === exportName) {
      let init = node.initializer;
      // Unwrap `{...} as SomeType` if present.
      while (init && ts.isAsExpression(init)) init = init.expression;
      if (init && ts.isObjectLiteralExpression(init)) {
        const obj = readObjectLiteral(init, sf);
        result = {
          command: obj.command,
          describe: obj.describe,
          options: collectOptions(init, sf),
        };
      }
    }
    if (!result) ts.forEachChild(node, visit);
  }
  visit(sf);
  return result;
}

// Extract the run/global flags from buildYargs() in src/utils.ts.
function extractRunFlags() {
  const sf = sourceFile("utils.ts");
  const fn = findFunction(sf, "buildYargs");
  if (!fn) throw new Error("buildYargs() not found in src/utils.ts");
  return collectOptions(fn, sf);
}

// Extract the `install` subcommand names in the order they are registered on
// the group's builder (`.command(agentsSubcommand).command(runtimeSubcommand)…`
// in installCommand's builder) — that registration order is the user-facing
// order in `install --help`, which is what the summary should mirror. Names are
// resolved from each `const <x>Subcommand = { command: "…" }` declaration. Used
// only to summarize the group; the full option detail lives on the /install
// page.
function extractInstallSubcommands() {
  const sf = sourceFile("runtime/installCommand.ts");

  function commandWord(commandStr) {
    // "runtime [packages..]" -> "runtime".
    return String(commandStr).split(/\s+/)[0];
  }

  // 1. Map each `<x>Subcommand` declaration to its command word.
  const declByVar = new Map();
  function collectDecls(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(sf).endsWith("Subcommand") &&
      node.initializer
    ) {
      let init = node.initializer;
      while (init && ts.isAsExpression(init)) init = init.expression;
      if (init && ts.isObjectLiteralExpression(init)) {
        const obj = readObjectLiteral(init, sf);
        if (obj.command) {
          declByVar.set(node.name.getText(sf), commandWord(obj.command));
        }
      }
    }
    ts.forEachChild(node, collectDecls);
  }
  collectDecls(sf);

  // 2. Walk the installCommand builder's `.command(<x>Subcommand)` chain in
  //    registration (source) order. yargs chains parse outermost-first, so
  //    reverse to recover the written order.
  const registered = [];
  function collectRegistrations(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.getText(sf) === "command" &&
      node.arguments.length >= 1
    ) {
      let arg = node.arguments[0];
      while (arg && ts.isAsExpression(arg)) arg = arg.expression;
      if (arg && ts.isIdentifier(arg)) {
        const word = declByVar.get(arg.getText(sf));
        if (word) registered.push(word);
      }
    }
    ts.forEachChild(node, collectRegistrations);
  }
  collectRegistrations(sf);
  registered.reverse();

  // 3. Fall back to declaration order if the builder chain couldn't be read.
  const names = registered.length > 0 ? registered : [...declByVar.values()];
  return names.map((name) => ({ name }));
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

// Render a flag's type for the Type column. yargs booleans/strings map
// directly; an `array: true` string option renders as "string (array)".
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
      ". For every subcommand, option, and example, see the [install reference](/reference/cli/install).",
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
      "Every boolean run flag has a `--no-` negation form; the ones you'll typically reach for are: " +
        serialJoin(negatable) +
        ". (Other boolean flags, such as `--dry-run` and `--allow-unsafe`, can be negated the same way with `--no-dry-run` and `--no-allow-unsafe`.)",
      ""
    );
  }

  // Editorial cross-links and caveats (not derivable from yargs metadata).
  parts.push(
    "Notes on individual flags:",
    "",
    "- `--reporters`: see [reporters and artifacts](/docs/ci/reporters-and-artifacts) for the `runFolder` reporter and the built-in output formats.",
    "- `--cache-dir`: see the [cache directory guidance](/reference/cli/install#cache-directory).",
    "- `--shell`: [`runShell`](/docs/actions/runshell) documents its steps, and [shell selection](/docs/actions/runshell#shell-selection) covers how the default is chosen.",
    "- `--dry-run`: the resolved test plan is printed to stdout, so you can pipe it (for example, `npx doc-detective --dry-run | jq`).",
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
    (lsp.describe ? escapeMdxBraces(lsp.describe) : "Start the Doc Detective language server.") +
      " It also ships as a standalone command, `doc-detective-lsp`.",
    "",
    "This is distinct from `install agents`: the language server (`lsp`) exposes editor and AI-agent integrations over the LSP protocol, while `install agents` installs the Agent Skills and slash commands documented in the [agent tools overview](/ai/overview).",
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
    "<Note>",
    "The standalone `doc-detective` CLI does not exit with a non-zero code when tests fail—it exits non-zero only on a crash or invalid configuration. To gate CI on test failures, parse the results `summary` from the [reporter output](/docs/ci/reporters-and-artifacts) (the JSON reporter), or use the [GitHub Action](/docs/ci/github-action)'s exit-on-fail behavior.",
    "</Note>",
    "",
    "The default `json` reporter writes a `testResults-<timestamp>.json` file into the `--output` directory (it prints the path as `See detailed results at …`); read that file's `summary` to decide whether the run passed. The `debug` command exits non-zero when it finds an invalid configuration. The specific non-zero value isn't a stable contract, so gate CI on the parsed results, not on which non-zero code the process returns.",
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
    "1. File config and the `DOC_DETECTIVE_CONFIG` environment variable (the environment value merges over the file).",
    "2. Validation against the [`config_v3` schema](/reference/schemas/config).",
    "3. CLI flag overrides.",
    "4. Runtime: the runner and reporters read only the merged config.",
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

function main() {
  const configSchema = loadConfigSchema();

  const runFlags = extractRunFlags();

  const lspSf = sourceFile("lsp/command.ts");
  const lsp = extractCommandModule(lspSf, "lspCommand") || {
    describe: null,
    options: [],
  };

  const debugSf = sourceFile("debug/command.ts");
  const debug = extractCommandModule(debugSf, "debugCommand") || {
    describe: null,
    options: [],
  };

  const installSubcommands = extractInstallSubcommands().filter(
    (s) => s.name && s.name !== "install"
  );

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

main();
