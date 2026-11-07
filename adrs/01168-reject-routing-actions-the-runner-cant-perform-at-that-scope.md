---
status: accepted
date: 2026-11-07
decision-makers: doc-detective maintainers
---

# Reject routing actions the runner can't perform at that scope

## Context and Problem Statement

Steps and tests carry routing handlers (`onPass`, `onFail`, `onWarning`, `onSkip`). Each entry names one action:
`continue`, `stop` with a scope, `retry`, `goToStep`, or `goToTest`. Both scopes shared one schema,
`routing_v3`, so it accepted every action everywhere. The runner doesn't perform all of them:

- A step's `stop: "spec"` or `stop: "run"` logged `Routing stop scope 'run' is not yet propagated beyond the
  current test` and behaved as `stop: "test"`. Later tests and specs still ran.
- A test's `stop: "run"` logged a warning and behaved as `stop: "spec"`.
- A step's `goToTest`, and a test's `retry` or `goToStep`, were ignored with no warning.

```json
{ "runShell": "npm test", "onFail": [{ "stop": "run" }] }
```

That reads as "if this step fails, stop the whole run". Someone writes a fail-fast setup, believes it works,
and it doesn't. What should 5.0 do with routing the runner can't perform?

## Decision Drivers

- A spec that validates must do what it says.
- Supporting more later must not change what an existing 5.x spec does.
- Stopping a spec or a run from inside a step races with tests already running under `concurrentRunners > 1`.

## Considered Options

- **A. Reject the unsupported combinations in the schema.**
- **B. Implement them.**
- **C. Keep accepting them with a warning.**

## Decision Outcome

Chosen option: **A**.

- Step handlers accept exactly one of `continue: true`, `stop: "test"`, `retry: {limit, delay?, backoff?}`, or
  `goToStep`. `routing_v3` gains `components.schemas.step`, and `step_v3`'s handlers reference it.
- Test handlers accept exactly one of `continue: true`, `stop: "test"` or `"spec"`, or `goToTest`. The root of
  `routing_v3` is the test entry.
- A spec that uses anything else fails validation, so the CLI exits 2 through the existing invalid-spec path and
  names the key path, for example `tests[0].steps[0].onFail[0].stop` or
  `tests[0].onFail[0]: unknown key 'retry'.`
- The two "not yet implemented" warning branches in `src/core/tests.ts`, and the unreachable fallbacks in
  `src/core/routing.ts`, are deleted.

### Consequences

- Good: a spec that validates does what it says. Nothing is quietly downgraded or ignored.
- Good: implementing `stop: "run"` or a step-level `goToTest` later only widens what's accepted, so it isn't
  breaking.
- Bad: specs that used the rejected values stop validating. That's a breaking change, so it rides 5.0, and the
  upgrade guide lists it.
- Neutral: the exact message text follows the shared schema-error line format once that formatter lands. Until
  then the CLI prints AJV's message under the same key path.

### Confirmation

- `src/common/test/validate.test.js` ("routing scopes") rejects step `stop: "spec"`, `stop: "run"`, and
  `goToTest`, and test `stop: "run"`, `retry`, and `goToStep`. It accepts every allowed action at each scope.
- `test/routing-scope.test.js` runs the real CLI: the six rejected shapes exit 2 and name the key path, and a
  test-level `stop: "spec"` exits 0.
- `test/core-artifacts/cli/routing-scope.spec.json` runs the same seven permutations as a fixture.

## Pros and Cons of the Options

### A. Reject in the schema

- Good: small. One schema component and two deleted branches.
- Good: honest. Validation tells the author before anything runs.
- Bad: breaking for specs that relied on the downgrade.

### B. Implement them

- Good: authors get fail-fast across specs and runs.
- Bad: medium to large. Stopping a spec or a run means cancelling tests that may already be running in parallel,
  which is racy.

### C. Keep accepting with a warning

- Good: no spec breaks today.
- Bad: if the actions are implemented in 5.x, specs written for 5.0 would suddenly start skipping work. That's a
  breaking change at a bad time.
- Bad: three of the five cases had no warning at all.
