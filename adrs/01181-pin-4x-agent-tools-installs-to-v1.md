---
status: accepted
date: 2026-11-09
decision-makers: doc-detective maintainers
---

# Pin 4.x agent-tools installs to v1

Backports ADR 01164 on `feat/v5-rc` to 4.x, with `v1` as the ref. If `01181` is taken when this merges, renumber
this file to the next free number.

## Context and Problem Statement

`doc-detective install agents` installs skills and plugins from the
[agent-tools](https://github.com/doc-detective/agent-tools) repository. On 4.x, every adapter read agent-tools'
default branch, `main`:

- Codex and OpenCode downloaded `codeload.github.com/doc-detective/agent-tools/zip/main`.
- Every adapter's up-to-date check read `raw.githubusercontent.com/doc-detective/agent-tools/main/...`.
- Claude Code and Copilot CLI added the repository as a plugin marketplace with no ref. Gemini CLI and Qwen Code
  installed it as a git extension with no ref. All four followed the default branch.

agent-tools 1.x teaches CLI 4, and 2.x teaches CLI 5. When agent-tools merges its 2.x work to `main`, every 4.x
`install agents` would start installing skills that teach flags and exit codes 4.x doesn't have.

ADR 01164 on `feat/v5-rc` pins CLI 5 to agent-tools' `v2` through one constant, `AGENT_TOOLS_REF`. 4.x needs the
same pin, at `v1`, before agent-tools' 2.x reaches `main`.

## Decision Drivers

- A CLI major installs skills that describe that major.
- The 5.0 merge to `main` should carry over the same mechanism with one constant changed.

## Considered Options

- **A. Backport ADR 01164's mechanism with `AGENT_TOOLS_REF = "v1"`.**
- **B. Pin an exact release tag, such as `v1.4.0`.**
- **C. Keep the default branch.**

## Decision Outcome

Chosen option: **A**. `src/agents/fetcher.ts` exports `AGENT_TOOLS_REF = "v1"` and `agentToolsRawUrl(file)`. The
mechanism matches ADR 01164 on `feat/v5-rc`:

- Every adapter's up-to-date check reads `raw.githubusercontent.com/doc-detective/agent-tools/v1/...`.
- Codex and OpenCode download `codeload.github.com/doc-detective/agent-tools/zip/v1`. `fetchAgentToolsZip`
  defaults to the pinned ref.
- Gemini CLI and Qwen Code pass `--ref v1` to `extensions install`.
- Claude Code and Copilot CLI add the marketplace as `doc-detective/agent-tools#v1`. On an update, both re-add
  the marketplace at the ref first. A failed re-add logs a warning and doesn't block the update.
- Claude Code's settings-file fallback writes `ref: "v1"` on the marketplace's `github` source, and rewrites an
  entry without it in place.

Precondition: the `v1` tag must exist on agent-tools before this merges. The maintainer creates it on agent-tools'
`main` tip from before the 2.x merge. A later 1.x fix reaches 4.x users when `v1` moves to it.

When 5.0 merges to `main`, ADR 01164 supersedes this ADR and `AGENT_TOOLS_REF` becomes the CLI 5 ref.

### Consequences

- Good: 4.x keeps installing 1.x skills after agent-tools' `main` moves to 2.x.
- Good: the 5.0 merge changes one constant, its one value assertion, and the docs paragraph.
- Bad: merging before the `v1` tag exists breaks Codex, OpenCode, Gemini CLI, and Qwen Code installs with a 404,
  and every up-to-date check fails.
- Bad: a Gemini CLI or Qwen Code install made by an earlier 4.x release recorded no ref. `extensions update`
  replays that, so it keeps following the default branch until the user uninstalls the extension and runs
  `install agents` again. `docs/fern/pages/reference/cli/install.mdx` gives the steps.
- Neutral: Claude Code and Copilot CLI installs made by an earlier 4.x release move to `v1` on their next update,
  through the marketplace re-add. Neither CLI documents whether a re-add changes the tracked ref.

### Confirmation

- `test/agents-pinned-ref.test.js` asserts `AGENT_TOOLS_REF === "v1"`. That's the only test that names the ref.
- The same file asserts every adapter's up-to-date URL, the `fetchAgentToolsZip` default, and the ref Codex and
  OpenCode pass to `fetchZip`.
- `test/agents-gemini.test.js` and `test/agents-qwen.test.js` assert `--ref <AGENT_TOOLS_REF>` on a fresh install.
- `test/agents.test.js` and `test/agents-copilot.test.js` assert `marketplace add doc-detective/agent-tools#<ref>`
  on a fresh install and before an update, and that a failed re-add doesn't block the update.
- `grep -rn "agent-tools/main" src` finds nothing.

## Pros and Cons of the Options

### A. Backport with `v1`

- Good: the same code on both majors, so the 5.0 merge is a one-constant change.
- Bad: needs a `v1` tag on agent-tools before merge.

### B. Exact release tag

- Good: fully reproducible installs.
- Bad: every 1.x fix needs a 4.x release to reach users.

### C. Default branch

- Good: no coordination with agent-tools.
- Bad: 4.x users get CLI 5 skills as soon as agent-tools' 2.x reaches `main`.
