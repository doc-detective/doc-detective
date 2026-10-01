# Target audiences

Doc Detective serves five distinct audiences. The **lead audience** drives the primary IA track and
gets the deepest coverage. Secondary audiences have dedicated tracks, scoped to what they
actually need from the tool.

**Audiences 1 and 2 do the same job, testing docs, through different interfaces.** Both own
documentation and want it to stay correct automatically. They differ only in the **kind of interface
their procedures drive**, a graphical UI versus commands, code, and APIs. The IA therefore gives them
one shared "Test your docs" track with surface-typed sub-sections, not two competing tracks. See
[`information-architecture.md`](./information-architecture.md) for how that umbrella is structured.

## 1. Documentation teams, UI-procedure authors (lead)

Own a docs repo and the procedures, screenshots, and UI flows in it. They want that content to *stay
correct automatically* as the product ships, instead of rotting silently until a reader complains.
Their docs mostly walk readers through a **graphical interface**.

This is the lead audience because they adopt Doc Detective as part of their everyday
workflow. They author tests, configure contexts, capture screenshots and video, and live with the
CI gate. The "Docs as Tests" thesis is the product's identity, and these users touch every layer of
it. Everything else serves them or intersects with them.

## 2. Developers: CLI, code, and API doc authors

Own docs whose procedures are **code samples, CLI commands, and API calls**. Those live embedded in
the docs, or in a spec file beside them. They want those procedures to run and assert correctly
against the real product. They are engineering-oriented and may not write prose at all.

They are testing docs just as audience 1 is; the interface is a terminal or an HTTP endpoint rather
than a UI. Their questions are about `runShell` / `runCode` / `runBrowserScript`, `httpRequest` and
`checkLink`, capturing and asserting `outputs` and variables, and generating tests from an OpenAPI
spec. They care that a sample that drifts from the SDK fails loudly.

## 3. CI / Platform integrators

Own pipelines across many repos. They want a low-maintenance doc-testing gate that runs identically
everywhere, headless and in containers. It must emit machine-readable results they can pipe into
existing tooling.

They don't author docs and don't own the test content; they install and plumb the gate. Their
questions are about the GitHub Action, exit behavior and reporters, Docker and headless execution,
cache/install warming, concurrency, and the orchestration API. They overlap with documentation teams
(often a docs team asks them to wire the gate) but have a distinct job: run it reliably at scale.

## 4. AI-assisted authors: agent users (raised pillar)

Use coding agents such as Claude Code, GitHub Copilot CLI, and Gemini CLI, plus MCP and agent tools.
They *generate and maintain* Doc Detective tests from prose rather than hand-writing step JSON. They
lean on self-healing to keep tests green as the product drifts.

This audience cross-cuts the others, since a writer or a developer can both be "an author working
with an agent." It is still **raised to its own pillar**, because agent-native authoring is a
strategic investment and a primary differentiator. It gets a top-level track in its own tab, rather
than being buried as a sub-section of each persona.

## 5. Project contributors (secondary)

Developers or writers who want to fix a bug, add a feature, or improve the docs of Doc Detective
itself. They need to set up the multi-repo project (core / common / action / docs), follow the
contribution and review process, and land a change.

This audience is secondary. It does not intersect the end-user journeys, and a single
self-contained track in its own tab serves it.
