---
status: accepted
date: 2026-04-20
decision-makers: doc-detective maintainers
---

# Coding-agent postinstall detection prompt

## Context and Problem Statement

The `install-agents` subcommand (`00154`) installs Doc Detective's integration for a chosen
coding agent, but users had to know it existed and run it manually. Many users install
Doc Detective from inside an environment where a coding agent (Claude Code, Copilot, Gemini,
Codex, Qwen, opencode) is already present, so the opportune moment to offer the integration
is at install time. But a postinstall prompt must never hang CI or non-interactive installs,
and probing `PATH` for agent binaries must be done safely. Should postinstall detect coding
agents and offer to install their integration, and under what guards?

## Decision Drivers

* The integration should be offered at the moment an agent is detectable (install time).
* A prompt must never block non-interactive installs (CI, scripted `npm i`).
* Users must be able to opt out without interaction.
* `PATH` probing for agent binaries must be sanitized to avoid unsafe lookups.

## Considered Options

* **A. postinstall detects coding agents and offers `install-agents --agent <id>`, gated by TTY and `CI`/`DOC_DETECTIVE_SKIP_AGENT_PROMPT`, with sanitized PATH lookup** (chosen).
* **B. Always prompt during postinstall regardless of environment.**
* **C. No postinstall detection; rely on documentation telling users to run `install-agents`.**

## Decision Outcome

Chosen option: **A**, because install time is when an agent is most reliably detectable, and
the prompt is safe only behind strict interactivity guards. The postinstall step detects
installed coding agents (Claude Code, Copilot, Gemini, Codex, Qwen, opencode) and offers to
run `install-agents --agent <id>`. The prompt is gated by a TTY check and is suppressed when
`CI` is set or `DOC_DETECTIVE_SKIP_AGENT_PROMPT` is present, so non-interactive installs
proceed silently. `PATH` is sanitized before probing for agent binaries.

### Consequences

* Good: integration is offered exactly when an agent is detected, with no manual discovery.
* Good: CI and scripted installs are never blocked (TTY + `CI`/skip-env guards).
* Good: explicit opt-out via `DOC_DETECTIVE_SKIP_AGENT_PROMPT`.
* Good: sanitized PATH lookup avoids unsafe binary resolution.
* Neutral: only detected agents are offered; absent agents produce no prompt.
* Bad: postinstall now has agent-detection logic to maintain alongside the adapters.

### Confirmation

Shipped in postinstall agent detection (commits `88772fbc` PR #273, `050af3cc`). Confirmed by
the TTY/`CI`/`DOC_DETECTIVE_SKIP_AGENT_PROMPT` gating and sanitized PATH probe.

## Pros and Cons of the Options

### A. Guarded postinstall detection
* Good: timely, safe, opt-out-able.
* Bad: extra postinstall logic.

### B. Always prompt
* Good: maximum visibility.
* Bad: hangs CI/non-interactive installs; unacceptable.

### C. Docs only
* Good: zero install-time code.
* Bad: low discoverability; users miss the integration.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `88772fbc` (PR #273),
`050af3cc`. Inventory ref: BACKFILL-INVENTORY.md Seq 221. Related: `00154` (install-agents
CLI subcommand).
