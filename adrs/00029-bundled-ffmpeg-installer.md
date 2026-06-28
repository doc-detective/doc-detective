---
status: accepted
date: 2022-09-23
decision-makers: doc-detective maintainers
---

# Bundled ffmpeg installer

## Context and Problem Statement

Doc Detective's recording actions shell out to ffmpeg, but early versions assumed a system ffmpeg was
already installed and discoverable on `PATH`. That made recordings fail on machines and CI runners
without ffmpeg, and forced users to install and locate a binary themselves. Should Doc Detective keep
requiring a system ffmpeg, or bundle one it can resolve programmatically?

## Decision Drivers

* Requiring users to pre-install ffmpeg on `PATH` is a setup burden and a frequent failure point.
* CI runners frequently lack ffmpeg, breaking recording out of the box.
* A programmatically resolvable binary path removes `PATH` discovery from the failure surface.
* The same need exists at both the core engine and the published wrapper package.

## Considered Options

* **A. Autoload ffmpeg via `@ffmpeg-installer/ffmpeg` and resolve its `.path`** (chosen).
* **B. Keep requiring a system ffmpeg on `PATH`.**
* **C. Download ffmpeg at runtime on first recording.**

## Decision Outcome

Chosen option: **A**, because depending on `@ffmpeg-installer/ffmpeg` ships a platform-appropriate
binary and exposes a resolvable path, eliminating the `PATH` requirement. The recording path resolves
the binary via `require("@ffmpeg-installer/ffmpeg").path` instead of assuming a system ffmpeg
(commit `3fd29eca`).

The same decision was re-applied later at a different layer: when the runtime was reorganized, the
`@ffmpeg-installer/ffmpeg` dependency was re-bundled at the **wrapper** level so recording works
without system ffmpeg there too (commit `f764c49a`). The two together establish "ffmpeg is always
bundled, never assumed on PATH" as the durable contract.

### Consequences

* Good: recording works out of the box without a user-installed ffmpeg.
* Good: removes `PATH` discovery from the recording failure surface.
* Bad: adds a sizable platform-specific binary dependency to install size.
* Neutral: the bundling must be maintained at whichever layer owns recording (core, then wrapper).

### Confirmation

Shipped in commit `3fd29eca` (core, via `require("@ffmpeg-installer/ffmpeg").path`) and re-bundled at
the wrapper in commit `f764c49a` (`package.json` dependency).

## Pros and Cons of the Options

### A. Bundle via @ffmpeg-installer/ffmpeg
* Good: zero-setup recording; resolvable path.
* Bad: larger install footprint.

### B. Require system ffmpeg on PATH
* Good: no bundled binary.
* Bad: fails on machines/CI without ffmpeg; setup burden.

### C. Runtime download on first use
* Good: small base install.
* Bad: first-run latency/failure; network dependency at run time.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `3fd29eca` and `f764c49a`.
Inventory ref: BACKFILL-INVENTORY.md Seq 37, 122. Related recording ADRs: `00018`, `00069`.
