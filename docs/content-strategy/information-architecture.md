# Information architecture & content set

## IA design principle

The site is organized by **user intent**, not by document type. Each top-level track maps to a
persona's job-to-be-done. The landing page is a router — "What do you want to do?" — that sends each
user into the matching track. Reference material is a **flat lookup shelf** that journeys deep-link
into: it supports navigation, it does not drive it.

**One activity, many interfaces.** Doc Detective has a single job: *test documentation*. Everything it
does — clicking through a UI walkthrough, running a documented shell command, issuing a documented API
request — is verifying that a **procedure in the docs** still works. The end-user track is therefore a
single **"Test your docs"** umbrella, organized underneath by the **kind of interface the documented
procedure drives**:

- **UI procedures** — docs that walk a reader through a graphical interface (browser or app): find,
  click, type, fill fields, capture screenshots, record video.
- **CLI, code & APIs** — docs that show commands, code samples, and API calls: `runShell`, `runCode`,
  `runBrowserScript`, `httpRequest`, `checkLink`, and OpenAPI-generated tests.

This corrects an earlier framing bug: the IA used to split the top level into "Test your docs" **vs.**
"Test code & APIs," which read as *docs* on one side and *something other than docs* on the other.
There is no such split — testing a code sample or an API call **is** testing the docs that document
them. The real axis is the **interface**, so both live under one "Test your docs" track as
surface-typed sub-sections.

The remaining top-level tracks are **orthogonal** to interface — they are not "another kind of doc to
test" but a different concern entirely, so they keep their own tracks:

- **Run in CI & at scale** (Priya) — an *operational* concern: where and how the suite runs.
- **Build with AI agents** (Aria) — an *authoring-method* concern, and a first-class pillar (its own
  tab), not a sub-section of each persona.
- **Contribute** — its own tab, kept out of the end-user tracks.

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
├─ Get started                          (universal on-ramp → feeds W1)
│
├─ Test your docs                       → W1, W2, W3, D1, D2, D3   [LEAD track]
│   ├─ Authoring: inline · detected · standalone   (where the test lives — surface-neutral)
│   ├─ UI procedures            (Wren)  → W2   (find/click/type, screenshots, video)
│   ├─ CLI, code & APIs         (Diego) → D1, D2, D3   (runShell/runCode, httpRequest, OpenAPI)
│   └─ Formats & surfaces  (cross-surface) → input formats · platforms/browsers · Heretto   (W3)
│
├─ Run in CI & at scale  (Priya)        → P1, P2, P3
│
├─ Build with AI agents  (Aria)         → A1, A2          [PILLAR — own tab]
│
├─ Troubleshoot          (X-cut)        → X1              (high-traffic)
│
├─ Reference (lookup shelf)             → Concepts/Glossary · Actions · Configuration ·
│                                          CLI · Contexts & surfaces · Selectors ·
│                                          Input formats · Schemas
│
├─ Contribute (own tab)                 → C1
└─ Support
```

Both surface sub-sections sit **inside** the one "Test your docs" track. A reader whose docs mix UI
walkthroughs and API calls stays in a single track and picks the sub-section that matches the
procedure in front of them — they never have to decide whether their work counts as "docs" or as
"code & APIs."

### Fern realization (tabs vs. sidebar sections)

Six header tabs keep the bar legible while honoring "AI as a pillar" and "Contribute as its own tab":

| Header tab | Sidebar sections |
|---|---|
| **Home** | router |
| **Documentation** | Get started · Test your docs · Run in CI & at scale · Troubleshoot |
| **AI & Agents** | A1, A2 (pillar) |
| **Reference** | the lookup shelf |
| **Contribute** | C1 |
| **Support** | Support · Resources · Legal |

The surface split (UI procedures / CLI, code & APIs) is realized as **sub-sections within the
"Test your docs" sidebar section**, not as separate top-level sections. They are visual groupers; page
URLs stay flat under `/docs/test-docs/…` so moving a page between surface groups never changes its
slug.

> **Implementation status.** The nav, tabs, sections, page URLs (via explicit `slug`s in `docs.yml`),
> and redirects below are **live** — the umbrella "Test your docs" track (with the UI and CLI/code/API
> sub-sections) is in effect and `fern check` passes. To avoid breaking colocated assets (e.g. the
> tutorials' shared `img/`), the **page files have not yet been physically
> relocated** into the directories in the table below; they keep their current paths (some still under
> `pages/docs/test-code/`) while serving the new `/docs/test-docs/…` slugs. Physically moving files to
> match this map (carrying their assets) is a deferred mechanical pass. The tutorials' sample test
> specs now live as hosted Markdown under `docs/examples/watson-and-holmes/` and are referenced by URL
> rather than bundled in a downloadable zip.

### Directory mapping (Fern content paths)

| Nav section | Directory under `docs/fern/pages/` |
|---|---|
| Home (router) | `index.mdx` |
| Get started | `docs/get-started/` |
| Test your docs (UI + CLI/code/API sub-sections) | `docs/test-docs/` (CLI/code/API pages still served from `docs/test-code/` until the deferred file move) |
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

### Test your docs — Wren (UI) + Diego (CLI/code/API) — `docs/test-docs/`

One track for the whole doc-testing job, subdivided by the interface the documented procedure drives.

**Track foundations (surface-neutral — where the test lives)**

| Page | CUJ | ★ | Notes |
|---|---|---|---|
| Track overview / start here | W1, D1 | ★ | Frames the one job, routes by surface (UI vs. CLI/code/API). |
| Inline tests | W2 | ★ | Tests embedded in a doc source file. |
| Detected tests | W2 | ★ | Tests inferred from prose. |
| Standalone test specs | W1, D1 | ★ | `*.spec.json` files kept beside the docs — a valid authoring choice for any surface. |

**UI procedures — Wren**

| Page | CUJ | ★ | Notes |
|---|---|---|---|
| Fill fields & UI flows | W2 | | `find`/`click`/`type`/`dragAndDrop`. |
| Capture screenshots | W2 | ★ | Authored: `/docs/test-docs/capture-screenshots-guide`. Lead guide for the Screenshots sub-section: a single `screenshot` capture (full viewport, cropped element, padding). The topic split into a Screenshots sub-section — visual regression, automatic screenshots, and annotations each moved to their own guide (below). |
| Screenshot visual regression | W2 | ★ | Authored: `/docs/test-docs/screenshot-visual-regression`. Compare a capture against a committed reference image with `maxVariation`; cloud-storage references and the SSRF guard. |
| Automatic screenshots | W2 | ★ | Authored: `/docs/test-docs/automatic-screenshots`. `autoScreenshot` captures an image after every browser-driven step; artifact paths. |
| Annotate screenshots | W2 | ★ | Authored: `/docs/test-docs/annotate-screenshots`. `screenshot.annotations` types, targets, and the `annotationDefaults` theme. |
| Record video | W2 | | Authored: `/docs/test-docs/record-video-guide`. Lead guide for the Recording sub-section: `record`/`stopRecord` and choosing an engine. Checkpoints, automatic recording, and narration each moved to their own guide (below). |
| Video visual regression | W2 | ★ | Authored: `/docs/test-docs/video-visual-regression`. `checkpoints` and `verify` guards catch visual drift and structural problems; staleness detection. |
| Automatic recording | W2 | ★ | Authored: `/docs/test-docs/automatic-recording`. `autoRecord` records every driver-based context end to end with the `ffmpeg` engine. |
| Narrate recordings | W2 | ★ | Authored: `/docs/test-docs/narrate-recordings`. The `annotate` action draws persistent on-screen annotations that appear in a recording. |
| Multiple tabs, windows & browsers | W2, W3 | | goTo `newTab`/`newWindow` + browser-session opening, `surface` session/window/tab selectors, whole-browser `closeSurface`. |
| Test native & mobile apps (experimental) | W2, D1 | | The native-app-surfaces journey, split into four per-platform experimental guides (below) that live under `docs/test-docs/native-apps/`. Each guide covers the platform's setup, one runnable worked example, the platform-specific gotchas, and where to go next — and deep-links into the `startSurface`/`click`/`type`/`find`/`swipe` action pages and the generated reference (app-descriptor, device-descriptor) rather than duplicating them. |
| Test native Windows apps (experimental) | W2, D1 | | NovaWindows driver, executable/UWP identifiers, `runOn: ["windows"]`, UIA element mapping, window selectors, `workingDirectory`. |
| Test native macOS apps (experimental) | W2, D1 | | Mac2 driver, Accessibility (TCC) permission gate, `runOn: ["mac"]`, AX element mapping, `args`/`env`. |
| Test Android apps (experimental) | W2, D1 | | UiAutomator2 driver on a managed emulator, `install android`, `runOn: ["android"]`, device selection, `10.0.2.2` loopback, permission dialogs, device keys, gestures. |
| Test iOS apps (experimental) | W2, D1 | | XCUITest driver on a managed simulator (macOS host only), `install ios`, `runOn: ["ios"]`, simulator selection, WebDriverAgent build, device keys, gestures. |

**CLI, code & APIs — Diego**

| Page | CUJ | ★ | Notes |
|---|---|---|---|
| Run shell & code steps | D1 | ★ | `runShell` / `runCode` / `runBrowserScript`, outputs. |
| HTTP & API testing | D2 | ★ | `httpRequest`, `checkLink`. |
| Cookies & variables | D2 | | `saveCookie` / `loadCookie` / `loadVariables` / outputs. |
| Generate tests from OpenAPI | D3 | | `openApi` integration. |

**Formats & surfaces — cross-surface (W3 anchor)**

These pages apply equally to UI and CLI/code/API tests; W3 is the CUJ anchor, not a Wren-only label.

| Page | CUJ | ★ | Notes |
|---|---|---|---|
| Input formats (overview + Markdown/DITA/AsciiDoc/HTML/Custom) | W3 | ★ | Applies to every surface. |
| Test across platforms & browsers | W3 | ★ | contexts / `runOn`; links to Reference. |
| Heretto integration | W3 | | |
| Self-healing for docs *(shared with A2)* | W2 | | |

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
| CLI commands & flags — **generated** | All | ★ | `reference/cli.mdx`, generated by `buildCliReference.js` from `buildYargs()` in `src/utils.ts`, the command modules, and the `config_v3` schema. **Do not hand-author** — see "Generated reference pages" below. |
| Contexts & surfaces (platforms/browsers/`runOn`) — **generated** | W3, P2 | ★ | `reference/schemas/context.md` (generated); a thin journey-facing wrapper page may link to it. |
| Selectors (CSS, XPath) | W2, D1 | ★ | — |
| Input formats reference | W3 | | `fileTypes` in `config_v3` |
| Schemas (auto-generated) | All | ★ | `src/common/dist/schemas` via `buildSchemaReferencesV4.js` |

#### Generated reference pages (do not hand-edit)

The `reference/schemas/*.md` pages — including `config.md`, `context.md`, and every per-action schema —
are **generated by a script**,
[`docs/.scripts/buildSchemaReferencesV4.js`](../.scripts/buildSchemaReferencesV4.js) (run with
`npm run docs:build-schema-refs`), which reads this repo's committed `doc-detective-common` schema
bundle and emits the field/type/default tables.

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
- The **CLI reference** (`reference/cli.mdx`, slug `/cli`) is *not* schema-driven, so the schema
  generator doesn't produce it. It has **its own small generator**,
  [`docs/.scripts/buildCliReference.js`](../.scripts/buildCliReference.js) (run with
  `npm run docs:build-cli-ref`), which reads the CLI definitions from `buildYargs()` in `src/utils.ts`,
  the `lsp`/`debug`/`install` command modules, and the command registrations in `src/cli.ts`, and
  reads run-flag defaults from the committed `config_v3` schema bundle (buildYargs itself declares no
  defaults — the CLI overlays flags onto the schema-validated config). Like the schema pages it is
  **generated, not hand-edited**: change the CLI source (or the schema) and re-run the generator. A CI
  drift check ([`.github/workflows/docs-cli-ref.yml`](../../.github/workflows/docs-cli-ref.yml)) fails
  the build if the committed page doesn't match the regenerated output.

### Contribute (own tab) — `contribute/`

Existing 18 pages (guides, content templates, repo guides) unchanged in content; moved to a dedicated
tab so they don't sit inside the user-facing Documentation tab.

### Support — `support.mdx`, `legal/`

Support · Resources · Legal / Privacy policy · Telemetry and data collection (what anonymous
telemetry Doc Detective collects and how to turn it off; cross-cutting trust concern, serves all
personas).

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
| Get started / Integrations | Split: Heretto→Test your docs (Formats & surfaces); OpenAPI→Test your docs (CLI, code & APIs); orchestration→CI |
| Get started / Self-healing | AI & Agents / Self-healing (linked into Test your docs) |
| Get started / Resources | Support / Resources |
| Agent tools / * | AI & Agents (pillar) |
| Configuration / Contexts | Reference / Contexts & surfaces |
| Tests / Overview | Get started / How testing works |
| Tests / Standalone | Test your docs / CLI, code & APIs |
| Tests / Inline, Detected | Test your docs (foundations) |
| Input formats / * | Test your docs / Formats & surfaces / Input formats |
| Integrations / Heretto | Test your docs / Formats & surfaces |
| Test code & APIs / * | Test your docs / CLI, code & APIs (the separate "Test code & APIs" track is dissolved into this sub-section) |
| Actions / * (17) | Reference / Actions (folder unchanged) |
| Selectors / CSS, XPath | Reference / Selectors |
| Contribute / * (18) | Contribute (own tab) |
| Legal / Privacy policy | Support / Legal |
| Tutorials / Set up your test environment | Run in CI & at scale |
| Tutorials / Fill fields | Test your docs / UI procedures |
| Tutorials / Capture screenshot, Record video | Test your docs / UI procedures |
| Reference / Glossary | Reference / Glossary |
| Reference / Schemas | Reference / Schemas (folder unchanged) |

The standalone *Tutorials* tab is dissolved into the audience tracks, and the former top-level *Test
code & APIs* track is folded into "Test your docs" as the **CLI, code & APIs** sub-section. The
`actions/` and `reference/schemas/` folders stay in place to avoid churning the ~67 auto-generated
pages.

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
| CLI commands & flags (`cli.mdx`) | yes (`buildCliReference.js`) | `buildYargs()` in [`src/utils.ts`](../../src/utils.ts), the command modules, [`src/cli.ts`](../../src/cli.ts), and `config_v3` for defaults |
| Action prose pages (`docs/actions/*.mdx`) | no (hand-written) | [`src/core/tests/`](../../src/core/tests/) + the action schema |
| Reporters & artifacts | no (hand-written) | [`src/reporters/`](../../src/reporters/) |

---

## Phased rollout

- **Phase 1 — Launch (★):** content-strategy dir; Home router; Get started on-ramp; the "Test your
  docs" track (foundations + UI and CLI/code/API sub-sections + their ★ pages); the CI track overview
  + ★ pages; AI pillar ★ pages; Troubleshoot; the full Reference shelf including the two net-new pages
  (Configuration, CLI). Redirects for every moved slug.
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
