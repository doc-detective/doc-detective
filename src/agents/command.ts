import type { CommandModule } from "yargs";

export interface InstallAgentsArgv {
  agent?: string[];
  scope?: "project" | "global";
  force: boolean;
  yes: boolean;
  "dry-run": boolean;
  dryRun?: boolean;
}

export const installAgentsCommand: CommandModule<{}, InstallAgentsArgv> = {
  command: "install-agents",
  describe:
    "Install or update the doc-detective agent tools for detected AI coding agents (e.g., Claude Code).",
  builder: (yargs) =>
    yargs
      .option("agent", {
        alias: "a",
        type: "string",
        array: true,
        describe:
          "Agent id to install into (repeatable). Skips the interactive picker. Example: --agent claude-code",
      })
      .option("scope", {
        alias: "s",
        type: "string",
        choices: ["project", "global"] as const,
        describe:
          "Where to install: 'project' (./.claude/…) or 'global' (~/.claude/…). Prompted if omitted.",
      })
      .option("force", {
        alias: "f",
        type: "boolean",
        default: false,
        describe: "Reinstall/overwrite even if already installed and up to date.",
      })
      .option("yes", {
        alias: "y",
        type: "boolean",
        default: false,
        describe: "Skip all prompts. Requires --agent and --scope.",
      })
      .option("dry-run", {
        type: "boolean",
        default: false,
        describe: "Print the actions that would be taken without executing them.",
      }) as unknown as import("yargs").Argv<InstallAgentsArgv>,
  handler: async (argv) => {
    // Lazy-load so unrelated subcommands don't pay the import cost.
    const { runInstallAgents } = await import("./runner.js");
    const { createPrompts } = await import("./prompts.js");
    await runInstallAgents(argv, { prompts: createPrompts() });
  },
};
