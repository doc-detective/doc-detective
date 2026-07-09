---
status: accepted
date: 2026-07-09
decision-makers: [hawkeyexl]
---

# Re-bootstrap Android command-line tools when a detected SDK is missing them

## Context and Problem Statement

`doc-detective install android` builds an install plan in `buildAndroidInstallPlan`
and decides whether to download the Android command-line tools (`sdkmanager` /
`avdmanager`) from a single flag: `bootstrapped = input.detected === null`. SDK
detection (`detectAndroidSdk`) considers a directory a usable SDK when **adb *or*
emulator** resolves under it (`androidSdk.ts` `usable`) — cmdline-tools are not
required for a root to "count".

Those two facts combine into a wedge. If an earlier install is interrupted after
`platform-tools` (adb) lands but before/while the command-line tools are placed,
the cache SDK is left **partial**: `adb.exe` present, `cmdline-tools/` absent. On
the next `install android` run, detection reports the partial root as a usable SDK,
so `bootstrapped` is `false`, the cmdline-tools download is **skipped**, and the
very next step runs `sdkmanager --licenses` against a file that doesn't exist. On
Windows this surfaces as the opaque:

```
…\cmdline-tools\latest\bin\sdkmanager.bat exited 1: The system cannot find the path specified.
```

and the install can never make progress — every re-run repeats the same skip. The
only recovery was manual: delete the cache SDK (losing the multi-GB system image)
or hand-place the command-line tools.

## Decision Drivers

- A re-run of `install android` must **make progress**, not repeat a dead-end — the
  installer already owns bootstrapping the whole stack, so it should heal a
  half-installed one too.
- Preserve expensive, already-downloaded assets — re-healing must not force a
  fresh multi-GB system-image download.
- Don't regress a **complete** existing SDK (Android Studio / `ANDROID_HOME`): that
  must still take the augment path with no bootstrap.
- Stay hermetically testable — the decision lives in the pure plan builder, no SDK
  or network in the unit suite.

## Considered Options

1. **Detect a missing `sdkmanager`/`avdmanager` in the plan builder and
   re-bootstrap into the existing SDK root.**
2. **Make SDK detection reject a root without cmdline-tools** (tighten `usable` to
   require `sdkmanager`) — rejected: detection also gates the *runtime* test
   preflight, where adb + emulator is a perfectly runnable SDK (running tests never
   needs `sdkmanager`). Tightening it would wrongly SKIP valid test runs.
3. **Guard at execution time** — before running `sdkmanager`, check it exists and
   bootstrap if not — rejected: scatters the "do we need cmdline-tools?" decision
   away from the plan (which drives both `--dry-run` and real execution), so the
   dry-run preview would disagree with what actually happens.

## Decision Outcome

Chosen option: **1**. `buildAndroidInstallPlan` now bootstraps when there is no
SDK **or** a detected SDK is missing its command-line tools:

```ts
const cmdlineToolsMissing =
  input.detected !== null &&
  (!input.detected.sdkmanager || !input.detected.avdmanager);
const bootstrapped = input.detected === null || cmdlineToolsMissing;
```

Because `sdkRoot` resolves to `input.detected?.sdkRoot ?? input.cacheSdkRoot`, the
bootstrap targets the **existing** (partial) SDK root, healing it in place. The rest
of the plan is unchanged: already-present `platform-tools` are still skipped, and an
already-installed system image is still reused (the image lives under the same
`sdkRoot`, so `listInstalledSystemImages` finds it and no re-download occurs). Both
`sdkmanager` and `avdmanager` are checked because they ship together in
`cmdline-tools`, and the install needs both (licenses/packages via `sdkmanager`, AVD
creation via `avdmanager`).

### Consequences

- Good: a re-run of `install android` after an interrupted install now **self-heals**
  — it re-fetches only the missing command-line tools and proceeds, reusing the
  platform-tools and the (often multi-GB) system image already on disk.
- Good: no change for a complete SDK — `sdkmanager` + `avdmanager` present ⇒
  `cmdlineToolsMissing` is false ⇒ augment path, no bootstrap.
- Good: the runtime test preflight is untouched — detection still treats an
  adb/emulator-only SDK as runnable; this decision is scoped to the installer.
- Neutral: a detected SDK that has `emulator` but neither cmdline-tool (an unusual
  partial) will also re-bootstrap — correct, since the install needs them.

### Confirmation

`buildAndroidInstallPlan` gains a unit test asserting a partial detected SDK (adb,
no `sdkmanager`) yields `bootstrapped: true`, a leading `bootstrap-cmdline-tools`
action, and a `dest`/`sdkRoot` equal to the existing partial root (heal-in-place).
An `installAndroid` orchestration test drives the partial SDK end-to-end with
injected effects: it asserts the bootstrap runs, the install then proceeds
(licenses + AVD creation), and the already-installed image is reused (no `--list`
availability query). The pre-existing "augments an existing SDK" cases were updated
to model a **complete** SDK (they now carry `sdkmanager`/`avdmanager`) so they keep
asserting the no-bootstrap augment path.

## Pros and Cons of the Options

### 1. Re-bootstrap in the plan builder (chosen)

- Good, because the fix lives in the single pure decision that drives both dry-run
  and execution — preview and reality stay in agreement.
- Good, because it heals in place and preserves already-downloaded assets.
- Bad, because it adds one more reason the (usually one-time) cmdline-tools download
  can run — acceptable, since it only triggers when they're genuinely absent.

### 2. Tighten SDK detection to require cmdline-tools

- Good, because "usable" would imply a complete SDK.
- Bad, because detection also gates running tests, where adb + emulator is fully
  runnable and needs no `sdkmanager` — this would wrongly SKIP valid runs.

### 3. Execution-time guard before running sdkmanager

- Good, because it directly precedes the failing call.
- Bad, because it splits the bootstrap decision off from the plan, so `--dry-run`
  would misreport what a real run does.
