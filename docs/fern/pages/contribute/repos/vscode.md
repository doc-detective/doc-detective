---
title: vscode
---

[`vscode`](https://github.com/doc-detective/doc-detective/tree/main/src/vscode) is a VS Code extension that provides syntax highlighting and validation for Doc Detective test files. It validates syntax as you type, detects tests in supported file types, and resolves file type configurations. The source code lives in the [`doc-detective`](https://github.com/doc-detective/doc-detective) monorepo under `src/vscode/`, and the extension is published to the VS Code Marketplace as `doc-detective-vscode`.

## Development

To work on the extension locally:

1. Install dependencies:

   ```bash
   npm run setup:vscode
   ```

2. Build the extension:

   ```bash
   npm run build:vscode
   ```

3. Run tests:

   ```bash
   npm run test:vscode
   ```

The extension uses shared code from `src/common/` for test detection and validation, so changes to [`doc-detective-common`](doc-detective-common) may affect it. It doesn't depend on any other Doc Detective packages at runtime.
