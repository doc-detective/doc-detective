# Design: a language server for the Doc Detective test DSL

Status: **in progress** — Phases 0–2 landed (schema-association contract,
`doc-detective lsp` server + JSON diagnostics, action-registry completion +
hover); Phases 3–5 (YAML + semantic checks, inline tests across all fileTypes,
packaging) remain. This document is the roadmap and the package-boundary
reference. Each shipped phase carries its own ADR + fixtures + docs assessment
per [CLAUDE.md](../../CLAUDE.md); this doc is the shared context they all
reference. Foundational decision:
[ADR 01066](../../adrs/01066-language-server-for-the-dsl.md).

Locked decisions (approved): full roadmap Phases 0–5; server lives in this repo at
`src/lsp/` as a lazy-loaded `doc-detective lsp` subcommand; the Claude plugin
launches it through a local → global → npx resolution shim in `agent-tools`;
JSON-first, YAML parity in Phase 3; inline-test support spans **every** runner
fileType (markdown, asciidoc, html, dita, + custom), not just Markdown.

## Problem

Doc Detective already **has** a DSL: the JSON/YAML test-spec language defined by
the `*_v3` schemas in `doc-detective-common` (`spec_v3`, `test_v3`, `config_v3`,
and the per-action schemas — `goTo`, `find`, `click`, `httpRequest`, `runCode`,
…), including the compact `{"<action>": <scalar>}` sugar. What it does **not**
have is authoring-time intelligence. Today the feedback loop is:

1. Write a spec (human in an editor, or an AI agent via the Doc Detective Claude
   plugin).
2. Run `doc-detective runTests` / `validate`.
3. Read AJV errors after the fact, map them back to the file by hand, fix, rerun.

That loop is slow for humans and expensive for agents. It also produces one
persistently common failure class that our own plugin skills have to shout about
in prose — and that the plugin's pre-edit hook has to block outright: writing a
step as an `action`-keyed object (the action name as a *value* under an `action`
key) instead of the compact form where the action name **is** the key, as in
`{"goTo": "url"}`. Prose guidance and write-blocking hooks are mitigations;
authoring-time diagnostics make the mistake visible the moment it's typed, with
a range-accurate error and a suggested fix.

The Language Server Protocol is the right delivery vehicle because one server
buys every surface at once:

- **Claude Code**, via the plugin `lspServers` capability: diagnostics are
  injected into the model's context after each edit, so an agent authoring a
  spec self-corrects immediately instead of discovering errors at run time.
  Go-to-definition, references, and hover also flow to the agent
  ([plugins reference](https://code.claude.com/docs/en/plugins-reference.md)).
- **VS Code / Neovim / JetBrains / Zed**, via each editor's standard LSP client,
  for human authors.

## What we are and are not building

**In scope**

- An LSP server that understands Doc Detective specs, configs, and inline tests,
  built on the schemas `doc-detective-common` already exports.
- Bundling that server in the Doc Detective Claude plugin
  ([doc-detective/agent-tools](https://github.com/doc-detective/agent-tools)).
- A thin VS Code extension client (later phase; other editors configure the
  server directly).

**Out of scope (non-goals)**

- **No new surface syntax.** The DSL stays JSON/YAML hosted in existing formats.
  We are not designing a bespoke grammar, lexer, or parser for a novel syntax —
  the "grammar" is the schema set, which stays the single source of truth.
- **Not a replacement for `doc-detective validate`** or the AJV gate in
  `setConfig`. The runner's validation remains authoritative; the LSP is the
  same knowledge surfaced earlier.
- **No formatting engine** initially (host-format formatters already exist).

## Architecture

### Where the code lives

The server lives in **this repo** as `src/lsp/`, exposed as a `doc-detective lsp`
subcommand (lazy-imported in `src/cli.ts`, following the `install-agents`
pattern so unrelated subcommands don't pay the import cost) and as a
`doc-detective-lsp` bin alias for editor configs that want a bare command.

Why here and not in `agent-tools`:

- **Schema lockstep.** The server's entire knowledge base is the
  `doc-detective-common` schema set, and `doc-detective` +
  `doc-detective-common` are published in lockstep at the same version. Keeping
  the server in-repo means it can never drift from the schemas the runner
  validates with. An LSP in `agent-tools` would have to pin and chase versions.
- **Reuse.** Position-mapped AJV validation, the action registry, and the
  markup-detection logic for inline tests already have natural homes near the
  code that owns those concerns today.
- **The plugin stays thin.** `agent-tools` contributes only the `.lsp.json`
  launcher config (see "Plugin bundling" below), consistent with how the plugin
  already wraps the CLI rather than reimplementing it.

### Stack

- **Transport/plumbing**: `vscode-languageserver` (Node), stdio transport. This
  is protocol plumbing only — it does not couple us to VS Code.
- **Position-preserving parsing**: `jsonc-parser` for JSON (tolerant of the
  in-progress, syntactically broken states editors produce), a CST-preserving
  YAML parser for YAML. `JSON.parse` is disqualified: it discards the
  line/column info every diagnostic and completion needs.
- **Validation**: the same AJV + `doc-detective-common` output schemas the
  runner uses, wrapped in a layer that maps AJV's `instancePath` errors back to
  source ranges via the position-preserving parse tree.
- **Language model**: a small build-time step compiles the schema set into an
  **action registry** — `action key → { schema, description, required fields,
  enum values, snippet }`. This registry drives completion, hover, and
  signature-style help, and is the one place the compact-form sugar is encoded.

### The file-identity problem

`extensionToLanguage` in the plugin LSP config (and editor file associations
generally) map by extension — but Doc Detective specs are `.json`/`.yaml` files
among thousands of unrelated ones, and inline tests live inside `.md`/`.mdx`.
Mapping `.json → doc-detective` wholesale would attach us to every JSON file in
a workspace. The server therefore owns a cheap **detection gate** and must stay
silent (no diagnostics, no completions) for files that don't pass it:

1. Filename convention: `*.spec.json` / `*.spec.yaml`, and config files named in
   the workspace's Doc Detective config.
2. Shape sniff: top-level `tests` array or other `spec_v3`-distinctive keys.
3. For Markdown: only inside regions matched by the same `fileTypes` markup
   patterns the runner uses to detect inline tests — reusing the runner's
   detection, not re-inventing it.

False silence (a real spec not recognized) is annoying; false noise (squiggles
on someone's `package.json`) is disqualifying. Bias the gate toward silence and
provide an explicit opt-in (`$schema` key or config listing) for edge cases.

## Feature phases

### Phase 0 — schema association (no LSP, immediate win)

The `$schema`-addressable URL contract **already exists**: `spec_v3` and
`config_v3` each expose a `$schema` property pinned by enum to
`https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/<name>.schema.json`
(the mirrored `doc-detective/common` repo the release publishes `dist/schemas/`
to). So a spec author can add `"$schema": "…spec_v3.schema.json"` today and VS
Code's built-in JSON service gives baseline completion/hover/validation with zero
custom code. Phase 0 is therefore documentation + one external registration:

1. A SchemaStore catalog entry (`*.spec.json` → the published `spec_v3` URL) so
   the association is automatic without an inline `$schema` key — external PR to
   `SchemaStore/schemastore`, tracked in this PR's docs-impact note.
2. An "Editor setup" reference page documenting both the `$schema` opt-in and the
   forthcoming LSP.

This is the benchmark the LSP proper must beat, not duplicate.

### Phase 1 — server skeleton + diagnostics

`doc-detective lsp --stdio`; document manager; detection gate; position-mapped
AJV diagnostics on open/change for spec and config files. Exit criterion: typing
an `action`-keyed step (the classic antipattern the plugin hook blocks today)
produces an immediate, correctly-positioned error whose message names the
compact form.

### Phase 2 — completion + hover from the action registry

- Action-key completion in step position (the full action list, each expanding
  to a minimal valid snippet).
- Field completion inside a known action; enum-value completion (engines,
  platforms, `runOn` shapes).
- Hover docs sourced from schema `description`s — one source of truth, no
  hand-written copies.

### Phase 3 — semantic checks beyond schema shape

The checks a plain schema association can never express:

- **Version mixing**: a v2-shaped step inside a v3 spec → diagnostic + (later) a
  quick-fix upgrade.
- **Reference resolution**: `loadVariables` paths that don't resolve; variable
  uses with no `setVariables`/`loadVariables`/env origin (needs a cross-file
  index); `openApi` operation references.
- **`runOn` sanity**: contexts that can never run anywhere.

### Phase 4 — inline tests in every supported fileType

The differentiating feature: recognize Doc Detective inline-test regions inside
**every fileType the runner supports** — markdown, asciidoc, html, dita
(`defaultFileTypes`) plus workspace-config custom fileTypes — and provide
diagnostics + completion *there*. This reuses common's `detectTests`/`parseContent`
(pure, already returns per-region `location: {line, startIndex, endIndex}`); it
does not re-implement detection. This is what no generic JSON tooling can do, and
it targets Doc Detective's most distinctive authoring surface — tests embedded in
the docs they verify.

**Fragment-aware validation.** Inline test-open statements almost never carry the
`steps`/`contexts` that `test_v3`'s `anyOf.required` demands — the runner parses
them leniently and assembles `steps` from later statements. The LSP mirrors that
in two layers so it never false-errors on a valid open statement:

1. *Open-statement fragment check* — validate the open statement against a
   `test_v3`-derived schema with the `steps`/`contexts` requirement relaxed
   (derived programmatically from `schemas["test_v3"]`, never hand-written).
   Inline `step` statements validate against `step_v3` directly (they are
   complete fragments).
2. *Assembled-region check* — validate the fully assembled test (open + collected
   steps, as `detectTests` returns it) against real `test_v3`, anchoring any
   region-level diagnostic (e.g. a test that never gains steps or contexts) on the
   open statement — matching what the runner rejects at run time.

### Phase 5 — surface packaging

- **Claude plugin** (see below) — can land as early as Phase 1; each subsequent
  phase upgrades it for free.
- **VS Code extension**: a thin client (~50 lines) that launches the server and
  contributes file associations. Other editors get a documented one-liner.

## Plugin bundling

`agent-tools` adds an `.lsp.json` (or `lspServers` in
`.claude-plugin/plugin.json`):

```json
{
  "doc-detective": {
    "command": "npx",
    "args": ["--yes", "doc-detective", "lsp", "--stdio"],
    "extensionToLanguage": {
      ".spec.json": "doc-detective-spec",
      ".spec.yaml": "doc-detective-spec"
    },
    "restartOnCrash": true
  }
}
```

Design considerations, to be settled when the phase ships (with its ADR):

- **Launcher resolution.** `npx --yes doc-detective` has a cold-start download
  cost on machines without a local install. Prefer a launcher order of: local
  project install → global install → `npx` fallback — possibly a tiny shim
  script shipped in the plugin. The runtime package's JIT-install machinery
  (`src/runtime/`) is prior art for "resolve locally, fetch if missing."
- **Extension scoping.** The manifest maps `.spec.json`/`.spec.yaml` only;
  Markdown attachment (Phase 4) and generic `.json` specs rely on the server's
  detection gate rather than greedy extension mapping, for the reasons above.
- **Diagnostics for agents are the point.** Claude Code injects LSP diagnostics
  into the model's context after each edit. Combined with Phase 1 this closes
  the loop the plugin's skills currently close with prose warnings and its
  pre-edit hook closes by rejecting writes: an agent that writes an invalid
  step sees the error before it ever runs the spec. The existing skill guidance
  and hook stay (belt), the LSP makes the whole schema enforceable (braces) —
  and covers the hundreds of mistakes the single-pattern hook can't.
- **Fallback for non-LSP surfaces.** Agents installed via adapters that lack LSP
  support (see `src/agents/adapters/`) can approximate Phase 1 with a
  post-edit hook running `doc-detective validate` on edited spec files. Same
  knowledge, worse latency; acceptable as a degraded mode, not the design
  center.

## Testing strategy

Per repo rules (red→green TDD; feature fixtures for user-facing features):

- **Unit**: action-registry compilation from schemas; AJV-error→range mapping;
  the detection gate (both directions — real specs recognized, non-specs
  ignored); each semantic check.
- **Protocol-level integration**: drive the server over stdio with scripted
  LSP sessions (initialize → didOpen → didChange → assert publishDiagnostics /
  completion payloads). These are hermetic — no editor required.
- **Fixtures**: the LSP is a new user-facing surface but not a runner feature;
  spec fixtures don't exercise it. Its equivalent end-to-end gate is the
  protocol-level suite plus a plugin smoke test in `agent-tools` CI (launch via
  the shipped `.lsp.json` config, open a fixture spec, assert diagnostics).
- **Anti-drift**: a test asserting every action schema exported by
  `doc-detective-common` appears in the action registry, so a new action added
  to the runner cannot silently be missing from completion.

## Open questions

- **Language ID naming**: `doc-detective-spec` vs reusing `json`/`yaml` with the
  server self-gating. Affects how editors pick highlighting grammars.
- **YAML priority**: JSON-first is assumed above; confirm how much real-world
  spec authoring is YAML before sequencing YAML CST work into Phase 1 vs 3.
- **Where the VS Code extension lives** (this repo, `agent-tools`, or its own
  repo) and who publishes to the marketplace.
- **SchemaStore registration** (Phase 0) needs stable public schema URLs —
  confirm the canonical host (docs site vs raw GitHub vs unpkg).

## Related

- [CLAUDE.md — CLI flags ↔ config](../../CLAUDE.md) — the config-first pattern
  the `lsp` subcommand must follow.
- [src/common/AGENTS.md](../../src/common/AGENTS.md) — schema build pipeline the
  action registry hooks into.
- [Claude Code plugins reference](https://code.claude.com/docs/en/plugins-reference.md)
  — `lspServers` config schema and diagnostic-injection behavior.
- [multi-surface-targeting.md](multi-surface-targeting.md) — style precedent for
  phased design docs in this directory.
