---
status: accepted
date: 2023-09-08
decision-makers: doc-detective maintainers
---

# Per-context browser app options

## Context and Problem Statement

A spec or test runs inside a `context` that names an application (a browser) and the platforms it
supports. Until now the browser was launched with fixed dimensions and headless behavior, so a test
could not ask for a specific viewport size or run headed in one context and headless in another.
Documentation screenshots and find/click flows depend on a predictable window size. How should
per-context browser launch parameters (size, headless) be expressed and wired into the underlying
Firefox/Chrome drivers?

## Decision Drivers

* Screenshot and layout-sensitive steps need a deterministic, configurable viewport.
* Headless vs. headed must be selectable per context (recording/visual work needs headed).
* Launch parameters must reach the real Firefox/Chrome driver argument lists, not just the schema.
* Sensible defaults so most tests need no `options` block at all.

## Considered Options

* **A. A per-context `app.options` object (`width`, `height`, `headless`) wired into driver args, schema-defined, with defaults** (chosen).
* **B. Global config-level browser options only (no per-context override).**
* **C. Free-form driver-capabilities passthrough.**

## Decision Outcome

Chosen option: **A**, because launch parameters belong to the context that defines the browser, and
a small typed object keeps the contract discoverable while still flowing into the driver. The
context's `app` gains an `options` object with `width` (default `1200`), `height` (default `800`),
and `headless` (default `true`); the schema adds `app.options` and the runner maps these into the
Firefox and Chrome driver argument lists at launch.

### Consequences

* Good: deterministic, per-context viewport and headless control for screenshots and layout steps.
* Good: defaults (1200×800, headless) mean existing tests need no change.
* Bad: two browser engines must each translate the same options into their own arg syntax.
* Neutral: this v1 `app.options` shape is later folded into the `context_v3` / unified `browsers`
  redesign.

### Confirmation

Shipped in core `076982d5` (driver-arg wiring) and common `7f99cba`, `e593fee` (schema `app.options`).
Defaults and per-context override are exercised by context fixtures driving headed/headless browsers.

## Pros and Cons of the Options

### A. Per-context `app.options` object
* Good: scoped to the context that owns the browser; typed; defaulted.
* Bad: per-engine arg translation.

### B. Global options only
* Good: one place to set.
* Bad: can't differ per context; blocks mixed headed/headless runs.

### C. Raw capabilities passthrough
* Good: maximally flexible.
* Bad: leaks driver internals into the public contract; no validation.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commit `076982d5`;
doc-detective-common commits `7f99cba`, `e593fee`. Inventory ref: BACKFILL-INVENTORY.md Seq 91.
Related: `00044` (context platform gating), `00098` (context_v3 / browsers array redesign).
