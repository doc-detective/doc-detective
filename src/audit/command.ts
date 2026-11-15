import { Command, Option } from "commander";
import { addGlobalOptions, addInputOptions, cliArgv } from "../cliOptions.js";

const GROUP = "Audit options:";

// `doc-detective audit`: report which documented content has a step, without
// running anything (ADR 01206). The implementation loads when the command runs.
export function buildAuditCommand(): Command {
  return addGlobalOptions(addInputOptions(new Command("audit"), GROUP))
    .argument("[inputs...]", "Files or folders to audit. Combines with --input.")
    .description("Report which procedures, code blocks, links, and images in your docs have a test step, without running anything.")
    .addOption(new Option("--no-env-file", "Don't load .env from the current directory").helpGroup(GROUP))
    .action(async (inputs: string[], _options, command: Command) => {
      await auditHandler({ ...cliArgv(command), inputs });
    });
}

export const auditHandler = async (args: Record<string, any>): Promise<void> => {
  const { runAudit } = await import("./index.js");
  await runAudit(args);
};
