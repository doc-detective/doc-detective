import type { CommandModule } from "yargs";
import { installAgentsCommand } from "../agents/command.js";
import type { Logger, LogLevel } from "./loader.js";
import { HEAVY_NPM_DEPS } from "./heavyDeps.js";

// Re-register the agents command under the bare name `agents` for use inside
// the `install <subcommand>` group. The original `install-agents` registration
// remains in cli.ts as a hidden top-level alias for back-compat.
const agentsSubcommand: CommandModule<any, any> = {
  ...(installAgentsCommand as any),
  command: "agents",
};

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

const sharedInstallOptions = (yargs: any) =>
  yargs
    .option("yes", {
      alias: "y",
      type: "boolean",
      default: false,
      describe:
        "Skip interactive prompts (auto-install missing assets without confirming).",
    })
    .option("force", {
      alias: "f",
      type: "boolean",
      default: false,
      describe:
        "Reinstall even if the asset is already present and current. Prunes any older versions in the cache.",
    })
    .option("dry-run", {
      type: "boolean",
      default: false,
      describe:
        "Report the actions that would be taken without executing them.",
    })
    .option("silent", {
      type: "boolean",
      default: false,
      describe: "Suppress all output except errors. Alias: --quiet.",
    })
    .option("quiet", {
      type: "boolean",
      default: false,
      describe: "Same as --silent.",
    })
    .option("verbose", {
      type: "boolean",
      default: false,
      describe:
        "Emit debug-level output, including child-process (npm) stdout/stderr.",
    })
    .option("cache-dir", {
      type: "string",
      describe:
        "Override the cache root for this invocation (also DOC_DETECTIVE_CACHE_DIR env var).",
    });

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

const runtimeSubcommand: CommandModule<any, InstallArgv & { _packages?: string[] }> = {
  command: "runtime [packages..]",
  describe: `Install heavy npm packages into <cacheDir>/runtime. Supported: ${HEAVY_NPM_DEPS.join(", ")}.`,
  builder: (yargs) =>
    sharedInstallOptions(yargs).positional("packages", {
      describe:
        "Package names to install (defaults to every heavy dep when omitted).",
      type: "string",
      array: true,
    }) as any,
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

const browsersSubcommand: CommandModule<any, InstallArgv & { _names?: string[] }> = {
  command: "browsers [names..]",
  describe:
    "Install browsers + drivers (chrome, firefox, chromedriver, geckodriver) into <cacheDir>/browsers.",
  builder: (yargs) =>
    sharedInstallOptions(yargs).positional("names", {
      describe:
        "Browser/driver names to install (defaults to all when omitted).",
      type: "string",
      array: true,
      choices: ["chrome", "firefox", "chromedriver", "geckodriver"] as const,
    }) as any,
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

const androidSubcommand: CommandModule<any, InstallArgv> = {
  command: "android",
  describe:
    "Install the Android SDK toolchain (platform-tools, emulator, a system image) and create the default AVD. Augments an existing SDK (ANDROID_HOME/ANDROID_SDK_ROOT), or bootstraps commandline-tools into <cacheDir>/android-sdk. Downloads are multi-GB — requires --yes to proceed. Needs a Java runtime (JRE 17+).",
  builder: (yargs) =>
    sharedInstallOptions(yargs)
      .option("os-version", {
        type: "string",
        describe:
          "Android version for the system image / AVD (e.g. 14, or a raw API level like 34). Default: the newest available.",
      })
      .option("device-type", {
        type: "string",
        choices: ["phone", "tablet"] as const,
        describe: "Abstract hardware profile for the default AVD. Default: phone.",
      }) as any,
  handler: async (argv: any) => {
    const logger = makeLogger(pickLogLevel(argv));
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

const iosSubcommand: CommandModule<any, InstallArgv> = {
  command: "ios",
  describe:
    "Prepare iOS simulator prerequisites on macOS hosts (Xcode command-line tools, simctl visibility, and guidance for WebDriverAgent/XCUITest).",
  builder: (yargs) => sharedInstallOptions(yargs) as any,
  handler: async (argv: any) => {
    const logger = makeLogger(pickLogLevel(argv));
    const { installIos } = await import("./iosInstaller.js");
    const reports = await installIos({
      yes: Boolean(argv.yes),
      force: Boolean(argv.force),
      dryRun: Boolean(argv["dry-run"]),
      ctx: ctxFromArgv(argv),
      deps: { logger },
    });
    printReports(reports, logger);
  },
};

const statusSubcommand: CommandModule<any, InstallArgv> = {
  command: "status",
  describe:
    "Report what's installed in <cacheDir>/runtime and <cacheDir>/browsers vs. the shim's declared versions.",
  builder: (yargs) => sharedInstallOptions(yargs) as any,
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

const allSubcommand: CommandModule<any, InstallArgv> = {
  command: "all",
  describe:
    "Install all lazy-installed runtime assets: runtime npm packages and browser binaries. Agent tools (`install agents`) and mobile toolchains (`install android`, `install ios`) are installed separately — agents need an interactive picker, Android pulls multi-GB downloads, and iOS preparation is macOS-only.",
  builder: (yargs) => sharedInstallOptions(yargs) as any,
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
  },
};

/**
 * The `doc-detective install` command group. Registers subcommands and
 * a bare `install` form that prints help. The existing `install-agents`
 * command keeps its top-level registration as a permanent hidden alias
 * (configured in cli.ts).
 */
export const installCommand: CommandModule<{}, InstallArgv> = {
  command: "install <subcommand>",
  describe:
    "Install doc-detective's lazy-loaded assets: agents, runtime, browsers, android, ios.",
  builder: (yargs) =>
    yargs
      .command(agentsSubcommand as any)
      .command(runtimeSubcommand as any)
      .command(browsersSubcommand as any)
      .command(androidSubcommand as any)
      .command(iosSubcommand as any)
      .command(statusSubcommand as any)
      .command(allSubcommand as any)
      .demandCommand(1, "Specify a subcommand: agents | runtime | browsers | android | ios | status | all.") as any,
  handler: () => {
    // Each subcommand registers its own handler; this top-level handler is
    // only reached when yargs falls through (demandCommand should prevent
    // that, but in defensive coding we still print help).
  },
};
