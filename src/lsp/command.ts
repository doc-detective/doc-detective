import type { CommandModule } from "yargs";

export interface LspArgv {
  stdio: boolean;
}

/**
 * `doc-detective lsp` — start the Doc Detective language server. Registered
 * lazily in `src/cli.ts`: the handler imports the server (and its
 * `vscode-languageserver` dependency graph) only when this subcommand runs, so
 * ordinary `runTests` invocations never pay that import cost.
 */
export const lspCommand: CommandModule<{}, LspArgv> = {
  command: "lsp",
  describe:
    "Start the Doc Detective language server (LSP) over stdio for editors and AI agents.",
  builder: (yargs) =>
    yargs.option("stdio", {
      type: "boolean",
      default: true,
      describe:
        "Communicate over stdio (the only supported transport). Present for explicitness and editor configs.",
    }) as unknown as import("yargs").Argv<LspArgv>,
  /* c8 ignore start - thin lazy-load + real stdio server start; the server's
     pure wiring is unit-tested via registerHandlers and end-to-end via the
     spawned protocol test. */
  handler: async () => {
    const { startServer } = await import("./server.js");
    startServer();
  },
  /* c8 ignore stop */
};
