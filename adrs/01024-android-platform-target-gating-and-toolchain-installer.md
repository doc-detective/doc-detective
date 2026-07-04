---
status: accepted
date: 2026-07-04
decision-makers: doc-detective maintainers
---

# Android as a target platform: capability gating + opt-in toolchain installer (phase A3a)

## Context and Problem Statement

Phases A1 (ADR 01021, Windows) and A2 (ADR 01023, macOS) shipped native **desktop** app
automation behind `startSurface`, gated by host identity — the host *is* the target. Phase A3 of
[docs/design/native-app-surfaces.md](../docs/design/native-app-surfaces.md) is the first **device**
phase: **Android** apps on a managed emulator. It splits into two shippable PRs. This ADR covers
**A3a** — the parts that land green with **no emulator anywhere**:

- `android` (and `ios`) as values of `context.platforms`.
- The revised **device descriptor** (`deviceType`, reuse-or-create semantics).
- **Capability gating**: an android context is gated by whether the *host* can run Android, not by
  host identity, and in A3a always resolves **SKIPPED** (the device layer is A3b).
- `doc-detective install android` — the one explicit, opt-in place the multi-GB Android toolchain
  is downloaded.

The central problem: the Android SDK + emulator + system images are a **very heavy dependency**
(multiple GB, a Java runtime, long emulator boots). They must cost **nothing** on any run that
doesn't target android, and must never be downloaded as a side effect of running a test.

## Decision Drivers

* **Zero cost unless android.** No SDK probe, no adb spawn, no driver install on a run with no
  android context. The cost must be *structurally* impossible to pay, not merely avoided by
  convention.
* **Multi-GB downloads are always explicit.** Only `doc-detective install android` fetches system
  images; a test run never does.
* **Mobile targets gate by capability, not identity.** `platforms: "android"` names a *target*;
  the host runs it if capable. A multi-OS CI matrix should run android on every capable leg — no
  host-pinning knob to keep in sync.
* **Gaps gate (SKIP), never FAIL** — same semantics as `requires` (ADR 01020) and the A1/A2 driver
  preflight. Missing SDK / image / Java is a SKIP with an actionable message, not a failure.
* **Schema is designed up front** so A3b (and A4 iOS) are additive — no breaking change per phase.
* **A3a is a shippable intermediate.** Android contexts SKIP with a roadmap-shaped reason; when A3b
  lands they start running with no fixture change.

## Considered Options

**Where the Android SDK is probed:**
* **Lazily, only inside the android context preflight** (chosen) — detection is unreachable unless
  a context's platform is `android`.
* Eagerly during environment setup (like browser probing in `getAvailableApps`) — rejected: pays a
  filesystem walk / spawn on every run.
* Through `inferRuntimeNeeds` like heavy npm deps — rejected: the SDK isn't an npm package, and
  routing it there would provision it for the whole run.

**How mobile platforms are gated:**
* **Host *capability* (SDK present, later emulator acceleration), plus an early-return mobile
  branch in `runContext`** (chosen).
* A `hosts` field on the context to pin which host OSes run a mobile entry — **rejected** (see
  below): it adds a knob that must be kept in sync and disambiguates something capability already
  answers.

**Installer scope:**
* **Augment-or-bootstrap** (chosen): use an existing SDK's `sdkmanager`/`avdmanager` to add only
  the missing pieces + create the default AVD; bootstrap commandline-tools into
  `<cacheDir>/android-sdk` when no SDK exists.
* Existing-SDK-only — rejected: leaves users with no SDK stuck.
* AVD-creation-only — rejected: "opt-in installer" that installs almost nothing.

**Device descriptor shape** (revising the design doc's original provisioning spec):
* **Reuse-or-create keyed by `name`, with an abstract `deviceType`** (chosen): `{ name }` reuses an
  existing AVD or creates one with defaults; `{ name, deviceType, osVersion }` refines creation.
* The design doc's `{ name: "Pixel_7", osVersion, headless }` hardware-model spec — rejected:
  hardware-model names aren't portable across android/ios and leak device taxonomy into the schema.

## Decision Outcome

**Chosen:** lazy detection inside the android preflight; capability-based gating with an
early-return mobile branch in `runContext`; the augment-or-bootstrap `install android` command; and
the reuse-or-create device descriptor with an abstract `deviceType`.

### Schema

- `context.platforms` enum gains **`android`** and **`ios`** (both ship now, schema-first; A3a runs
  neither — ios SKIPs pointing at A4).
- New optional `context.device` (`$ref` the device descriptor, `platform` implied by the context).
- The `deviceDescriptor` drops the reserved **`type`** field (`emulator`/`simulator`/`device`) and
  adds **`deviceType`** (`phone` | `tablet`). `name` becomes reuse-or-create; `osVersion`/`deviceType`
  refine creation. `platform` is required only in `startSurface.device` (via `allOf`), implied in
  `context.device`.

Dropping `type` is technically a validation-breaking change (`additionalProperties: false`), but it
was **reserved and guaranteed-to-FAIL at runtime** in A1/A2 — no working spec can carry it — so the
reshape is safe pre-implementation. This is recorded here as the deliberate call.

### Runtime

- `detectAndroidSdk` (`src/runtime/androidSdk.ts`) probes ANDROID_HOME → ANDROID_SDK_ROOT →
  `<cacheDir>/android-sdk` → adb-on-PATH, pure over injected `env`/`existsSync`/`platform`. It is
  called **only** from the android branch of `runContext`, which is entered only when
  `context.platform === "android"` — the structural zero-cost guarantee.
- A mobile branch in `runContext` (before the desktop `requires`/driver gates) evaluates `requires`
  on the reached host (a host fact, and the desktop `requires` gate is scoped to host == target,
  which is never true for mobile), then SKIPs: android → install-android when no SDK, else the A3b
  pointer (or A5 for a mobile-browser step); ios → the A4 pointer. It returns early, so no desktop
  engine/platform skip runs for mobile contexts.
- `inferRuntimeNeeds` is unchanged and never names the Android SDK or the uiautomator2 driver; a
  pinning test locks this. (The generic `webdriverio`/`appium`/chromium stack is still inferred from
  surface-agnostic `find`/`click`/`type` steps — the same pre-existing behavior A1/A2 app specs
  have; that stack is not the Android toolchain.)

### `doc-detective install android`

Augment-or-bootstrap, behind `--yes` (multi-GB downloads never happen without confirmation);
`--dry-run` previews the plan with no java/network/spawn. Java (JRE 17+) is required for
`sdkmanager`/`avdmanager` and reported up front. What it provisioned is recorded in `installed.json`
(a new optional `android` slot) so `install status` can report it and reruns skip done work. It is
**not** part of `install all`.

### No `hosts` field

An android context runs on the current host iff the host is capable (SDK present now; emulator
acceleration in A3b). A multi-OS CI matrix runs android on every capable leg — redundant runs are
accepted as harmless, and there is no host-identity knob to keep in sync. This is a deliberate
omission of the design doc's originally-planned `hosts` extension.

### Consequences

* Good: a non-android run pays nothing; the invariant is structural, not conventional.
* Good: A3b adds the device layer + uiautomator2 driver additively — android contexts flip from
  SKIP to run with no schema or fixture change.
* Good: the installer boundary keeps multi-GB fetches explicit and auditable.
* Bad / accepted: A3a ships android contexts that always SKIP — an intentional intermediate whose
  skip reasons read as roadmap, not breakage.
* Bad / accepted: redundant android CI legs on multi-OS matrices (mitigated: they SKIP fast where
  incapable).
* Both installer paths are wired: **augment** (an existing SDK) and **bootstrap-from-nothing**
  (download + unzip the command-line tools into `<cacheDir>/android-sdk` — the "portable Android"
  install). A JRE 17+ remains a host prerequisite for sdkmanager/avdmanager.

### Confirmation

- `src/common/test/validate.test.js`: the revised descriptor + mobile platforms (positive/negative,
  including the retired `type`).
- `test/android-gating.test.js`: `isMobileTargetPlatform`, the skip-reason composer, and
  `detectAndroidSdk` over injected deps.
- `test/android-installer.test.js`: the pure helpers, the plan builder, and `installAndroid`
  orchestration over injected detect/run/bootstrap/java effects.
- `test/runtime-cache-dir.test.js`: the `android` installed-record slot round-trip.
- `test/runtime-infer-needs.test.js`: the zero-cost pinning test.
- `test/core-core.test.js`: android/ios contexts resolve SKIPPED (never FAIL) end-to-end via
  `runTests`.
- `test/cli-install.test.js`: `install android` registration + `--dry-run` preview.
- Fixture `test/core-artifacts/apps/android-gating.spec.json`: android/ios contexts SKIP on every
  host leg of the existing `apps` group (asserted gate, PASS/SKIPPED only).

## Pros and Cons of the Options

### Lazy detection inside the android preflight

* Good, because the SDK is unreachable unless a context targets android — zero cost is structural.
* Good, because the same pure `detectAndroidSdk` serves the installer.
* Neutral: detection runs per android context, not once per run — cheap (fs stats), and android
  contexts are already the heavyweight path.

### Capability gating without `hosts`

* Good, because there's no host-pinning knob to keep in sync; capability is the real gate.
* Good, because a newly-capable CI leg starts running android with no config change.
* Bad, because multi-OS matrices pay redundant (fast-SKIP) android legs — accepted.

### Augment-or-bootstrap installer

* Good, because it works whether or not an SDK exists — bootstrap downloads and unzips the
  command-line tools into `<cacheDir>/android-sdk` (cross-platform: unzip/bsdtar/Expand-Archive),
  then drives sdkmanager/avdmanager exactly as the augment path does.
* Neutral: a JRE 17+ is still a host prerequisite (sdkmanager/avdmanager are Java tools); Doc
  Detective doesn't bundle a JRE, and reports its absence actionably.

### Reuse-or-create device descriptor with abstract `deviceType`

* Good, because `deviceType` is portable across android/ios and keeps hardware taxonomy out of the
  schema.
* Good, because `{ name }` alone is the common case (reuse an AVD, or create with defaults).
* Neutral: mapping `deviceType` → a concrete avdmanager profile is a code-side table, versioned
  with cmdline-tools.
