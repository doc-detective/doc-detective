import { Command } from "commander";
import { createRequire } from "node:module";
import { buildInstallAgentsCommand } from "./agents/command.js";
import { addRunOptions, cliArgv } from "./cliOptions.js";
import { buildDebugCommand } from "./debug/command.js";
import { buildLspCommand } from "./lsp/command.js";
import { buildInstallCommand } from "./runtime/installCommand.js";

const require = createRequire(import.meta.url);

type RunHandler = (args: Record<string, any>) => Promise<void> | void;

// Settings commander copies into `.command()` children but not into commands
// mounted with `addCommand`, so apply them across the finished tree.
function applyShared(command: Command) {
  command.exitOverride().helpOption("-h, --help", "Show help");
  command.commands.forEach(applyShared);
}

// The whole command tree, with no heavy imports. Command modules load their
// implementations when they run, and the reference generator reads this tree.
export function buildProgram({ runTests }: { runTests: RunHandler }): Command {
  const program = new Command()
    .name("doc-detective")
    .description("Run Doc Detective tests (default).")
    .version(require("../package.json").version, "--version", "Show version number")
    // Without this, the root consumes flags written after a subcommand, so
    // `-s` under `install agents` would be read as the root's `--spec`.
    .enablePositionalOptions()
    .helpCommand(false);

  addRunOptions(program).action(async (_options, command) => {
    await runTests(cliArgv(command));
  });

  // Preserved for the `runTests` npm script and existing CI invocations.
  addRunOptions(program.command("runTests", { hidden: true }))
    .description("Run Doc Detective tests.")
    .action(async (_options, command) => {
      await runTests(cliArgv(command));
    });

  program.addCommand(buildInstallAgentsCommand("install-agents"), { hidden: true });
  program.addCommand(buildInstallCommand());
  program.addCommand(buildLspCommand());
  program.addCommand(buildDebugCommand());

  program
    .command("help [command...]")
    .description("Show help for a command.")
    .action((names: string[]) => {
      let target: Command = program;
      for (const name of names) {
        const next = target.commands.find(
          (c) => c.name() === name || c.aliases().includes(name)
        );
        if (!next) target.error(`error: unknown command '${names.join(" ")}'`);
        target = next as Command;
      }
      target.outputHelp();
    });

  applyShared(program);
  return program;
}
