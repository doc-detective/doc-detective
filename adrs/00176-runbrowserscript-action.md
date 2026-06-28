---
status: accepted
date: 2026-06-17
decision-makers: doc-detective maintainers
---

# runBrowserScript action

## Context and Problem Statement

Doc Detective could drive a browser through high-level steps (`find`, `click`, `goTo`, screenshots),
but some documented procedures need to execute arbitrary JavaScript *inside the page context* — to
read computed state, trigger app behavior, or set up preconditions the step vocabulary doesn't cover.
There was no step type that ran author-supplied JS in the browser. Should Doc Detective add a
`runBrowserScript` step, and how should it fit the v3 action-as-key schema and the runtime's
browser-step machinery?

## Decision Drivers

* Some browser verifications require running JS in the page context, not just high-level actions.
* A new step must follow the v3 action-as-key schema convention (`*_v3`, action IS the key).
* The runtime must recognize the step as a browser step so it routes through the driver/session path.
* Runtime-needs inference must know the step requires a browser so a driver gets provisioned.

## Considered Options

* **A. A dedicated `runBrowserScript` step type running JS in the browser context** (chosen).
* **B. Extend an existing step (e.g. `find` or `runCode`) with an in-page-script mode.**
* **C. No in-page scripting; require all checks via high-level steps.**

## Decision Outcome

Chosen option: **A**, because executing arbitrary in-page JavaScript is a distinct capability from the
process-level `runCode` step (`00095`) and from the high-level browser actions, so it earns its own
step type wired through the browser-step machinery and runtime-needs inference.

Contract decided:

* New `runBrowserScript` action/step type executes author-supplied JavaScript in the browser page
  context.
* `runBrowserScript_v3` schema defines the step under the v3 action-as-key convention.
* The handler lives in `tests/runBrowserScript.ts`; the step is registered in `browserStepKeys.ts`
  so the runtime treats it as a browser step, and `inferRuntimeNeeds` is wired so a run containing it
  provisions a driver/session.

Implementation in `src/.../tests/runBrowserScript.ts`, `browserStepKeys.ts`, schema
`runBrowserScript_v3`.

### Consequences

* Good: documented procedures can run and assert on arbitrary in-page JavaScript.
* Good: cleanly separated from process-level `runCode`; no overloading of existing steps.
* Good: runtime-needs inference provisions a browser when the step is present.
* Neutral: in-page script execution is an additional driver-backed capability surface.
* Bad: running author JS in the page is inherently more powerful/risky than scoped high-level steps.

### Confirmation

Shipped in `f010c67d` (PR #352); `runBrowserScript_v3` schema, handler in `tests/runBrowserScript.ts`,
registration in `browserStepKeys.ts`, and `inferRuntimeNeeds` wiring.

## Pros and Cons of the Options

### A. Dedicated runBrowserScript step
* Good: distinct capability, clean wiring through browser-step + runtime-needs machinery.
* Bad: adds a powerful in-page execution surface.

### B. Extend find/runCode
* Good: no new step type.
* Bad: conflates page-context JS with process execution or element location; muddied semantics.

### C. No in-page scripting
* Good: smallest capability surface.
* Bad: leaves page-state verifications impossible to express.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `f010c67d` (PR #352). Inventory
ref: BACKFILL-INVENTORY.md Seq 249. Related: `00095` (`runCode`, process-level execution), `00096`
(v3 action-as-key schema redesign), `00100` (v3 runner adoption / browser action handlers).
