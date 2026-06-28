---
status: accepted
date: 2023-07-21
decision-makers: doc-detective maintainers
---

# Docker base image and runtime contract

## Context and Problem Statement

Doc Detective needed a container image so users could run it in CI and locally without provisioning
Node, browsers, and drivers themselves. The image had to pick a base, bundle Chrome and Node, expose
`doc-detective` as the entrypoint, and signal to the runtime that it is executing inside a container.
A multi-architecture build was also needed so the image works on common CI runners. What base image,
runtime configuration, entrypoint, and licensing should the official image commit to?

## Decision Drivers

* The image should run Doc Detective out of the box (Node + Chrome + global CLI present).
* The runtime must know it is inside a container so it can adapt provisioning/behavior.
* Users should pass a version at build time rather than hard-code it.
* The image must be available for multiple architectures.

## Considered Options

* **A. A maintained Dockerfile: Node + Chrome base, global `doc-detective`, `ENV CONTAINER=true`, `ENTRYPOINT ["npx","doc-detective"]`, `ARG DOC_DETECTIVE_VERSION`, multiarch build** (chosen).
* **B. No official image — document a manual setup users build themselves.**
* **C. A minimal image without a bundled browser, expecting users to add one.**

## Decision Outcome

Chosen option: **A**, because a batteries-included, multiarch image is what makes containerized runs
turnkey. The Dockerfile establishes a base (evolving `ubuntu:20.04`→`24.04`→`node:23-slim`) with
Chrome and Node, installs `doc-detective` globally, sets `ENV CONTAINER=true` so the runtime detects
the container, uses `ENTRYPOINT ["npx","doc-detective"]`, and accepts the package version via
`ARG DOC_DETECTIVE_VERSION`. The license moves from MIT to AGPL-3.0. A multi-architecture build is
added so the image runs on common runner architectures.

### Consequences

* Good: containerized runs work out of the box with browser + CLI bundled.
* Good: `CONTAINER=true` lets the runtime adapt (pairs with `inContainer()` detection).
* Good: multiarch coverage for common CI runners.
* Neutral: AGPL-3.0 licensing of the image is a deliberate stance.
* Bad: a bundled-browser image is large and must track base/browser updates.

### Confirmation

Shipped in docker `0289de4`, `807f70c`, `fad250f`, `f781751`; monorepo multiarch build `f962d5c5`
(2023-08-20). Confirmed by the published image exposing `npx doc-detective` and setting `CONTAINER=true`.

## Pros and Cons of the Options

### A. Batteries-included multiarch image
* Good: turnkey container runs; container-aware runtime; multiarch.
* Bad: large image; ongoing base/browser maintenance.

### B. No official image
* Good: nothing to maintain.
* Bad: every user reinvents the setup; inconsistent environments.

### C. Browserless minimal image
* Good: small.
* Bad: browser tests fail until the user adds a compatible browser.

## More Information

Recorded retrospectively (ADR backfill). Origin: `docker-images` commits `0289de4`, `807f70c`,
`fad250f`, `f781751`, and monorepo `f962d5c5`. Inventory ref: BACKFILL-INVENTORY.md Seq 88. The image
contract was later extended (Linux ffmpeg + `DOC_DETECTIVE` env, ADR 00118; DITA-OT, ADR 00125;
multi-OS publish, ADR 00140) and the configs merged into the monorepo (ADR 00147).
