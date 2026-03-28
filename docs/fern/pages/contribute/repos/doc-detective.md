---
title: "doc-detective"
---

[`doc-detective`](https://github.com/doc-detective/doc-detective) is an NPM-based CLI tool that performs tests. It's installable via NPM (`npm i -g doc-detective`) and directly runnable without installation via NPX (`npx doc-detective`).

This monorepo contains:

- The main CLI tool
- [`doc-detective-common`](doc-detective-common): JSON schema definitions, schema validation logic, and path resolution logic (located in `src/common/`)
- [`vscode`](vscode): VS Code extension for syntax highlighting and validation (located in `src/vscode/`)

This repo depends on [`doc-detective-core`](doc-detective-core) for the primary testing logic.
