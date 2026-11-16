import { Command } from "commander";
import { addGlobalOptions, addInputOptions, cliArgv } from "../cliOptions.js";

// `doc-detective validate` checks test files without running them (ADR 01206).
export function buildValidateCommand(): Command {
  return addGlobalOptions(addInputOptions(new Command("validate"), "Validate options:"))
    .argument("[inputs...]", 'Files or folders to check; "-" reads stdin. Combines with --input.')
    .description("Check that test files are valid, without running them.")
    /* c8 ignore start - thin lazy-load; covered end to end in test/cli-contract.test.js */
    .action(async (inputs: string[], _options, command: Command) => {
      const { validateHandler } = await import("./index.js");
      await validateHandler({ ...cliArgv(command), inputs });
    });
  /* c8 ignore stop */
}
