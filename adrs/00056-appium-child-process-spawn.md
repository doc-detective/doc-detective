---
status: accepted
date: 2023-04-21
decision-makers: doc-detective maintainers
---

# Spawn Appium as a tree-killable child process

## Context and Problem Statement

After the pivot to Appium/WebdriverIO drivers (ADR 00042), the runner needed an Appium server
process alongside each run. Running Appium in-process tangled its lifecycle with the runner's and
risked orphaned processes that survived the run and held ports. Appium also spawns child processes of
its own, so a naive kill could leave a subtree alive. How should the runner start and stop Appium so
it is reliably torn down, including on Windows, and so the same code works whether running from source
or from an installed module?

## Decision Drivers

* Appium must be reliably terminated at the end of a run, leaving no orphaned subtree.
* Termination must work cross-platform, including Windows process trees.
* The launcher must resolve Appium correctly whether running from source checkout or installed module.
* Child commands should run without spurious console windows on Windows.

## Considered Options

* **A. Spawn Appium as a child process and tree-kill it; detect source-vs-module path; run commands with `{shell:true, windowsHide:true}`** (chosen).
* **B. Run Appium in-process within the runner.**
* **C. Spawn Appium but kill only the top-level PID (no tree kill).**

## Decision Outcome

Chosen option: **A**, because an externally spawned, tree-killed process cleanly isolates Appium's
lifecycle from the runner and reliably reclaims the whole subtree. Appium is launched via `spawn` and
torn down with a tree-kill so no child survives. The launcher detects whether it is running from a
source checkout or an installed module to resolve the correct Appium path. Spawned commands use
`{shell:true, windowsHide:true}` so shell features work and no console window flashes on Windows.

### Consequences

* Good: no orphaned Appium subtree after a run; clean cross-platform teardown.
* Good: works from both source and installed-module layouts.
* Bad: managing an external process adds spawn/kill plumbing and platform-specific handling.
* Neutral: `shell:true` enables shell parsing, which later command-execution features rely on.

### Confirmation

Shipped in `core` `b1551734`, `2b6a3b95`, `04adc5bc`. Confirmed by Appium being spawned as a child
process and tree-killed on teardown with no surviving processes.

## Pros and Cons of the Options

### A. Spawned child + tree-kill + shell/windowsHide
* Good: isolated lifecycle; reliable full-subtree teardown; cross-platform.
* Bad: external-process plumbing and OS-specific kill logic.

### B. In-process Appium
* Good: no spawn/kill machinery.
* Bad: lifecycle entangled with the runner; harder to guarantee clean shutdown.

### C. Top-level PID kill only
* Good: simpler than tree-kill.
* Bad: leaves Appium's own children orphaned, holding ports.

## More Information

Recorded retrospectively (ADR backfill). Origin: `doc-detective-core` commits `b1551734`,
`2b6a3b95`, `04adc5bc`. Inventory ref: BACKFILL-INVENTORY.md Seq 82. Builds on the Appium/WebdriverIO
pivot (ADR 00042); Appium port selection and readiness handling were hardened later (ADR 00130,
00162).
