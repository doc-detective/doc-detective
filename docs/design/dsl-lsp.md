# Design: a language server for the Doc Detective test DSL

Status: **Phases 0–5 landed in this repo.** That covers the schema-association
contract, the `doc-detective lsp` server with JSON diagnostics, and
action-registry completion and hover. It covers YAML diagnostics parity with a
v2-deprecation warning, and inline-test diagnostics across all fileTypes. It also
covers packaging: a `doc-detective-lsp` bin, plus the finalized `agent-tools`
`.lsp.json` and shim reference. The remaining work is cross-repo, meaning the
`agent-tools` plugin PR and a VS Code extension. So are the per-phase follow-ups.
Those are YAML and inline completion and hover, fs and cross-file semantic checks,
quick-fixes, and the assembled-region check. This document is the roadmap and the
package-boundary reference. Each shipped phase carries its own ADR, fixtures, and
docs assessment, per [CLAUDE.md](../../CLAUDE.md). This doc is the shared context
they all reference. The foundational decision is
[ADR 01066](../../adrs/01066-language-server-for-the-dsl.md).

Locked decisions, approved: the full roadmap covers Phases 0–5. The server lives
in this repo at `src/lsp/`, as a lazy-loaded `doc-detective lsp` subcommand. The
Claude plugin launches it through a local, then global, then npx resolution shim
in `agent-tools`. It's JSON-first, with YAML parity in Phase 3. Inline-test
support spans **every** runner fileType, meaning markdown, asciidoc, html, dita,
and custom, not just Markdown.

## Problem

Doc Detective already **has** a DSL. It's the JSON and YAML test-spec language
defined by the `*_v3` schemas in `doc-detective-common`. Those are `spec_v3`,
`test_v3`, `config_v3`, and the per-action schemas such as `goTo`, `find`,
`click`, `httpRequest`, and `runCode`. It includes the compact
`{"<action>": <scalar>}` sugar. What it does **not** have is authoring-time
intelligence. Today the feedback loop is:

1. Write a spec (human in an editor, or an AI agent via the Doc Detective Claude
   plugin).
2. Run `doc-detective runTests` / `validate`.
3. Read AJV errors after the fact, map them back to the file by hand, fix, rerun.

That loop is slow for humans and expensive for agents. It also produces one
persistently common failure class. Our own plugin skills have to shout about it in
prose, and the plugin's pre-edit hook has to block it outright. That failure is
writing a step as an `action`-keyed object, putting the action name as a *value*
under an `action` key. The compact form makes the action name **the key**, as in
`{"goTo": "url"}`. Prose guidance and write-blocking hooks are mitigations.
Authoring-time diagnostics make the mistake visible the moment it's typed, with a
range-accurate error and a suggested fix.

The Language Server Protocol is the right delivery vehicle because one server
buys every surface at once:

- **Claude Code**, through the plugin `lspServers` capability. Diagnostics are
  injected into the model's context after each edit. An agent authoring a spec
  therefore self-corrects immediately, instead of discovering errors at run time.
  Go-to-definition, references, and hover also flow to the agent. See the
  [plugins reference](https://code.claude.com/docs/en/plugins-reference.md).
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

- **No new surface syntax.** The DSL stays JSON and YAML, hosted in existing
  formats. We are not designing a bespoke grammar, lexer, or parser for a novel
  syntax. The "grammar" is the schema set, which stays the single source of truth.
- **Not a replacement for `doc-detective validate`**, or for the AJV gate in
  `setConfig`. The runner's validation remains authoritative. The LSP is the same
  knowledge, surfaced earlier.
- **No formatting engine** initially (host-format formatters already exist).

## Architecture

### Where the code lives

The server lives in **this repo** as `src/lsp/`. It's exposed as a
`doc-detective lsp` subcommand, lazy-imported in `src/cli.ts` following the
`install-agents` pattern, so unrelated subcommands don't pay the import cost.
It's also exposed as a `doc-detective-lsp` bin alias, for editor configs that
want a bare command.

Why here and not in `agent-tools`:

- **Schema lockstep.** The server's entire knowledge base is the
  `doc-detective-common` schema set. `doc-detective` and `doc-detective-common`
  are published in lockstep at the same version. Keeping the server in-repo means
  it can never drift from the schemas the runner validates with. An LSP in
  `agent-tools` would have to pin and chase versions.
- **Reuse.** Three things already have natural homes today, near the code that
  owns those concerns. Those are position-mapped AJV validation, the action
  registry, and the markup-detection logic for inline tests.
- **The plugin stays thin.** `agent-tools` contributes only the `.lsp.json`
  launcher config, per "Plugin bundling" below. That's consistent with how the
  plugin already wraps the CLI rather than reimplementing it.

### Stack

- **Transport and plumbing**: `vscode-languageserver` on Node, over a stdio
  transport. This is protocol plumbing only, and does not couple us to VS Code.
- **Position-preserving parsing**: `jsonc-parser` for JSON, which tolerates the
  in-progress, syntactically broken states editors produce. YAML uses a
  CST-preserving parser. `JSON.parse` is disqualified, because it discards the
  line and column info every diagnostic and completion needs.
- **Validation**: the same AJV and `doc-detective-common` output schemas the
  runner uses. A wrapping layer maps AJV's `instancePath` errors back to source
  ranges, through the position-preserving parse tree.
- **Language model**: a small build-time step compiles the schema set into an
  **action registry**, mapping `action key → { schema, description, required
  fields, enum values, snippet }`. This registry drives completion, hover, and
  signature-style help. It's the one place the compact-form sugar is encoded.

### The file-identity problem

`extensionToLanguage` in the plugin LSP config maps by extension, as editor file
associations do generally. Doc Detective specs are `.json` and `.yaml` files among
thousands of unrelated ones, and inline tests live inside `.md` and `.mdx`.
Mapping `.json` to `doc-detective` wholesale would attach us to every JSON file in
a workspace. The server therefore owns a cheap **detection gate**. It must stay
silent for files that don't pass it, emitting no diagnostics and no completions:

1. Filename convention: `*.spec.json` / `*.spec.yaml`, and config files named in
   the workspace's Doc Detective config.
2. Shape sniff: top-level `tests` array or other `spec_v3`-distinctive keys.
3. For Markdown, only inside regions matched by the same `fileTypes` markup
   patterns the runner uses to detect inline tests. That reuses the runner's
   detection rather than re-inventing it.

False silence, where a real spec isn't recognized, is annoying. False noise, such
as squiggles on someone's `package.json`, is disqualifying. Bias the gate toward
silence, and provide an explicit opt-in through a `$schema` key or a config
listing, for edge cases.

## Feature phases

### Phase 0: schema association, with no LSP and an immediate win

The `$schema`-addressable URL contract **already exists**. `spec_v3` and
`config_v3` each expose a `$schema` property, pinned by enum to
`https://raw.githubusercontent.com/doc-detective/common/refs/heads/main/dist/schemas/<name>.schema.json`.
That's the mirrored `doc-detective/common` repo the release publishes
`dist/schemas/` to. A spec author can therefore add
`"$schema": "…spec_v3.schema.json"` today. VS Code's built-in JSON service then
gives baseline completion, hover, and validation, with zero custom code. Phase 0
is therefore documentation plus one external registration:

1. A SchemaStore catalog entry, mapping `*.spec.json` to the published `spec_v3`
   URL, so the association is automatic without an inline `$schema` key. That's
   an external PR to `SchemaStore/schemastore`, tracked in this PR's docs-impact
   note.
2. An "Editor setup" reference page documenting both the `$schema` opt-in and the
   forthcoming LSP.

This is the benchmark the LSP proper must beat, not duplicate.

### Phase 1: server skeleton and diagnostics

This covers `doc-detective lsp --stdio`, the document manager, the detection gate,
and position-mapped AJV diagnostics on open and change, for spec and config files.
The exit criterion involves the classic antipattern the plugin hook blocks today.
Typing an `action`-keyed step must produce an immediate, correctly-positioned
error, whose message names the compact form.

### Phase 2: completion and hover from the action registry

- Action-key completion in step position. It offers the full action list, each
  expanding to a minimal valid snippet.
- Field completion inside a known action, plus enum-value completion for engines,
  platforms, and `runOn` shapes.
- Hover docs sourced from schema `description`s. That's one source of truth, with
  no hand-written copies.

### Phase 3: YAML parity and semantic checks

**Delivered:**

- **YAML diagnostics parity.** A format-agnostic `SpecModel` (`src/lsp/model.ts`)
  backs both JSON, through the jsonc CST, and YAML, through the `yaml`
  `parseDocument` AST. They share one interface, covering the value, syntax-error
  spans, `instancePath` to range mapping, and action-keyed step detection. The
  schema and diagnostic logic is therefore written once. YAML specs and configs
  now get live validation, source-mapped errors, and the action-keyed flagship.
  The detection gate parses `.yaml` and `.yml` through the YAML parser too, so the
  `$schema` and shape-sniff opt-in works for YAML.
- **Version-mixing and v2-deprecation warning.** Some documents are *valid* but
  use the legacy `action`-keyed step form, which transforms to a valid `spec_v3`.
  Those get a non-blocking **Warning**, steering them to the compact v3 form.
  That's the right home for the nudge. Phase 1's flagship error must not make it,
  since that would be a false positive on valid input. The flagship **Error** now
  fires only on invalid action-keyed steps.
- **Syntax-first UX.** A syntactically broken buffer shows only its syntax
  errors. Schema noise from the partial value is suppressed until it parses.

**Deferred to a follow-up, since they need surface the pure diagnostics layer
lacks:**

- YAML **completion and hover**. They need YAML cursor-context resolution, and
  there's no `getLocation` equivalent. JSON has them today.
- **Reference resolution**, covering `loadVariables` path existence,
  variable-use-without-origin, and `openApi` refs. Also deep **`runOn` sanity**.
  Both need a workspace filesystem seam and a cross-file index. That's a larger
  design than the pure, hermetically-testable in-process modules shipped so far.
- **Quick-fix code actions**, meaning the v2-to-v3 upgrade and
  insert-required-field.

### Phase 4: inline tests in every supported fileType

**Delivered.** This is the differentiating feature. `src/lsp/inline.ts` recognizes
Doc Detective inline-test statements inside **every fileType the runner
supports**, meaning markdown, asciidoc, html, and dita, from `defaultFileTypes`.
It uses the runner's own `inlineStatements` regex patterns, reused rather than
re-invented. It respects `ignoreStart` and `ignoreEnd` blocks, and stays silent on
prose with no statements. `computeDiagnostics` routes any markup file, by
extension, to this pipeline.

**Fragment-aware validation**, so a valid open statement is never false-flagged:

- *`step` statements* validate against `step_v3`. A single invalid step matches
  no `anyOf` branch, so AJV emits a failure for *every* action. That wall is
  **collapsed** to one concise, action-scoped message, inferring the author's
  intended action from the top-level key. Action-keyed steps get the flagship
  **error** when invalid, or the v2-deprecation **warning** when valid, mirroring
  specs.
- *`test` open statements* validate against `test_v3`, with the top-level `steps`
  and `contexts` requirement **filtered out**. The runner assembles steps from
  later statements, so an open statement legitimately carries neither. Every other
  field is still flagged, including a bad `runOn`, an unknown property, and a
  wrong type.

**Deferred to a follow-up:** inline **completion and hover**, plus the
cross-statement *assembled-region* check. That check correlates `detectTests`'
assembled output back to statement offsets, to flag things like a region that
never gains steps.

### Phase 5: surface packaging

**This repo, delivered:** two entry points ship the server. There's the
`doc-detective lsp --stdio` subcommand, and a bare **`doc-detective-lsp`** bin at
`bin/doc-detective-lsp.js`, for editor LSP configs that want a single command.
Both call the same `startServer`, which binds explicit stdin and stdout streams,
so it works no matter how it's launched. The Claude adapter
(`src/agents/adapters/claude-code.ts`) fetches whatever the `agent-tools` repo
contains, so a plugin `.lsp.json` requires **no adapter change**. The finalized
launcher config + shim (below) is the copy-paste for the `agent-tools` PR.

**`agent-tools` repo, a separate PR:** add the `.lsp.json` and
`scripts/lsp-shim.cjs` below, plus a CI smoke test. That test launches through the
shipped config, does a `didOpen` on a fixture spec, and asserts diagnostics.

**Deferred:** a **VS Code extension**, meaning a thin client that launches the
server and contributes file associations without claiming the markdown language.
Also a user-facing docs page. Both should land *with* the published plugin rather
than ahead of it, per the repo's "don't pre-announce" norm. The design doc and
ADRs are the record until then.

### Install weight: `npx doc-detective lsp` stays light

Someone reaching for the LSP through `npx doc-detective lsp`, whether a user or
the plugin shim, should not pay for the heavy browser and driver runtime the
postinstall normally pre-warms. The server needs none of it. `scripts/postinstall.js` detects this
invocation, and skips both the runtime pre-warm and the agent-install prompt. The
runtime still lazy-installs on the first actual test run. Detection can't read the
`lsp` subcommand from npm's environment, since there's no `npm_config_argv` on npm
7+. It therefore inspects the process ancestry for a `doc-detective lsp` command.
It does that only for npx, where `npm_command === "exec"`. A plain `npm install`
or Docker build therefore pays nothing and still pre-warms, and
`npx doc-detective runTests` still pre-warms too. It's best-effort, so any
detection failure falls back to pre-warming. See
[ADR 01070](../../adrs/01070-skip-runtime-prewarm-for-lsp-invocations.md). The
three LSP dependencies stay lightweight regular deps rather than JIT ones, so
there's no first-run install delay.

> Note: the concrete `.lsp.json` and shim below predate the shipped `agent-tools`
> wiring. The delivered plugin maps single trailing extensions, because Claude
> Code's `extensionToLanguage` doesn't match multi-part `.spec.json` keys. It
> launches `lsp/lsp-launch.js`, relying on the server's detection gate for
> silence.

## Plugin bundling

`agent-tools` adds an `.lsp.json` at the plugin root, plus a resolution shim:

```json
{
  "doc-detective": {
    "command": "node",
    "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/lsp-shim.cjs"],
    "extensionToLanguage": {
      ".spec.json": "doc-detective-spec",
      ".spec.yaml": "doc-detective-spec",
      ".spec.yml": "doc-detective-spec",
      ".md": "doc-detective-markup",
      ".mdx": "doc-detective-markup",
      ".adoc": "doc-detective-markup",
      ".html": "doc-detective-markup",
      ".dita": "doc-detective-markup"
    },
    "restartOnCrash": true
  }
}
```

```js
// scripts/lsp-shim.cjs: resolve doc-detective, project-local first then npx, and
// proxy its stdio LSP server. This keeps the version matched to the project when
// possible, and still works on a cold machine.
const { spawnSync } = require("node:child_process");
const path = require("node:path");

function localBin() {
  try {
    const pkg = require.resolve("doc-detective/package.json", { paths: [process.cwd()] });
    return path.join(path.dirname(pkg), "bin", "doc-detective.js");
  } catch {
    return null; // fall through to npx (which also finds a global install)
  }
}

const bin = localBin();
const run = bin
  ? spawnSync(process.execPath, [bin, "lsp", "--stdio"], { stdio: "inherit" })
  : spawnSync("npx", ["--yes", "doc-detective", "lsp", "--stdio"], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
process.exit(run.status ?? 1);
```

Notes:

- **Launcher resolution** is local-project → `npx` (which itself resolves a
  global install before fetching). Local-first keeps the LSP's schemas matched to
  the project's pinned `doc-detective`.
- **Extension scoping.** Markup extensions are mapped, meaning `.md`, `.mdx`,
  `.adoc`, `.html`, and `.dita`, because Phase 4 serves inline tests there. The
  server is silent on files without Doc Detective statements, so a broad mapping
  stays quiet. Specs map by their `.spec.*` compound extension, and the detection
  gate is the backstop if a host matches only the final extension. **Open item for
  the PR:** confirm whether Claude Code's `extensionToLanguage` matches compound
  extensions like `.spec.json`, or only the last one, `.json`. If it's the latter,
  map `.json` and `.yaml`, and lean entirely on the gate.
- **Diagnostics for agents are the point.** Claude Code injects LSP diagnostics
  into the model's context after each edit. An agent that writes an invalid step
  therefore sees the error before it ever runs the spec. The existing plugin
  skills and the pre-edit hook stay, as the belt. The LSP makes the whole schema
  enforceable, the braces, and covers the mistakes the single-pattern hook can't.
- **Fallback for non-LSP surfaces.** Some agents are installed through adapters
  that lack LSP support, per `src/agents/adapters/`. Those can approximate this
  with a post-edit hook running `doc-detective validate` on edited spec files.
  That's the same knowledge with worse latency. It's a degraded mode, not the
  design center.

## Testing strategy

Per repo rules (red→green TDD; feature fixtures for user-facing features):

- **Unit tests** cover action-registry compilation from schemas, AJV-error to
  range mapping, and each semantic check. They cover the detection gate in both
  directions, so real specs are recognized and non-specs ignored.
- **Protocol-level integration** drives the server over stdio with scripted LSP
  sessions. That's initialize → didOpen → didChange → assert publishDiagnostics
  and completion payloads. These are hermetic, and need no editor.
- **Fixtures**: the LSP is a new user-facing surface, but not a runner feature, so
  spec fixtures don't exercise it. Its equivalent end-to-end gate is the
  protocol-level suite, plus a plugin smoke test in `agent-tools` CI. That test
  launches through the shipped `.lsp.json` config, opens a fixture spec, and
  asserts diagnostics.
- **Anti-drift**: one test asserts that every action schema exported by
  `doc-detective-common` appears in the action registry. A new action added to the
  runner therefore cannot silently be missing from completion.

## Open questions

- **Compound extension matching** in Claude Code's `extensionToLanguage`, per the
  plugin-bundling note. That's the one item gating the `agent-tools` PR.
- **Where the VS Code extension lives**, meaning this repo, `agent-tools`, or its
  own repo. Also who publishes to the marketplace.
- **SchemaStore registration** for Phase 0. The public schema URLs already exist
  at `raw.githubusercontent.com/doc-detective/common/.../dist/schemas/`. Confirm
  that's the URL to register, rather than an eventual docs-site alias.

*Resolved during implementation:* the language IDs are `doc-detective-spec` for
JSON and YAML specs, and `doc-detective-markup` for inline. YAML landed in Phase 3
alongside JSON, through the shared `SpecModel`, rather than being deferred.

## Related

- [CLAUDE.md, CLI flags and config](../../CLAUDE.md): the config-first pattern
  the `lsp` subcommand must follow.
- [src/common/AGENTS.md](../../src/common/AGENTS.md): the schema build pipeline
  the action registry hooks into.
- [Claude Code plugins reference](https://code.claude.com/docs/en/plugins-reference.md):
  the `lspServers` config schema and diagnostic-injection behavior.
- [multi-surface-targeting.md](multi-surface-targeting.md): the style precedent
  for phased design docs in this directory.
