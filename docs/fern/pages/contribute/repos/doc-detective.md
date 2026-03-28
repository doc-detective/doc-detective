---
title: "doc-detective"
---

[`doc-detective`](https://github.com/doc-detective/doc-detective) is an NPM-based CLI tool that performs tests. It's installable via NPM (`npm i -g doc-detective`) and directly runnable without installation via NPX (`npx doc-detective`).

This monorepo contains:

- The main CLI tool
- [`doc-detective-common`](doc-detective-common): JSON schema definitions, schema validation logic, and path resolution logic (located in `src/common/`)
- Documentation source files (located in `docs/`)

This repo depends on [`doc-detective-core`](doc-detective-core) for the primary testing logic.

## Documentation

The documentation source files are in the `docs/` directory. The docs are built with [Fern](https://buildwithfern.com) and published to [docs.doc-detective.com](https://docs.doc-detective.com).

To work on the documentation locally:

```bash
cd docs
npm install
npm start
```

For more information, see the [docs/README.md](https://github.com/doc-detective/doc-detective/blob/main/docs/README.md).
