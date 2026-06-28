---
status: accepted
date: 2026-05-12
decision-makers: doc-detective maintainers
---

# Post-run hint system

## Context and Problem Statement

After a run, users often missed contextual next steps — a flag that would have helped, a feature
relevant to what they just did, a common pitfall they hit. There was no mechanism to surface a short,
situational tip without spamming logs or interfering with machine-readable output. How should Doc
Detective offer one helpful, context-aware hint after a run, and how do users turn it off?

## Decision Drivers

* New features need a discovery surface; users don't read the whole CLI reference.
* A hint must be unobtrusive: at most one per run, human-facing only.
* It must never pollute piped/redirected or non-info output (CI, JSON consumers).
* Users and configs must be able to disable hints entirely.
* Hints should live in a dedicated, extensible module, not be scattered inline.

## Considered Options

* **A. A dedicated `src/hints/*` system that prints one short context-selected hint after a run (TTY + info log level only), gated by `config.hints` and `--no-hints`** (chosen).
* **B. Print all applicable hints after every run.**
* **C. No hint surface; rely on docs and release notes only.**

## Decision Outcome

Chosen option: **A**, because a single, situational, opt-out hint aids discovery without becoming
noise. The system lives in `src/hints/*` (an initial catalog of 25 hints); after a run it selects
and prints exactly one short hint, only when output is a TTY and the log level is `info`. It is
controlled by a `config.hints` enable/disable field and the `--no-hints` CLI flag (commit
`1e2bf432`, PR #303).

### Consequences

* Good: lightweight in-product discovery of flags/features tied to what the user just did.
* Good: never interferes with CI or machine-readable output (TTY + info gate).
* Good: one-flag / one-config opt-out.
* Neutral: hint selection is contextual, so different runs surface different tips.
* Bad: the hint catalog must be curated and kept current as features change.

### Confirmation

`src/hints/*` (25 hints), the TTY + info gate, `config.hints`, and `--no-hints` ship the feature.
Shipped in `1e2bf432` (PR #303). Authoring guidance for new hints lives in `src/hints/AGENTS.md`.

## Pros and Cons of the Options

### A. One contextual hint, opt-out
* Good: discovery without noise; safe for CI; disable-able.
* Bad: requires maintaining the hint catalog.

### B. Print all hints
* Good: nothing missed.
* Bad: noisy; trains users to ignore output.

### C. No hints
* Good: zero surface to maintain.
* Bad: features stay undiscovered until users read docs.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `1e2bf432` (PR #303).
Inventory ref: BACKFILL-INVENTORY.md Seq 228. Related: `00170` (`debug` subcommand diagnostic dump),
`00122` (debug-only version/config dump).
