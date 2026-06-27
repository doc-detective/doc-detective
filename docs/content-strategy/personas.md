# Personas

Five concrete personas, one per audience. Each writing task should be anchored to the persona(s) it
serves. Names are chosen so the Critical User Journey codes are mnemonic (W / D / P / A / C). See
`cujs.md` for the end-to-end journeys each persona must complete.

---

## Wren — Documentation Engineer (LEAD persona)

Wren owns a large docs-as-code site for a platform product. She is fluent in Markdown, YAML, Git, and
reading a CI config. She is not a JSON Schema expert and doesn't want to hand-write test internals.

**Goal:** every procedure, UI flow, and screenshot in the docs stays accurate as the product ships.

**Pains:**
- A UI change silently breaks a documented procedure; nobody notices until a reader files an issue.
- Screenshots go stale and no longer match the product.
- Metadata and steps drift as the team and the product grow, but she has no enforcement mechanism —
  only review fatigue.

**How she uses Doc Detective:** writes inline or detected tests in her source files, runs them locally,
wires a CI gate, and lets the tool auto-capture fresh screenshots and video. She returns when adding
coverage, supporting a new platform/browser, or tightening the suite.

**Why she is the lead persona:** she is the primary adopter and touches every layer — authoring tests,
contexts, configuration, recording, and CI. Her anchor journey (W1) threads install → authoring →
contexts → CI in a single coherent path.

---

## Diego — Developer / SDK & API Engineer

Diego maintains code samples and API reference content. He has high technical proficiency and scripts
freely.

**Goal:** prove that every sample, command, and API call in the docs works against the real product.

**Pains:**
- Code samples drift from the SDK as it changes.
- API responses change shape and the documented examples quietly become wrong.
- He has no fast, repeatable way to assert that a doc's commands still run and still produce the
  expected output.

**How he uses Doc Detective:** authors standalone `*.spec.json` files; uses `runShell`, `runCode`, and
`runBrowserScript` to execute commands and scripts; uses `httpRequest` and `checkLink` to exercise
APIs; captures `outputs` and asserts on them; and generates API tests from an OpenAPI spec.

---

## Priya — Platform / CI Engineer

Priya maintains CI/CD infrastructure for many repos across a mix of platforms. She automates
everything and optimizes for low per-repo maintenance.

**Goal:** drop in a doc-testing gate that runs identically everywhere, headless, and feeds results
into existing tooling without custom glue per repo.

**Pains:**
- Browser and display setup in CI is fiddly; headless runs go flaky.
- Per-tool config sprawl: a different recipe for every checker.
- She needs stable, documented reporters and exit behavior, plus artifacts (screenshots, video, JSON)
  that flow into PR review and dashboards.

**How she uses Doc Detective:** runs the GitHub Action or `doc-detective-runner` in Docker, sets
`--reporters json/html`, tunes `concurrentRunners`, warms the cache with `install`, and optionally
points at the orchestration API for distributed runs. She returns when adding a CI platform or when
output formats change.

---

## Aria — AI-assisted Docs Author (PILLAR persona)

Aria writes and maintains docs with a coding agent in the loop. She is comfortable directing an agent
but wants the agent to do the mechanical test authoring.

**Goal:** generate and maintain Doc Detective tests from prose without hand-writing JSON, and keep them
green as the product changes.

**Pains:**
- Hand-authoring step JSON is tedious and error-prone.
- Tests break on minor UI churn and someone has to babysit them.
- She is unsure how to wire an agent or an MCP server to her project so the agent has the right tools
  and context.

**How she uses Doc Detective:** runs `install agents`; works through the Claude Code, Copilot CLI, or
Gemini CLI integrations; connects agent tools / MCP; relies on self-healing to repair tests; and
follows best-practice prompts for agent-authored tests.

---

## Cole — Open-source Contributor (secondary)

Cole wants to fix a bug, add a feature, or improve the docs of Doc Detective itself. He has medium-to-
high proficiency but low context on the project's multi-repo layout.

**Goal:** set up the repo, follow the contribution and review process, and land a change.

**Pains:**
- The project spans several repos (core, common, action, docs) and it's unclear where a change goes.
- Local-development and test steps aren't obvious to a newcomer.

**How he uses Doc Detective:** follows the local-development guide, picks the standard or substantial
contribution flow, consults the per-repo guides and content templates, and works through the review
process.
