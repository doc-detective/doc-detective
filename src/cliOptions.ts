import { Command, InvalidArgumentError, Option } from "commander";

export const GLOBAL_GROUP = "Global options:";
const RUN_GROUP = "Run options:";
const BEHAVIOR_GROUP = "Run behavior:";
const DEPRECATED_GROUP = "Deprecated options:";

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

function grouped(group: string, flags: string, description?: string) {
  return new Option(flags, description).helpGroup(group);
}

// A boolean flag and its opposite, with one shown in help. Declaring both leaves
// the option undefined when neither is passed, which is what setConfig's
// `typeof args.x === "boolean"` override blocks rely on to tell "unset" from
// "explicitly off".
function addBooleanPair(
  command: Command,
  group: string,
  shown: string,
  description: string,
  hidden: string
) {
  command.addOption(grouped(group, shown, description));
  command.addOption(new Option(hidden).hideHelp());
}

// The flags every command takes, before or after its name.
export function addGlobalOptions(command: Command): Command {
  return command
    .addOption(grouped(GLOBAL_GROUP, "-q, --quiet", "Show only errors and a one-line verdict"))
    .addOption(
      grouped(
        GLOBAL_GROUP,
        "-d, --debug",
        "Show debugging output (alias: --verbose; also DEBUG and DOC_DETECTIVE_DEBUG)"
      )
    )
    .addOption(new Option("--verbose").hideHelp().implies({ debug: true }))
    .addOption(
      grouped(GLOBAL_GROUP, "-l, --log-level <level>", "Set log detail: silent, error, warning, info, debug").choices(
        LOG_LEVELS
      )
    )
    .addOption(
      grouped(
        DEPRECATED_GROUP,
        "--logLevel <level>",
        `Set log detail ${DEPRECATED_LABELS["--logLevel"]}`
      ).choices(LOG_LEVELS)
    )
    .addOption(grouped(GLOBAL_GROUP, "--json", "Print one JSON document to stdout"))
    .addOption(grouped(GLOBAL_GROUP, "--no-color", "Turn off color (also NO_COLOR)"))
    .addOption(new Option("--color").hideHelp())
    // Taken out of argv before parsing (see applyInputFlag). Declared for help.
    .addOption(grouped(GLOBAL_GROUP, "--no-input", "Never prompt; fail and name the flag to pass"));
}

// The flags that choose what to read, shared by the run commands and `debug`.
export function addInputOptions(command: Command, group = RUN_GROUP): Command {
  return command
    .addOption(grouped(group, "-c, --config <file>", "Use this config file"))
    .addOption(grouped(group, "-i, --input <path>", 'Test these files or folders; "-" reads stdin'));
}

// The flags a test run takes. Runtime code never reads these directly: setConfig
// overlays them onto the validated config.
export function addRunOptions(command: Command): Command {
  addInputOptions(command);
  command
    .addOption(grouped(RUN_GROUP, "-o, --output <file>", 'Write results JSON here; "-" writes to stdout'))
    .addOption(grouped(RUN_GROUP, "--output-dir <dir>", "Write the run folder and reports here [.]"))
    .addOption(
      grouped(
        RUN_GROUP,
        "-r, --reporters <names...>",
        "Use terminal, json, html, runFolder, junit, or markdown [terminal, runFolder]"
      )
    )
    .addOption(grouped(RUN_GROUP, "-t, --test <patterns>", "Run only tests with a matching ID"))
    .addOption(grouped(RUN_GROUP, "-s, --spec <patterns>", "Run only specs with a matching ID"));
  addBooleanPair(
    command,
    RUN_GROUP,
    "-n, --dry-run",
    "Print the resolved test plan as JSON and stop",
    "--no-dry-run"
  );
  command.addOption(grouped(RUN_GROUP, "--plain", "Print one tab-separated line per test"));
  command.addOption(grouped(RUN_GROUP, "--no-exit-on-fail", "Exit 0 even when tests fail"));

  addBooleanPair(
    command,
    BEHAVIOR_GROUP,
    "--allow-unsafe",
    "Run steps marked unsafe, such as detected code",
    "--no-allow-unsafe"
  );
  command
    .addOption(
      grouped(
        BEHAVIOR_GROUP,
        "--concurrent-runners <count>",
        "Run contexts at once: a number or auto [1]"
      ).argParser(parseConcurrentRunners)
    )
    .addOption(
      grouped(
        BEHAVIOR_GROUP,
        "--browser-fallback <mode>",
        "Replace a browser that won't start: auto, explicit, or off [auto]"
      ).choices(["auto", "explicit", "off"])
    )
    .addOption(
      grouped(
        BEHAVIOR_GROUP,
        "--shell <name>",
        "Set the default runShell shell: bash, cmd, or powershell [bash]"
      ).choices(["bash", "cmd", "powershell"])
    );
  addBooleanPair(
    command,
    BEHAVIOR_GROUP,
    "--auto-screenshot",
    "Capture a screenshot after each browser step",
    "--no-auto-screenshot"
  );
  addBooleanPair(
    command,
    BEHAVIOR_GROUP,
    "--auto-record",
    "Record a video of each browser context",
    "--no-auto-record"
  );
  command
    .addOption(
      grouped(
        BEHAVIOR_GROUP,
        "--verification <mode>",
        "Write results back to source files: existing, true, or false [existing]"
      ).choices(["existing", "true", "false"])
    )
    .addOption(grouped(BEHAVIOR_GROUP, "--cache-dir <dir>", "Keep browsers and runtimes here"))
    .addOption(
      grouped(BEHAVIOR_GROUP, "--no-env-file", "Don't load .env from the current directory")
    );
  addBooleanPair(
    command,
    BEHAVIOR_GROUP,
    "--no-hints",
    "Don't show hints after a run",
    "--hints"
  );
  addBooleanPair(
    command,
    BEHAVIOR_GROUP,
    "--no-auto-update",
    "Don't update to a newer 5.x before running",
    "--auto-update"
  );
  command.addOption(grouped(BEHAVIOR_GROUP, "--no-telemetry", "Don't send anonymous usage data"));
  // The positive form is deprecated, and listed in its own group.
  command.addOption(
    grouped(
      DEPRECATED_GROUP,
      "-e, --exit-on-fail",
      `Exit 1 on test failure ${DEPRECATED_LABELS["--exit-on-fail"]}`
    )
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
