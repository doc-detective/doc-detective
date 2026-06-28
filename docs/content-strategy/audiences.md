# Target audiences

Doc Detective serves five distinct audiences. The **lead audience** drives the primary IA track and
gets the deepest coverage; secondary audiences have dedicated tracks but are scoped to what they
actually need from the tool.

## 1. Documentation teams — Docs-as-Tests authors (lead)

Own a docs repo and the procedures, screenshots, and UI flows in it. They want that content to *stay
correct automatically* as the product ships, instead of rotting silently until a reader complains.

This is the lead audience because they are the ones adopting Doc Detective as part of their everyday
workflow: authoring tests, configuring contexts, capturing screenshots and video, and living with the
CI gate. The "Docs as Tests" thesis is the product's identity, and these users touch every layer of
it. Everything else serves them or intersects with them.

## 2. Developers — example & API testers

Want the code samples, CLI commands, and API calls embedded in docs (or kept in a spec file) to
actually run and assert correctly against the real product. They are engineering-oriented and may not
write prose at all.

Their questions are about `runShell` / `runCode` / `runBrowserScript`, `httpRequest` and `checkLink`,
capturing and asserting `outputs` and variables, and generating tests from an OpenAPI spec. They care
that a sample that drifts from the SDK fails loudly.

## 3. CI / Platform integrators

Own pipelines across many repos. They want a low-maintenance doc-testing gate that runs identically
everywhere — headless, in containers — and emits machine-readable results they can pipe into existing
tooling.

They don't author docs and don't own the test content; they install and plumb the gate. Their
questions are about the GitHub Action, exit behavior and reporters, Docker and headless execution,
cache/install warming, concurrency, and the orchestration API. They overlap with documentation teams
(often a docs team asks them to wire the gate) but have a distinct job: run it reliably at scale.

## 4. AI-assisted authors — agent users (elevated pillar)

Use coding agents — Claude Code, GitHub Copilot CLI, Gemini CLI — and MCP / agent tools to *generate
and maintain* Doc Detective tests from prose, rather than hand-writing step JSON. They lean on
self-healing to keep tests green as the product drifts.

This audience cross-cuts the others — a writer or a developer can both be "an author working with an
agent" — but it is **elevated to its own pillar** because agent-native authoring is a strategic
investment and a primary differentiator. It gets a top-level track (own tab) rather than being buried
as a sub-section of each persona.

## 5. Project contributors (secondary)

Developers or writers who want to fix a bug, add a feature, or improve the docs of Doc Detective
itself. They need to set up the multi-repo project (core / common / action / docs), follow the
contribution and review process, and land a change.

This audience is secondary: it does not intersect the end-user journeys, and it is served by a single
self-contained track in its own tab.
