---
status: accepted
date: 2026-07-04
decision-makers: [hawkeyexl]
---

# Bootstrap a portable JRE for the Android toolchain instead of requiring one

## Context and Problem Statement

`sdkmanager` and `avdmanager` (used by `doc-detective install android` and the
lazy install-at-test-time path) are Java programs. Phase A3 shipped with Java as
a **host prerequisite**: if no JRE 17+ was found, `installAndroid` reported
`java: missing` and stopped. That leaves a gap in the "zero-setup" story — a run
on a minimal container, or a dev box without Java, hits a wall even though Doc
Detective already bootstraps everything else (command-line tools, platform-tools,
emulator, system image, AVD, UiAutomator2 driver). The GitHub Action's new
`android` input (doc-detective/github-action#71) removes the *KVM* prerequisite
on Linux; Java is the remaining one, and it applies everywhere, not just CI.

## Decision Drivers

- Match the existing "Doc Detective bootstraps the whole Android stack itself"
  contract — Java is the one piece that was still the user's problem.
- Keep the multi-GB-download discipline: never fetch anything before the `--yes`
  confirmation (or the lazy path's explicit opt-in).
- Stay hermetically testable — no real download in the unit suite.
- Don't regress hosts that already have Java (system Java must win, with no
  download and no surprise `JAVA_HOME` override).

## Considered Options

1. **Keep Java as a prerequisite** (status quo) — document it and rely on
   `setup-java` in CI.
2. **Bootstrap a portable Temurin JRE into the cache** when Java is absent,
   mirroring the SDK bootstrap.
3. **Bundle a JRE with the npm package** — rejected: bloats every install for a
   feature only Android users need, and can't be right for every OS/arch.

## Decision Outcome

Chosen option: **2 — bootstrap a portable Temurin (Eclipse Adoptium) JRE 17**.
`ensureJava` resolves Java in priority order: **system Java → cached
Doc-Detective JRE → download**. On a cache/bootstrap hit it points `JAVA_HOME`
and `PATH` at the managed JRE for the rest of the process, so the `sdkmanager` /
`avdmanager` spawns that follow pick it up. It runs **after** the `--yes` guard in
`installAndroid`, so the JRE download is part of the confirmed install, never a
surprise. The download uses the Adoptium binary API
(`/v3/binary/latest/17/ga/<os>/<arch>/jre/hotspot/normal/eclipse`) and reuses the
existing redirect-following downloader and cross-platform extractor (its
`tar -xf` fallback handles the POSIX `.tar.gz`; Windows gets the `.zip`).

### Consequences

- Good: `doc-detective install android` and the lazy install path now work with
  **no host Java** — the zero-setup story is complete on any host with the SDK's
  other needs met.
- Good: system Java still short-circuits — no behavior change or download where
  Java already exists.
- Neutral: the JRE lands in `<cache>/jre` and is reused across runs; it's an
  extra ~50–70 MB one-time download only on hosts that lack Java.
- Limitation (follow-up): the **runtime** device-creation path
  (`realCreateAvd` at boot, when a `device` descriptor needs a brand-new AVD on
  an already-complete SDK that skipped `installAndroid`) does not yet call
  `ensureJava`. The common paths (CLI install, lazy install) all route through
  `installAndroid` and are covered; the reuse-then-create edge is tracked
  separately.

### Confirmation

`ensureJava`'s branch logic (system / cache / bootstrap / failure) and the pure
helpers (`jreDownloadUrl`, `jreArchiveFilename`, `resolveJavaHome`,
`javaBinPath`) are unit-tested with injected effects — no real download. An
`installAndroid` test asserts that an absent-Java host bootstraps the JRE and
proceeds to create the AVD, and another asserts an unprovisionable Java still
reports `java: missing`.

## Pros and Cons of the Options

### 1. Keep Java as a prerequisite

- Good, because it's zero new code and no download.
- Bad, because it breaks the zero-setup promise on minimal hosts and pushes
  per-CI `setup-java` boilerplate onto every user.

### 2. Bootstrap a portable Temurin JRE (chosen)

- Good, because it completes the self-bootstrapping story and reuses the existing
  download/extract machinery.
- Good, because system Java still wins, so no regression where Java exists.
- Bad, because it adds a one-time ~50–70 MB download on Java-less hosts and a
  dependency on the Adoptium API being reachable.

### 3. Bundle a JRE in the npm package

- Good, because it needs no network at test time.
- Bad, because it bloats every install regardless of Android use and can't cover
  every OS/arch from one package.
