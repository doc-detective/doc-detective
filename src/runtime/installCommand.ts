import { Argument, Command, Option } from "commander";
import { buildInstallAgentsCommand } from "../agents/command.js";
import { cliArgv } from "../cliOptions.js";
import type { Logger, LogLevel } from "./loader.js";
import { HEAVY_NPM_DEPS } from "./heavyDeps.js";

// One `install <asset>` subcommand: what it's called, its extra arguments and
// options, and the handler that receives its parsed options.
interface InstallSubcommand {
  command: string;
  describe: string;
  configure?: (command: Command) => void;
  handler: (argv: any) => Promise<void>;
}

export interface InstallArgv {
  yes: boolean;
  force: boolean;
  "dry-run": boolean;
  dryRun?: boolean;
  silent?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  "cache-dir"?: string;
  cacheDir?: string;
  all?: boolean;
}

function pickLogLevel(argv: InstallArgv): LogLevel {
  if (argv.silent || argv.quiet) return "error";
  if (argv.verbose) return "debug";
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
    if (lvl === "error") console.error(msg);
    else console.log(msg);
  };
}

const sharedInstallOptions = (command: Command) =>
  command
    .option(
      "-y, --yes",
      "Skip interactive prompts (auto-install missing assets without confirming)."
    )
    .option(
      "-f, --force",
      "Reinstall even if the asset is already present and current. Prunes any older versions in the cache."
    )
    .option(
      "-n, --dry-run",
      "Report the actions that would be taken without executing them."
    )
    .option("--silent", "Suppress all output except errors. Alias: --quiet.")
    .option("--quiet", "Same as --silent.")
    .option(
      "--verbose",
      "Emit debug-level output, including child-process (npm) stdout/stderr."
    )
    .option(
      "--cache-dir <path>",
      "Override the cache root for this invocation (also DOC_DETECTIVE_CACHE_DIR env var)."
    );

function ctxFromArgv(argv: InstallArgv) {
  return argv.cacheDir ? { cacheDir: argv.cacheDir } : {};
}

function printReports(reports: any[], logger: Logger) {
  for (const r of reports) {
    const ver = r.installedVersion ? ` @ ${r.installedVersion}` : "";
    const notes = r.notes && r.notes.length > 0 ? ` (${r.notes.join("; ")})` : "";
    logger(`  [${r.kind}] ${r.assetId} — ${r.action}${ver}${notes}`, "info");
  }
}

const runtimeSubcommand: InstallSubcommand = {
  command: "runtime",
  describe: `Install heavy npm packages into <cacheDir>/runtime. Supported: ${HEAVY_NPM_DEPS.join(", ")}.`,
  configure: (command) => {
    command.argument(
      "[packages...]",
      "Package names to install (defaults to every heavy dep when omitted)."
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
        process.exitCode = 1;
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
  describe:
    "Install browsers + drivers (chrome, firefox, chromedriver, geckodriver) into <cacheDir>/browsers.",
  configure: (command) => {
    command.addArgument(
      new Argument(
        "[names...]",
        "Browser/driver names to install (defaults to all when omitted)."
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
  describe:
    "Install the Android SDK toolchain (platform-tools, emulator, a system image) and create the default AVD. Augments an existing SDK (ANDROID_HOME/ANDROID_SDK_ROOT), or bootstraps commandline-tools into <cacheDir>/android-sdk. Downloads are multi-GB — requires --yes to proceed. Needs a Java runtime (JRE 17+).",
  configure: (command) => {
    command
      .option(
        "--os-version <version>",
        "Android version for the system image / AVD (e.g. 14, or a raw API level like 34). Default: the newest available."
      )
      .addOption(
        new Option(
          "--device-type <type>",
          "Abstract hardware profile for the default AVD. Default: phone."
        ).choices(["phone", "tablet"])
      )
      .option(
        "--reset-snapshot",
        "Delete Doc Detective's clean boot snapshot from every AVD (nothing is installed). Each AVD's next managed boot cold-boots and retakes the snapshot from its current state."
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
      if (failed.length) process.exitCode = 1;
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
  describe:
    "Install Git Bash on Windows hosts (backs runShell's default `bash` shell). Uses an existing Git for Windows install when present; otherwise downloads MinGit (~40 MB) into <cacheDir>/tools/git-bash. No-op on macOS/Linux, which resolve bash from PATH.",
  handler: async (argv: any) => {
    const logger = makeLogger(pickLogLevel(argv));
    await runInstallBash(argv, logger);
  },
};

const iosSubcommand: InstallSubcommand = {
  command: "ios",
  describe:
    "Prepare iOS simulator prerequisites on macOS hosts (Xcode command-line tools, simctl visibility, and guidance for WebDriverAgent/XCUITest).",
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
  describe:
    "Report what's installed in <cacheDir>/runtime and <cacheDir>/browsers vs. the shim's declared versions.",
  handler: async (argv: any) => {
    const logger = makeLogger(pickLogLevel(argv));
    const { status } = await import("./installer.js");
    const rows = status(ctxFromArgv(argv));
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
  describe:
    "Install all lazy-installed runtime assets: runtime npm packages, browser binaries, and (on Windows) Git Bash. Agent tools (`install agents`) and mobile toolchains (`install android`, `install ios`) are installed separately — agents need an interactive picker, Android pulls multi-GB downloads, and iOS preparation is macOS-only.",
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
  runtime: runtimeSubcommand,
  browsers: browsersSubcommand,
  bash: bashSubcommand,
  android: androidSubcommand,
  ios: iosSubcommand,
  status: statusSubcommand,
  all: allSubcommand,
};

function toCommand(subcommand: InstallSubcommand): Command {
  const command = new Command(subcommand.command).description(subcommand.describe);
  sharedInstallOptions(command);
  subcommand.configure?.(command);
  return command.action(async (...actionArgs: any[]) => {
    const argv = cliArgv(command);
    command.registeredArguments.forEach((argument, index) => {
      argv[argument.name()] = actionArgs[index];
    });
    await subcommand.handler(argv);
  });
}

/**
 * The `doc-detective install` command group. A bare or unrecognized
 * `install <word>` reaches the action, which names the valid subcommands.
 * `install-agents` keeps its top-level registration as a hidden alias
 * (configured in cliProgram.ts).
 */
export function buildInstallCommand(): Command {
  const install = new Command("install")
    .description(
      "Install doc-detective's lazy-loaded assets: agents, runtime, browsers, bash, android, ios."
    )
    .argument("[subcommand]")
    .action((_subcommand, _options, command: Command) => {
      command.error(
        "Specify a subcommand: agents | runtime | browsers | bash | android | ios | status | all."
      );
    });
  install.addCommand(buildInstallAgentsCommand("agents"));
  for (const subcommand of Object.values(installSubcommands)) {
    install.addCommand(toCommand(subcommand));
  }
  return install;
}
