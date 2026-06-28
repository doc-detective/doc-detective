---
status: accepted
date: 2025-12-06
decision-makers: doc-detective maintainers
---

# Multi-OS image and canonical docker publish contract

## Context and Problem Statement

The Docker image was Linux-only with an ad-hoc base/runtime layering. Users on Windows runners had no
official image, and the publish targets and tags were not a stable, canonical contract. The project
needed a Windows image alongside Linux, a deterministic runtime (a known Chrome shared-library set),
and a single canonical publish namespace with a predictable tag matrix. What should the multi-OS
image and publish contract be?

## Decision Drivers

* Windows runners need an official image, not only Linux.
* The Linux runtime must declare its Chrome shared-library dependencies explicitly (reproducible).
* Publish targets/tags must be a canonical, predictable contract for downstream pulls.
* The platform→tag mapping should be generated, not hand-maintained per release.

## Considered Options

* **A. Add a Windows image (`windows/server:ltsc2022`, Node MSI, cmd entrypoint); single-stage Linux
  runtime with an explicit Chrome shared-lib set; publish `docdetective/docdetective:latest` +
  `:$VERSION`; a `build.js` platform→tag matrix; a GitHub Actions publish workflow** (chosen).
* **B. Stay Linux-only and document Windows as unsupported.**
* **C. Per-OS, hand-written tags with no shared build/tag-matrix script.**

## Decision Outcome

Chosen option: **A**, because shipping both OSes under one generated tag matrix and a canonical
namespace makes images predictable to pull and to release. The contract: a Windows image based on
`windows/server:ltsc2022` (Node via MSI, `cmd` entrypoint) joins the Linux image, which becomes a
single-stage runtime declaring an explicit Chrome shared-library set; images publish to the canonical
`docdetective/docdetective:latest` and `:$VERSION`; `build.js` derives the platform→tag matrix; and a
GitHub Actions workflow performs the publish (commits `cc0dbe8`, `178fe1d`, `ca6c49bd`, `c545eb8`,
`2efbaa8`, `fc938ee`, `3f9c767`, `docker-images`).

### Consequences

* Good: official Windows and Linux images under one canonical namespace and tag scheme.
* Good: explicit Linux Chrome shared-lib set makes the runtime reproducible.
* Bad: two OS image definitions to maintain and test in CI.
* Neutral: `build.js` centralizes the platform→tag mapping so releases don't hand-edit tags.

### Confirmation

Windows + Linux images, the canonical `docdetective/docdetective:latest`/`:$VERSION` tags, the
`build.js` platform→tag matrix, and the GitHub Actions publish workflow ship across `docker-images`
commits `cc0dbe8`, `178fe1d`, `ca6c49bd`, `c545eb8`, `2efbaa8`, `fc938ee`, `3f9c767`.

## Pros and Cons of the Options

### A. Multi-OS images + canonical publish matrix
* Good: official Windows+Linux; reproducible runtime; predictable tags via generated matrix.
* Bad: two OS images to maintain.

### B. Linux-only
* Good: one image to maintain.
* Bad: leaves Windows runner users without an official image.

### C. Hand-written per-OS tags
* Good: no build script.
* Bad: error-prone tags drift release to release; no single source of truth.

## More Information

Recorded retrospectively (ADR backfill). Origin: `docker-images` commits `cc0dbe8`, `178fe1d`,
`ca6c49bd`, `c545eb8`, `2efbaa8`, `fc938ee`, `3f9c767`. Inventory ref: BACKFILL-INVENTORY.md Seq 201.
Related: `00059` (docker base image contract), `00118` (container env + ffmpeg), `00147` (merge
docker configs into monorepo).
