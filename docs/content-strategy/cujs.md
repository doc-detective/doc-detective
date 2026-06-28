# Critical User Journeys (CUJs)

A CUJ is a complete, end-to-end outcome a persona must be able to reach using Doc Detective and its
documentation. The CUJs are the organizing principle for the IA: each top-level nav track maps to one
persona's set of journeys, and every page is justified by the CUJ it serves.

See `information-architecture.md` for the page-level content set and which pages carry each CUJ.

---

## Wren — Documentation engineer

### W1 · Stand up doc testing for my docs

Wren needs to go from zero to a working CI gate: evaluate whether Doc Detective fits her use case,
install it, write a first test (inline in a doc or as a standalone spec), run it and read the output,
add a config file, and land a passing CI step.

This is the anchor CUJ. It is the first thing the lead persona does, and it threads install →
authoring → config → CI in a single coherent journey.

### W2 · Stop my procedures and screenshots from rotting

Wren wants to add tests across her existing docs so that drift is caught automatically. She needs to:
author inline and detected tests in her source files, auto-capture fresh screenshots and video,
recognize when the product UI has drifted from the docs, and apply self-healing so small UI churn
doesn't constantly break the suite.

### W3 · Test across formats and surfaces

Wren's docs span formats (Markdown, DITA, AsciiDoc, HTML, or a custom format) and her product runs on
multiple platforms and browsers. She needs to: detect and test content regardless of source format,
target multiple platform/browser contexts via `runOn`, and — when her content lives in a CMS — round-
trip through the Heretto integration.

---

## Diego — Example & API testing

### D1 · Verify code samples and CLI commands

Diego needs to confirm the commands and snippets in his docs actually run. He authors standalone specs
that use `runShell`, `runCode`, and `runBrowserScript`, captures the results as `outputs` or variables,
and asserts on them so a broken sample fails the build.

### D2 · Test API requests and responses

Diego needs to exercise APIs from his docs: issue `httpRequest` calls (any method, with a body and a
response expectation, tolerating allowed variation via `maxVariation`), validate links with
`checkLink`, and carry auth across steps with cookies and `loadVariables`.

### D3 · Generate API tests from an OpenAPI spec

Diego wants to derive tests directly from an OpenAPI definition rather than writing each one by hand,
using the `openApi` integration.

---

## Priya — CI & scale

### P1 · Add doc testing to our CI

Priya needs working recipes for the CI systems her org runs, starting with the GitHub Action. She also
needs the exit/result contract documented precisely, the `--reporters` options (json / html /
runFolder) explained, and the run-folder artifacts (screenshots, video, results) surfaced for PR
review.

### P2 · Run headless and containerized at scale

Priya needs Doc Detective to run reliably in Docker and headless: understanding headless contexts,
`ffmpeg` recording for headless captures, warming runtime assets with `install` and the cache,
`allowUnsafeSteps` behavior in containers, and tuning `concurrentRunners` for throughput.

### P3 · Orchestrate distributed runs

Priya needs to scale beyond one machine: running via `doc-detective-runner` and pointing at the
orchestration API (`integrations.docDetectiveApi`) for remote, distributed execution.

---

## Aria — AI agents (pillar)

### A1 · Author tests with an AI agent

Aria needs to wire an agent to her project and have it write tests for her: running `install agents`,
following the Claude Code / Copilot CLI / Gemini CLI integration for her tool of choice, connecting
agent tools / MCP, and generating tests from prose.

### A2 · Keep tests healthy automatically

Aria needs the suite to stay green with minimal babysitting: understanding and configuring self-healing
docs, letting an agent maintain and repair tests, and following best practices for agent-authored tests
so they're robust to product churn.

---

## Cole — Contributor

### C1 · Contribute to Doc Detective or its docs

Cole needs to set up the project and land a change: local development setup, choosing the standard or
substantial contribution flow, navigating the per-repo guides, using the content templates, and working
through the review process.

---

## Cross-cutting

### X1 · Troubleshoot a failing or flaky test

A high-traffic journey that serves Wren, Diego, Priya, and Aria. When a test fails, the user needs to
map the failure to the step, selector, or context that caused it; fix it; handle flakiness with the
right tools (`maxVariation`, waits, headed vs. headless, timeouts); and confirm the run is green again.

This is cross-cutting — the person hitting the failure configured Doc Detective themselves, so it isn't
a separate audience — and it lives in a Troubleshooting section that every track links into.
