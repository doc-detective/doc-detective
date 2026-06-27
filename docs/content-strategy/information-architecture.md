# Information architecture & content set

## IA design principle

The site is organized by **user intent**, not by document type. Each top-level track maps to a
persona's job-to-be-done. The landing page is a router — "What do you want to do?" — that sends each
user into the matching track. Reference material is a **flat lookup shelf** that journeys deep-link
into: it supports navigation, it does not drive it.

Two product priorities shape the top level:

- **AI & Agents is a first-class pillar** (its own tab), not a sub-section of each persona.
- **Contribute is its own tab**, kept out of the end-user tracks.

This is explicitly **not** a Diátaxis tutorial/how-to/reference/explanation split as the top-level
organizer. Diátaxis page *types* may still inform an individual page's shape, but the navigation is
sequenced by journey.

**Frontmatter requirement:** every page in `docs/fern/pages/**` must include `title` and `description`
in its frontmatter (see [`docs/AGENTS.md`](../AGENTS.md)) and avoid level-1 (`#`) headings. Author
hand-written content pages as `.mdx`. Some pages are `.md` by exception: the generated schema
reference pages under `reference/schemas/`, and a few legacy pages (e.g. `get-started/concepts.md`)
that predate this convention.

---

## Navigation tree

```
Home — "What do you want to do?" router + 60-second proof
│
├─ Get started                       (universal on-ramp → feeds W1)
│
├─ Test your docs        (Wren)      → W1, W2, W3      [LEAD track]
├─ Test code & APIs      (Diego)     → D1, D2, D3
├─ Run in CI & at scale  (Priya)     → P1, P2, P3
│
├─ Build with AI agents  (Aria)      → A1, A2          [PILLAR — own tab]
│
├─ Troubleshoot          (X-cut)     → X1              (high-traffic)
│
├─ Reference (lookup shelf)          → Concepts/Glossary · Actions · Configuration ·
│                                       CLI · Contexts & surfaces · Selectors ·
│                                       Input formats · Schemas
│
├─ Contribute (own tab)              → C1
└─ Support
```

### Fern realization (tabs vs. sidebar sections)

Six header tabs keep the bar legible while honoring "AI as a pillar" and "Contribute as its own tab":

| Header tab | Sidebar sections |
|---|---|
| **Home** | router |
| **Documentation** | Get started · Test your docs · Test code & APIs · Run in CI & at scale · Troubleshoot |
| **AI & Agents** | A1, A2 (pillar) |
| **Reference** | the lookup shelf |
| **Contribute** | C1 |
| **Support** | Support · Resources · Legal |

**Variant (one-line change in `docs.yml`):** promote the three Documentation tracks to their own
header tabs (Writers / Developers / CI) for maximum persona prominence — at the cost of ~8 tabs. The
recommended default keeps them as sidebar sections under **Documentation**.

> **Implementation status.** The nav, tabs, sections, page URLs (via explicit `slug`s in `docs.yml`),
> and redirects below are **live** — the new IA is in effect and `fern check` passes. To avoid breaking
> colocated assets (e.g. the tutorials' shared `TestExamples.zip` and `img/`), the **page files have not
> yet been physically relocated** into the directories in the table below; they keep their current paths
> while serving the new slugs. Physically moving files to match this map (carrying their assets) is a
> deferred mechanical pass.

### Directory mapping (Fern content paths)

| Nav section | Directory under `docs/fern/pages/` |
|---|---|
| Home (router) | `index.mdx` |
| Get started | `docs/get-started/` |
| Test your docs | `docs/test-docs/` |
| Test code & APIs | `docs/test-code/` |
| Run in CI & at scale | `docs/ci/` |
| Troubleshoot | `docs/troubleshoot/` |
| Build with AI agents | `ai/` |
| Reference | `reference/` |
| Contribute | `contribute/` |
| Support | `support.mdx`, `legal/` |

---

## Content set (mapped to CUJs)

★ = launch priority (Phase 1). Every page is justified by the CUJ it serves. "(new)" marks a gap to
author; the rest are existing pages being moved or retitled.

### Get started (on-ramp) — `docs/get-started/`

| Page | CUJ | ★ | Notes |
|---|---|---|---|
| Landing / router (Home) | All | ★ | Value prop, who it's for, 60-second quickstart; links to each track. |
| Introduction | All | ★ | What Doc Detective is and the Docs-as-Tests thesis. |
| Installation | W1 | ★ | Install + runtime/browser setup. |
| Core concepts | All | ★ | spec → test → step → action → context. |
| Create your first test | W1 | ★ | Inline or standalone first test, run, read results. |
| How testing works | W1 | ★ | Standalone vs. inline vs. detected — the three test sources. |
| Sample tests | W1 | | Worked examples. |

### Test your docs — Wren — `docs/test-docs/`

| Page | CUJ | ★ | Notes |
|---|---|---|---|
| Track overview / start here (new) | W1 | ★ | Routes Wren through W1→W2→W3. |
| Inline tests | W2 | ★ | |
| Detected tests | W2 | ★ | |
| Input formats (overview + Markdown/DITA/AsciiDoc/HTML/Custom) | W3 | ★ | |
| Capture screenshots | W2 | ★ | `screenshot`, auto-screenshot. |
| Record video | W2 | | `record`/`stopRecord`, engines. |
| Fill fields & UI flows | W2 | | `find`/`click`/`type`/`dragAndDrop`. |
| Test across platforms & browsers | W3 | ★ | contexts / `runOn`; links to Reference. |
| Heretto integration | W3 | | |
| Self-healing for docs *(shared with A2)* | W2 | | |

### Test code & APIs — Diego — `docs/test-code/`

| Page | CUJ | ★ | Notes |
|---|---|---|---|
| Track overview / start here (new) | D1 | ★ | |
| Standalone test specs | D1 | ★ | |
| Run shell & code steps | D1 | ★ | `runShell` / `runCode` / `runBrowserScript`, outputs. |
| HTTP & API testing | D2 | ★ | `httpRequest`, `checkLink`. |
| Cookies & variables | D2 | | `saveCookie` / `loadCookie` / `loadVariables` / outputs. |
| Generate tests from OpenAPI | D3 | | `openApi` integration. |

### Run in CI & at scale — Priya — `docs/ci/`

| Page | CUJ | ★ | Notes |
|---|---|---|---|
| Track overview / start here (new) | P1 | ★ | |
| CI/CD: GitHub Action recipe | P1 | ★ | |
| CI recipes: other platforms (new) | P1 | | Fills the GitHub-only gap. |
| Reporters & artifacts (new) | P1 | ★ | terminal/json/html/runFolder + run-folder layout. |
| Docker & headless (new) | P2 | ★ | |
| Concurrency & performance (new) | P2 | | `concurrentRunners`, recording serialization. |
| Orchestrate distributed runs (new) | P3 | | `doc-detective-runner`, orchestration API. |

### Build with AI agents — Aria (pillar) — `ai/`

| Page | CUJ | ★ | Notes |
|---|---|---|---|
| Overview | A1 | ★ | Frames the pillar. |
| Author tests with agents (Claude Code / Copilot / Gemini / Other) | A1 | ★ | |
| Agent tools & MCP (new) | A1 | ★ | |
| Self-healing docs | A2 | ★ | |
| Best practices for agent-authored tests (new) | A2 | | |

### Troubleshoot — cross-cutting — `docs/troubleshoot/`

| Page | CUJ | ★ | Notes |
|---|---|---|---|
| Troubleshoot a failing or flaky test (new) | X1 | ★ | Error → step/selector/context → fix → re-run; flakiness tools. |

### Reference (lookup shelf — supports all journeys) — `reference/`

| Page | CUJ | ★ | Source of truth |
|---|---|---|---|
| Glossary | All | ★ | — |
| Core concepts / data model | All | ★ | schemas |
| Actions (all 17) | All | ★ | `step_v3.schema.json` + per-action schemas; `src/core/tests/*.ts` |
| Configuration (`config_v3`) — **generated** | W1, P1 | ★ | `reference/schemas/config.md`, generated by `buildSchemaReferencesV4.js` from the `config_v3` schema. **Do not hand-author** — see "Generated reference pages" below. |
| CLI commands & flags (new) | All | ★ | `buildYargs()` in `src/utils.ts`, `src/cli.ts` — not schema-generated; see note below. |
| Contexts & surfaces (platforms/browsers/`runOn`) — **generated** | W3, P2 | ★ | `reference/schemas/context.md` (generated); a thin journey-facing wrapper page may link to it. |
| Selectors (CSS, XPath) | W2, D1 | ★ | — |
| Input formats reference | W3 | | `fileTypes` in `config_v3` |
| Schemas (auto-generated) | All | ★ | `src/common/dist/schemas` via `buildSchemaReferencesV4.js` |

#### Generated reference pages (do not hand-edit)

The `reference/schemas/*.md` pages — including `config.md`, `context.md`, and every per-action schema —
are **generated by a script**, currently
[`.scripts/buildSchemaReferencesV4.js`](https://github.com/doc-detective/doc-detective.github.io/blob/main/.scripts/buildSchemaReferencesV4.js)
in the `doc-detective.github.io` repo, which reads the `{ schemas }` export from `doc-detective-common`
and emits the field/type/default tables.

- **Never hand-edit a `reference/schemas/*.md` page.** To change its content, change the JSON schema in
  [`src/common/src/schemas/src_schemas/`](../../src/common/src/schemas/src_schemas/) (its `description`,
  `default`, `examples`, `enum`, etc.) and re-run the generator. Edits made by hand are overwritten on
  the next generation.
- There is **therefore no separate hand-authored "Configuration reference" page** — the generated
  `config.md` *is* it. The Reference shelf links to the generated pages; journey pages deep-link into
  them.
- **Generator:** the generator is [`docs/.scripts/buildSchemaReferencesV4.js`](../.scripts/buildSchemaReferencesV4.js),
  run via `npm run docs:build-schema-refs`. It reads this repo's committed schema bundle and writes the
  Fern pages; a CI drift check (`.github/workflows/docs-schema-refs.yml`) fails the build if the
  committed pages don't match the regenerated output.
- The **CLI reference** is *not* schema-driven, so the generator doesn't produce it. It should either
  get its own small generator from `buildYargs()` (preferred, same "generated, not hand-edited"
  principle) or be carefully hand-authored and kept in sync with `src/utils.ts`. Decision pending.

### Contribute (own tab) — `contribute/`

Existing 18 pages (guides, content templates, repo guides) unchanged in content; moved to a dedicated
tab so they don't sit inside the user-facing Documentation tab.

### Support — `support.mdx`, `legal/`

Support · Resources · Legal / Privacy policy.

---

## Page mapping (current → proposed)

Nothing is dropped.

| Current location | Proposed location |
|---|---|
| Home / Welcome | Home (router) |
| Docs / Introduction | Get started / Introduction |
| Get started / Installation | Get started / Installation |
| Get started / Concepts | Get started / Core concepts (canonical copy in Reference) |
| Get started / Create your first test | Get started |
| Get started / Sample tests | Get started / Sample tests |
| Get started / CI | Run in CI & at scale / GitHub Action recipe |
| Get started / Integrations | Split: Heretto→Test your docs; OpenAPI→Test code & APIs; orchestration→CI |
| Get started / Self-healing | AI & Agents / Self-healing (linked into Test your docs) |
| Get started / Resources | Support / Resources |
| Agent tools / * | AI & Agents (pillar) |
| Configuration / Contexts | Reference / Contexts & surfaces |
| Tests / Overview | Get started / How testing works |
| Tests / Standalone | Test code & APIs |
| Tests / Inline, Detected | Test your docs |
| Input formats / * | Test your docs / Input formats |
| Integrations / Heretto | Test your docs |
| Actions / * (17) | Reference / Actions (folder unchanged) |
| Selectors / CSS, XPath | Reference / Selectors |
| Contribute / * (18) | Contribute (own tab) |
| Legal / Privacy policy | Support / Legal |
| Tutorials / Set up your test environment | Run in CI & at scale |
| Tutorials / Fill fields | Test your docs |
| Tutorials / Capture screenshot, Record video | Test your docs |
| Reference / Glossary | Reference / Glossary |
| Reference / Schemas | Reference / Schemas (folder unchanged) |

The standalone *Tutorials* tab is dissolved into the audience tracks. The `actions/` and
`reference/schemas/` folders stay in place to avoid churning the ~67 auto-generated pages.

---

## Source-of-truth mapping

Reference pages must never contradict the source code. **Schema-derived reference pages are generated,
not hand-written** (see "Generated reference pages" above): change the schema and re-run the generator.
The "source of truth" for those rows is the schema; the page is an artifact.

| Reference page | Generated? | Source of truth |
|---|---|---|
| Configuration (`config.md`) | yes (`buildSchemaReferencesV4.js`) | [`config_v3.schema.json`](../../src/common/src/schemas/src_schemas/config_v3.schema.json) |
| Contexts & surfaces (`context.md`) | yes | `context_v3.schema.json` |
| Actions (per-action `*.md`) | yes | per-action schemas in [`src/common/src/schemas/src_schemas/`](../../src/common/src/schemas/src_schemas/) |
| All other `reference/schemas/*.md` | yes | the corresponding schema |
| CLI commands & flags | no (decision pending) | `buildYargs()` in [`src/utils.ts`](../../src/utils.ts), [`src/cli.ts`](../../src/cli.ts) |
| Action prose pages (`docs/actions/*.mdx`) | no (hand-written) | [`src/core/tests/`](../../src/core/tests/) + the action schema |
| Reporters & artifacts | no (hand-written) | [`src/reporters/`](../../src/reporters/) |

---

## Phased rollout

- **Phase 1 — Launch (★):** content-strategy dir; Home router; Get started on-ramp; the three
  Documentation track overviews + their ★ pages; AI pillar ★ pages; Troubleshoot; the full Reference
  shelf including the two net-new pages (Configuration, CLI). Redirects for every moved slug.
- **Phase 2 — Depth:** remaining per-track pages (other CI recipes, concurrency, orchestration,
  OpenAPI, agent best-practices, record/fill-fields polish).
- **Phase 3 — Polish:** prose-quality pass per page; cross-persona refinements.

---

## Journey walk-through test

Before declaring any ★ CUJ complete, follow all of its linked pages from start to finish and confirm:

1. The persona reaches the stated outcome without leaving the track (except deliberate Reference
   lookups).
2. Every code example resolves and, where possible, is covered by a `*.spec.json` the docs' own
   Doc Detective run executes.
3. Every page has `title` and `description` frontmatter.
