---
status: accepted
date: 2026-07-05
decision-makers: [hawkeyexl]
---

# Enable iOS app surfaces via XCUITest preflight and installer wiring

## Context and Problem Statement

Phase A3 left the `ios` target as a roadmap skip (`phase A4`) even though the
multi-surface schema already reserved the `ios` platform and mobile device
shape. That gap blocked user-authored iOS contexts from ever reaching native
app-surface execution, and left no explicit install/preflight contract for
macOS hosts.

The problem was twofold:

1. iOS contexts were hard-stopped early in `runContext` with a roadmap message.
2. There was no first-class `install ios` command to preview/check host
   prerequisites from non-macOS development environments and CI planning flows.

## Decision Drivers

- Remove the hardcoded A4 roadmap skip and replace it with real capability
  gating, consistent with other context gates.
- Keep behavior deterministic and non-destructive on non-macOS hosts (SKIP with
  actionable guidance, not FAIL).
- Preserve lazy-install/runtime patterns: preflight resolves required app driver
  (`appium-xcuitest-driver`) and appium home exactly where needed.
- Support remote validation from non-macOS contributors using workflow dispatch
  legs.

## Considered Options

1. Keep iOS as a roadmap-only SKIP until full simulator lifecycle parity lands.
2. Land full simulator lifecycle orchestration and iOS execution in one step.
3. Enable iOS execution through app-surface preflight + XCUITest driver mapping,
   with toolchain probes and installer wiring; leave deeper simulator lifecycle
   hardening to follow-up.

## Decision Outcome

Chosen option: **3**.

- `runContext` no longer hardcodes an iOS A4 skip.
- iOS mobile-browser contexts remain gated to A5 (`mobileContextSkipReason`).
- iOS native app contexts run through `iosContextPreflight`, which delegates to
  `appSurfacePreflight({ platform: "ios" })`.
- App-surface adapter table now includes an `ios` platform row using
  `appium-xcuitest-driver` and XCUITest capabilities.
- New CLI path: `doc-detective install ios` (with `--dry-run` support).
- Runtime dependency contract includes `appium-xcuitest-driver` so lazy
  provisioning can resolve/install it consistently.

### Consequences

- Good: `ios` contexts now have a real PASS path on capable macOS hosts.
- Good: non-macOS hosts get explicit SKIP guidance (`xcode-select`/`simctl`
  prerequisites), preserving deterministic cross-platform runs.
- Good: CI and contributors on Windows/Linux can validate iOS changes via the
  single-leg fixture dispatch workflow on macOS runners.
- Trade-off: simulator lifecycle parity (managed create/boot/reuse/teardown
  symmetry with Android) is not fully implemented in this decision and remains
  follow-up scope.

### Confirmation

- Focused unit/CLI tests cover:
  - iOS mobile skip semantics (A5 for mobile browser contexts).
  - `install ios` command discovery + dry-run behavior.
  - app-surface platform routing for iOS/XCUITest.
  - iOS preflight skip guidance on non-macOS capability probes.
- macOS fixture validation is executed via workflow dispatch (`fixtures-debug`)
  for `group=apps` (and `apps-ios` where present) from this branch.

## Pros and Cons of the Options

### 1. Keep roadmap skip only

- Good, because it avoids immediate implementation risk.
- Bad, because `ios` remains unusable despite schema support and blocks A4
  adoption.

### 2. Full simulator lifecycle parity immediately

- Good, because it provides maximum feature completeness in one change.
- Bad, because it increases implementation and review risk substantially,
  especially from non-macOS development hosts.

### 3. Preflight + XCUITest enablement now (chosen)

- Good, because it unlocks practical iOS execution with bounded scope and clear
  gates.
- Good, because it aligns with existing capability-gate patterns and installer
  conventions.
- Bad, because deeper simulator orchestration refinements still need follow-on
  work.
