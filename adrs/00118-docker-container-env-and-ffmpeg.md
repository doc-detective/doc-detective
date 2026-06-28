---
status: accepted
date: 2025-06-17
decision-makers: doc-detective maintainers
---

# Structured DOC_DETECTIVE container env, ffmpeg in the Linux image, and 10-minute driver timeouts

## Context and Problem Statement

The Docker image signaled "you are running inside the official container" with a flat
`ENV CONTAINER=true`. That boolean carried no provenance (which image, which version) and overlapped
awkwardly with the runner's growing need to read structured environment config. The Linux image also
lacked `ffmpeg`, so in-container recording could not work. And the 2-minute driver init timeouts
(`00114`) were still too tight once heavy-dependency install/provisioning was added to cold starts.
The question: how should the container identify itself to the runner, should the image ship ffmpeg,
and what driver timeout survives provisioning?

## Decision Drivers

* The runner needs structured container identity (image + version), not a bare boolean.
* In-container recording requires `ffmpeg` present in the image.
* Driver/session startup must tolerate heavy-dep install and cold provisioning on CI.
* The container env should align with how the runner already reads `DOC_DETECTIVE`-shaped config.

## Considered Options

* **A. Replace `CONTAINER=true` with a structured `DOC_DETECTIVE` env JSON, add ffmpeg to the Linux image, and raise driver timeouts to 10 minutes** (chosen).
* **B. Keep `CONTAINER=true` and add separate version/image env vars alongside it.**
* **C. Leave the image as-is and skip recording inside containers.**

## Decision Outcome

Chosen option: **A**. Two coordinated change-sets:

1. **Docker image.** `ENV CONTAINER=true` is replaced with a structured `DOC_DETECTIVE` env JSON
   (`{"container":"docdetective/docdetective:<os>","version":…}`) that the runner reads, and
   `ffmpeg` is added to the Linux image so in-container recording works. Commit `64a8e10`.
2. **Driver timeouts (core).** `connectionRetryTimeout` / `waitforTimeout` raised
   120000 → 600000 ms (10 minutes), and `appium:newCommandTimeout:600` set on Gecko/Safari/Chromium,
   so sessions survive provisioning. Commits `c3a4b55`, `816f93e`.

### Consequences

* Good: the container self-identifies with image + version, not a bare boolean.
* Good: in-container recording works (ffmpeg present in the Linux image).
* Good: driver sessions survive heavy-dep install and cold starts (10-minute ceiling).
* Bad: a structured env JSON is more to parse/validate than a boolean flag.
* Neutral: the `DOC_DETECTIVE` env channel converges with the resolver's env-config override (`00115`) and later `DOC_DETECTIVE_CONFIG` (`00127`).

### Confirmation

Shipped in docker commit `64a8e10` (structured `DOC_DETECTIVE` env + ffmpeg) and core commits
`c3a4b55`, `816f93e` (timeouts → 600000, `newCommandTimeout:600`). Confirmed by the image's
`DOC_DETECTIVE` env JSON, ffmpeg presence, and the WDIO timeout values.

## Pros and Cons of the Options

### A. Structured DOC_DETECTIVE env + ffmpeg + 10-min timeouts
* Good: provenance-carrying identity; recording works; robust startup.
* Bad: JSON env to parse/validate.

### B. Keep CONTAINER=true plus extra vars
* Good: incremental.
* Bad: scattered, unstructured signals; no single source of truth.

### C. As-is, skip in-container recording
* Good: no image change.
* Bad: recording unavailable in the supported container.

## More Information

Recorded retrospectively (ADR backfill). Origin: docker commit `64a8e10`; core commits `c3a4b55`,
`816f93e`. Inventory ref: BACKFILL-INVENTORY.md Seq 178, 177. Related: `00114` (earlier 2-minute
timeouts), `00115`/`00127` (`DOC_DETECTIVE`/`DOC_DETECTIVE_CONFIG` env config), `00059` (base image).
