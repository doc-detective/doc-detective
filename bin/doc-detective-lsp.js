#!/usr/bin/env node
// Bare entry point for editor LSP configs (VS Code, Neovim, Zed, …) that want a
// single command instead of `doc-detective lsp --stdio`. Starts the same stdio
// language server the `doc-detective lsp` subcommand does.
import { startServer } from "../dist/lsp/server.js";
startServer();
