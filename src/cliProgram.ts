import { Command, Option } from "commander";
import { applyHelpText, rewriteRootError } from "./cliHelp.js";
import { createRequire } from "node:module";
import { buildInstallAgentsCommand } from "./agents/command.js";
import {
  addGlobalOptions,
  addRunOptions,
  cliArgv,
  DEPRECATED_COMMAND_LABEL,
  GLOBAL_GROUP,
  warnOnDeprecatedUse,
} from "./cliOptions.js";
import { buildDebugCommand } from "./debug/command.js";
import { buildLspCommand } from "./lsp/command.js";
import { buildInstallCommand } from "./runtime/installCommand.js";

const require = createRequire(import.meta.url);

type RunHandler = (args: Record<string, any>) => Promise<void> | void;

// Settings commander copies into `.command()` children but not into commands
// mounted with `addCommand`, so apply them across the finished tree.
function applyShared(command: Command) {
  const { version } = require("../package.json");
  command
    .exitOverride()
    .showHelpAfterError("(add --help for usage)")
    .version(version, "--version", "Show the version number")
    .addHelpOption(new Option("-h, --help", "Show help").helpGroup(GLOBAL_GROUP));
  command.options.find((option) => option.long === "--version")?.helpGroup(GLOBAL_GROUP);
  command.commands.forEach(applyShared);
}

// The whole command tree, with no heavy imports. Command modules load their
// implementations when they run, and the reference generator reads this tree.
export function buildProgram({ runTests }: { runTests: RunHandler }): Command {
  const program = new Command()
    .name("doc-detective")
    // Without this, the root consumes flags written after a subcommand.
    .enablePositionalOptions()
    .helpCommand(false);

  addGlobalOptions(addRunOptions(program)).action(async (_options, command) => {
    await runTests(cliArgv(command));
  });

  const addRunCommand = (name: string, description: string) =>
    addGlobalOptions(addRunOptions(program.command(name)))
      .argument("[inputs...]", 'Files or folders to test; "-" reads stdin. Combines with --input.')
      .description(description)
      .action(async (inputs: string[], _options, command) => {
        await runTests({ ...cliArgv(command), inputs });
      });
  addRunCommand("run", "Run tests on specific files or folders.");
  // Kept for older usage. The bare command stays flags-only, so any word can
  // still become a subcommand.
  addRunCommand("runTests", `Run tests. ${DEPRECATED_COMMAND_LABEL}`);
  addRunCommand("runtests", `Run tests. ${DEPRECATED_COMMAND_LABEL}`);

  program.addCommand(buildInstallCommand());
  program.addCommand(buildLspCommand());
  program.addCommand(buildDebugCommand());

  addGlobalOptions(program.command("runner", { hidden: true }))
    .description(
      "Run a hosted test job: fetch its config, run the tests, and report back. Used by Doc Detective's hosted runner images. It reads its settings from the DD_RUN_ID, DD_RUN_TOKEN, DD_API_BASE, and DD_TIMEOUT_SECONDS environment variables."
    )
    /* c8 ignore start - thin lazy-load + real hosted run; the runner's own
       logic is covered in test/runner-entrypoint.test.js. */
    .action(async () => {
      const { main } = await import(
        new URL("../bin/runner-entrypoint.js", import.meta.url).href
      );
      process.exit(await main());
    });
  /* c8 ignore stop */

  program
    .command("help")
    .argument("[command...]", "The command to explain")
    .description("Show help for a command.")
    .action((names: string[]) => {
      let target: Command = program;
      for (const name of names) {
        const next = target.commands.find(
          (c) => c.name() === name || c.aliases().includes(name)
        );
        if (!next) target.error(`unknown command '${names.join(" ")}'`);
        target = next as Command;
      }
      target.outputHelp();
    });

  applyShared(program);
  applyHelpText(program);
  program.configureOutput({
    outputError: (message, write) =>
      write(rewriteRootError(message, program.commands.map((command) => command.name()))),
  });
  warnOnDeprecatedUse(program);
  return program;
}
