---
status: accepted
date: 2026-03-07
decision-makers: doc-detective maintainers
---

# Merge docker configs into the monorepo

## Context and Problem Statement

After the engine (`00145`) and schema package (`00146`) merged in, the container build artifacts —
the Linux and Windows Dockerfiles, the build script, and the publish workflow — still lived in a
separate `docker` repo. The image base/runtime contract therefore drifted out of sync with the code
it packages, and shipping a new image meant a cross-repo change. With the rest of the v4 line
consolidated, should the docker configuration move into the `doc-detective` monorepo?

## Decision Drivers

* The image's base/runtime contract should version with the code it ships.
* A runtime change that affects the container (a new dependency, an entrypoint tweak) should land
  with its Dockerfile in one PR.
* The build-and-publish workflow should live beside the source it builds.
* Both Linux and Windows image definitions should sit together for consistent maintenance.

## Considered Options

* **A. Merge docker configs into the monorepo as `src/container/{linux,windows}.Dockerfile` + `build.cjs` + container-build-push workflow** (chosen).
* **B. Keep the docker repo separate and trigger its build from the main repo's release.**
* **C. Generate Dockerfiles from a template at publish time.**

## Decision Outcome

Chosen option: **A**, because co-locating the image definitions and their publish workflow with the
source makes the container's base/runtime contract an in-repo, versioned artifact that moves in
lockstep with the code.

The contract:

* `src/container/linux.Dockerfile` and `src/container/windows.Dockerfile` define the per-OS image.
* `src/container/build.cjs` drives the build.
* A container-build-push workflow publishes the images.
* This establishes the **in-repo Docker base/runtime contract**, completing the monorepo
  consolidation (engine `00145`, common `00146`, docker `00147`).

### Consequences

* Good: image base/runtime contract versions with the code it packages.
* Good: a container-affecting runtime change lands with its Dockerfile in one PR.
* Good: Linux and Windows image definitions are maintained side by side.
* Bad: container build/publish CI now lives in the main repo's workflow surface.
* Neutral: structural move; the prior image contracts (`00059`, `00118`, `00140`) carry over.

### Confirmation

Shipped in doc-detective `912191e7` (#191). Confirmed by `src/container/linux.Dockerfile`,
`src/container/windows.Dockerfile`, `src/container/build.cjs`, and the container-build-push workflow
in-repo.

## Pros and Cons of the Options

### A. Merge configs into `src/container/`
* Good: versioned in-repo image contract; single-PR container changes; co-located build.
* Bad: container CI moves into the main repo.

### B. Keep docker repo, trigger remotely
* Good: smaller main-repo footprint.
* Bad: cross-repo drift and dispatch coordination persist.

### C. Template-generate Dockerfiles at publish
* Good: less duplication between OS variants.
* Bad: more build machinery; harder to read/debug the actual image definition.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `912191e7` (#191). Inventory
ref: BACKFILL-INVENTORY.md Seq 208. Related: `00059` (docker base image), `00118` (container env +
ffmpeg), `00140` (multi-OS publish), `00145`/`00146` (merge core/common).
