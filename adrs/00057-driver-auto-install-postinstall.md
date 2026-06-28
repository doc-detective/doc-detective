---
status: accepted
date: 2023-05-01
decision-makers: doc-detective maintainers
---

# Auto-install Appium browser drivers via postinstall, with container detection

## Context and Problem Statement

Running browser tests through Appium requires the gecko (Firefox) and chromium browser drivers to be
present. Requiring users to install these manually was a setup cliff that broke the "install and run"
promise. A `postinstall` hook could provision the drivers automatically, but it needed to skip work
when drivers were already present and behave correctly inside containers (where assumptions about
interactivity and paths differ). Should driver provisioning happen automatically at install time, and
how should it detect that it is running in a container?

## Decision Drivers

* Browser drivers should be available after a normal install with no manual steps.
* Re-installing already-present drivers wastes time and bandwidth.
* Container environments differ and must be detectable so provisioning can adapt.
* The wrapper package should reuse the same provisioning rather than duplicate it.

## Considered Options

* **A. `postinstall` re-enables Appium driver deps and installs gecko+chromium if absent; add an `inContainer()` helper; wrapper delegates to this postinstall** (chosen).
* **B. Require users to install drivers manually (document the steps).**
* **C. Lazily install drivers on first run instead of at install time.**

## Decision Outcome

Chosen option: **A**, because provisioning at install time makes the common case work with no extra
steps while staying idempotent. The `postinstall` hook re-enables the Appium driver dependencies and
installs the gecko and chromium drivers when they are absent. An `inContainer()` helper detects
container execution via the `IN_CONTAINER` environment variable or `/proc` cgroup inspection, so
provisioning can adapt to containerized environments. The CLI wrapper delegates to this same
postinstall rather than re-implementing it.

### Consequences

* Good: browser drivers present after a normal install; no manual setup.
* Good: idempotent — present drivers are not reinstalled.
* Good: container-aware via `inContainer()`.
* Bad: postinstall network/disk activity surprises some environments; later reworked toward lazy/JIT provisioning.

### Confirmation

Shipped in `core` `b2b460b5`, `6a127c34`, `d9460eba`; wrapper delegation `c187cbe2`, `725d2897`
(2023-07-28). Confirmed by gecko/chromium drivers being present after install and `inContainer()`
returning true under `IN_CONTAINER`/cgroup signals.

## Pros and Cons of the Options

### A. postinstall auto-install + inContainer + wrapper delegation
* Good: zero-setup drivers; idempotent; container-aware.
* Bad: install-time network/disk activity; heavy for users who never run browser tests.

### B. Manual driver install
* Good: no implicit install-time work.
* Bad: setup cliff; broken first-run experience.

### C. Lazy install on first run
* Good: no install-time cost.
* Bad: first run pays the latency; harder to reason about at the time.

## More Information

Recorded retrospectively (ADR backfill). Origin: `doc-detective-core` commits `b2b460b5`, `6a127c34`,
`d9460eba`, and wrapper `c187cbe2`, `725d2897`. Inventory ref: BACKFILL-INVENTORY.md Seq 83. The
eager-postinstall model was later evolved toward lazy/JIT runtime provisioning (ADR 00164).
