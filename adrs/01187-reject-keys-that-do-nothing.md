---
status: accepted
date: 2026-11-10
decision-makers: doc-detective maintainers
---

# Reject keys that do nothing

Amends [ADR 01150](01150-reject-unknown-keys-on-specs-and-steps.md).

## Context and Problem Statement

ADR 01150 made unknown keys invalid, so a typo can't silently turn off a check. Some keys still validate and then
do nothing:

| Key | Where | What happens |
|---|---|---|
| `crawl` | Config | Nothing reads it. |
| `fileMapping` | Each `integrations.heretto` entry | Declared as set by Doc Detective, but nothing sets or reads it. |
| `breakpoint` | Step | Describes a debugger that was never built. |
| `$schema` | Inside `saveCookie` and `loadCookie` | A linter hint inside an action object, which no editor reads there. |
| `workingDirectory` | A `startSurface` app | Valid, then fails every app step at run time, because no app driver supports it. |

An author who sets one believes it did something. The unknown-key message also quotes keys and values as `'key'`
and suggests a bare `near`, while the message rule puts keys and values in backticks.

Should these keys stay valid?

## Decision Drivers

- A key that's valid does what it says (ADR 01150).
- An interface describes what the tool does now, never a plan (`CLAUDE.md`, rule 4).
- A mistake fails at validation, before anything runs, rather than mid-run.
- Messages follow one style.

## Considered Options

- **A. Remove the keys, so each is an unknown key.**
- **B. Keep them, deprecated, with a warning.**
- **C. Keep them, and document that they do nothing.**

## Decision Outcome

Chosen option: **A**.

- `config_v3` drops `crawl` and `integrations.heretto[].fileMapping`. `step_v3` drops `breakpoint`.
  `saveCookie_v3` and `loadCookie_v3` drop the `$schema` property inside the action object. `startSurface_v3`
  drops `workingDirectory` from the app descriptor. A process descriptor keeps it, because it works there.
- `appSurface.ts` drops the per-platform rows that failed an app's `workingDirectory` at run time.
- Setting any of them is an invalid config or spec, and the run exits `2`. `--no-exit-on-fail` skips an invalid
  spec, as for any unknown key.
- The unknown-key line puts the key and the suggestion in backticks:
  ``unknown key `<key>`. Did you mean `<near>`?``

No deprecated alias: these keys aren't renamed, and none of them did anything to keep working.

Config, stderr, exit 2:

```text
Error: Invalid config in <path>:
unknown key `crawl`.
See https://docs.doc-detective.com/reference/schemas/config
```

Step, stderr, exit 2:

```text
Error: Invalid test specifications, so nothing ran:
<file>
tests[0].steps[0]: unknown key `breakpoint`.
Fix them, or pass --no-exit-on-fail to skip them.
```

### Consequences

- Good: every key the schema accepts does something.
- Good: an app's `workingDirectory` fails before the run, not at its step.
- Good: the unknown-key line follows the message style.
- Bad: a config or spec that carries one of these keys stops validating. The fix is to delete the key.
- Bad: anything that matched the quoted form, `unknown key 'x'`, needs the backtick form.
- Neutral: an app's `workingDirectory` error names the keys the other `startSurface` shapes need. That's because the
  process shape allows `workingDirectory`, so the key isn't unknown to every shape.

### Confirmation

- `src/common/test/strictKeys.test.js` rejects each removed key and accepts the same object without it. It keeps
  `workingDirectory` valid on a process.
- `test/cli-contract.test.js` pins the full stderr for `crawl` and `breakpoint`. The existing unknown-key tests
  pin the backtick form.
- Fixture: `cli/strict-keys.spec.json` exits `2` for `breakpoint`, `$schema` in `saveCookie`, an app's
  `workingDirectory`, and config `crawl`.

## Pros and Cons of the Options

### A. Remove them

- Good: the schema is the truth, with no exceptions to explain.
- Bad: a breaking change for anyone who set them.

### B. Deprecate with a warning

- Good: nothing breaks at once.
- Bad: the deprecation rule is for renames that keep working. These keys never worked, so there's nothing to keep.

### C. Document them as no-ops

- Good: no change to configs.
- Bad: the reference would describe keys that do nothing, which the interface rule forbids.
