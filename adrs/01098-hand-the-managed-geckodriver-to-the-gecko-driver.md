---
status: accepted
date: 2026-09-04
decision-makers: doc-detective maintainers
---

# Hand the managed geckodriver to the Gecko driver instead of relying on PATH

## Context and Problem Statement

Firefox contexts could not start in the official Linux container image. With geckodriver correctly
installed (that is a separate defect, fixed in
[ADR 01097](01097-resolve-the-version-suffixed-geckodriver-binary.md)), a Firefox context still
failed and fell back:

```text
WebDriverError: geckodriver binary cannot be found in PATH
firefox unavailable; ran on chrome
```

`appium-geckodriver` resolves its binary from exactly two places
(`build/lib/gecko.js`, `resolveGeckodriverBinary`): the `geckodriverExecutable` capability, or
`fs.which('geckodriver')`. Doc Detective set neither. Chrome has always passed
`"appium:executable": chromium.driver`, and `getAvailableApps` builds the chrome descriptor with a
`driver` field. The Firefox descriptor carried only `{ name, version, path }`, so
`getDriverCapabilities` had nothing to pass even though `resolveGeckodriverBinaryPath` had already
resolved the binary for the Layer 2 functional gate.

Two properties of the managed install make PATH a non-answer: the binary lives in Doc Detective's
browsers cache (not on PATH), and since geckodriver v6 it is named `geckodriver-<version>`, so even
adding that directory to PATH would not satisfy `which geckodriver`.

Why this stayed invisible: GitHub-hosted runners ship a system geckodriver on PATH, and the
feature-fixture suite defaults to Firefox headless contexts
([test/core-artifacts/config.groups.json](../test/core-artifacts/config.groups.json)). CI has
therefore been exercising the *system* driver all along, never the managed one. Worse, the fixture
suite could not have caught the container failure even if it ran there: no fixture asserted which
engine actually carried a context, so a Firefox context that degraded to Chrome still reported PASS.

## Decision Drivers

* The container image must be able to drive Firefox. On `linux/arm64` it is the only browser
  available, since ChromeDriver has no native upstream build there.
* A managed install should be *used*, not shadowed by whatever happens to be on PATH; pinning the
  binary also makes runs reproducible across machines.
* Any Appium insecure-feature opt-in must be as narrow as the mechanism allows.
* Degradation must stay graceful: when no binary can be resolved, the session should still try
  whatever geckodriver exists rather than hard-failing.
* CI must stop silently substituting Chrome for a broken Firefox.

## Considered Options

* **A. Pass the resolved path as `appium:geckodriverExecutable`, with a feature-scoped
  `--allow-insecure` on the desktop pool's servers.**
* **B. Prepend the browsers cache dir to `PATH` and place a `geckodriver`-named link or copy there.**
* **C. Leave it, and keep documenting the manual `PATH` workaround.**

## Decision Outcome

Chosen option: **A**.

* [src/core/config.ts](../src/core/config.ts): the Firefox app descriptor now carries
  `driver: <resolved geckodriver>` in both builders (`getAvailableApps` and `patchAppCache`),
  mirroring chrome. The field is omitted, not set to `undefined`, when no path resolved.
* [src/core/tests.ts](../src/core/tests.ts): `getDriverCapabilities`' firefox case emits
  `"appium:geckodriverExecutable": firefox.driver` when present, and omits it otherwise so the
  session falls back to the PATH lookup exactly as before.
* [src/core/tests/geckoDriver.ts](../src/core/tests/geckoDriver.ts): a new
  `GECKODRIVER_EXECUTABLE_ARGS` constant, passed to every desktop-pool Appium server, plus
  `PROTECTED_CAPABILITIES` / `applyDriverOptions`, which keep an authored `driverOptions` from
  overriding the capability the opt-in unlocks.

### The scope of `--allow-insecure`, in three dimensions

**Feature scope.** `--allow-insecure <feature>`, never `--relaxed-security` (which enables every
insecure feature of every driver). This matches the existing precedent for the mobile chromedriver
autodownload (`CHROMEDRIVER_AUTODOWNLOAD_ARGS`).

**Driver scope, and a surprise.** The obvious spelling is
`gecko:custom_geckodriver_executable`, which is what appium-geckodriver's own source comment
documents. **It does not work.** `isFeatureEnabled` (`@appium/base-driver`,
`basedriver/core.js`) matches the scope against `this.opts.automationName`, but its only caller for
this feature, geckodriver's `validateDesiredCaps`, runs from `BaseDriver.createSession` *before*
`this.opts` is assigned (`basedriver/driver.js`: `validateDesiredCaps(caps)` at line 274,
`this.opts = {...}` at line 279). The automation name is still undefined at that point, so `gecko:`
compares against `"undefined"` and never matches. Confirmed empirically against the real image by
driving both spellings through a raw session POST:

| `--allow-insecure` value | Result |
|---|---|
| `gecko:custom_geckodriver_executable` | `session not created: … requires the 'custom_geckodriver_executable' insecure feature to be enabled` |
| `*:custom_geckodriver_executable` | session created |

So the wildcard driver scope is used. What `*` widens is the **driver** scope, not the feature: the
granted feature is still `custom_geckodriver_executable`, and `appium-geckodriver` is the only
package that defines or consults that name (verified against every driver the image installs:
safari, xcuitest, gecko, chromium). The effective permission is therefore exactly what `gecko:` was
meant to express: one driver, one capability.

**Run scope.** The flag goes on *every* desktop-pool server, not only runs that authored a Firefox
context. The pool's servers are shared across contexts, and `buildFallbackCandidates` can route a
chrome-authored context to Firefox mid-run under the default `browserFallback: "auto"`. Gating the
flag on the run's authored browsers would leave the capability illegal exactly when the fallback
needs it, converting today's soft PATH fallback into a hard `SessionNotCreatedError`. Passing it
unconditionally keeps the capability and the server permission consistent by construction. The
servers are run-owned, bound to `127.0.0.1`, and every session request on them originates from Doc
Detective itself, so the residual surface is a driver accepting a filesystem path this process
already chose.

### The capability must not be author-overridable

Opting the server in to the insecure feature has a consequence that is easy to miss, and review
caught it: `driverOptions` is a documented escape hatch on a `startSurface` browser descriptor,
declared in the schema as an open object and merged into the computed capabilities **last**
(`Object.assign(caps, overrides.driverOptions)`). Before the opt-in existed, an authored
`appium:geckodriverExecutable` was harmless, because Appium rejected the session outright. With the opt-in,
that same authored value would be honoured, and Appium would spawn whatever binary the spec named.
Specs are read from documentation, which is not necessarily trusted input, so this would have
converted a narrow permission into arbitrary local-binary execution.

`PROTECTED_CAPABILITIES` (in [geckoDriver.ts](../src/core/tests/geckoDriver.ts)) therefore lists the
capabilities an authored `driverOptions` may never set, and `applyDriverOptions` drops them with a
warning instead of merging. A protected key is dropped, never substituted: when nothing computed a
value the capability stays absent rather than taking the authored one. Only
insecure-feature-gated capabilities belong on that list. Every ordinary override keeps working,
which is what the escape hatch is for. This restores exactly the pre-change boundary.

Note that chrome's `appium:executable` is *not* on the list. It is author-settable today and was
before this change: the Chromium driver accepts it without an insecure-feature opt-in, so it is
pre-existing behaviour of the documented escape hatch rather than something this change introduces.
Narrowing it is a separate decision.

### Consequences

* Good: Firefox works in the official image on `linux/amd64` and `linux/arm64`, with no geckodriver
  on PATH. The documented arm64 alternative to emulation is true again.
* Good: every environment now uses the geckodriver Doc Detective installed rather than an ambient
  one, so a run is reproducible and CI stops testing a driver the product does not manage.
* Good: the failure mode when no binary resolves is unchanged (PATH lookup, then cross-browser
  fallback). This adds a capability, it does not remove a fallback.
* Neutral: desktop-pool Appium servers now carry one insecure-feature opt-in. Scoped as above, and
  the capability it unlocks is not author-overridable.
* Neutral: an authored `driverOptions.appium:geckodriverExecutable` is now dropped with a warning
  rather than merged. Nothing could have relied on it, because before this change Appium rejected the
  session it produced.
* Bad: the wildcard driver scope reads broader than it is, and would become genuinely broader if a
  future Appium driver adopted the same feature name. The constant carries the reasoning and the
  test asserts the exact value, so a change is a deliberate edit rather than a drift.
* Bad (narrow): on a machine with *both* a managed geckodriver and a system one, sessions now use
  the managed binary. If it passes the Layer 2 `--version` check but can't actually drive the
  installed Firefox, a system geckodriver that previously rescued the run silently no longer does.
  That is the intended trade, since an ambient rescue is exactly the ambiguity this removes, and the
  cross-browser fallback still carries the context.

### Confirmation

* Red→green unit tests: `getDriverCapabilities` sets the capability from `app.driver` and omits it
  when absent; `applyDriverOptions` drops an authored `appium:geckodriverExecutable` (leaving the
  computed one, or leaving the capability absent when there was none), warns naming the refused key,
  and still merges every other authored capability
  ([test/context-resolution.test.js](../test/context-resolution.test.js)); the Firefox
  app carries / omits `driver` through `patchAppCache`
  ([test/config-coverage.test.js](../test/config-coverage.test.js)); and
  `GECKODRIVER_EXECUTABLE_ARGS` is asserted verbatim, including the wildcard scope, since a wrong
  value fails no startup check and only surfaces as a dead session later.
* Feature fixture
  [test/core-artifacts/guards/firefox-managed-geckodriver.spec.json](../test/core-artifacts/guards/firefox-managed-geckodriver.spec.json)
  asserts the live `navigator.userAgent` carries `Firefox/<version>`, so a cross-browser fallback
  FAILs instead of passing quietly. It closes the blind spot described above and needs no
  fixtures.yml change (`guards/` is already in the `web-plumbing` bundle). Verified in both
  directions against the real image: **FAIL** on the unfixed image (`firefox unavailable; ran on
  chrome` → the UA assertion fails), **PASS** on the fixed one.
* End-to-end in the real image on both architectures, with `command -v geckodriver` confirmed empty
  so only the capability can be supplying the binary: context PASS on
  `{"name":"firefox","headless":true}`, `fallback: null`, and the UA assertion passing.

## Pros and Cons of the Options

### A. `appium:geckodriverExecutable` + a feature-scoped `--allow-insecure`

* Good: uses the mechanism appium-geckodriver provides for exactly this purpose.
* Good: pins the managed binary by absolute path, with no dependence on PATH ordering, filename, or an
  ambient install.
* Good: mirrors the chrome path (`appium:executable`), so the two engines stay symmetric.
* Bad: requires an insecure-feature opt-in on the server.
* Bad: the working spelling contradicts upstream's documented one, which needs explaining (done
  above, and in the constant).

### B. Prepend the cache dir to PATH with a `geckodriver`-named link

* Good: no insecure feature; works with an unmodified driver.
* Bad: the cached file is `geckodriver-<version>`, so a bare PATH entry is not enough. It needs a
  link or copy per version, which is new install-time state to create, refresh, and clean up.
* Bad: symlinks need elevation or Developer Mode on Windows, so it degrades to copying a ~6 MB
  binary per version.
* Bad: mutating PATH for the Appium child process is a blunt instrument that changes resolution for
  everything else the driver shells out to.
* Bad: still implicit, because resolution depends on PATH ordering against any system geckodriver, which is
  the ambiguity this change exists to remove.

### C. Leave it; document the workaround

* Good: no code change.
* Bad: Firefox stays unusable out of the box in the image, on the architecture where it is the only
  option.
* Bad: pushes a `--entrypoint bash` incantation onto every container user.
* Bad: leaves CI silently exercising a driver Doc Detective does not manage.
