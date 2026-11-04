import { Command, Option } from "commander";
import { addGlobalOptions, cliArgv } from "../cliOptions.js";

export interface InstallAgentsArgv {
  agent?: string[];
  scope?: "project" | "global";
  force: boolean;
  yes: boolean;
  "dry-run": boolean;
  dryRun?: boolean;
}

async function installAgentsHandler(argv: any): Promise<void> {
  // Lazy-load so unrelated subcommands don't pay the import cost.
  const { runInstallAgents } = await import("./runner.js");
  const { createPrompts } = await import("./prompts.js");
  const reports = await runInstallAgents(argv, {
    prompts: createPrompts(),
    // With --json, stdout holds the JSON document and nothing else.
    ...(argv.json ? { logger: (message: string) => console.error(message) } : {}),
  });
  if (argv.json) console.log(JSON.stringify(reports, null, 2));
}

// `handler` is replaceable for tests.
export function buildInstallAgentsCommand(
  handler: (argv: any) => Promise<void> | void = installAgentsHandler
): Command {
  return addGlobalOptions(new Command("agents"))
    .description(
      "Install or update the doc-detective agent tools for detected AI coding agents (e.g., Claude Code)."
    )
    .option(
      "--agent <id...>",
      "Agent id to install into (repeatable). Skips the interactive picker. Example: --agent claude"
    )
    .addOption(
      new Option(
        "--scope <scope>",
        "Where to install: 'project' (current repo) or 'global' (user home). Each adapter resolves the exact path. Prompted if omitted."
      ).choices(["project", "global"])
    )
    .option("-f, --force", "Reinstall/overwrite even if already installed and up to date.")
    .option("-y, --yes", "Skip all prompts. Requires --agent and --scope.")
    .option("-n, --dry-run", "Print the actions that would be taken without executing them.")
    .action(async (_options, command: Command) => {
      await handler(cliArgv(command));
    });
}
