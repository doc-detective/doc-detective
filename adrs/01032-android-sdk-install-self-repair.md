---
status: accepted
date: 2026-07-06
decision-makers: doc-detective maintainers
---

# Self-repair transient Android SDK download flakes inside the installer

## Context and Problem Statement

`doc-detective install android` — and the identical lazy-bootstrap path Doc Detective runs at test
time — downloads system images and the command-line tools through `sdkmanager`
([src/runtime/androidInstaller.ts](../src/runtime/androidInstaller.ts)). Google's SDK repository
intermittently serves a **truncated/corrupt package**: `sdkmanager` aborts with
`Warning: An error occurred while preparing SDK package … Error on ZipFile unknown archive` and exits
non-zero. The whole step can die in ~30s, well before any boot timeout.

Before this change, each package install was a bare `await run(sdkmanager, …)` with **no retry**, so
a single transient flake failed the entire install. [PR #523](https://github.com/doc-detective/doc-detective/pull/523)
mitigated this **only in CI**, by retrying the emulator legs at the workflow level. That does nothing
for real users installing the toolchain on their own machines, and it is a blunt whole-leg re-run.

A second, rarer failure mode exists: a partial extraction where `sdkmanager` exits **0** but leaves a
structurally incomplete image on disk, which then fails to boot with a confusing downstream error.

The question this ADR answers: rather than a CI-only retry, can the installer **validate and
self-repair** a bad download in-process — the way the heavy-npm-dep loader already reinstalls a
missing/stale runtime cache ([ADR 01025](01025-non-destructive-runtime-cache-installs.md),
`ensureRuntimeInstalled` in [src/runtime/loader.ts](../src/runtime/loader.ts))?

## Decision Drivers

* Protect **real users** and the DD-owned CI legs (`apps-android` managed-boot + action/lazy), not
  just the CI matrix.
* A transient infra flake should self-heal; a **genuine** failure (bad license, unknown arg, no
  matching image) must still fail — recovery must never mask a real error.
* Keep the change confined to the installer with no new user-facing config/CLI surface and no
  `config_v3` schema churn.
* Stay hermetically unit-testable: the flake cannot be reproduced through the real runner (we cannot
  make Google serve a truncated zip), so the behavior must be assertable with injected effects.

## Considered Options

1. **In-runtime bounded retry + post-install integrity probe** (both layers), wired into
   `installAndroid` through the existing injected `run`/`fs` seams.
2. Retry only (Layer 1), no integrity probe.
3. Leave it at #523's CI-level retry.
4. A user-facing `--retries` / config knob for install attempts.

## Decision Outcome

Chosen option: **1 — bounded retry + integrity probe, in the installer.**

**Layer 1 — bounded retry on transient errors.** `runSdkInstallWithRetry` wraps a single
sdkmanager package install. On rejection it retries **only** when `isTransientSdkError` matches a
tight, documented signature list (`Error on ZipFile`, `unknown archive`, `An error occurred while
preparing SDK package`, and the network transients `ECONNRESET`/`ETIMEDOUT`/`Connection reset`/
`Read timed out`); anything else rethrows immediately. Up to `SDK_INSTALL_MAX_ATTEMPTS` (3) attempts
with a short backoff (2s, 4s). sdkmanager re-downloads a fresh copy each invocation, so a retry is a
genuine self-repair. The retry is logged at `warn` (surfaced, never silent). The platform-tools,
emulator, and system-image installs all route through it.

**Layer 2 — post-install integrity probe + one repair.** After a system image installs,
`isSystemImageComplete` checks the extracted dir for the canonical markers `source.properties`
(package manifest) **and** `system.img` (payload). If incomplete, the installer wipes just that
package dir and reinstalls once; if it is **still** incomplete it returns a
`{ assetId: "system-image", action: "corrupt" }` report and **stops before AVD creation**, rather
than building an AVD from a bad image. The probe runs only on a freshly installed image, never on a
user's pre-existing one (which is never wiped).

Scope boundary: the reactivecircus `apps-android` **reuse** leg runs *its own* `sdkmanager`, not Doc
Detective's, so it is **out of scope** here and stays covered by #523's workflow retry. #523's CI
retries are retained as a belt-and-suspenders net.

Option 2 was rejected because the silent-partial-extraction case is real and produces a worse,
later, more confusing failure. Option 3 leaves real users unprotected. Option 4 adds user-facing
surface and schema churn for a value nobody needs to tune; a module constant is sufficient.

### Consequences

* Good: the observed `ZipFile unknown archive` flake self-heals in-process on every DD-owned install
  path, for users and CI alike; a partial extraction is caught and repaired before it can misboot.
* Good: no new config/CLI/schema surface; the retry count is a module constant.
* Neutral: a doubly-failing transient (or a genuine failure) now costs up to 3 attempts + backoff
  before surfacing — bounded and short.
* Neutral: one place (`isSystemImageComplete`) now encodes what "a complete image on disk" means; if
  Google changes the package layout the marker list must follow.

### Confirmation

* [test/android-installer.test.js](../test/android-installer.test.js): `isTransientSdkError`
  true/false table; `runSdkInstallWithRetry` returns on first success, self-repairs one transient
  then succeeds (no real wait via injected `sleep`), rethrows a non-transient immediately, and gives
  up after `SDK_INSTALL_MAX_ATTEMPTS`; `isSystemImageComplete` marker check; and through
  `installAndroid`: a transient image install self-repairs then creates the AVD, an incomplete image
  is wiped + reinstalled, and a still-incomplete image returns `corrupt` and skips the AVD. All
  hermetic via injected `run`/`fs`/`sleep` — no spawn, download, or real backoff.
* End-to-end, the existing `apps-android` managed-boot and action/lazy CI legs continue to exercise
  the real install path; the corrupt-download flake itself is not reproducible on demand, so it is
  covered by the injected-effect unit tests rather than a fixture.

## Pros and Cons of the Options

### Option 1 — retry + integrity probe (chosen)

* Good: covers both failure modes (non-zero corrupt exit, and silent partial extraction); protects
  users and CI; no user-facing surface.
* Bad: two new behaviors and a marker list to maintain.

### Option 2 — retry only

* Good: smallest change; fixes the observed flake.
* Bad: leaves the silent-partial-extraction case to fail later and more confusingly.

### Option 3 — CI retry only (status quo, #523)

* Good: already merged; zero runtime code.
* Bad: does nothing for real users; blunt whole-leg re-run; only covers the CI matrix.

### Option 4 — user-facing retries flag

* Good: tunable.
* Bad: config/CLI/schema surface and docs for a knob with no real use case; a constant suffices.
