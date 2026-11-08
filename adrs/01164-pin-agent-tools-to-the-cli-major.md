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

agent-tools releases only from `main`. Its CLI 5 work lives on its `feat/v5-rc` branch, the counterpart of this repo's
`feat/v5-rc`. So the `v2` tag can't exist until CLI 5 GA, and a CLI 5 release candidate pinned to `v2` gets a 404.

Which agent-tools ref should a CLI install?

## Decision Drivers

- A CLI major installs skills that describe that major.
- agent-tools fixes still reach users without a CLI release.
- One place to change when the next major ships.

## Considered Options

- **A. A floating major tag (`v2`) in one constant, `AGENT_TOOLS_REF`.**
- **B. An exact release tag, such as `v2.0.0`.**
- **C. Keep the default branch.**
- **D. Pin `v2` during the release candidate too.**

## Decision Outcome

Chosen option: **A**, with agent-tools' `feat/v5-rc` branch standing in for `v2` until CLI 5 GA.
`src/agents/fetcher.ts` exports `AGENT_TOOLS_REF` and `agentToolsRawUrl(file)`.

- Every adapter's up-to-date check reads `raw.githubusercontent.com/doc-detective/agent-tools/<ref>/...`.
- Codex and OpenCode download `codeload.github.com/doc-detective/agent-tools/zip/<ref>`. `fetchAgentToolsZip`
  defaults to the pinned ref.
- Both URL shapes take a branch name with a slash as-is, so neither needs a `refs/heads/` prefix.
- Gemini CLI and Qwen Code pass `--ref <ref>` to `extensions install`. Both CLIs document `--ref` for git sources.
- Claude Code (`claude plugin marketplace add`) and Copilot CLI (`copilot plugin marketplace add`) have no ref option,
  so they keep tracking the default branch. The `install agents` reference page says so.

#### Release candidate: `feat/v5-rc`

While CLI 5 is a release candidate, `AGENT_TOOLS_REF = "feat/v5-rc"`. A push to that agent-tools branch reaches CLI 5
release candidate users on their next `install agents`.

#### General availability: `v2`

At CLI 5 GA, agent-tools merges `feat/v5-rc` to `main` and releases 2.0.0, which creates the `v2` tag. Then:

1. Confirm `codeload.github.com/doc-detective/agent-tools/zip/v2` returns 200.
2. Set `AGENT_TOOLS_REF = "v2"` in `src/agents/fetcher.ts`, in the change that promotes CLI 5 to `main`.
   A `TODO(ADR 01164)` comment marks the line.
3. Change the one value assertion in `test/agents-pinned-ref.test.js` to `"v2"`.
4. Update this ADR and `docs/fern/pages/reference/cli/install.mdx`. A `TODO(ADR 01164)` comment marks the docs
   paragraph.
5. Confirm `grep -rn "feat/v5-rc" src test docs/fern` finds nothing.

agent-tools' release workflow moves the `v2` tag to each 2.x release. CLI 4 pins `v1` the same way, on its own
branch.

### Consequences

- Good: CLI 5 release candidates install the CLI 5 skills today, with no agent-tools release.
- Good: after GA, CLI 5 gets agent-tools 2.x fixes as they release, and never 3.x.
- Good: the GA switch and the next major each change one constant.
- Bad: the GA switch is a manual step. Ship GA with `feat/v5-rc` and CLI 5 keeps tracking a branch.
- Bad: switch before the `v2` tag exists and installs for Codex, OpenCode, Gemini CLI, and Qwen Code fail.
- Bad: Claude Code and Copilot CLI installs follow the default branch. agent-tools 2.x must merge to it at CLI 5 GA.
  Their up-to-date check reads the pinned ref. When the default branch's version differs, those two report an update
  on every run. The update itself is harmless.
- Neutral: whether a host CLI's `extensions update` follows a moved tag is up to that CLI.

### Confirmation

- `test/agents-pinned-ref.test.js` asserts `AGENT_TOOLS_REF === "feat/v5-rc"`. That's the only test that names
  the ref.
- The same file asserts that every adapter's up-to-date URL starts with `.../agent-tools/<AGENT_TOOLS_REF>/`.
  It also asserts that `fetchAgentToolsZip` requests `zip/<AGENT_TOOLS_REF>`, and that Codex and OpenCode pass the
  ref to `fetchZip`.
- `test/agents-gemini.test.js` and `test/agents-qwen.test.js` assert `--ref <AGENT_TOOLS_REF>` on a fresh install.
- The `install-agents integration` workflow installs every agent for real, then checks that a second run is
  already up to date.
- At GA, only the value assertion changes to `v2`. The rest read the constant.

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

### D. `v2` during the release candidate

- Good: no switch at GA.
- Bad: the tag doesn't exist before GA. Every Codex, OpenCode, Gemini CLI, and Qwen Code install fails with a 404.
- Bad: every agent's up-to-date check fails, so a repeat install never reports "already up to date".
