# Design: multi-surface targeting

Status: **delivered through Phase 6** — Phase 1 process surfaces
([#386](https://github.com/doc-detective/doc-detective/pull/386)), Phase 2 `background.tty`
(ADR 01004), Phase 3 browser window/tab selectors (ADR 01016), Phase 4 multi-session browser
registry ([#483](https://github.com/doc-detective/doc-detective/pull/483), ADR 01019), Phase 5
native apps (see [native-app-surfaces.md](native-app-surfaces.md) for the A1–A8 breakdown and
status), and Phase 6 generic + parallel `startSurface`
([#539](https://github.com/doc-detective/doc-detective/pull/539), ADR 01039). This document
remains the reference for the target shape and semantics; per-phase detail lives in the PRs and
ADRs.

## Problem

Today a test runs in a single **context** (one browser engine + platform, one
`driver`; see `context_v3.browsers`). A step implicitly acts on that one surface.
We want a single context to drive **several surfaces at once**: multiple browser
windows/tabs, multiple native app windows, and background terminal processes — and
to address windows/tabs that an app or browser opens on its own.

We do not want to ship targeting per-step ad hoc and then refactor when the next
kind lands. So we fix the **addressing model** now and reuse it everywhere.

## Concepts

- **Surface** — an addressable thing a step can act on. Three kinds:
  `browser` (engine: chrome/firefox/safari/webkit/edge), `app` (native, future),
  `process` (background process from `runShell`/`runCode`).
- **Window** — a sub-surface of a browser or app (browser tabs are windows too).
  Processes have no windows.
- **Surface registry** — `name → { kind, handle, windows }`, the generalization of
  today's run-scoped `processRegistry`. Created by **opener** steps, addressed by
  the **`surface`** field, torn down by `closeSurface` or the run/context sweep.
- **Active surface / active window** — the most recently opened, focused, or
  explicitly targeted one. Omitting `surface` acts on it. With a single browser
  (today's norm) it is always that browser, so every existing test keeps working
  unchanged. **Implemented across all three kinds** (ADR 01081): one per-context
  MRU tracker spans browser sessions, app surfaces, and background processes; an
  explicit `surface` reference switches the active surface for the surface-less
  steps that follow, and closing the active surface falls through to the next
  live one.

## Design ethos: progressive disclosure + sane defaults

Every targeting field starts as the simplest scalar with an assumed default and
**graduates** to an object only when more is needed. Defaults are discoverable (a
surface's default name is the obvious thing — the engine, the executable, the base
command). **We only nest where a step forces it** (see "flat by default").

## The `surface` field — one shared shape, flat on every step

`surface` answers **where**. It is a flat, step-level field (never `target` — that
name is already taken by `record.target` and `dragAndDrop.target`). Same shape
everywhere:

| form | meaning | validated |
|---|---|---|
| *(omitted)* | the active surface / active window | — |
| `"chrome"` \| `"firefox"` \| … | a browser of that engine, default-named | string |
| `"web"` (any other string) | the surface named `web`, **identity only** (kind resolved at runtime) | string |
| object | **explicit kind** + name + window | **full (per kind)** |

Object form always names its kind, so the schema can validate it:

```jsonc
"surface": { "browser": "chrome", "name": "secondary", "window": -1 }
"surface": { "app": "calc", "window": { "title": "/Alert/" } }
"surface": { "process": "web" }
```

Each step's `surface` is `anyOf:[ string, { oneOf:[ …only the kinds that step
allows ] } ]`, so the **capability matrix is enforced by the schema** for the
object form (a `process` branch simply doesn't exist on `runBrowserScript.surface`).
The bare string stays identity-only and is kind-checked at runtime.

### `window` and `tab` selectors — progressive

A browser surface is two levels: **windows** contain **tabs**. `window` and `tab`
are independent selectors sharing one grammar; `window` omitted → active window,
`tab` omitted → that window's active tab. (Native apps have windows, no tabs.)

| form | meaning |
|---|---|
| *(omitted)* | active window / active tab |
| `"settings"` | window/tab with that assigned name |
| `0`, `1`, … | by index (creation order) |
| `-1` | **newest** (negative counts from the end) |
| `{ name, index, title, url }` | by criteria (`title`/`url` support `/regex/`) |

`window`/`tab` mean *which* window/tab exclusively. Window **size** is `size`
(`browserConfig`), not `window` — see the rename note under openers.

> WebDriver caveat: the W3C handle model is **flat** — every tab/window is an
> opaque handle with no parent grouping. We track the window→tab hierarchy for
> handles **we** open (record parent at creation); page-opened tabs/windows are
> addressable by `title`/`url`/index but may not resolve a reliable parent window.

## Flat by default; nest only where forced

`surface`, `waitUntil`, and `timeout` are **flat step-level fields** with the same
shape across steps. Readiness (`waitUntil`/`timeout`) is shaped by the step's kind:

- **Single-kind steps** (goTo, runBrowserScript → browser; closeSurface → any):
  the kind is fixed, so flat `waitUntil` validates directly. **goTo keeps its
  existing top-level `waitUntil`/`timeout` unchanged — no nesting, no deprecation.**
- **The one multi-kind step with divergent readiness — `type`** (browser/app/process)
  — keeps `waitUntil` flat too, and uses `allOf` `if/then` guards keyed on the
  object-form `surface` kind to constrain the shape:
  - `if surface.process` → `waitUntil` ⊆ `{ stdio, delayMs }`; element fields forbidden.
  - `if surface.browser|app` → `waitUntil` ⊆ `{ networkIdleTime, domIdleTime, find }`.
  - string/omitted `surface` → runtime kind check (the one un-typeable gap).

This gives the same schema-level validation as nesting readiness inside `surface`,
but keeps shapes flat and consistent and leaves goTo alone. Only `type` pays
complexity, and in conditional *validation*, not *structure*.

## Capability matrix (schema-enforced for the object form)

| action | browser | app | process |
|---|:---:|:---:|:---:|
| `goTo` | ✓ | — | — |
| `runBrowserScript` | ✓ | — | — |
| `find` / `click` / `dragAndDrop` | ✓ | ✓ | — |
| `screenshot` | ✓ | ✓ | — (no pixels) |
| `record` | ✓ | ✓ | — (no pixels) |
| `type` | ✓ (element/active) | ✓ | ✓ (stdin) |
| `closeSurface` | ✓ | ✓ | ✓ |

> `screenshot` was added to the matrix during Phase 3 (ADR 01016): focus-follow
> made it nearly free and "screenshot the cart tab" is a materially better
> authoring experience than the focus-a-surface-first workaround.

`process` is only ever a `type` / `closeSurface` target. Multi-window does not push
`process` onto the DOM/spatial actions.

## Per-step shapes

All browser-targeting steps accept `window` + `tab` selectors in their `surface`
reference. **Only `goTo` opens** new windows/tabs (`newWindow`/`newTab`); every
other step acts on existing ones.

```jsonc
// goTo — the ONLY step that opens windows/tabs
{ "goTo": { "url": "/dashboard", "surface": "chrome", "timeout": 30000,
            "waitUntil": { "networkIdleTime": 500, "find": { "selector": ".ready" } } } }
{ "goTo": { "url": "/checkout", "surface": "chrome", "newTab": "cart" } }               // open new tab
{ "goTo": { "url": "/admin", "surface": "chrome",
            "newWindow": { "name": "admin", "tab": "overview" } } }                     // open new window
{ "goTo": { "url": "/cart",
            "surface": { "browser": "chrome", "window": "main", "tab": "cart" } } }     // existing tab

// type — process (the only step with if/then guards) OR a browser tab
{ "type": { "keys": ["2+2","$ENTER$"], "surface": "node",
            "waitUntil": { "stdio": "/^4$/" }, "timeout": 5000 } }                      // process
{ "type": { "keys": ["hi"], "selector": "#q",
            "surface": { "browser": "chrome", "window": "main", "tab": "cart" } } }     // browser tab

// click / find — element criteria stay flat; surface picks window/tab
{ "click": { "selector": "Checkout", "surface": { "browser": "chrome", "tab": "cart" } } }
{ "find":  { "elementText": "Order #", "surface": { "browser": "chrome", "tab": { "url": "/orders/" } } } }

// dragAndDrop — `source`/`target` are ELEMENTS; `surface` is the tab they live in
{ "dragAndDrop": { "source": "#a", "target": "#b",
                   "surface": { "browser": "chrome", "window": "main", "tab": "board" } } }

// record — `target` stays = capture region; `surface` picks window/tab
{ "record": { "surface": { "browser": "chrome", "window": "admin", "tab": "overview" },
              "target": "window", "path": "admin.mp4" } }

// runBrowserScript
{ "runBrowserScript": { "function": "…", "surface": { "browser": "chrome", "tab": "report" } } }

// closeSurface — close at the level you name
{ "closeSurface": { "browser": "chrome", "tab": "cart" } }      // one tab
{ "closeSurface": { "browser": "chrome", "window": "admin" } }  // a window + its tabs
{ "closeSurface": "chrome" }                                    // the whole browser
```

## Openers — create and name a surface

### `startSurface` — generic provisioner (any kind), parallel-capable

The **descriptor** counterpart to the `surface` **reference**: same kind
discriminator, plus the provisioning payload (command/args/path) and kind-shaped
startup readiness. Single object, or an **array that launches all entries
concurrently** and completes when every one is ready — this is the parallelism
mechanism (overlap startup instead of paying it serially).

```jsonc
// BROWSER — reuses the shared `browserConfig` (same fields as runOn)
"startSurface": { "browser": "chrome", "name": "shopper",
                  "headless": false,
                  "size":     { "width": 1920, "height": 1080 },   // was `window` in runOn — now `size`
                  "viewport": { "width": 1600, "height": 900 } }

// APP — gains `args` + `workingDirectory` (like process); default name = executable basename
"startSurface": { "app": "/Applications/Calculator.app", "name": "calc",
                  "args": ["--reset"], "workingDirectory": "./sandbox",
                  "waitUntil": { "delayMs": 500 }, "timeout": 10000 }

// PROCESS — command/args/workingDirectory + stdio readiness
"startSurface": { "process": "api", "command": "npm start", "args": ["--port", "3000"],
                  "workingDirectory": "./server",
                  "waitUntil": { "stdio": "/listening on \\d+/" }, "timeout": 30000 }

// PARALLEL — concurrent launch + overlapped readiness
"startSurface": [
  { "browser": "chrome",  "name": "shopper" },
  { "browser": "firefox", "name": "admin" },
  { "process": "api", "command": "npm start", "waitUntil": { "stdio": "/listening/" } },
  { "app": "Calculator", "name": "calc", "args": ["--reset"] }
]
```

Fields: `name`/`waitUntil`/`timeout` are common to all kinds; **`args`** and
**`workingDirectory`** (default: inherit the run's cwd, `.`) on app + process — both
launch executables (not browser — it takes engine config, not argv, matching runOn).
Browser config is the shared **`browserConfig`** (`headless`/`size`/`viewport`)
`$ref`'d by both `startSurface` and `context_v3.browsers`, so they never drift —
note `size` (renamed from runOn's `window`; `window` now means the selector
everywhere). Startup readiness is kind-shaped (same `if/then` approach as `type`):
`process` → `{ stdio, delayMs }`; `app` → `{ delayMs }`; `browser` → launch-only
(no page until `goTo`, so usually no `waitUntil`).

`startSurface` parallelizes **provisioning** only. Steps still run sequentially
(targeting different surfaces); concurrent *actions* belong to the dynamic-routing
roadmap, not here.

### Relationship to the kind-specific openers

- **Subsumes `openApp`** — that is just `startSurface: { app: … }`; no separate
  step.
- **`runShell` `background`** stays (runs a command *and* registers a process);
  equivalent to `startSurface: { process, command, waitUntil }`. Kept as inline
  sugar — no churn to the in-flight background work. `background` graduates
  bool → string → object; default process name = base command.
- **`goTo`** navigates and may auto-open a browser surface on first reference
  (engine keyword), or act on a `startSurface`-provisioned browser by name. It is
  the **only** step that opens windows/tabs:
  - **`newTab`** (`true` → `"name"` → `{ name }`) — new tab in the target/active window.
  - **`newWindow`** (`true` → `"name"` → `{ name, tab }`) — new window + its first tab.
  - Mutually exclusive on one `goTo`. Opened windows/tabs register by name, so later
    steps select them with the `window`/`tab` selectors. (Surface auto-open is
    browser-level; `newTab`/`newWindow` are window/tab-level — they compose.)

```jsonc
"runShell": { "command": "npm start", "background": "web" }            // process "web" (sugar)
"goTo": { "url": "https://ex.com", "surface": "firefox" }              // browser: auto-open or by name
"goTo": { "url": "/checkout", "surface": "chrome", "newTab": "cart" }  // new tab "cart", navigate it
"goTo": { "url": "/admin", "surface": "chrome",
          "newWindow": { "name": "admin", "tab": "overview" } }        // new window + first tab
// later: act in that tab by name
"type": { "keys": ["…"], "surface": { "browser": "chrome", "window": "admin", "tab": "overview" } }
```

## Closing surfaces — `closeSurface` (replaces `stopProcess`)

The symmetric partner of `startSurface`. Takes a `surface` **reference**,
progressive, never-fail-on-missing (inherits #385). Array form closes several.

```jsonc
"closeSurface": "web"                                  // close surface named "web" (any kind)
"closeSurface": { "browser": "chrome", "window": -1 }  // close just the newest tab
"closeSurface": ["shopper", "admin", "api"]            // close several
```

`stopProcess` becomes a **deprecated alias** for `closeSurface` with a process
target.

## `runOn` impact

`runOn` is an array of `context_v3` `{ platforms, browsers }`, where **`browsers`
fans out** (`["chrome","firefox"]` runs the test once per engine). It conflates
three jobs: environment matrix, gating, and default-surface provisioning.
Multi-surface moves provisioning into steps, so:

- **`browsers` keeps working, reinterpreted** as "the default/active browser
  surface + the cross-browser fan-out matrix." `surface`-less steps use it; steps
  naming a `surface` open *additional* named surfaces on top. The default browser
  surface auto-names to its engine so it resolves like any named surface.
  **Non-breaking.**
- **`surface` is orthogonal to `runOn`** — surfaces are opened/named at runtime,
  never enumerated in `runOn`. Adding `surface` needs **no `runOn` shape change**.
- **Additive gating (the one real change): a `requires` capability gate** on
  `context_v3`, evaluated like `platforms` → SKIPPED when unmet, so app/CLI tests
  (e.g. drive `claude`, drive `Calculator`) skip cleanly where the dependency is
  absent. `platforms` already gates OS; absent browsers already skip their matrix
  entry.
- **Caveat (docs):** cross-browser fan-out is for browser-*agnostic* tests. A test
  that pins `surface: { browser: "firefox" }` should not also rely on a
  multi-engine `browsers` matrix (it would open firefox in every entry); pin a
  single `browsers` entry instead.

Not doing: generalizing `browsers` → `surfaces` in `context_v3` to pre-provision
apps. Provisioning stays in steps; `runOn` stays focused on matrix + gating.

### `requires` gate (additive, progressive)

`"node"` → `["node","ffmpeg"]` → `{ commands, files, env }`. All entries AND-ed;
any miss → that context entry is **SKIPPED** (same as a `platforms` mismatch).
`files` entries support `$VAR`/`$HOME` expansion.

### `runOn` examples

```jsonc
// Unchanged today — chrome is now "the default/active surface"
"runOn": [ { "platforms": ["linux"], "browsers": "chrome" } ]

// Cross-browser matrix — runs the browser-agnostic test once per default surface
"runOn": [ { "platforms": ["windows","mac","linux"], "browsers": ["chrome","firefox","webkit"] } ]

// Process/CLI-only test — NO browser; gated by requires (skips where `node` is absent)
"runOn": [ { "platforms": ["linux","mac","windows"], "requires": "node" } ]

// Drive the claude TUI — needs the CLI + an API key
"runOn": [ { "platforms": ["mac","linux"], "requires": { "commands": ["claude"], "env": ["ANTHROPIC_API_KEY"] } } ]

// Native app — OS-restricted + app bundle must exist
"runOn": [ { "platforms": ["mac"], "requires": { "files": ["/Applications/Calculator.app"] } } ]

// Pinned multi-surface (browser + process) — ONE default browser, process opened by a step
"runOn": [ { "platforms": ["linux"], "browsers": "chrome", "requires": "node" } ]

// requires full object form
"runOn": [ { "platforms": ["windows","mac","linux"],
             "requires": { "commands": ["node","ffmpeg"], "files": ["$HOME/.config/app.toml"], "env": ["API_TOKEN"] } } ]
```

Caveat in practice — pin a surface OR fan out, not both:

```jsonc
// DON'T — a step that pins surface:{browser:"firefox"} opens firefox in BOTH entries
"runOn": [ { "platforms": ["linux"], "browsers": ["chrome","firefox"] } ]
// DO — single default browser; the step opens the second browser explicitly
"runOn": [ { "platforms": ["linux"], "browsers": "chrome" } ]
```

## Backward compatibility

- Omitting `surface` everywhere → today's single-active-surface behavior. No
  existing spec changes.
- `goTo` is additive (`surface`); its `waitUntil`/`timeout` are unchanged.
- `record.target` (region) and `dragAndDrop.source`/`target` (elements) are
  untouched — the surface field is `surface`, avoiding the collision.
- `runOn`/`context_v3` shape stable except the browser-size key: `window` →
  `size` (so `window` can mean the selector everywhere). `window` stays a
  **deprecated alias** for `size` in `browserConfig`; removed next schema major.
  `requires` added later.

## Reusable schema artifacts

- A shared **`surface` schema** (`surface_v3.schema.json`): `anyOf:[string,
  {oneOf:[ …kind branches ]}]` + the `window`/`tab` selectors. Each step `$ref`s it
  but lists only its allowed kind branches. **Branches are added per phase** —
  Phase 1 ships only `surfaceProcess` + the string form; `surfaceBrowser` lands in
  Phase 3, `surfaceApp` in Phase 5. Adding a `oneOf` branch is non-breaking, so
  "minimal per phase" and "no breaking refactor" both hold.
- A shared **readiness** schema reused by flat `waitUntil`: `waitUntilBrowser`
  (`{networkIdleTime,domIdleTime,find}` — goTo's current shape) and
  `waitUntilProcess` (`{stdio,delayMs}`). `type`'s `if/then` selects which applies.
- A shared **`browserConfig`** (`headless`/`size`/`viewport`, with `window`
  deprecated-alias→`size`) `$ref`'d by BOTH `context_v3.browsers` and
  `startSurface`'s browser branch — single source of truth so runOn and
  startSurface never drift.
- A shared **`startSurface` descriptor** (`startSurface_v3.schema.json`): object |
  array, each entry `{ <kind>, name?, waitUntil?, timeout?, + per-kind payload }` —
  browser → `browserConfig`; app/process → `args` (+ `command`/`workingDirectory`
  for process, `path` for app). The create-side mirror of the `surface` reference.
  `closeSurface` reuses the `surface` reference schema (string | object | array).

## Phased delivery

Each phase is independently shippable, additive (a `oneOf` branch / optional field
is never a breaking change), and ends green. Phases are grouped by the capability
and **what deps they require** — the current install already ships Appium browser
drivers (`appium-chromium-driver`/`-geckodriver`/`-safari-driver`) but **no native
driver**, which is the natural seam.

### Block A — runShell / process surfaces (no new deps)

- **Phase 1 — process input (this PR).** `runShell.background` reshaped to
  progressive `true`|`"name"`|`{name, waitUntil}` (default name = base command);
  readiness converges onto the new vocabulary — `readyWhen`→`background.waitUntil`,
  `log`→`stdio` — and the old sibling `name`/`readyWhen` are **removed**. `surface`
  schema with the **process branch + string form only**. `type` → process:
  `surface`, flat `waitUntil`/`timeout`, the `if/then` process guard, stdin write,
  `stdio` readiness. `closeSurface` **replaces** `stopProcess`. Covers line REPLs
  (`node -i`, etc.). **No deprecation aliases** — background processes,
  `readyWhen`, and `stopProcess` shipped only on `next` (prerelease), so all
  renames are clean breaks.
- **Phase 2 — PTY / full TUIs (heavy dep).** `background.tty` via lazily-installed
  `node-pty` (graceful skip when absent); process branch unchanged. Unlocks the
  original goal — driving the `claude` TUI, arrow keys/`$CTRL$` over a real PTY.

### Block B — browser surfaces (no new deps; current Appium drivers)

- **Phase 3 — windows & tabs in the active browser.** ✅ **Shipped** (ADR 01016).
  Added the **browser branch** to `surface` with `window` + `tab` selectors; wired
  `surface` into the browser-targeting steps
  (goTo/type/click/find/dragAndDrop/runBrowserScript/record/screenshot);
  added `goTo` `newTab`/`newWindow`. One driver, multiple handles — extends the
  existing recorder-tab machinery (`createWindow`/`switchToWindow`); the
  per-context registry (`driver.state.surfaces`) tracks handles by first-seen
  order and hides the recorder tab. `type` gained the kind-shaped browser
  `waitUntil` (`networkIdleTime`/`domIdleTime`/`find`); `closeSurface` closes
  tabs/windows idempotently. Engine mismatch, browser `name`, and whole-browser
  close FAIL loudly with "lands in a later phase" guidance.
- **Phase 4 — multiple browser surfaces at once.** ✅ **Shipped** (ADR 01019).
  A context-scoped session registry holds several driver sessions keyed by
  surface name (the default browser registers under its engine name);
  `surface:{browser:engine,name}` (and the bare engine keyword) selects — and,
  on **goTo only**, opens — additional browsers on the context's
  already-acquired Appium port, inheriting the context's headless-ness.
  Active surface = most recently opened or focused, across sessions.
  `closeSurface` closes whole browsers (bare name / engine / `{browser,name}`),
  idempotently, with focus falling back to the most recently focused survivor;
  it refuses while a recording is active on the session. Phase 3's engine
  mismatch / `name` / whole-browser-close FAILs became working behavior;
  unopened references on non-goTo steps FAIL pointing at goTo.
  `runOn.browsers` reinterpreted as the default surface (+ the matrix caveat
  documented). Still only the installed browser drivers. Same-engine
  multi-session recording caveat: ffmpeg window capture can't disambiguate two
  same-engine sessions' identically-titled windows — record before opening a
  same-engine twin, or use the browser (MediaRecorder) engine, which is
  per-session.

### Block C — additions

- **Phase 5 — native app surfaces (new driver, lazy-installed).** `startSurface
  {app, args, workingDirectory}` (subsumes `openApp`) + app `window` selectors, via
  a lazily-installed native Appium driver (mac2 / windows), graceful skip when
  absent. Add the `context_v3.requires` gate so app/CLI tests SKIP cleanly.
  **Expanded into its own phased roadmap** (Windows → macOS → emulated Android →
  emulated iOS → mobile browsers → mobile vocabulary → app recording → Linux
  spike, phases A1–A8) in [native app surfaces](native-app-surfaces.md); that
  doc also pulls `startSurface`'s app branch forward into its first phase and
  adds `android`/`ios` to `runOn.platforms` (with `hosts` + `device` context
  fields) as the mobile environment model.
- **Phase 6 — convergence & ergonomics.** ✅ **Shipped (ADR 01039).** Generic
  `startSurface` incl. the parallel array form (browser/process too): three
  key-discriminated descriptor branches + an array (browser/process lanes
  parallel; app sessions serial with device boots pre-acquired in parallel),
  allSettled roll-up (FAIL > SKIPPED > PASS) with `outputs.surfaces`, and
  authored-order activation. `closeSurface` already closed browser/app
  surfaces (Phases 1/4 + A1). **Deviation:** no shared `browserConfig`
  factoring — the `window`→`size` rename applies ONLY inside the new
  startSurface browser descriptor (per-decision: `context_v3` keeps
  `browser.window`, no deprecated alias); the browser descriptor also adds
  `viewport` and `driverOptions`. (`closeSurface` itself ships in Phase 1;
  the `startSurface` step and its app branch shipped first in
  [native app surfaces](native-app-surfaces.md) phase A1 — Phase 6 added the
  remaining kind branches and the array form.)

Phase 1 is fully specified in the companion plan file; later phases reuse the
schema and registry it establishes.
