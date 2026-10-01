# Design: multi-surface targeting

Status: **delivered through Phase 6.**

- Phase 1, process surfaces ([#386](https://github.com/doc-detective/doc-detective/pull/386)).
- Phase 2, `background.tty` (ADR 01004).
- Phase 3, browser window and tab selectors (ADR 01016).
- Phase 4, the multi-session browser registry
  ([#483](https://github.com/doc-detective/doc-detective/pull/483), ADR 01019).
- Phase 5, native apps. See [native-app-surfaces.md](native-app-surfaces.md) for the A1–A8
  breakdown and status.
- Phase 6, generic and parallel `startSurface`
  ([#539](https://github.com/doc-detective/doc-detective/pull/539), ADR 01039).

This document remains the reference for the target shape and semantics. Per-phase detail lives in
the PRs and ADRs.

## Problem

Today a test runs in a single **context** (one browser engine + platform, one
`driver`; see `context_v3.browsers`). A step implicitly acts on that one surface.
We want a single context to drive **several surfaces at once**. That means multiple browser
windows and tabs, multiple native app windows, and background terminal processes. It also means
addressing windows and tabs that an app or browser opens on its own.

We do not want to ship targeting per-step ad hoc and then refactor when the next
kind lands. So we fix the **addressing model** now and reuse it everywhere.

## Concepts

- A **surface** is an addressable thing a step can act on. There are three kinds.
  `browser` takes an engine: chrome, firefox, safari, webkit, or edge. `app` is
  native, and future. `process` is a background process from `runShell` or
  `runCode`.
- A **window** is a sub-surface of a browser or app, and browser tabs are windows
  too. Processes have no windows.
- The **surface registry** maps `name → { kind, handle, windows }`. It generalizes
  today's run-scoped `processRegistry`. **Opener** steps create it, the
  **`surface`** field addresses it, and `closeSurface` or the run and context
  sweep tear it down.
- The **active surface** and **active window** are the most recently opened,
  focused, or explicitly targeted ones. Omitting `surface` acts on them. With a
  single browser, today's norm, it is always that browser, so every existing test
  keeps working unchanged. It's **implemented across all three kinds** (ADR
  01081). One per-context MRU tracker spans browser sessions, app surfaces, and
  background processes. An explicit `surface` reference switches the active
  surface for the surface-less steps that follow. Closing the active surface falls
  through to the next live one.

## Design ethos: progressive disclosure + sane defaults

Every targeting field starts as the simplest scalar with an assumed default and
**graduates** to an object only when more is needed. Defaults are discoverable (a
surface's default name is the obvious thing: the engine, the executable, or the
base command). **We only nest where a step forces it**, per "flat by default".

## The `surface` field: one shared shape, flat on every step

`surface` answers **where**. It is a flat, step-level field. It's never `target`,
since that name is already taken by `record.target` and `dragAndDrop.target`. The
shape is the same everywhere:

| form | meaning | validated |
|---|---|---|
| *(omitted)* | the active surface and active window | n/a |
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

### `window` and `tab` selectors, progressive

A browser surface has two levels, where **windows** contain **tabs**. `window` and
`tab` are independent selectors sharing one grammar. An omitted `window` means the
active window, and an omitted `tab` means that window's active tab. Native apps
have windows but no tabs.

| form | meaning |
|---|---|
| *(omitted)* | the active window and active tab |
| `"settings"` | the window or tab with that assigned name |
| `0`, `1`, … | by index (creation order) |
| `-1` | **newest** (negative counts from the end) |
| `{ name, index, title, url }` | by criteria (`title`/`url` support `/regex/`) |

`window` and `tab` mean *which* window or tab, exclusively. Window **size** is
`size` on `browserConfig`, not `window`. See the rename note under openers.

> WebDriver caveat: the W3C handle model is **flat**. Every tab and window is an
> opaque handle with no parent grouping. We track the window-to-tab hierarchy for
> handles **we** open, recording the parent at creation. Page-opened tabs and
> windows are addressable by `title`, `url`, or index, but may not resolve a
> reliable parent window.

## Flat by default; nest only where forced

`surface`, `waitUntil`, and `timeout` are **flat step-level fields** with the same
shape across steps. Readiness (`waitUntil`/`timeout`) is shaped by the step's kind:

- **Single-kind steps** have a fixed kind, so a flat `waitUntil` validates
  directly. `goTo` and `runBrowserScript` are browser-only, and `closeSurface`
  takes any kind. **goTo keeps its existing top-level `waitUntil` and `timeout`
  unchanged, with no nesting and no deprecation.**
- **`type` is the one multi-kind step with divergent readiness**, spanning
  browser, app, and process. It keeps `waitUntil` flat too. It uses `allOf`
  `if/then` guards, keyed on the object-form `surface` kind, to constrain the
  shape:
  - `if surface.process` limits `waitUntil` to `{ stdio, delayMs }`, and forbids element fields.
  - `if surface.browser|app` limits `waitUntil` to `{ networkIdleTime, domIdleTime, find }`.
  - A string or omitted `surface` gets a runtime kind check. That's the one un-typeable gap.

This gives the same schema-level validation as nesting readiness inside `surface`,
but keeps shapes flat and consistent and leaves goTo alone. Only `type` pays
complexity, and in conditional *validation*, not *structure*.

## Capability matrix (schema-enforced for the object form)

| action | browser | app | process |
|---|:---:|:---:|:---:|
| `goTo` | ✓ | no | no |
| `runBrowserScript` | ✓ | no | no |
| `find`, `click`, `dragAndDrop` | ✓ | ✓ | no |
| `screenshot` | ✓ | ✓ | no, there are no pixels |
| `record` | ✓ | ✓ | no, there are no pixels |
| `type` | ✓, element or active | ✓ | ✓, through stdin |
| `closeSurface` | ✓ | ✓ | ✓ |

> `screenshot` was added to the matrix during Phase 3 (ADR 01016). Focus-follow
> made it nearly free, and "screenshot the cart tab" is a materially better
> authoring experience than the focus-a-surface-first workaround.

`process` is only ever a `type` or `closeSurface` target. Multi-window does not
push `process` onto the DOM and spatial actions.

## Per-step shapes

All browser-targeting steps accept `window` + `tab` selectors in their `surface`
reference. **Only `goTo` opens** new windows and tabs, through `newWindow` and
`newTab`. Every other step acts on existing ones.

```jsonc
// goTo: the ONLY step that opens windows and tabs
{ "goTo": { "url": "/dashboard", "surface": "chrome", "timeout": 30000,
            "waitUntil": { "networkIdleTime": 500, "find": { "selector": ".ready" } } } }
{ "goTo": { "url": "/checkout", "surface": "chrome", "newTab": "cart" } }               // open new tab
{ "goTo": { "url": "/admin", "surface": "chrome",
            "newWindow": { "name": "admin", "tab": "overview" } } }                     // open new window
{ "goTo": { "url": "/cart",
            "surface": { "browser": "chrome", "window": "main", "tab": "cart" } } }     // existing tab

// type: a process (the only step with if/then guards) OR a browser tab
{ "type": { "keys": ["2+2","$ENTER$"], "surface": "node",
            "waitUntil": { "stdio": "/^4$/" }, "timeout": 5000 } }                      // process
{ "type": { "keys": ["hi"], "selector": "#q",
            "surface": { "browser": "chrome", "window": "main", "tab": "cart" } } }     // browser tab

// click and find: element criteria stay flat, and surface picks the window or tab
{ "click": { "selector": "Checkout", "surface": { "browser": "chrome", "tab": "cart" } } }
{ "find":  { "elementText": "Order #", "surface": { "browser": "chrome", "tab": { "url": "/orders/" } } } }

// dragAndDrop: `source` and `target` are ELEMENTS, and `surface` is the tab they live in
{ "dragAndDrop": { "source": "#a", "target": "#b",
                   "surface": { "browser": "chrome", "window": "main", "tab": "board" } } }

// record: `target` stays the capture region, and `surface` picks the window or tab
{ "record": { "surface": { "browser": "chrome", "window": "admin", "tab": "overview" },
              "target": "window", "path": "admin.mp4" } }

// runBrowserScript
{ "runBrowserScript": { "function": "…", "surface": { "browser": "chrome", "tab": "report" } } }

// closeSurface: close at the level you name
{ "closeSurface": { "browser": "chrome", "tab": "cart" } }      // one tab
{ "closeSurface": { "browser": "chrome", "window": "admin" } }  // a window + its tabs
{ "closeSurface": "chrome" }                                    // the whole browser
```

## Openers: create and name a surface

### `startSurface`: a generic, parallel-capable provisioner for any kind

This is the **descriptor** counterpart to the `surface` **reference**. It shares
the kind discriminator, and adds the provisioning payload of command, args, and
path, plus kind-shaped startup readiness. Pass a single object, or an **array that
launches all entries concurrently** and completes when every one is ready. That
array is the parallelism mechanism, overlapping startup instead of paying it
serially.

```jsonc
// BROWSER: reuses the shared `browserConfig`, the same fields as runOn
"startSurface": { "browser": "chrome", "name": "shopper",
                  "headless": false,
                  "size":     { "width": 1920, "height": 1080 },   // was `window` in runOn, now `size`
                  "viewport": { "width": 1600, "height": 900 } }

// APP: gains `args` and `workingDirectory`, like process. The default name is the executable basename
"startSurface": { "app": "/Applications/Calculator.app", "name": "calc",
                  "args": ["--reset"], "workingDirectory": "./sandbox",
                  "waitUntil": { "delayMs": 500 }, "timeout": 10000 }

// PROCESS: command, args, and workingDirectory, plus stdio readiness
"startSurface": { "process": "api", "command": "npm start", "args": ["--port", "3000"],
                  "workingDirectory": "./server",
                  "waitUntil": { "stdio": "/listening on \\d+/" }, "timeout": 30000 }

// PARALLEL: concurrent launch with overlapped readiness
"startSurface": [
  { "browser": "chrome",  "name": "shopper" },
  { "browser": "firefox", "name": "admin" },
  { "process": "api", "command": "npm start", "waitUntil": { "stdio": "/listening/" } },
  { "app": "Calculator", "name": "calc", "args": ["--reset"] }
]
```

Fields: `name`/`waitUntil`/`timeout` are common to all kinds; **`args`** and
**`workingDirectory`** applies to app and process, since both launch executables.
It defaults to inheriting the run's cwd, `.`. It doesn't apply to browser, which
takes engine config rather than argv, matching runOn. Browser config is the shared
**`browserConfig`**, carrying `headless`, `size`, and `viewport`. Both
`startSurface` and `context_v3.browsers` `$ref` it, so they never drift. Note
`size`, renamed from runOn's `window`, since `window` now means the selector
everywhere. Startup readiness is kind-shaped, using the same `if/then` approach as
`type`. `process` takes `{ stdio, delayMs }`, and `app` takes `{ delayMs }`.
`browser` is launch-only, with no page until `goTo`, so it usually has no
`waitUntil`.

`startSurface` parallelizes **provisioning** only. Steps still run sequentially,
targeting different surfaces. Concurrent *actions* belong to the dynamic-routing
roadmap, not here.

### Relationship to the kind-specific openers

- **It subsumes `openApp`**, which is just `startSurface: { app: … }`. There's no
  separate step.
- **`runShell` `background`** stays. It runs a command *and* registers a process,
  equivalent to `startSurface: { process, command, waitUntil }`. It's kept as
  inline sugar, avoiding churn to the in-flight background work. `background`
  graduates from bool to string to object, and the default process name is the
  base command.
- **`goTo`** navigates. It may auto-open a browser surface on first reference,
  through an engine keyword, or act on a `startSurface`-provisioned browser by
  name. It is the **only** step that opens windows and tabs:
  - **`newTab`** graduates `true` → `"name"` → `{ name }`. It opens a new tab in
    the target or active window.
  - **`newWindow`** graduates `true` → `"name"` → `{ name, tab }`. It opens a new
    window plus its first tab.
  - The two are mutually exclusive on one `goTo`. Opened windows and tabs register
    by name, so later steps select them with the `window` and `tab` selectors.
    Surface auto-open is browser-level, while `newTab` and `newWindow` are window-
    and tab-level, so they compose.

```jsonc
"runShell": { "command": "npm start", "background": "web" }            // process "web", inline sugar
"goTo": { "url": "https://ex.com", "surface": "firefox" }              // browser, auto-opened or by name
"goTo": { "url": "/checkout", "surface": "chrome", "newTab": "cart" }  // new tab "cart", navigate it
"goTo": { "url": "/admin", "surface": "chrome",
          "newWindow": { "name": "admin", "tab": "overview" } }        // new window + first tab
// later: act in that tab by name
"type": { "keys": ["…"], "surface": { "browser": "chrome", "window": "admin", "tab": "overview" } }
```

## Closing surfaces: `closeSurface`, which replaces `stopProcess`

This is the symmetric partner of `startSurface`. It takes a `surface`
**reference**, is progressive, and never fails on a missing surface,
inheriting #385. The array form closes several.

```jsonc
"closeSurface": "web"                                  // close the surface named "web", any kind
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

- **`browsers` keeps working, reinterpreted** as the default and active browser
  surface, plus the cross-browser fan-out matrix. `surface`-less steps use it.
  Steps naming a `surface` open *additional* named surfaces on top. The default
  browser surface auto-names to its engine, so it resolves like any named surface.
  This is **non-breaking**.
- **`surface` is orthogonal to `runOn`.** Surfaces are opened and named at
  runtime, never enumerated in `runOn`. Adding `surface` needs **no `runOn` shape
  change**.
- **Additive gating is the one real change: a `requires` capability gate** on
  `context_v3`. It's evaluated like `platforms`, giving SKIPPED when unmet. App
  and CLI tests, such as driving `claude` or `Calculator`, then skip cleanly where
  the dependency is absent. `platforms` already gates the OS, and absent browsers
  already skip their matrix entry.
- **Caveat for docs:** cross-browser fan-out is for browser-*agnostic* tests. A
  test that pins `surface: { browser: "firefox" }` should not also rely on a
  multi-engine `browsers` matrix, since that would open firefox in every entry.
  Pin a single `browsers` entry instead.

Not doing: generalizing `browsers` → `surfaces` in `context_v3` to pre-provision
apps. Provisioning stays in steps; `runOn` stays focused on matrix + gating.

### `requires` gate (additive, progressive)

It graduates `"node"` → `["node","ffmpeg"]` → `{ commands, files, env }`. All
entries are AND-ed, and any miss makes that context entry **SKIPPED**, the same as
a `platforms` mismatch. `files` entries support `$VAR` and `$HOME` expansion.

### `runOn` examples

```jsonc
// Unchanged today. chrome is now the default and active surface
"runOn": [ { "platforms": ["linux"], "browsers": "chrome" } ]

// Cross-browser matrix: runs the browser-agnostic test once per default surface
"runOn": [ { "platforms": ["windows","mac","linux"], "browsers": ["chrome","firefox","webkit"] } ]

// Process and CLI-only test. NO browser, gated by requires, so it skips where `node` is absent
"runOn": [ { "platforms": ["linux","mac","windows"], "requires": "node" } ]

// Drive the claude TUI: needs the CLI and an API key
"runOn": [ { "platforms": ["mac","linux"], "requires": { "commands": ["claude"], "env": ["ANTHROPIC_API_KEY"] } } ]

// Native app: OS-restricted, and the app bundle must exist
"runOn": [ { "platforms": ["mac"], "requires": { "files": ["/Applications/Calculator.app"] } } ]

// Pinned multi-surface, browser plus process: ONE default browser, with the process opened by a step
"runOn": [ { "platforms": ["linux"], "browsers": "chrome", "requires": "node" } ]

// requires full object form
"runOn": [ { "platforms": ["windows","mac","linux"],
             "requires": { "commands": ["node","ffmpeg"], "files": ["$HOME/.config/app.toml"], "env": ["API_TOKEN"] } } ]
```

The caveat in practice: pin a surface OR fan out, not both.

```jsonc
// DON'T. A step that pins surface:{browser:"firefox"} opens firefox in BOTH entries
"runOn": [ { "platforms": ["linux"], "browsers": ["chrome","firefox"] } ]
// DO. A single default browser, where the step opens the second browser explicitly
"runOn": [ { "platforms": ["linux"], "browsers": "chrome" } ]
```

## Backward compatibility

- Omitting `surface` everywhere gives today's single-active-surface behavior. No
  existing spec changes.
- `goTo` is additive, gaining `surface`. Its `waitUntil` and `timeout` are
  unchanged.
- `record.target`, a region, and `dragAndDrop.source` and `target`, elements, are
  untouched. The surface field is `surface`, which avoids the collision.
- The `runOn` and `context_v3` shape is stable, except for the browser-size key.
  `window` becomes `size`, so `window` can mean the selector everywhere. `window`
  stays a **deprecated alias** for `size` in `browserConfig`, removed at the next
  schema major. `requires` was added later.

## Reusable schema artifacts

- A shared **`surface` schema** in `surface_v3.schema.json`. It's
  `anyOf:[string, {oneOf:[ …kind branches ]}]`, plus the `window` and `tab`
  selectors. Each step `$ref`s it, but lists only its allowed kind branches.
  **Branches are added per phase.** Phase 1 ships only `surfaceProcess` and the
  string form. `surfaceBrowser` lands in Phase 3, and `surfaceApp` in Phase 5.
  Adding a `oneOf` branch is non-breaking, so "minimal per phase" and "no breaking
  refactor" both hold.
- A shared **readiness** schema, reused by flat `waitUntil`. `waitUntilBrowser` is
  `{networkIdleTime,domIdleTime,find}`, goTo's current shape. `waitUntilProcess`
  is `{stdio,delayMs}`. `type`'s `if/then` selects which applies.
- A shared **`browserConfig`**, carrying `headless`, `size`, and `viewport`, with
  `window` as a deprecated alias for `size`. BOTH `context_v3.browsers` and
  `startSurface`'s browser branch `$ref` it. That single source of truth keeps
  runOn and startSurface from drifting.
- A shared **`startSurface` descriptor** in `startSurface_v3.schema.json`. It's an
  object or array, where each entry is
  `{ <kind>, name?, waitUntil?, timeout?, + per-kind payload }`. A browser takes
  `browserConfig`. App and process take `args`, plus `command` and
  `workingDirectory` for process, and `path` for app. It's the create-side mirror
  of the `surface` reference. `closeSurface` reuses the `surface` reference
  schema, as a string, object, or array.

## Phased delivery

Each phase is independently shippable and ends green. Each is additive, since a
`oneOf` branch or optional field is never a breaking change. Phases are grouped by
capability and **what deps they require**. The current install already ships the
Appium browser drivers `appium-chromium-driver`, `-geckodriver`, and
`-safari-driver`, but **no native driver**. That's the natural seam.

### Block A: runShell and process surfaces, with no new deps

- **Phase 1, process input (this PR).** `runShell.background` is reshaped to a
  progressive `true`, `"name"`, or `{name, waitUntil}`, where the default name is
  the base command. Readiness converges onto the new vocabulary, with `readyWhen`
  becoming `background.waitUntil` and `log` becoming `stdio`. The old sibling
  `name` and `readyWhen` are **removed**. The `surface` schema ships with the
  **process branch and string form only**. `type` gains process support:
  `surface`, a flat `waitUntil` and `timeout`, the `if/then` process guard, a
  stdin write, and `stdio` readiness. `closeSurface` **replaces** `stopProcess`.
  This covers line REPLs such as `node -i`. There are **no deprecation aliases**,
  because background processes, `readyWhen`, and `stopProcess` shipped only on
  `next`, a prerelease. All renames are therefore clean breaks.
- **Phase 2, PTY and full TUIs, needing a heavy dep.** `background.tty` arrives
  through a lazily-installed `node-pty`, with a graceful skip when absent. The
  process branch is unchanged. This unlocks the original goal: driving the
  `claude` TUI, with arrow keys and `$CTRL$` over a real PTY.

### Block B: browser surfaces, with no new deps, on the current Appium drivers

- **Phase 3, windows and tabs in the active browser.** ✅ **Shipped** (ADR 01016).
  Added the **browser branch** to `surface` with `window` + `tab` selectors; wired
  `surface` into the browser-targeting steps
  That covers goTo, type, click, find, dragAndDrop, runBrowserScript, record, and
  screenshot. It added `goTo`'s `newTab` and `newWindow`. It's one driver with
  multiple handles, extending the existing recorder-tab machinery of
  `createWindow` and `switchToWindow`. The per-context registry
  (`driver.state.surfaces`) tracks handles by first-seen order, and hides the
  recorder tab. `type` gained the kind-shaped browser `waitUntil`, covering
  `networkIdleTime`, `domIdleTime`, and `find`. `closeSurface` closes tabs and
  windows idempotently. An engine mismatch, a browser `name`, and a whole-browser
  close all FAIL loudly, with "lands in a later phase" guidance.
- **Phase 4, multiple browser surfaces at once.** ✅ **Shipped** (ADR 01019).
  A context-scoped session registry holds several driver sessions keyed by
  surface name. The default browser registers under its engine name.
  `surface:{browser:engine,name}`, and the bare engine keyword, selects additional
  browsers. On **goTo only**, it also opens them, on the context's
  already-acquired Appium port, inheriting the context's headless-ness. The active
  surface is the most recently opened or focused one, across sessions.
  `closeSurface` closes whole browsers idempotently, taking a bare name, an
  engine, or `{browser,name}`. Focus falls back to the most recently focused
  survivor. It refuses while a recording is active on the session. Phase 3's
  engine mismatch, `name`, and whole-browser-close FAILs became working behavior.
  Unopened references on non-goTo steps FAIL, pointing at goTo. `runOn.browsers`
  is reinterpreted as the default surface, with the matrix caveat documented.
  It's still only the installed browser drivers. One same-engine multi-session
  recording caveat: ffmpeg window capture can't disambiguate two same-engine
  sessions' identically-titled windows. Record before opening a same-engine twin,
  or use the browser MediaRecorder engine, which is per-session.

### Block C: additions

- **Phase 5, native app surfaces, on a new lazy-installed driver.** This adds
  `startSurface {app, args, workingDirectory}`, which subsumes `openApp`, plus app
  `window` selectors. It goes through a lazily-installed native Appium driver,
  mac2 or windows, with a graceful skip when absent. It adds the
  `context_v3.requires` gate, so app and CLI tests SKIP cleanly. It's **expanded
  into its own phased roadmap** in [native app surfaces](native-app-surfaces.md).
  Those are phases A1–A8: Windows → macOS → emulated Android → emulated iOS →
  mobile browsers → mobile vocabulary → app recording → a Linux spike. That doc
  also pulls `startSurface`'s app branch forward into its first phase. It adds
  `android` and `ios` to `runOn.platforms`, with `hosts` and `device` context
  fields, as the mobile environment model.
- **Phase 6, convergence and ergonomics.** ✅ **Shipped (ADR 01039).** This adds
  the generic `startSurface`, including the parallel array form for browser and
  process. It has three key-discriminated descriptor branches plus an array.
  Browser and process lanes run parallel, while app sessions run serial with
  device boots pre-acquired in parallel. There's an allSettled roll-up, ordered
  FAIL over SKIPPED over PASS, with `outputs.surfaces`, and authored-order
  activation. `closeSurface` already closed browser and app surfaces, from Phases
  1 and 4 plus A1. **Deviation:** there's no shared `browserConfig` factoring. The
  `window` to `size` rename applies ONLY inside the new startSurface browser
  descriptor. Per decision, `context_v3` keeps `browser.window`, with no
  deprecated alias. The browser descriptor also adds `viewport` and
  `driverOptions`. `closeSurface` itself ships in Phase 1. The `startSurface` step
  and its app branch shipped first in
  [native app surfaces](native-app-surfaces.md) phase A1. Phase 6 then added the
  remaining kind branches and the array form.

Phase 1 is fully specified in the companion plan file; later phases reuse the
schema and registry it establishes.
