---
status: accepted
date: 2026-11-07
decision-makers: doc-detective maintainers
---

# Pin agent-tools to the CLI's major

## Context and Problem Statement

`doc-detective install agents` installs the doc-detective skills and plugins from the
[agent-tools](https://github.com/doc-detective/agent-tools) repository. Every adapter read agent-tools' default
branch:

- Codex and OpenCode downloaded `codeload.github.com/doc-detective/agent-tools/zip/main`.
- Every adapter's up-to-date check read `raw.githubusercontent.com/doc-detective/agent-tools/main/...`.
- Claude Code and Copilot CLI add the repository as a plugin marketplace, and Gemini CLI and Qwen Code install it
  as a git extension. All four follow the default branch.

The skills teach CLI flags and exit codes. agent-tools 2.x teaches CLI 5 (`--output-dir`, exit `2` for nothing
tested), and 1.x teaches CLI 4. While both CLI majors are in use, one default branch is wrong for one of them.
Before the 2.x merge, a CLI 5 user gets CLI 4 skills. After it, a CLI 4 user gets flags that 4.x doesn't have.

Which agent-tools ref should a CLI install?

## Decision Drivers

- A CLI major installs skills that describe that major.
- agent-tools fixes still reach users without a CLI release.
- One place to change when the next major ships.

## Considered Options

- **A. A floating major tag (`v2`) in one constant, `AGENT_TOOLS_REF`.**
- **B. An exact release tag, such as `v2.0.0`.**
- **C. Keep the default branch.**

## Decision Outcome

Chosen option: **A**. `src/agents/fetcher.ts` exports `AGENT_TOOLS_REF = "v2"` and `agentToolsRawUrl(file)`.

- Every adapter's up-to-date check reads `raw.githubusercontent.com/doc-detective/agent-tools/v2/...`.
- Codex and OpenCode download the `v2` zip, and `fetchAgentToolsZip` defaults to `v2`.
- Gemini CLI and Qwen Code pass `--ref v2` to `extensions install`. Both CLIs document `--ref` for git sources.
- Claude Code (`claude plugin marketplace add`) and Copilot CLI (`copilot plugin marketplace add`) have no ref option,
  so they keep tracking the default branch. The `install agents` reference page says so.

agent-tools' release workflow moves the `v2` tag to each 2.x release. CLI 4 pins `v1` the same way, on its own
branch.

### Consequences

- Good: CLI 5 gets agent-tools 2.x fixes as they release, and never 3.x.
- Good: the next major changes one constant.
- Bad: `install agents` for Codex, OpenCode, Gemini CLI, and Qwen Code fails until agent-tools publishes the `v2`
  tag. It must exist before CLI 5 GA.
- Bad: Claude Code and Copilot CLI installs follow the default branch. agent-tools 2.x must merge to it at CLI 5 GA.
  Their up-to-date check reads `v2`, so when the default branch runs ahead of the tag, those two report an update on
  every run. The update itself is harmless.
- Neutral: whether a host CLI's `extensions update` follows a moved tag is up to that CLI.

### Confirmation

- `test/agents-pinned-ref.test.js` asserts `AGENT_TOOLS_REF === "v2"`, that every adapter's up-to-date URL starts
  with `.../agent-tools/v2/`, that `fetchAgentToolsZip` defaults to `zip/v2`, and that Codex and OpenCode pass `v2`
  to `fetchZip`.
- `test/agents-gemini.test.js` and `test/agents-qwen.test.js` assert `--ref v2` on a fresh install.

## Pros and Cons of the Options

### A. Floating major tag

- Good: fixes reach users without a CLI release, and a new major can't.
- Bad: agent-tools must move the tag on release. That's one step in its release workflow.

### B. Exact release tag

- Good: fully reproducible installs.
- Bad: every agent-tools fix needs a CLI release to reach users.

### C. Default branch

- Good: no coordination with agent-tools.
- Bad: one of the two CLI majors always gets the wrong skills.
