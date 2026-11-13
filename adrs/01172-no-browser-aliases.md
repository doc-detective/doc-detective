---
status: accepted
date: 2026-11-07
decision-makers: doc-detective maintainers
---

# No browser aliases

## Context and Problem Statement

`startSurface`, `surface`, and `type`'s surface accept `"browser": "edge"`. Edge is Chromium, so the runner opens
Chrome for it, on the chromedriver stack, and registers the session under the `chrome` engine. A context's
`browsers` doesn't accept `edge` at all. So a test that names Edge runs Chrome, and its author believes they tested
Edge. An unnamed `edge` session also collides with an unnamed `chrome` one, which surprises people who named two
different browsers.

The alias is a second spelling of one surface, kept in five places: three engine-keyword sets, an engine
normalizer, and the runtime-needs inference.

Should a browser name ever stand for a different browser?

## Decision Drivers

- A test result should describe the browser that ran.
- Contexts and surfaces should accept the same browser names.
- One name per thing, so docs, errors, and reports agree.

## Considered Options

- **A. Remove the `edge` alias.** `"browser": "edge"` is invalid, and exits `2`.
- **B. Keep the alias, with a warning that names Chrome.**
- **C. Support real Edge**, with msedgedriver.

## Decision Outcome

Chosen option: **A**.

- `startSurface`'s browser descriptor, `surface`'s browser object and engine keyword, and `type`'s browser-surface
  condition accept `chrome`, `firefox`, `safari`, and `webkit`. `edge` fails validation:
  `tests[0].steps[0].startSurface.browser: must be one of chrome, firefox, safari, webkit (got "edge").`
- A bare `"surface": "edge"` is no longer an engine keyword, so, like any other name, it names a background
  process. A browser session may be named `edge`.
- The runner's alias code is gone: `edge` left the engine-keyword sets in `activeSurface`, `browserSessions`, and
  `browserSurface`, `normalizeEngine` only lowercases, and runtime-needs inference no longer maps `edge` to Chrome.
- A version 2 context that names `edge` still upgrades to `chrome`, as before. That's the legacy upgrade path, not
  a version 3 name.
- `safari` and `webkit` stay. They aren't an alias pair in this sense: `webkit` names the engine Safari runs, and
  the runner resolves both to Safari.

### Consequences

- Good: a result that says `chrome` ran Chrome, and nothing claims Edge.
- Good: surfaces and contexts accept the same browser names.
- Bad: specs that open `edge` surfaces must change to `chrome`. The upgrade guide says so.

### Confirmation

- `src/common/test/validate.test.js` rejects `edge` in a startSurface descriptor, a startSurface array, a browser
  surface object, and a browser-only surface keyword. It accepts a bare `"edge"` surface as a process name.
- `test/browserSessions.test.js`, `test/browserSurface.test.js`, and `test/start-surface-dispatch.test.js` assert
  that `edge` is no engine keyword, doesn't match a Chrome session, and fails a startSurface step as invalid.
- `test/core-artifacts/cli/process-tightening.spec.json` runs a startSurface `edge` spec through the CLI and expects
  exit `2`.

## Pros and Cons of the Options

### A. Remove the alias

- Good: one name per browser, and results stay honest.
- Bad: breaking for the few specs that use it.

### B. Keep it, with a warning

- Good: nothing breaks.
- Bad: keeps a permanent second spelling and a result that misreports the browser. A warning is easy to miss in CI.

### C. Real Edge support

- Good: tests could cover Edge.
- Bad: a new driver stack to install, provision, and test on every platform. It's a feature, not a fix, and can
  come later under its own name without this alias in the way.
