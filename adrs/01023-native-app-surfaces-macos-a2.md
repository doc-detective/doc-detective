---
status: accepted
date: 2026-07-03
decision-makers: doc-detective maintainers
---

# Native app surfaces on macOS via Mac2 (phase A2)

## Context and Problem Statement

Phase A1 (ADR 01021) shipped native **Windows** app automation behind `startSurface`, with the
schema deliberately shaped so later platforms are additive. Phase A2 of
[docs/design/native-app-surfaces.md](../docs/design/native-app-surfaces.md) is **macOS desktop**. It
covers launch by bundle ID or `.app` path, the AX semantic-mapping column, `args` and `env` launch
options, and a TCC Accessibility preflight. Three questions follow. How do we port the A1 foundation
without disturbing its behavior? Which driver capabilities should the locked descriptor map onto?
And how do we get *real* macOS coverage in CI, rather than skip-everything, from a project developed
largely on non-macOS machines?

## Decision Drivers

* **No schema changes.** A1 locked the descriptor; A2 must be runtime + fixtures + CI only.
* **A1 behavior byte-stable.** Windows message text and capability mapping are asserted by
  existing tests and must not drift during the refactor.
* **Environment gaps gate with SKIP, never FAIL.** That's the same semantics as `requires`
  (ADR 01020) and A1's driver preflight. On macOS the new gap is the Accessibility TCC permission.
* **Honest CI**: the fixture gate accepts PASS or SKIPPED, so a macOS lane whose fixtures all
  SKIP would read as green while exercising nothing. A2's macOS code paths must actually run.
* Later phases, A3 Android and A4 iOS, will add more platform columns. The seam A2 cuts is the
  template.

## Considered Options

* **Per-platform driver table in `appSurface.ts`** (package, capabilities builder, locator
  column, unsupported-field rules per platform), Mac2 as the macOS row.
* **Parallel `macAppSurface.ts` module** mirroring the A1 file.
* **Branch `if (platform === …)` inline at each call site** (no table).

For CI: **require ≥1 real PASS on capable legs** vs. **accept all-SKIPPED as green** (the design
doc's original expectation for hosted macOS runners).

## Decision Outcome

Chosen option: **per-platform driver table with Mac2, and a required-PASS gate on the capable
apps legs**. Key mechanics:

* **The adapter seam is a table**, `APP_DRIVER_PLATFORMS` in
  [src/core/tests/appSurface.ts](../src/core/tests/appSurface.ts). Each platform row carries four
  things. The driver package, `appium-novawindows-driver` or `appium-mac2-driver`. A capabilities
  builder. The semantic-locator column, `buildUiaLocator` or `buildAxLocator`. And the descriptor
  fields the driver can't honor. Preflight, manifest invalidation, `startAppSurface`, and locator building
  all read the table. Surfaces record their platform, so actions compile locators against the
  right column. Driver choice stays behind the seam, with no `automationName` in user schema.
* **Capability mapping for Mac2.** Reverse-DNS identifiers map to `appium:bundleId`, and paths to
  `appium:appPath`, reusing A1's syntax-only `classifyAppIdentifier`. `args` maps to
  `appium:arguments` as a **real array**. NovaWindows joins a shell-style string instead, and the
  per-platform difference is documented in the schema description. `env` maps to
  `appium:environment`, newly supported, and still FAILs with guidance on Windows.
  `appium:serverStartupTimeout` is max(descriptor `timeout`, 120s), because the first-ever session
  builds WebDriverAgentMac through xcodebuild, which takes minutes on a cold runner.
* **`workingDirectory` FAILs with guidance on macOS**, since LaunchServices offers no cwd control.
  That mirrors A1's treatment of `env` on Windows. The schema's injected default of `"."` is
  tolerated, so only authored values trip the guard. Reserved fields keep failing with the roadmap
  named. Those are `device`, `install`, and `activity`.
* **AX locator column.** `elementId` and `elementTestId` map to the accessibility id, an
  AXIdentifier fast path. `elementText` maps to an XPath matching `@title` **or** `@label` **or**
  `@value`. That's a deliberate deviation from the design table's pure-AXTitle column. macOS
  controls split their visible text across three Mac2 XML view attributes. Those are `title` for
  buttons, `label` for static text, and `value` for text views and value displays, CI-verified
  against TextEdit and Calculator. `elementAria`'s accessible-*name* matching stays title and label,
  since a name is not a value. `elementAria` `{ role, name }` maps to an `XCUIElementType<Role>` tag
  plus a title-or-label predicate, with unknown roles passing through capitalized. Note that the
  `elementAria` **object** form is not yet schema-reachable. The schema accepts the accessible-name
  string form only, an A1-era boundary rather than something new to A2. The role mapping is
  unit-tested, and lights up when the interaction vocabulary phase opens the object form. Fixtures
  use the string form.
* **TCC preflight.** It probes `AXIsProcessTrusted` through JXA, with `osascript -l JavaScript`. A
  definitive-denied verdict SKIPs the context, carrying the System Settings → Privacy & Security →
  Accessibility walkthrough. An inconclusive verdict proceeds. The probe reports on the probing
  process's TCC attribution, which approximates but does not guarantee WebDriverAgentMac's.
  Accessibility-shaped session-start errors append the same walkthrough as the backstop.
  `AXIsProcessTrusted` is a C function, so the JXA script must register it with
  `ObjC.bindFunction('AXIsProcessTrusted', ['bool', []])` before calling it. `ObjC.import` alone
  does not expose C functions. An unbound call collapses every verdict to inconclusive, silently
  making the denied-to-SKIP path unreachable. A darwin-gated unit test calls the real probe and
  asserts a definitive boolean, rather than the deps-injected stub, to guard the bind.
* **CI runs macOS for real.** GitHub's macOS runner images pre-grant `kTCCServiceAccessibility` to
  three processes in the system TCC.db, per runner-images `configure-tccdb-macos.sh`. Those are
  `com.apple.dt.Xcode-Helper`, the process WebDriverAgentMac runs under, `/usr/bin/osascript`, so
  the probe answers truthfully, and `/bin/bash`. So no grant step is needed, and the design doc's
  "expected to SKIP on hosted runners" is **superseded** for macOS apps. To keep it honest,
  [scripts/check-fixture-results.cjs](../scripts/check-fixture-results.cjs) gains opt-in
  `DD_FIXTURES_REQUIRE_PASS=1`, set on the apps×windows and apps×macos legs. An all-SKIPPED run
  there fails the job, instead of reading as green. A permanent
  [fixtures-debug.yml](../.github/workflows/fixtures-debug.yml) `workflow_dispatch` runs one
  (group × OS) leg, for iterating on platform-specific fixtures from a different-platform dev box.

### Consequences

* Good, because three permutations run, and must PASS, on hosted macos-latest. Those are TextEdit
  with a bundle ID and args-opens-file, Calculator with an `.app` path and AX-name clicks, and env.
  Windows A1 fixtures and unit tests stay green, and unsupported platforms SKIP naming both
  supported ones.
* Good, because A3 and A4 add platforms by adding table rows, plus their preflight probes. A row is
  a package, caps builder, locator column, and unsupported fields. The seam is now demonstrated
  twice.
* Bad, because the required-PASS gate couples the apps×macos leg to GitHub's image provisioning. If
  a future image drops the Xcode-Helper TCC pre-grant, the leg fails loudly, with skip reasons in
  the artifact. It then needs a grant step or a gate downgrade. That was chosen over silently
  losing all macOS coverage.
* Bad, because `elementText` matching title, label, or value can over-match when several elements
  share a string. The escape hatch covers precision needs, through a `//…` XPath or a `~…`
  accessibility id. That's the same trade-off as A1's star-matched `@Name`. Control names that are
  words rather than symbols also route to the escape hatch, as Calculator's `+` is "Add".
* Neutral: the mac2 driver JIT-installs like every heavy dep (`ddRuntimeDependencies`,
  `^4.0.3`); a stale Appium manifest is now invalidated per-driver rather than
  novawindows-hard-coded.

### Confirmation

* Hermetic unit tests in [test/app-surface.test.js](../test/app-surface.test.js) cover the platform
  table and the AX locator column, including the role map and quote escaping. They also cover Mac2
  capability mapping, TCC probe branches, per-platform unsupported fields, and Windows regression
  assertions.
  [test/app-actions-coverage.test.js](../test/app-actions-coverage.test.js) checks that mac surfaces
  get AX locators through `findElement` and `typeKeys`.
* End-to-end, [test/core-artifacts/apps/app-surfaces-macos.spec.json](../test/core-artifacts/apps/app-surfaces-macos.spec.json)
  runs on the apps×macos-latest fixture leg with `DD_FIXTURES_REQUIRE_PASS=1`. The A1 charmap flow
  is unchanged on apps×windows, and `app-preflight-skip` is narrowed to Linux.

## Pros and Cons of the Options

### Per-platform driver table (chosen)

* Good, because one seam holds every per-platform fact: driver, caps, locators, and unsupported
  fields. Adding A3 and A4 is additive rows, and nothing platform-specific leaks to call sites
  beyond the entry's `platform` tag.
* Good, because A1 behavior moves verbatim into the windows row. The regression surface is minimal,
  and covered by existing tests.
* Bad, because the table couples loosely-related concerns (locators + caps + guidance strings)
  in one structure; acceptable at two rows, revisit if rows grow methods.

### Parallel macAppSurface.ts module

* Good, because zero risk to the A1 file.
* Bad, because it duplicates the session/registry/preflight machinery that is deliberately
  platform-agnostic, and the duplication compounds each phase.

### Inline platform branches

* Good, because no new structure.
* Bad, because platform facts scatter across preflight, start, locator, and error-message sites.
  That's exactly what made the A1 file Windows-hard-coded.

### Accept all-SKIPPED macOS CI (rejected for the gate)

* Good, because zero coupling to runner-image provisioning.
* Bad, because the macOS code path would ship unexercised. A fixture lane that can silently stop
  testing anything is what the zero-spec check exists to prevent. This is the same failure mode one
  level up.
