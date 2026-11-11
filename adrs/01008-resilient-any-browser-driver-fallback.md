---
status: accepted
date: 2026-06-29
decision-makers: doc-detective maintainers
---

# Validate browser drivers by execution and fall back across browsers

## Context and Problem Statement

A user on Windows reported that `geckodriver` sometimes **partially downloads**: the binary exists on
disk but does not run (it returns no version). Every gate in the runner trusts a driver's *presence*
rather than its *function*. So the broken binary launders itself into a "valid" state.
`ensureGeckodriver` records it, even as `installedVersion: "unknown"`. `getAvailableApps` reports
Firefox available from an `appium driver list` regex plus the on-disk binary. `isSupportedContext`
passes, and `driverStart` finally invokes the broken binary and throws. The headed→headless retry
attempts both fail. The context is marked **SKIPPED**, and the `platform::firefox` combination is
memoized as failed. Every other Firefox context then skips silently, with only a generic driver
error. The user's Firefox coverage disappears with no actionable signal.

Geckodriver is only the instance that surfaced. The defect is general. Any driver can be
present-but-broken, whether chromedriver, geckodriver, or safaridriver. And the runner has **no
functional validation of a driver** and **no cross-engine fallback**. The only existing fallback is
headed→headless within the same engine. How do we make a defective driver degrade gracefully to
another available browser, instead of silently dropping coverage? It must also preserve the user's
specified testing experience.

## Decision Drivers

* Resilience: a broken or unavailable driver must not silently erase a test. The run should fall
  back to another available browser where possible.
* Generality: the fix must be driver-agnostic across chrome, firefox, and safari or webkit, not a
  geckodriver special case. It falls back from any requested browser to any other available browser.
* Honesty: a substitution must never be reported as a clean success when the author pinned a
  specific engine. An unrecoverable case must produce an actionable, not generic, skip.
* Backward compatibility: the default-browser path and existing report shapes and verdicts must not
  regress. The new behavior must be configurable, and default to the most resilient mode.
* Testability: the decision logic must be unit-testable without spinning up real drivers (a partial
  download can't be deterministically reproduced in CI).

## Considered Options

* **A. Validate drivers by execution, plus policy-gated any→any cross-browser fallback** (chosen).
  It has five layers:
  1. install-time validation with one re-download,
  2. a functional availability probe,
  3. a self-heal repair on the on-demand path,
  4. a runtime cross-engine fallback loop, and
  5. graded reporting.
* **B. Validate at install time only.** Catch the partial download when `ensureGeckodriver` runs and
  re-download once; no cross-engine fallback.
* **C. Cross-engine fallback only.** Leave detection presence-based; catch the failure at
  `driverStart` and fall back to another engine.

## Decision Outcome

Chosen option: **A**. B alone doesn't help an *already-cached* broken driver whose freshness
fast-path skips re-download. It never preserves coverage when a browser is genuinely unavailable.
C alone wastes a doomed session attempt on every context. It also can't distinguish a broken driver
from a missing one in its skip message. A composes both, with self-heal and honest reporting. A
defect is caught as early as possible, and when it slips through, the run still completes on another
engine with a truthful verdict.

A new config key `browserFallback: "auto" | "explicit" | "off"` (default `"auto"`) governs the
fallback, flowing through `config_v3` and the `--browser-fallback` CLI flag like every other knob
(schema → AJV validate → CLI override → runtime). `auto` falls back for both auto-selected and
explicitly pinned browsers. `explicit` falls back only for auto-selected browsers. And `off` never
falls back across browsers, though validation and diagnostic skips still apply.

The same key may also be set **per context** on a `runOn` entry (`context_v3`). A context-level value
overrides the config-level policy for the contexts that entry expands into. Precedence resolves as
`context.browserFallback ?? config.browserFallback ?? "auto"`, through
`resolveBrowserFallbackPolicy`. This lets a run default to `auto` while pinning a single
context, such as a Safari-only context, to `off`.

### The five layers

1. **Install-time validation** (`src/runtime/browsers.ts`). After download, `verifyDriverBinary`
   executes the driver (`--version`) and parses a version. A binary that runs but reports nothing is
   treated as broken, which is the partial-download symptom. On failure the artifact is quarantined
   and re-downloaded exactly once. A second failure throws rather than recording `"unknown"`. This
   applies to geckodriver and chromedriver through a driver→version-command table.
2. **Functional availability probe** (`src/core/config.ts`). `getAvailableApps` gates each browser on
   its driver executing (via `verifyAppDrivers`), not just on presence in `installed.json` /
   `appium driver list`. A browser whose driver can't be located cheaply passes through to the
   runtime fallback rather than erroring.
3. **Self-heal repair** (`src/core/tests.ts`). When a context's browser is unavailable, the on-demand
   install path repairs it. `ensureContextBrowserInstalled({ repair: true })` force-reinstalls
   *every* required component, the browser binary **and** its driver. So a partial or corrupt
   component of either kind is replaced and re-validated, rather than just installed-if-missing.
   That covers a missing component and an incorrectly installed one. Repair only fires when something
   is already wrong. Re-downloading a healthy component is an acceptable cost for a guaranteed-clean
   state.
   Repair is attempted at two points, so it always precedes a fallback. Those are (a) when Layer 2
   *excluded* the requested browser, and (b) when the requested browser was offered but its *session*
   failed to start. `shouldRepairBeforeFallback` gates a one-time repair-and-retry of the requested
   engine before the loop substitutes another browser. So a present-but-broken driver that Layer 2
   couldn't pre-validate doesn't cause an unnecessary fallback.
4. **Cross-engine fallback** (`src/core/tests.ts`). `buildFallbackCandidates` produces the ordered
   list of engines to attempt. That's the requested one first, then every other available engine
   when policy permits, with `webkit` normalized to `safari`. `runContext` tries each
   headed→headless, repairing the requested engine once on a start failure, per Layer 3. The first
   success wins, and the per-combination warm-up memo is reused so a known-bad engine isn't retried.
5. **Graded reporting** (`src/core/tests.ts`). Running on a fallback engine annotates the context
   (`requested unavailable; ran on <engine>`). An auto-selected browser keeps **PASS**; an explicitly
   pinned browser that was substituted is downgraded **PASS → WARNING**. When no engine starts, the
   context is **SKIPPED** with a diagnostic that names the requested engine and the partial-download
   cause.

An internal, schema-documented `browser.explicit` flag carries author-pinned versus auto-selected.
It is set during context resolution in `resolveTests.ts`, so layers 4–5 can apply the PASS/WARNING
rule.

### Consequences

* Good: a partially downloaded geckodriver, or any broken driver, no longer silently skips coverage.
  It self-heals, falls back to another browser, or fails with an actionable message.
* Good: the fallback is symmetric and general (chrome↔firefox↔safari), configurable, and defaults to
  the most resilient behavior.
* Good: the decision primitives are pure and unit-tested; no real driver is needed to cover the
  policy matrix.
* Neutral/!: a context can now report **WARNING** where it previously reported **SKIPPED** (pinned
  engine substituted) or **PASS** on a different engine than requested (auto-selected). This is the
  intended honesty trade-off and is opt-out via `browserFallback: "off"`.
* Cost: the availability probe executes each driver once per run (cached per `browsersDir`); a
  negligible startup cost that buys functional certainty.

### Confirmation

* Unit tests cover `verifyDriverBinary` (good/exit-nonzero/no-version/unspawnable), and the
  geckodriver validation, single re-download, and throw-on-broken flow. They also cover
  `verifyAppDrivers` (independent per-app gating), `buildFallbackCandidates` (requested-first, both
  directions, safari as source/target, each policy), `driverSkipDiagnostic`, and
  `ensureContextBrowserInstalled({ repair })`.
* Schema/flag tests: `browserFallback` positive/negative + default in `validate.test.js` (both
  `config_v3` and the per-context `context_v3`); yargs parse and `setConfig` override (including
  invalid-value drop) in `utils.test.js`; `resolveBrowserFallbackPolicy` precedence (context > config
  > default) unit-tested, plus an end-to-end test that a context-level `off` overrides a config that
  would otherwise fall back.
* A partial download can't be deterministically reproduced end-to-end in CI. So the runner-level
  fallback verdicts are covered by the unit layer above, rather than by a `*.spec.json` fixture that
  breaks a driver.

## Pros and Cons of the Options

### A. Validate by execution + any→any fallback (chosen)

* Good: catches the defect at install, probe, and runtime; preserves coverage; honest verdicts.
* Good: general and configurable; default is most resilient.
* Bad: largest surface (five layers, one config key, one internal field).

### B. Install-time validation only

* Good: smallest change; fixes fresh installs at the source.
* Bad: doesn't help an already-cached broken driver (freshness fast-path skips re-download); never
  preserves coverage when a browser is unavailable.

### C. Cross-engine fallback only

* Good: preserves coverage on a broken driver.
* Bad: wastes a doomed session attempt per context; can't distinguish broken-vs-missing in the skip
  message; leaves a broken driver recorded as "valid".
