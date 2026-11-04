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

const AGENT_GROUP = "Agent options:";

// `handler` is replaceable for tests.
export function buildInstallAgentsCommand(
  handler: (argv: any) => Promise<void> | void = installAgentsHandler
): Command {
  return addGlobalOptions(new Command("agents"))
    .addOption(
      new Option(
        "--agent <id...>",
        "Install for this agent; repeatable. One of claude, copilot, gemini, codex, qwen, or opencode"
      ).helpGroup(AGENT_GROUP)
    )
    .addOption(
      new Option(
        "--scope <scope>",
        "Install for this project or for your user: project or global"
      )
        .choices(["project", "global"])
        .helpGroup(AGENT_GROUP)
    )
    .addOption(new Option("-y, --yes", "Don't prompt; needs --agent and --scope").helpGroup(AGENT_GROUP))
    .addOption(new Option("-f, --force", "Reinstall even if up to date").helpGroup(AGENT_GROUP))
    .addOption(new Option("-n, --dry-run", "Show what would happen without doing it").helpGroup(AGENT_GROUP))
    .action(async (_options, command: Command) => {
      await handler(cliArgv(command));
    });
}
