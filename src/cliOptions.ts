import { Command, InvalidArgumentError, Option } from "commander";

// Old arguments kept for compatibility (ADR 01146). Each is labeled in help and
// warns on stderr when used.
const DEPRECATED_LABELS = {
  "--logLevel": "[deprecated: use --log-level]",
  "--exit-on-fail": "[deprecated: now the default]",
};

export const DEPRECATED_COMMAND_LABEL = "[deprecated: use run]";

// Print a one-line warning for each deprecated argument a command received,
// unless --quiet asked for less. Commander fires `option:<name>` per spelling,
// which is how --logLevel is told apart from --log-level.
export function warnOnDeprecatedUse(program: Command) {
  const used = new Set<string>();
  const watch = (command: Command) => {
    command.on("option:logLevel", () => used.add("--logLevel"));
    command.on("option:exit-on-fail", () => used.add("--exit-on-fail"));
    command.commands.forEach(watch);
  };
  watch(program);
  program.hook("preAction", (_thisCommand, actionCommand) => {
    const name = actionCommand.name();
    if (name === "runTests" || name === "runtests") {
      used.add(name);
    }
    if (actionCommand.optsWithGlobals().quiet) return;
    for (const argument of used) {
      const label =
        DEPRECATED_LABELS[argument as keyof typeof DEPRECATED_LABELS] ?? DEPRECATED_COMMAND_LABEL;
      console.error(`Warning: ${argument} is ${label.slice(1, -1).replace(":", ";")}.`);
    }
  });
}

const LOG_LEVELS = ["silent", "error", "warning", "info", "debug"];

function parseConcurrentRunners(value: string): string {
  if (value === "auto" || /^[1-9]\d*$/.test(value)) return value;
  throw new InvalidArgumentError("Expected a positive whole number, or auto.");
}

// A boolean flag plus its hidden `--no-` form. Declaring both leaves the option
// undefined when neither is passed, which is what setConfig's
// `typeof args.x === "boolean"` override blocks rely on to tell "unset" from
// "explicitly off".
function addBooleanOption(command: Command, flags: string, description: string) {
  command.option(flags, description);
  const long = flags.split(/,\s*/).pop() as string;
  command.addOption(new Option(`--no-${long.slice(2)}`).hideHelp());
}

// The flags every command takes, before or after its name.
export function addGlobalOptions(command: Command): Command {
  return command
    .option("-q, --quiet", "Show only errors and a one-line verdict.")
    .option(
      "-d, --debug",
      "Show debugging output. Also DEBUG and DOC_DETECTIVE_DEBUG."
    )
    .addOption(new Option("--verbose").hideHelp().implies({ debug: true }))
    .addOption(
      new Option(
        "-l, --log-level <level>",
        "Detail level of logging events. Accepted values: silent, error, warning, info (default), debug"
      ).choices(LOG_LEVELS)
    )
    .addOption(
      new Option(
        "--logLevel <level>",
        `Detail level of logging events. ${DEPRECATED_LABELS["--logLevel"]}`
      ).choices(LOG_LEVELS)
    )
    .option("--json", "Print one JSON document to stdout.")
    .option("--no-color", "Turn off color. Also NO_COLOR.")
    .addOption(new Option("--color").hideHelp());
}

// The flags that choose what to read, shared by the run commands and `debug`.
export function addInputOptions(command: Command): Command {
  return command
    .option("-c, --config <path>", "Path to a `config.json` or `config.yaml` file.")
    .option(
      "-i, --input <path>",
      "Path to test specifications and documentation source files. May be paths to specific files or to directories to scan for files."
    );
}

// The flags a test run takes. Runtime code never reads these directly: setConfig
// overlays them onto the validated config.
export function addRunOptions(command: Command): Command {
  addInputOptions(command);
  command
    .option("-o, --output <file>", "Path of the JSON results file. It's overwritten on each run.")
    .option(
      "--output-dir <dir>",
      "Path of the folder that holds the run folder and the html, junit, and markdown reports."
    );
  addBooleanOption(command, "--allow-unsafe", "Allow execution of potentially unsafe tests");
  addBooleanOption(
    command,
    "-n, --dry-run",
    "Resolve tests fully (file detection, inline-test extraction, config merge) and emit the resolved test plan as JSON, but do not execute any steps."
  );
  command
    .option(
      "-r, --reporters <names...>",
      "Reporters to use for output. Built-in reporters: terminal, json, html, runFolder (archives results in <output>/.doc-detective/runs/<runId>/, beside any screenshots from the run), junit (JUnit XML written as junit.xml in the output directory, or beside <output> when it names a file), markdown (a run summary written as doc-detective-summary.md in the output directory, or beside <output> when it names a file). Custom reporters registered via registerReporter() can also be referenced by name. Pass multiple values after the flag (e.g. --reporters terminal html) or repeat the flag (e.g. -r terminal -r html)."
    )
    .option(
      "-t, --test <patterns>",
      "Run only tests whose testId matches the given regex (case-insensitive). Comma-separate multiple patterns; a test passes if any pattern matches."
    )
    .option(
      "-s, --spec <patterns>",
      "Run only specs whose specId matches the given regex (case-insensitive). Comma-separate multiple patterns; a spec passes if any pattern matches."
    );
  addBooleanOption(
    command,
    "--hints",
    "After a test run, show one applicable post-run hint with code samples and links. Some hints intentionally fire on failures (e.g. enableDebugLog). Disable with --no-hints."
  );
  command.addOption(new Option(
    "--verification <mode>",
    "What to write back into source files after a run: `existing` (default) fills only the verified-by entries and badge tests a page declares, `true` also declares them on passing pages and inline tests, `false` writes nothing back. Overrides `verification.write`."
  ).choices(["existing", "true", "false"]));
  addBooleanOption(
    command,
    "--auto-screenshot",
    "Capture a screenshot after every browser-based step. Images are saved in the per-run artifact folder (<output>/.doc-detective/runs/<runId>/) under the nested resource tree specs/<specId>/tests/<testId>/contexts/<contextId>/screenshots/, named with each step's order, action, and ID, so the same step lands on the same relative path in every run's folder for run-over-run comparison. Use --no-auto-screenshot to override a config file that enables it."
  );
  addBooleanOption(
    command,
    "--auto-record",
    "Record a video of every browser-based test context, in addition to any explicit record steps. The recording wraps the whole context and always uses the ffmpeg engine. Videos are saved in the per-run artifact folder (<output>/.doc-detective/runs/<runId>/) under the nested resource tree specs/<specId>/tests/<testId>/contexts/<contextId>/recordings/, so the same context lands on the same relative path in every run's folder for run-over-run comparison. Use --no-auto-record to override a config file that enables it."
  );
  addBooleanOption(
    command,
    "--auto-update",
    "Check the npm registry on startup for a newer doc-detective and self-update before running. Use --no-auto-update (or set autoUpdate: false in config) to pin to the installed version."
  );
  command
    .option(
      "--cache-dir <path>",
      "Directory for lazy-installed runtime assets (heavy npm packages, browser binaries, ffmpeg). Defaults to ~/.doc-detective/. Also overridable via DOC_DETECTIVE_CACHE_DIR."
    )
    .option(
      "--concurrent-runners <count>",
      "Number of test contexts to run concurrently (default 1). Pass a number (for example, --concurrent-runners 4), or `auto` to use the CPU core count (capped at 4). With more than 1 runner, log lines from different contexts interleave and cross-context variable dependencies are unsupported.",
      parseConcurrentRunners
    )
    .addOption(new Option(
      "--browser-fallback <mode>",
      "How to handle a context whose browser cannot start a driver session. auto (default): fall back to any other available browser (a fallback away from an explicitly requested browser reports WARNING). explicit: fall back only for auto-selected browsers; a broken explicitly-requested browser is skipped with a diagnostic reason. off: never fall back across browsers. Drivers are validated by execution, so a present-but-broken driver (e.g. a partially downloaded geckodriver) no longer silently skips coverage."
    ).choices(["auto", "explicit", "off"]))
    .addOption(new Option(
      "--shell <name>",
      "Default shell for runShell steps: bash (default), cmd, or powershell. cmd and powershell only work on Windows. Steps can override this value with their own `shell` field."
    ).choices(["bash", "cmd", "powershell"]));
  addBooleanOption(
    command,
    "-e, --exit-on-fail",
    `Exit with a non-zero code (1) when any spec's result is FAIL. ${DEPRECATED_LABELS["--exit-on-fail"]}`
  );
  return command;
}

// The options a command received, in the shape its handler reads. Handlers and
// their tests use both `dryRun` and `dry-run`, so each camelCase key also gets
// its kebab-case spelling.
export function cliArgv(command: Command): Record<string, any> {
  const argv: Record<string, any> = { ...command.optsWithGlobals() };
  for (const [key, value] of Object.entries(argv)) {
    const kebab = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    if (kebab !== key) argv[kebab] = value;
  }
  return argv;
}

// Parse argv with the run flags and nothing else, for tests of the flag surface.
// Throws on anything the real CLI would reject.
export function setArgs(args?: string[]): Record<string, any> {
  if (!args) return {};
  const command = addGlobalOptions(addRunOptions(new Command()))
    .exitOverride()
    .configureOutput({ writeErr: () => {}, writeOut: () => {} });
  command.parse(args);
  return cliArgv(command);
}
