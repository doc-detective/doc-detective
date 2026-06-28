---
status: accepted
date: 2025-10-08
decision-makers: doc-detective maintainers
---

# Bundle DITA-OT in the container images

## Context and Problem Statement

Doc Detective was about to add DITA support (`00126`), which processes `.ditamap` files through the `dita` CLI — and that CLI is DITA-OT, a Java toolchain not present in the container images. Running DITA tests in the official Linux and Windows images would otherwise fail at the toolchain-missing step. Should DITA-OT (and its Java/unzip prerequisites) be baked into the images?

## Decision Drivers

* DITA processing requires the DITA-OT toolchain and a JRE at runtime.
* The official images should make DITA tests work out of the box, not require users to layer in a toolchain.
* Both the Linux and Windows images must support DITA equivalently.
* The toolchain version should be pinned for reproducibility.

## Considered Options

* **A. Install pinned DITA-OT 4.3.4 plus Java/unzip into both images** (chosen).
* **B. Leave DITA-OT out; document a user-supplied layer.**
* **C. Install DITA-OT lazily at runtime on first DITA use.**

## Decision Outcome

Chosen option: **A**, because DITA support is only useful if the toolchain is present, and baking a pinned version into both images gives reproducible, zero-setup DITA runs. A runtime install would add first-run latency and a network dependency inside the container.

Contract decided:

* DITA-OT **4.3.4** installed at `/opt/dita-ot` and added to `PATH` in both images.
* Linux image adds `unzip` and `default-jre`; Windows image adds Microsoft OpenJDK 17.
* `update-ca-certificates` run to keep TLS trust current for toolchain downloads.

### Consequences

* Good: DITA tests run out of the box in the official images.
* Good: pinned 4.3.4 makes image builds reproducible.
* Bad: image size grows by a Java toolchain plus DITA-OT.

### Confirmation

Dockerfile changes across docker commits `5b07372`, `a20f59d`, `cab4f03`, `ece503e`.

## Pros and Cons of the Options

### A. Bake in pinned DITA-OT
* Good: zero-setup, reproducible DITA runs.
* Bad: larger images.

### B. User-supplied layer
* Good: smaller base images.
* Bad: DITA tests fail out of the box; burden on users.

### C. Lazy runtime install
* Good: pay only when DITA is used.
* Bad: first-run latency and in-container network dependency.

## More Information

Recorded retrospectively (ADR backfill). Origin: docker commits `5b07372`, `a20f59d`, `cab4f03`, `ece503e`. Inventory ref: BACKFILL-INVENTORY.md Seq 185. Related: `00126` (DITA fileType support), `00118` (Linux image ffmpeg + env), `00147` (docker configs merged into monorepo).
