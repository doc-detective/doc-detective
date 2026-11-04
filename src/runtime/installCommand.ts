import { Argument, Command, Option } from "commander";
import { buildInstallAgentsCommand } from "../agents/command.js";
import { addGlobalOptions, cliArgv } from "../cliOptions.js";
import { clearSpinner, startSpinner } from "../cliOutput.js";
import type { Logger, LogLevel } from "./loader.js";
import { HEAVY_NPM_DEPS } from "./heavyDeps.js";

// One `install <asset>` subcommand: what it's called, its extra arguments and
// options, and the handler that receives its parsed options.
interface InstallSubcommand {
  command: string;
  /** Set when the subcommand only reads the cache, so it takes no install flags. */
  readOnly?: boolean;
  configure?: (command: Command) => void;
  handler: (argv: any) => Promise<void>;
}

export interface InstallArgv {
  yes: boolean;
  force: boolean;
  "dry-run": boolean;
  dryRun?: boolean;
  quiet?: boolean;
  debug?: boolean;
  logLevel?: string;
  "cache-dir"?: string;
  cacheDir?: string;
  all?: boolean;
}

function pickLogLevel(argv: InstallArgv): LogLevel {
  if (argv.debug || argv.logLevel === "debug") return "debug";
  if (argv.quiet || argv.logLevel === "silent" || argv.logLevel === "error") return "error";
  if (argv.logLevel === "warning") return "warn";
  return "info";
}

function makeLogger(level: LogLevel): Logger {
  const order: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };
  const threshold = order[level];
  return (msg, lvl = "info") => {
    if (order[lvl] < threshold) return;
    clearSpinner();
    // With --json, stdout holds the JSON document and nothing else.
    if (lvl === "error" || jsonReports) console.error(msg);
    else console.log(msg);
  };
}

const INSTALL_GROUP = "Install options:";

const sharedInstallOptions = (command: Command) =>
  command
    .addOption(new Option("-y, --yes", "Don't ask for confirmation").helpGroup(INSTALL_GROUP))
    .addOption(new Option("-f, --force", "Reinstall, and remove older cached versions").helpGroup(INSTALL_GROUP))
    .addOption(new Option("-n, --dry-run", "Show what would happen without doing it").helpGroup(INSTALL_GROUP))
    .addOption(
      new Option("--cache-dir <dir>", "Install here (also DOC_DETECTIVE_CACHE_DIR)").helpGroup(INSTALL_GROUP)
    );

function ctxFromArgv(argv: InstallArgv) {
  return argv.cacheDir ? { cacheDir: argv.cacheDir } : {};
}

// Set while a subcommand runs with --json: it collects reports to print as one
// document, rather than printing lines.
let jsonReports: any[] | null = null;

function printReports(reports: any[], logger: Logger) {
  jsonReports?.push(...reports);
  for (const r of reports) {
    const ver = r.installedVersion ? ` @ ${r.installedVersion}` : "";
    const notes = r.notes && r.notes.length > 0 ? ` (${r.notes.join("; ")})` : "";
    logger(`  [${r.kind}] ${r.assetId} — ${r.action}${ver}${notes}`, "info");
  }
}

const runtimeSubcommand: InstallSubcommand = {
  command: "runtime",
  configure: (command) => {
    command.argument(
      "[packages...]",
      `Any of ${HEAVY_NPM_DEPS.join(", ")} [all]`
    );
  },
  handler: async (argv: any) => {
    const logger = makeLogger(pickLogLevel(argv));
    const requested: string[] | undefined = Array.isArray(argv.packages)
      ? argv.packages
      : undefined;
    if (requested && requested.length > 0) {
      // Validate up front so an unknown name yields a user-friendly error
      // listing supported values, rather than the developer-facing
      // `getDeclaredVersion()` "not declared in package.json" exception
      // deep inside the installer.
      const supported = new Set<string>(HEAVY_NPM_DEPS as readonly string[]);
      const unknown = requested.filter((name) => !supported.has(name));
      if (unknown.length > 0) {
        logger(
          `Unknown runtime package(s): ${unknown.join(", ")}. Supported names: ${HEAVY_NPM_DEPS.join(", ")}.`,
          "error"
        );
        process.exitCode = 2;
        return;
      }
    }
    const { installRuntime } = await import("./installer.js");
    const reports = await installRuntime({
      packages: requested,
      force: Boolean(argv.force),
      dryRun: Boolean(argv["dry-run"]),
      ctx: ctxFromArgv(argv),
      deps: { logger },
    });
    printReports(reports, logger);
  },
};

const browsersSubcommand: InstallSubcommand = {
  command: "browsers",
  configure: (command) => {
    command.addArgument(
      new Argument(
        "[names...]",
        "Any of chrome, firefox, chromedriver, geckodriver [all]"
      ).choices(["chrome", "firefox", "chromedriver", "geckodriver"])
    );
  },
  handler: async (argv: any) => {
    const logger = makeLogger(pickLogLevel(argv));
    const { installBrowsers } = await import("./installer.js");
    const reports = await installBrowsers({
      names: Array.isArray(argv.names) ? argv.names : undefined,
      force: Boolean(argv.force),
      dryRun: Boolean(argv["dry-run"]),
      ctx: ctxFromArgv(argv),
      deps: { logger },
    });
    printReports(reports, logger);
  },
};

const androidSubcommand: InstallSubcommand = {
  command: "android",
  configure: (command) => {
    command
      .addOption(
        new Option("--os-version <version>", "Android version or API level [newest available]").helpGroup(
          "Android options:"
        )
      )
      .addOption(
        new Option("--device-type <type>", "Hardware profile: phone or tablet [phone]")
          .choices(["phone", "tablet"])
          .helpGroup("Android options:")
      )
      .addOption(
        new Option(
          "--reset-snapshot",
          "Delete the clean boot snapshot from every virtual device, and install nothing"
        ).helpGroup("Android options:")
      );
  },
  handler: async (argv: any) => {
    const logger = makeLogger(pickLogLevel(argv));
    if (argv["reset-snapshot"]) {
      const { resetCleanSnapshots } = await import("./androidInstaller.js");
      const dryRun = Boolean(argv["dry-run"]);
      const { reset, failed } = resetCleanSnapshots({ dryRun });
      if (reset.length) {
        logger(
          dryRun
            ? `Would reset the clean boot snapshot for: ${reset.join(", ")}.`
            : `Reset the clean boot snapshot for: ${reset.join(", ")}. The next managed boot of each retakes it.`,
          "info"
        );
      }
      for (const { name, error } of failed) {
        logger(
          `Couldn't reset the clean boot snapshot for ${name}: ${error}. Close any emulator running that AVD and rerun.`,
          "error"
        );
      }
      if (!reset.length && !failed.length) {
        logger("No clean boot snapshots to reset.", "info");
      }
      if (failed.length) process.exitCode = 2;
      return;
    }
    const { installAndroid } = await import("./androidInstaller.js");
    const reports = await installAndroid({
      yes: Boolean(argv.yes),
      force: Boolean(argv.force),
      dryRun: Boolean(argv["dry-run"]),
      osVersion: argv["os-version"],
      deviceType: argv["device-type"],
      ctx: ctxFromArgv(argv),
      deps: { logger },
    });
    printReports(reports, logger);
    if (reports.some((report: any) => report.action === "declined")) {
      process.exitCode = 2;
    }
  },
};

// Shared by the `install bash` subcommand and `install all`'s Windows leg so
// the two entry points can't drift on how installBash is invoked.
async function runInstallBash(argv: any, logger: Logger): Promise<void> {
  const { installBash } = await import("./windowsBash.js");
  const reports = await installBash({
    force: Boolean(argv.force),
    dryRun: Boolean(argv["dry-run"]),
    ctx: ctxFromArgv(argv),
    deps: { logger },
  });
  printReports(reports, logger);
}

const bashSubcommand: InstallSubcommand = {
  command: "bash",
  handler: async (argv: any) => {
    const logger = makeLogger(pickLogLevel(argv));
    await runInstallBash(argv, logger);
  },
};

const iosSubcommand: InstallSubcommand = {
  command: "ios",
  handler: async (argv: any) => {
    const logger = makeLogger(pickLogLevel(argv));
    const { installIos } = await import("./iosInstaller.js");
    const reports = await installIos({
      yes: Boolean(argv.yes),
      dryRun: Boolean(argv["dry-run"]),
      ctx: ctxFromArgv(argv),
      deps: { logger },
    });
    printReports(reports, logger);
  },
};

const statusSubcommand: InstallSubcommand = {
  command: "status",
  readOnly: true,
  handler: async (argv: any) => {
    const logger = makeLogger(pickLogLevel(argv));
    const { status } = await import("./installer.js");
    const rows = status(ctxFromArgv(argv));
    jsonReports?.push(...rows);
    for (const r of rows) {
      const present = r.installed ? r.installedVersion ?? "?" : "—";
      const expected = r.expectedVersion ?? r.latestKnownVersion ?? "—";
      const note = r.outdated ? " (outdated)" : "";
      logger(
        `  [${r.kind}] ${r.assetId}: installed=${present} expected=${expected}${note}`,
        "info"
      );
    }
  },
};

const allSubcommand: InstallSubcommand = {
  command: "all",
  handler: async (argv: any) => {
    const logger = makeLogger(pickLogLevel(argv));
    const { installRuntime, installBrowsers } = await import("./installer.js");
    logger("Installing runtime…", "info");
    printReports(
      await installRuntime({
        force: Boolean(argv.force),
        dryRun: Boolean(argv["dry-run"]),
        ctx: ctxFromArgv(argv),
        deps: { logger },
      }),
      logger
    );
    logger("Installing browsers…", "info");
    printReports(
      await installBrowsers({
        force: Boolean(argv.force),
        dryRun: Boolean(argv["dry-run"]),
        ctx: ctxFromArgv(argv),
        deps: { logger },
      }),
      logger
    );
    // Git Bash backs runShell's default `bash` shell on Windows; POSIX hosts
    // resolve bash from PATH, so the subcommand is skipped there (and gating
    // here avoids a noisy skipped row on every macOS/Linux `install all`).
    if (process.platform === "win32") {
      logger("Installing bash…", "info");
      await runInstallBash(argv, logger);
    }
  },
};

// Exported so tests can call a subcommand's handler with a synthetic argv.
export const installSubcommands: Record<string, InstallSubcommand> = {
  all: allSubcommand,
  browsers: browsersSubcommand,
  runtime: runtimeSubcommand,
  bash: bashSubcommand,
  android: androidSubcommand,
  ios: iosSubcommand,
  status: statusSubcommand,
};

function toCommand(subcommand: InstallSubcommand): Command {
  const command = addGlobalOptions(new Command(subcommand.command));
  if (subcommand.readOnly) {
    command.addOption(
      new Option("--cache-dir <dir>", "Check here (also DOC_DETECTIVE_CACHE_DIR)").helpGroup("Status options:")
    );
  } else {
    sharedInstallOptions(command);
  }
  subcommand.configure?.(command);
  return command.action(async (...actionArgs: any[]) => {
    const argv = cliArgv(command);
    command.registeredArguments.forEach((argument, index) => {
      argv[argument.name()] = actionArgs[index];
    });
    jsonReports = argv.json ? [] : null;
    const spinner =
      subcommand.readOnly || argv.quiet || argv.json
        ? { stop: () => {} }
        : await startSpinner(`Installing ${subcommand.command}`);
    try {
      await subcommand.handler(argv);
    } finally {
      spinner.stop();
    }
    if (jsonReports) console.log(JSON.stringify(jsonReports, null, 2));
  });
}

/**
 * The `doc-detective install` command group. A bare or unrecognized
 * `install <word>` reaches the action, which names the valid subcommands.
 */
export function buildInstallCommand(): Command {
  const install = addGlobalOptions(new Command("install"))
    .helpCommand(false)
    .commandsGroup("Assets:")
    .allowExcessArguments(true)
    .action((_options, command: Command) => {
      command.error(
        "Specify an asset: all | browsers | runtime | bash | android | ios | agents | status."
      );
    });
  for (const subcommand of Object.values(installSubcommands)) {
    install.addCommand(toCommand(subcommand));
  }
  install.addCommand(buildInstallAgentsCommand());
  return install;
}
