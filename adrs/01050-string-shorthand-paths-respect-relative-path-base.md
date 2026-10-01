---
status: accepted
date: 2026-07-11
decision-makers: doc-detective maintainers
---

# String-shorthand `screenshot`/`record` paths must respect `relativePathBase`

## Context and Problem Statement

`config.relativePathBase` (default `"file"`) controls whether a relative path in a spec resolves
against the current working directory or against the file that declared it. `resolvePaths()` in
`src/core/files.ts` implements this by walking a resolved spec and rewriting known path-bearing
properties (`path`, `directory`, `file`, ...) to absolute paths before any step runs.

That walk keys off property **names**: `path`, `directory`, and so on. It has no notion of the
action-name properties (`screenshot`, `record`) whose *string* value is itself a path, e.g.
`"screenshot": "shot.png"`. When the value is an *object* (`"screenshot": { "path": "shot.png" }`),
the walk recurses into it and finds the `path` key, so the object form is resolved correctly. When
the value is a bare string, no property name matches, so `resolvePaths()` leaves it untouched.

The string is later boxed into `{ path: <string> }` inside `saveScreenshot.ts` / `startRecording.ts`
at step-execution time, well after `resolvePaths()` has already run, and is never re-resolved.
Node's `fs` calls then resolve it against `process.cwd()` by default. Net effect: the string-shorthand
form always behaves as `relativePathBase: "cwd"`, regardless of the configured (or default `"file"`)
setting, while the object form correctly honors it. This was confirmed empirically, running a spec
from a different directory than the spec file. `"screenshot": "shot.png"` lands next to the invoking
process's cwd, while `"screenshot": { "path": "shot.png" }` lands next to the spec file.

## Decision Drivers

* String shorthand and object shorthand must resolve paths identically. An author shouldn't have
  to know an implementation-internal reason to prefer one form.
* No change to the *default* observable behavior of the object form, or of any other action.
* No corruption of user-authored data that happens to reuse the words `screenshot`/`record` as a
  field name inside unrelated data (e.g. an `httpRequest` request body).
* A minimal, centralized fix. The same bug pattern, where a string shorthand action value is a bare
  path, should not require a bespoke patch inside every affected action file.

## Considered Options

* **A. Teach `resolvePaths()` to resolve the string form for known step-level actions** (chosen).
* **B. Fix it inside each action file** (`saveScreenshot.ts`, `startRecording.ts`) at the point
  where the string gets boxed into `{ path }`.
* **C. Change the default of `relativePathBase` to `"cwd"`** so the (buggy) string behavior becomes
  the documented default.

## Decision Outcome

Chosen option: **A**. `resolvePaths()` already owns every other case of this exact problem: config
paths, spec paths, and array-of-path items. Teaching it about the two action names extends the
existing single source of truth, instead of duplicating `relativePathBase`-aware resolution logic in
each action module. Option B works. But the next action with a path-bearing string shorthand then
reintroduces the same bug, until someone remembers the fix lives in N different files. Option C
throws out `relativePathBase: "file"`'s value for every *other* path in a spec, and contradicts the
documented default.

Implementation: `resolvePaths()` gains a `stepShorthandPathProperties = ["screenshot", "record"]`
list and an `isStep` flag threaded through the recursive walk. The flag is set `true` only when
recursing into the `steps` array specifically (`property === "steps"`). So it's `true` exactly when
`object` is a genuine step, and `false` for every other nested object. That includes a `record` or
`screenshot` field that happens to appear inside `request` or `response` body data. A plain-string
property value may be one of `stepShorthandPathProperties` **and** have `isStep` true. It then goes
through the same `relativePathBase`-aware `resolve()` helper the object form's `path` and
`directory` keys already use. A URL-shaped string (`https://`, `http://`, `heretto:`) is still left untouched, matching the
existing behavior for every other path property.

### Consequences

* Good: `"screenshot": "shot.png"` and `"screenshot": { "path": "shot.png" }` now resolve
  identically, honoring `relativePathBase`.
* Good: no change to any other action's path resolution, and no change to the object form's
  existing (already-correct) behavior.
* Good: a `record` or `screenshot` field nested in unrelated user data, such as request and response
  bodies, is provably left alone. A dedicated regression test covers it.
* Neutral, and breaking for some existing users. A spec may have authored a string-shorthand
  `screenshot` or `record` path, and *relied on* the old cwd-relative behavior. An example is an
  absolute-looking relative path built assuming invocation-directory resolution. It now resolves
  relative to the spec file instead. This matches the documented, already-default
  `relativePathBase: "file"` contract, so it's a bug fix rather than a new default. A project that
  explicitly sets `relativePathBase: "cwd"` is unaffected; both forms already resolved against cwd
  there, and continue to.

### Confirmation

Red→green unit tests live in `test/misc-edge-branches-coverage.test.js`, under
`resolvePaths — screenshot/record string shorthand`. A step-level string shorthand resolves next
to the spec file under `relativePathBase: "file"`. A URL-shaped shorthand is left untouched, and a
`record` field nested inside unrelated request-body data is left untouched. It was also verified end
to end against the real CLI. Invoke `doc-detective` from a different cwd than the spec file, with a
string-shorthand `screenshot` step. It now writes the file next to the spec file instead of the cwd.
That matches the object form's existing behavior. Existing `resolvePaths` / `detectTests` suites
(`test/misc-edge-branches-coverage.test.js`, `test/detecttests-coverage.test.js`,
`test/detecttests-heretto-loader-coverage.test.js`, `test/exports.test.js`,
`test/cli-index-adapters-coverage.test.js`) pass unchanged.

## Pros and Cons of the Options

### A. Extend `resolvePaths()`
* Good: single source of truth; matches how every other path property is already handled.
* Good: naturally scoped via the existing `objectType`/recursion structure, no separate schema walk.
* Bad: `resolvePaths()` now needs to know two action names, instead of being purely generic over
  property names. That's a small increase in its surface, though not its complexity.

### B. Fix per-action
* Good: localized to the file that has the bug today.
* Bad: duplicates `relativePathBase`-aware resolution logic; the next action with this shape
  (a string shorthand that's secretly a path) has to remember to opt in.

### C. Change the default
* Good: no code change.
* Bad: silently changes behavior for every other spec path; contradicts the documented default and
  the object form's already-correct, already-shipped behavior.
