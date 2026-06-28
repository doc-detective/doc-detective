---
status: accepted
date: 2026-04-18
decision-makers: doc-detective maintainers
---

# install-agents CLI subcommand

## Context and Problem Statement

Coding agents (Claude Code, Codex, Copilot CLI, Gemini CLI, opencode, Qwen Code) each expect
project-local configuration — skills, instructions, or agent definitions — in a tool-specific
location and format. Authors who wanted Doc Detective's agent integrations had no
first-class way to install them; they had to copy files by hand per agent. The audit needed
a CLI subcommand that writes the right integration for whichever coding agent(s) the user
chose. What command, and what adapter surface, should Doc Detective expose for this?

## Decision Drivers

* Six distinct coding agents each have their own config location and file format.
* Installation should be one command, not manual file copying.
* Adapters must be isolated per agent so adding/removing one is contained.
* The integration set must be selectable (install one agent, several, or all).

## Considered Options

* **A. An `install-agents` subcommand backed by one adapter module per supported agent under `src/agents/`** (chosen).
* **B. A single generic config writer parameterized by agent, no per-agent adapters.**
* **C. Document manual installation steps per agent; ship no installer.**

## Decision Outcome

Chosen option: **A**, because each agent's on-disk contract differs enough that per-agent
adapters keep the format/location knowledge contained and independently testable. The
`doc-detective` CLI gained an `install-agents` subcommand (declared in `cli.ts`) backed by
six adapters under `src/agents/` — one each for `claude-code`, `codex`, `copilot-cli`,
`gemini-cli`, `opencode`, and `qwen-code`. Each adapter knows where and in what format to
write its agent's integration. This subcommand later became the target of the postinstall
detection prompt (`00159`).

### Consequences

* Good: one command installs Doc Detective's integration for any supported agent.
* Good: per-agent adapters isolate format/location changes.
* Good: the adapter set is the extension point for future agents.
* Neutral: agent-specific behavior lives behind a uniform subcommand surface.
* Bad: six adapters to maintain as each agent's config conventions evolve.

### Confirmation

Shipped as the `install-agents` subcommand in `cli.ts` with adapters under `src/agents/`
(commit `ae3f76d4`). Confirmed by the six adapter modules and the subcommand dispatch.

## Pros and Cons of the Options

### A. install-agents subcommand + per-agent adapters
* Good: isolated, testable adapters; one user command.
* Bad: six adapters to keep current.

### B. Generic parameterized writer
* Good: less code.
* Bad: leaks per-agent format/location into one branchy function.

### C. Manual docs only
* Good: nothing to maintain in code.
* Bad: error-prone manual setup; no automation.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `ae3f76d4`. Inventory
ref: BACKFILL-INVENTORY.md Seq 216. Related: `00159` (coding-agent postinstall detection).
