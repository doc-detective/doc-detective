import type { CommandModule } from "yargs";
import path from "node:path";
import fs from "node:fs";

export interface DebugArgv {
  config?: string;
  input?: string;
  logLevel?: string;
  "include-env": boolean;
  includeEnv?: boolean;
}

// `doc-detective debug` — print a paste-friendly diagnostic dump and
// exit without running tests. See `src/debug/index.ts` for the renderer.
//
// `--include-env` opts into the full `process.env` dump (still redacted
// by name AND by value shape). Without it, the dump only lists env
// vars referenced via `$VAR` in config or input files.
export const debugCommand: CommandModule<{}, DebugArgv> = {
  command: "debug",
  describe:
    "Print diagnostic information about the runtime environment (OS, Doc Detective version, tool versions, browsers, referenced env vars) and exit without running tests.",
  builder: (yargs) =>
    yargs.option("include-env", {
      type: "boolean",
      default: false,
      describe:
        "Also dump the full process.env (redacted by name and value shape). Off by default to avoid leaking PaaS-injected credentials (DATABASE_URL, Sentry DSN, webhooks).",
    }) as unknown as import("yargs").Argv<DebugArgv>,
  handler: async (args) => {
    // Lazy-load so the default `runTests` path doesn't pay the import cost.
    const { setConfig } = await import("../utils.js");
    const { printDebug, defaultDebugOutFile, defaultDebugJsonFile } =
      await import("./index.js");
    const outFile = defaultDebugOutFile();
    const jsonOutFile = defaultDebugJsonFile();

    const configPathJSON = path.resolve(process.cwd(), ".doc-detective.json");
    const configPathYAML = path.resolve(process.cwd(), ".doc-detective.yaml");
    const configPathYML = path.resolve(process.cwd(), ".doc-detective.yml");
    // Treat any non-empty `--config` as authoritative (resolved to an
    // absolute path) — a mistyped path must surface as a CONFIG INVALID
    // dump for that path, not silently fall back to auto-discovery.
    const hasExplicitConfig =
      typeof args.config === "string" && args.config.trim().length > 0;
    const configPath = hasExplicitConfig
      ? path.resolve(args.config as string)
      : fs.existsSync(configPathJSON)
      ? configPathJSON
      : fs.existsSync(configPathYAML)
      ? configPathYAML
      : fs.existsSync(configPathYML)
      ? configPathYML
      : null;

    // `--include-env` lands on argv as both kebab and camel; tolerate either.
    const includeEnv = Boolean(args["include-env"] ?? args.includeEnv);

    let config: any;
    try {
      config = await setConfig({ configPath, args });
    } catch (err: any) {
      // Bad config is exactly the case the user is debugging — emit the
      // dump under a CONFIG INVALID banner instead of bailing.
      await printDebug({
        config: {
          logLevel:
            typeof args.logLevel === "string" ? args.logLevel : "info",
          input: typeof args.input === "string" ? args.input : ".",
        },
        configPath,
        configError: err instanceof Error ? err : new Error(String(err)),
        includeEnv,
        outFile,
        jsonOutFile,
      });
      return;
    }
    await printDebug({
      config,
      configPath,
      configError: null,
      includeEnv,
      outFile,
      jsonOutFile,
    });
  },
};
