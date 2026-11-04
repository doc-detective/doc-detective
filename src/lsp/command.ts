import { Command, Option } from "commander";
import { addGlobalOptions } from "../cliOptions.js";

/**
 * `doc-detective lsp` — start the Doc Detective language server. The action
 * imports the server (and its `vscode-languageserver` dependency graph) only
 * when this subcommand runs, so ordinary test runs never pay that import cost.
 */
export function buildLspCommand(): Command {
  return addGlobalOptions(new Command("lsp"))
    .description(
      "Start the Doc Detective language server (LSP) over stdio for editors and AI agents."
    )
    .addOption(
      new Option(
        "--stdio",
        "Use stdio, the only transport. Accepted because LSP clients add it"
      )
        .default(true)
        .helpGroup("LSP options:")
    )
    /* c8 ignore start - thin lazy-load + real stdio server start; the server's
       pure wiring is unit-tested via registerHandlers and end-to-end via the
       spawned protocol test. */
    .action(async () => {
      const { startServer } = await import("./server.js");
      startServer();
    });
  /* c8 ignore stop */
}
