---
status: accepted
date: 2026-07-03
decision-makers: doc-detective maintainers
---

# Native app surfaces on macOS via Mac2 (phase A2)

## Context and Problem Statement

Phase A1 (ADR 01021) shipped native **Windows** app automation behind `startSurface`, with the
schema deliberately shaped so later platforms are additive. Phase A2 of
[docs/design/native-app-surfaces.md](../docs/design/native-app-surfaces.md) is **macOS desktop**:
launch by bundle ID or `.app` path, the AX semantic-mapping column, `args`/`env` launch options,
and a TCC (Accessibility) preflight. The question is how to port the A1 foundation without
disturbing its behavior, which driver capabilities to map the locked descriptor onto, and how to
get *real* (not skip-everything) macOS coverage in CI from a project developed largely on
non-macOS machines.

## Decision Drivers

* **No schema changes.** A1 locked the descriptor; A2 must be runtime + fixtures + CI only.
* **A1 behavior byte-stable.** Windows message text and capability mapping are asserted by
  existing tests and must not drift during the refactor.
* **Environment gaps gate (SKIP), never FAIL** — same semantics as `requires` (ADR 01020) and
  A1's driver preflight. On macOS the new gap is the Accessibility (TCC) permission.
* **Honest CI**: the fixture gate accepts PASS or SKIPPED, so a macOS lane whose fixtures all
  SKIP would read as green while exercising nothing. A2's macOS code paths must actually run.
* Later phases (A3 Android, A4 iOS) will add more platform columns — the seam A2 cuts is the
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

* **The adapter seam is a table** (`APP_DRIVER_PLATFORMS` in
  [src/core/tests/appSurface.ts](../src/core/tests/appSurface.ts)): per platform, the driver
  package (`appium-novawindows-driver` / `appium-mac2-driver`), a capabilities builder, the
  semantic-locator column (`buildUiaLocator` / `buildAxLocator`), and the descriptor fields the
  driver can't honor. Preflight, manifest invalidation, `startAppSurface`, and locator building
  all read the table; surfaces record their platform so actions compile locators against the
  right column. Driver choice stays behind the seam — no `automationName` in user schema.
* **Capability mapping (Mac2):** reverse-DNS identifiers → `appium:bundleId`, paths →
  `appium:appPath` (reusing A1's syntax-only `classifyAppIdentifier`); `args` →
  `appium:arguments` as a **real array** (NovaWindows joins a shell-style string — the
  per-platform difference is documented in the schema description); `env` →
  `appium:environment` (newly supported; still FAILs with guidance on Windows);
  `appium:serverStartupTimeout` = max(descriptor `timeout`, 120s) because the first-ever session
  builds WebDriverAgentMac via xcodebuild — minutes on a cold runner.
* **`workingDirectory` FAILs with guidance on macOS** (LaunchServices offers no cwd control),
  mirroring A1's treatment of `env` on Windows; the schema's injected default (`"."`) is
  tolerated so only authored values trip the guard. Reserved fields (`device`, `install`,
  `activity`) keep failing with the roadmap named.
* **AX locator column:** `elementId`/`elementTestId` → accessibility id (AXIdentifier fast
  path); `elementText` → XPath matching `@title` **or** `@label` **or** `@value` — a deliberate
  deviation from the design table's pure-AXTitle column, because macOS controls split their
  visible text across the Mac2 XML view's `title` (buttons), `label` (static text), and `value`
  (text views, value displays — CI-verified against TextEdit and Calculator) attributes;
  `elementAria`'s accessible-*name* matching stays title/label (a name is not a value);
  `elementAria` `{ role, name }` → `XCUIElementType<Role>` tag + title/label predicate, with
  unknown roles passing through capitalized. Note: the `elementAria` **object** form is not yet
  schema-reachable (the schema accepts the accessible-name string form only — an A1-era
  boundary, not new to A2); the role mapping is unit-tested and lights up when the interaction
  vocabulary phase opens the object form. Fixtures use the string form.
* **TCC preflight:** probe `AXIsProcessTrusted` through JXA
  (`osascript -l JavaScript`), definitive-denied → context **SKIPPED** carrying the System
  Settings → Privacy & Security → Accessibility walkthrough; inconclusive → proceed (the probe
  reports on the probing process's TCC attribution, which approximates but does not guarantee
  WebDriverAgentMac's). Accessibility-shaped session-start errors append the same walkthrough as
  the backstop.
* **CI runs macOS for real.** GitHub's macOS runner images pre-grant `kTCCServiceAccessibility`
  to `com.apple.dt.Xcode-Helper` (the process WebDriverAgentMac runs under), `/usr/bin/osascript`
  (so the probe answers truthfully), and `/bin/bash` in the system TCC.db
  (runner-images `configure-tccdb-macos.sh`) — so no grant step is needed and the design doc's
  "expected to SKIP on hosted runners" is **superseded** for macOS apps. To keep it honest,
  [scripts/check-fixture-results.cjs](../scripts/check-fixture-results.cjs) gains opt-in
  `DD_FIXTURES_REQUIRE_PASS=1`, set on the apps×windows and apps×macos legs: an all-SKIPPED run
  there fails the job instead of reading as green. A permanent
  [fixtures-debug.yml](../.github/workflows/fixtures-debug.yml) `workflow_dispatch` runs one
  (group × OS) leg for iterating on platform-specific fixtures from a different-platform dev box.

### Consequences

* Good, because the TextEdit (bundle ID + args-opens-file), Calculator (.app path + AX-name
  clicks), and env permutations run — and must PASS — on hosted macos-latest, while Windows A1
  fixtures and unit tests stay green; unsupported platforms SKIP naming both supported ones.
* Good, because A3/A4 add platforms by adding table rows (package, caps builder, locator column,
  unsupported fields) plus their preflight probes — the seam is now demonstrated twice.
* Bad, because the required-PASS gate couples the apps×macos leg to GitHub's image provisioning:
  if a future image drops the Xcode-Helper TCC pre-grant, the leg fails (loudly, with skip
  reasons in the artifact) and needs a grant step or a gate downgrade — chosen over silently
  losing all macOS coverage.
* Bad, because `elementText` matching title-or-label-or-value can over-match when several
  elements share a string; the escape hatch (`//…` XPath, `~…` accessibility id) covers
  precision needs, same trade-off as A1's star-matched `@Name`. Control names that are words
  rather than symbols (Calculator's `+` is "Add") also route to the escape hatch.
* Neutral: the mac2 driver JIT-installs like every heavy dep (`ddRuntimeDependencies`,
  `^4.0.3`); a stale Appium manifest is now invalidated per-driver rather than
  novawindows-hard-coded.

### Confirmation

* Hermetic unit tests in [test/app-surface.test.js](../test/app-surface.test.js) (platform
  table, AX locator column incl. role map and quote escaping, Mac2 capability mapping, TCC
  probe branches, per-platform unsupported fields, Windows regression assertions) and
  [test/app-actions-coverage.test.js](../test/app-actions-coverage.test.js) (mac surfaces get AX
  locators through `findElement`/`typeKeys`).
* End-to-end: [test/core-artifacts/apps/app-surfaces-macos.spec.json](../test/core-artifacts/apps/app-surfaces-macos.spec.json)
  on the apps×macos-latest fixture leg with `DD_FIXTURES_REQUIRE_PASS=1`; the A1 charmap flow
  unchanged on apps×windows; `app-preflight-skip` narrowed to Linux.

## Pros and Cons of the Options

### Per-platform driver table (chosen)

* Good, because one seam holds every per-platform fact (driver, caps, locators, unsupported
  fields) — adding A3/A4 is additive rows, and nothing platform-specific leaks to call sites
  beyond the entry's `platform` tag.
* Good, because A1 behavior moves verbatim into the windows row — regression surface is minimal
  and covered by existing tests.
* Bad, because the table couples loosely-related concerns (locators + caps + guidance strings)
  in one structure; acceptable at two rows, revisit if rows grow methods.

### Parallel macAppSurface.ts module

* Good, because zero risk to the A1 file.
* Bad, because it duplicates the session/registry/preflight machinery that is deliberately
  platform-agnostic, and the duplication compounds each phase.

### Inline platform branches

* Good, because no new structure.
* Bad, because platform facts scatter across preflight, start, locator, and error-message sites
  — exactly what made the A1 file Windows-hard-coded.

### Accept all-SKIPPED macOS CI (rejected for the gate)

* Good, because zero coupling to runner-image provisioning.
* Bad, because the macOS code path would ship unexercised — a fixture lane that can silently
  stop testing anything is what the zero-spec check exists to prevent; this is the same failure
  mode one level up.
