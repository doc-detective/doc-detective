---
status: accepted
date: 2025-03-12
decision-makers: doc-detective maintainers
---

# v3 runner adoption

## Context and Problem Statement

The schema side had landed the v3 action-as-key redesign (`00096`), `context_v3`/browsers (`00098`), and `config_v3` (`00099`), but the runner still spoke v2: it dispatched on an `action` field, read `id`, validated against v2 schemas, and resolved contexts from per-browser keys. To make v3 real end-to-end the runner had to be rewritten to validate against the v3 schemas, dispatch on the **object key** (`step.<action>`), resolve contexts from `runOn`, report under `stepId`, and reimplement the find/click/httpRequest/record handlers against their new shapes — including regex element matching. How should the runner adopt v3 across config, context resolution, reporting, and every action handler?

## Decision Drivers

* The runner must validate `config_v3` and the v3 step/context schemas, not v2.
* Action dispatch must key off the action object key, matching `step_v3`.
* Contexts must be derived from `config.runOn` (platform × browser), with Safari→webkit.
* Reports must use `stepId`; an unknown action must FAIL rather than silently pass.
* find/click/httpRequest/record handlers must implement the v3 shapes (string/object shorthand, regex matching, nested request/response).

## Considered Options

* **A. Full runner rewrite to the v3 contracts: v3 validation, object-keyed dispatch, resolveContexts/runOn, stepId reporting, rewritten action handlers** (chosen).
* **B. Translate v3 back to v2 at runtime and keep the v2 runner.**
* **C. Run a v2 and a v3 runner side by side, branching per spec version.**

## Decision Outcome

Chosen option: **A**. The runner adopts v3 across the board. The work spanned many commits and PR #105:

1. **Config + entrypoint** (`3ef45157`, `a44e89e`, `eee1170`, `84602e5`, `1f6a497`, `543e54f`, `e0632163`): `validate({ schemaKey: "config_v3" })`, support `beforeAny`/`afterAll`, drop the legacy `runTests` block; rename `setVariables`→`loadVariables`; split env helpers `loadEnvs`/`replaceEnvs`; config key `envVariables`→`loadVariables`.
2. **Driver actions + context resolution** (`a0f4915`, `3710089`, `8ce90ab`, `8c533f4`, `bde92de`): `driverActions` redefined to the v3 action-as-key set; appium-required tests keyed by `step[action]`; default contexts from `config.runOn`; `resolveContexts` expands `runOn` into platform×browser; Safari→webkit; `goTo`/`wait` to v3.
3. **Reporting + dispatch** (`8c17e59`, `97a043c`, `fdea584`, `02a6df6`, `3a44c981`, `25e3fb81`, `b430e99d`, `98965be1`, `d00d08cb`, `94a887a7`, `f168ba61`, `535fa08a`): object-arg `getDriverCapabilities`/`isDriverRequired` over a flattened context; viewport from `context.browser.viewport`; step key `id`→`stepId`; report objects rebuilt fresh; **unknown action → FAIL**; handlers dispatch on `step.<action>` with destructured `{config, step, driver}`, `step_v3` validation, string/bool shorthand; per-step `variables` flow outputs→`process.env`; `goTo` string shorthand + protocol/origin; `checkLink` default `statusCodes` `[200,301,302,307,308]`.
4. **httpRequest v3** (`8692728a`, `15273ef2`, `eaaf14ab`, `30774eb3`): nested `request.{params,headers,body}` & `response.{headers,body}`; `actualResponse`; body type-match; lowercased headers; `maxVariation` as a fraction; mock via `openApi.mockResponse`; `allowAdditionalFields` default true; `isRelativeUrl()` — a relative URL with no origin FAILs.
5. **find/click overhaul** (`32b5ce9e`, `d1a1efb1`, `b4c43c9d`, `79ecdf1e`): `find` string shorthand (selector-or-text probe), combined selector+text match, defaults (timeout 5000, moveTo/click/type false), find-level `setVariables` removed, nested sub-steps, `outputs.element`; `moveTo` ungated from recording; crop delegates to `findElement`; a new standalone `click` action.
6. **record v3** (`68198f21`, `b7e1853d`, `3a44c981`): `startRecording`/`stopRecording` → `step.record` object; headless check from `context.browser.headless`; engine gated to Chrome; download → `os.tmpdir`; auto-stop injects a synthetic `stopRecord`; key `recording`→`record`.
7. **Regex matching** (`cdf7dfe9`): `find`/`click` treat a `/…/`-delimited value as a regex via `findElementByRegex` (scans all elements, `foundBy:"regex"`); the text filter accepts a regex.
8. **Finding rewrite** (`57ddd517`, `e78bdd43`, `347d0ce2`): strategies extracted to `findStrategies.js` (breaks a circular dep); `click` handles string/object/absent; helpers return `{element:null, foundBy:null}`; honor a test-level `detectSteps:false` short-circuit.

### Consequences

* Good: v3 works end-to-end — config, contexts, dispatch, reporting, and every handler speak the action-as-key model.
* Good: `runOn`-driven `resolveContexts` makes platform×browser expansion declarative; Safari→webkit is consistent with the schema.
* Good: unknown actions FAIL loudly instead of passing silently; reports key on `stepId`.
* Good: find/click gain string/object shorthand and regex matching; httpRequest gains nested request/response with mock support.
* Bad: a large, breaking rewrite touching nearly every runner module at once.
* Neutral: relative-URL-without-origin now FAILs by design, a behavior change from the v2 leniency.

### Confirmation

Shipped across the core commits listed above and common PR #105 (`33aa165`, `7dced13`, `e4f1bcf`). Verified by the core test suite running v3 specs and fixtures end-to-end.

## Pros and Cons of the Options

### A. Full v3 runner rewrite
* Good: native v3 throughout; one coherent model.
* Bad: large blast radius landed together.

### B. Translate v3→v2 at runtime
* Good: keeps the v2 runner.
* Bad: a permanent shim; v3-only features can't surface.

### C. Side-by-side v2 and v3 runners
* Good: incremental.
* Bad: two runners to maintain; divergence risk.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commits `3ef45157`, `a44e89e`, `eee1170`, `84602e5`, `1f6a497`, `543e54f`, `e0632163`, `a0f4915`, `3710089`, `8ce90ab`, `8c533f4`, `bde92de`, `8c17e59`, `97a043c`, `fdea584`, `02a6df6`, `3a44c981`, `25e3fb81`, `b430e99d`, `98965be1`, `d00d08cb`, `94a887a7`, `f168ba61`, `535fa08a`, `8692728a`, `15273ef2`, `eaaf14ab`, `30774eb3`, `32b5ce9e`, `d1a1efb1`, `b4c43c9d`, `79ecdf1e`, `68198f21`, `b7e1853d`, `cdf7dfe9`, `57ddd517`, `e78bdd43`, `347d0ce2`; common PR #105 (`33aa165`, `7dced13`, `e4f1bcf`). Inventory ref: BACKFILL-INVENTORY.md Seq 144, 147, 148, 149, 150, 152, 153, 158, 163. Related: `00096` (v3 action-as-key schema), `00097` (v2→v3 auto-transform), `00098` (context_v3/browsers), `00099` (config_v3), `00101` (v3 spec/test resolution).
