---
status: accepted
date: 2024-01-03
decision-makers: doc-detective maintainers
---

# Media and download directory derivation

## Context and Problem Statement

Recordings, screenshots, and browser-downloaded files all need a destination directory. Requiring
authors to set `downloadDirectory` and `mediaDirectory` explicitly was redundant when a single output
location was already configured. Recording also needed to finalize its file format once the browser
finished writing the raw capture. How should the media and download directories be derived, and when
should a recording be converted to its final format?

## Decision Drivers

* Authors shouldn't have to set media/download directories separately from the configured output.
* Derived directories must fall back through a sensible chain to a known location.
* A recording must be converted to its final, broadly playable format after capture completes.
* Conversion must happen only once the download/capture is actually finished.

## Considered Options

* **A. Derive `runTests.downloadDirectory` and `mediaDirectory` in `setConfig` from an output fallback chain; on stopRecording, wait for the download then FFmpeg-convert to yuv420p** (chosen).
* **B. Require explicit media/download directory configuration.**
* **C. Use a fixed temp directory for all media/downloads.**

## Decision Outcome

Chosen option: **A**, because deriving the directories from the already-configured output keeps
configuration minimal while still allowing overrides, and converting after the capture completes
guarantees a finished, playable file. In `setConfig`, `runTests.downloadDirectory` and
`mediaDirectory` are derived via a fallback chain (`…downloadDirectory ?? …output ?? config.output`).
On `stopRecording`, the runner waits for the recording download to finish and then FFmpeg-converts the
result to `yuv420p` pixel format for broad compatibility.

### Consequences

* Good: media/download directories work with zero extra config, derived from `output`.
* Good: recordings finalize to a widely playable `yuv420p` encoding.
* Good: conversion waits for completion, avoiding truncated/partial files.
* Neutral: explicit `downloadDirectory`/`mediaDirectory` still override the derived values.

### Confirmation

Shipped in core `ac76f88`, `f480075`, `33bb083` (`setConfig` derivation; stopRecording wait +
yuv420p convert). Exercised by recording fixtures that produce a finalized media file under the
derived directory.

## Pros and Cons of the Options

### A. Derive from output chain + post-download FFmpeg convert
* Good: zero-config defaults; finalized playable output; override-friendly.
* Bad: the fallback chain must be kept in sync with output semantics.

### B. Require explicit directories
* Good: unambiguous.
* Bad: redundant config; easy to forget.

### C. Fixed temp directory
* Good: simplest.
* Bad: surprising location; not co-located with results.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commits `ac76f88`, `f480075`,
`33bb083`. Inventory ref: BACKFILL-INVENTORY.md Seq 101. Related: `00014` (unified media directory),
`00034` (download directory support), `00069` (FFmpeg recording engine), `00018` (recording formats).
