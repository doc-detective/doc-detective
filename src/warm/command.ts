import type { CommandModule } from "yargs";
import path from "node:path";
import fs from "node:fs";

export interface WarmArgv {
  config?: string;
  input?: string;
  logLevel?: string;
  down: boolean;
}

// `doc-detective warm` — the standalone warm phase (docs/design/warm-phase.md,
// phase B3): resolve the given tests, provision everything they need
// (browsers, drivers, simulator/emulator boots, the chromedriver prefetch),
// and exit with the booted devices LEFT UP, handed off to the next run
// through <cacheDir>/warm-manifest.json. Run it while your CI build compiles
// so the test run that follows adopts ready devices instead of paying the
// boots itself. `--down` is the manual teardown for anything handed off.
export const warmCommand: CommandModule<{}, WarmArgv> = {
  command: "warm",
  describe:
    "Provision what the given tests need (browsers, drivers, device boots) and exit with devices left up, handed off to the next run. Use --down to tear handed-off devices down.",
  builder: (yargs) =>
    yargs.option("down", {
      type: "boolean",
      default: false,
      describe:
        "Tear down every device recorded in warm handoff manifests (including claims left by dead runs) and delete the manifests.",
    }) as unknown as import("yargs").Argv<WarmArgv>,
  handler: async (args) => {
    // Lazy-load so the default `runTests` path doesn't pay the import cost.
    const { setConfig, log } = await import("../utils.js");

    // Same config discovery as the default command: an explicit --config is
    // authoritative; otherwise auto-discover the .doc-detective file.
    const configPathJSON = path.resolve(process.cwd(), ".doc-detective.json");
    const configPathYAML = path.resolve(process.cwd(), ".doc-detective.yaml");
    const configPathYML = path.resolve(process.cwd(), ".doc-detective.yml");
    const hasExplicitConfig =
      typeof args.config === "string" && args.config.trim().length > 0;
    const configPath = hasExplicitConfig
      ? path.resolve((args.config as string).trim())
      : fs.existsSync(configPathJSON)
      ? configPathJSON
      : fs.existsSync(configPathYAML)
      ? configPathYAML
      : fs.existsSync(configPathYML)
      ? configPathYML
      : null;

    const config: any = await setConfig({ configPath, args });

    if (args.down) {
      const { warmDown } = await import("../core/tests.js");
      await warmDown({ config });
      return;
    }

    const { runTests } = await import("../core/index.js");
    const results = await runTests(config, { warmOnly: true });
    if (!results) return;
    // Concise terminal summary — warm results aren't test results, so the
    // reporters don't run; the structured detail is results.warm.
    const tasks: any[] = results.warm?.tasks ?? [];
    const counts = tasks.reduce(
      (acc: Record<string, number>, t: any) => {
        acc[t.outcome] = (acc[t.outcome] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    log(
      `Warm finished in ${results.warm?.durationMs ?? 0}ms: ${
        tasks.length
      } task(s) (${Object.entries(counts)
        .map(([outcome, n]) => `${n} ${outcome}`)
        .join(", ") || "none"}).${
        results.warmManifest
          ? ` Devices handed off via ${results.warmManifest}.`
          : ""
      }`,
      "info",
      config
    );
  },
};
