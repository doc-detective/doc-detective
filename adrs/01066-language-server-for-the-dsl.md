---
status: accepted
date: 2026-07-14
decision-makers: doc-detective maintainers
---

# A language server (LSP) for the Doc Detective test DSL, shipped in-package

## Context and Problem Statement

Doc Detective's DSL — the JSON/YAML test-spec language defined by the `*_v3` schemas in
`doc-detective-common` (`spec_v3`, `test_v3`, `config_v3`, and the per-action schemas) — has no
authoring-time intelligence. Feedback arrives only at run time: an author (human or AI agent) writes
a spec, runs `runTests`/`validate`, then maps AJV errors back to the file by hand. That loop is slow
for humans and token-expensive for agents. It also produces one persistent failure class the
project already fights with prose in the Claude plugin's skills **and** a single-pattern
write-blocking hook (`pre-edit-block-action-antipattern.js`, which fired on the first draft of this
very ADR): writing a step as an object keyed on `action` (the action name carried as a *value* under
an `action` key) instead of the v3 compact form where the action name **is** the key, e.g.
`{"goTo": …}`.

The Language Server Protocol is the natural remedy: one server, written once, serves diagnostics and
completion to every LSP client. Two consumers matter here. **Claude Code** bundles LSP servers via a
plugin's `.lsp.json`/`lspServers` capability and injects their diagnostics into the model's context
after each edit — closing the author-time loop for agents. **Editors** (VS Code, Neovim, JetBrains,
Zed) consume the same server for humans.

The open questions were not *whether* to build it but *where the code lives* and *how tightly it
couples to the schema set that is its entire knowledge base*.

## Decision Drivers

* **Schema lockstep.** The server's knowledge is exactly the `doc-detective-common` schema set.
  `doc-detective` and `doc-detective-common` publish in lockstep at the same version; the runner's
  authoritative validation flows through common's single AJV instance (`validate({schemaKey,
  object})`). The LSP must validate identically and never drift from what the runner enforces.
* **No second source of truth.** The action inventory, field shapes, enum values, and descriptions
  must be *derived* from the schemas at runtime, not re-encoded. A new action added to the runner
  must not be able to silently miss the editor experience.
* **Thin plugin.** The Claude plugin (`agent-tools`) already wraps the CLI rather than
  reimplementing it; the LSP packaging should keep that shape.
* **Coverage discipline.** Any code compiled into the package's `dist/` joins the root coverage
  ratchet union, so the server must be hermetically unit-testable in-process (no editor, no network).

## Considered Options

* **A. In-package server + thin plugin launcher** (chosen) — the server lives in this repo as
  `src/lsp/`, exposed as a lazy-loaded `doc-detective lsp` subcommand; `agent-tools` contributes only
  an `.lsp.json` plus a resolution shim.
* **B. Server in the `agent-tools` plugin repo** — co-locate the server with the plugin that ships
  it.
* **C. New standalone `doc-detective-lsp` package/repo** — a third release artifact dedicated to
  editor tooling.

## Decision Outcome

Chosen option: **A**, because it is the only option that makes schema drift structurally impossible.
The server imports `doc-detective-common` as an in-repo workspace dependency and derives its entire
language model from the `schemas` export at runtime — the action list from `schemas["step_v3"].anyOf`
(each branch's `required[0]`/`title` is the action key), field/enum/description data from each
action's own schema, and validation from common's existing `validate()`. Because both packages are
built and versioned together, the LSP a user runs always matches the schemas the runner validates
with.

The server is reached as `doc-detective lsp --stdio`, registered as a lazy-imported `CommandModule`
(the `install-agents` pattern) so no other subcommand pays its import cost. Diagnostics map AJV
errors to source ranges via a position-preserving parse (`jsonc-parser` for JSON now; a `yaml`
`parseDocument` AST for YAML in a later phase), and the `action`-keyed-step antipattern gets a
single targeted diagnostic instead of a wall of `anyOf` failures.

A **detection gate** keeps the server silent on files that are not Doc Detective specs/configs
(filename convention, shape sniff, explicit `$schema` opt-in), because `extensionToLanguage` maps by
extension and specs are `.json`/`.yaml` among thousands of unrelated files. False silence is
tolerable; false noise on an unrelated `package.json` is disqualifying.

The Claude plugin bundles the server through a launcher shim resolving project-local → global → `npx`
`doc-detective`, so a workspace's pinned version wins and cold machines still work. The existing
write-blocking hook is **kept** as belt-and-braces for non-LSP agent surfaces.

B was rejected: an LSP in `agent-tools` would have to depend on a *published* `doc-detective-common`,
pin a version, and chase releases — reintroducing exactly the drift A eliminates — and would
duplicate schema-walking logic that already has a home next to the schemas. C was rejected: a third
lockstep-released artifact adds release-management burden for no isolation benefit, since the server's
dependency (the schemas) ships in this repo regardless.

### Consequences

* Good: the editor/agent experience can never disagree with the runner about what is valid — same
  AJV instance, same schema set, same version.
* Good: adding an action to the schemas automatically flows to completion/hover/diagnostics; an
  anti-drift test pins that every `step_v3.anyOf` action appears in the registry.
* Good: the plugin stays a thin launcher; later LSP phases upgrade every plugin user for free once
  published.
* Neutral (accepted): `doc-detective` gains new runtime deps (`vscode-languageserver`,
  `vscode-languageserver-textdocument`, `jsonc-parser`). They are lazy-loaded behind the `lsp`
  subcommand, so non-LSP invocations do not import them.
* Neutral: the server's logic sits in the root coverage union and must be tested in-process; the
  protocol surface is exercised by scripted stdio sessions rather than a live editor.

### Confirmation

* Red→green hermetic unit tests for the detection gate (both directions), the AJV-error→range
  mapper, and the `action`-key special case.
* A protocol-level integration test drives the server over stdio (`initialize` → `didOpen` →
  `didChange` → assert `publishDiagnostics`), no editor required.
* An anti-drift test asserts every action in `schemas["step_v3"].anyOf` is present in the derived
  registry, so a schema-only change cannot silently drop editor support.
* End-to-end, the Claude plugin's CI smoke test launches the server via the shipped `.lsp.json`,
  opens a fixture spec, and asserts diagnostics.

## Pros and Cons of the Options

### A. In-package server + thin plugin launcher
* Good: schema lockstep is structural; reuses `validate()` and the schema registry directly; plugin
  stays thin.
* Bad: adds LSP deps to the main package (mitigated by lazy-loading behind the subcommand); server
  logic must satisfy the root coverage ratchet.

### B. Server in the `agent-tools` plugin repo
* Good: simplest plugin packaging; server ships with the thing that launches it.
* Bad: must depend on a published `doc-detective-common`, pin and chase versions (drift risk), and
  duplicate schema-walking logic away from the schemas.

### C. Standalone `doc-detective-lsp` package/repo
* Good: cleanest dependency story for editor consumers.
* Bad: a third artifact to release in lockstep; no real isolation benefit since its knowledge base
  (the schemas) lives in this repo anyway.

## More Information

Design and phased roadmap: [docs/design/dsl-lsp.md](../docs/design/dsl-lsp.md). Reuses the
`install-agents` lazy-subcommand pattern (`src/agents/command.ts`), common's `validate`
(`src/common/src/validate.ts`), the schema registry (`src/common/src/schemas/index.ts`), and
`detectTests` for inline-test regions (`src/common/src/detectTests.ts`). Claude Code plugin LSP
mechanism: <https://code.claude.com/docs/en/plugins-reference.md>.
