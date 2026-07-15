---
status: accepted
date: 2026-07-14
decision-makers: doc-detective maintainers
---

# A bare `doc-detective-lsp` bin, and binding the language server to explicit stdio streams

## Context and Problem Statement

The language server ([ADR 01066](01066-language-server-for-the-dsl.md)) is reachable as the
`doc-detective lsp --stdio` subcommand. That is the right entry point for the Claude plugin (its
launcher shim invokes the subcommand), but it is awkward for **standard editor LSP clients** (VS
Code, Neovim, Zed), which expect to configure a single `command` — a bare executable, not a
CLI-with-subcommand-and-flag.

Separately, the server used `createConnection(ProposedFeatures.all)` with no explicit transport.
`vscode-languageserver` then **sniffs `process.argv`** for a `--stdio` / `--socket` / `--node-ipc`
flag to pick a transport. That works for `doc-detective lsp --stdio` (the flag is present) but throws
`Connection input stream is not set` for any launcher that doesn't pass `--stdio` — including a bare
bin. So the transport binding was implicitly coupled to how the process was launched.

## Decision Drivers

* Give editors a one-command entry point without teaching them the subcommand + flag.
* Make the server's transport independent of argv, so every launch path behaves identically.
* Keep a single implementation — both entry points must run the same server.
* No stdout contamination: the JSON-RPC stream owns stdout exclusively.

## Considered Options

* **A. Add a `doc-detective-lsp` bin + bind explicit stdin/stdout streams** (chosen).
* **B. Keep only the subcommand** and document `doc-detective lsp --stdio` as the editor command.
* **C. Add the bin but keep argv-sniffing**, having the bin inject `--stdio` into `process.argv`.

## Decision Outcome

Chosen: **A**. A two-line `bin/doc-detective-lsp.js` imports and calls the same `startServer()` the
subcommand does, and `package.json` registers it under `bin`. `startServer` now creates the
connection with **explicit** `StreamMessageReader(process.stdin)` / `StreamMessageWriter(process.stdout)`,
so the transport is fixed to stdio regardless of argv. Both entry points are exercised end-to-end by
the spawned protocol test.

stdout cleanliness is preserved: no module in the LSP chain writes to stdout (the AJV strict-mode
warnings from schema load go to stderr), so the JSON-RPC stream stays uncorrupted — the protocol
tests would fail otherwise.

B was rejected: a subcommand-plus-flag is a poor fit for editor `command` configs and leaves the
argv-coupling latent. C was rejected: mutating `process.argv` to satisfy a library's sniffing is a
fragile bandaid; binding the streams explicitly fixes the coupling at its root and is launch-agnostic.

### Consequences

* Good: editors configure `doc-detective-lsp` (or `npx doc-detective-lsp`) as a single command; the
  Claude plugin keeps using the subcommand via its shim. Both share one server.
* Good: the transport no longer depends on how the process was launched.
* Neutral: the subcommand's `--stdio` flag is now decorative (stdio is the only transport, bound
  explicitly). It stays for clarity in editor configs and back-compat.
* Neutral: a new published bin is a public contract to maintain.

### Confirmation

* The spawned protocol test in `test/lsp.test.js` drives **both** `doc-detective lsp --stdio` and the
  bare `doc-detective-lsp` bin through initialize → didOpen → publishDiagnostics, asserting the
  flagship diagnostic. A grep confirms no stdout writes in `src/lsp`.

## Pros and Cons of the Options

### A. Bin + explicit streams
* Good: single-command editor entry; launch-agnostic transport; one server implementation.
* Bad: one more published bin to keep working.

### B. Subcommand only
* Good: nothing new to ship.
* Bad: awkward editor configuration; argv-coupling stays latent.

### C. Bin that injects `--stdio` into argv
* Good: minimal server change.
* Bad: mutating argv to satisfy library sniffing is fragile; doesn't fix the coupling.

## More Information

Design and phased roadmap: [docs/design/dsl-lsp.md](../docs/design/dsl-lsp.md) (Phase 5 packaging).
Builds on [ADR 01066](01066-language-server-for-the-dsl.md).
