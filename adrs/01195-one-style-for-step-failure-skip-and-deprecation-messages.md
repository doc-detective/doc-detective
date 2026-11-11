---
status: accepted
date: 2026-11-10
decision-makers: doc-detective maintainers
---

# One style for step failure, skip, and deprecation messages

## Context and Problem Statement

The repository's message rule says a failure starts with `Couldn't`, a skip reads `Skipped: <reason>.`, and
keys go in backticks. The most common messages a user sees broke it:

* 22 actions printed `Invalid step definition:` followed by raw AJV errors, one for every `oneOf` branch.
  A bad `timeout` read as a wall of "must have required property" lines.
* A failed `find` said `No elements matched selector or text.` or `Element not found within timeout`. Neither
  named the element or the timeout.
* About 30 context skips started `Skipping context on '<platform>':`, in several shapes. Two described plans,
  such as "in this phase" and "isn't supported yet."
* Deprecated arguments warned in their own wording (`--logLevel is deprecated; use --log-level`), unlike
  renamed config keys. They printed through `console.error`, so `-l silent` didn't hide them.
* Hints told users to run `--logLevel debug`, the deprecated spelling.

Which wording should these messages use?

## Decision Drivers

* A message names the cause and, when a field fixes it, the field.
* Every surface uses one wording for the same thing, so renamed flags read like renamed keys.
* Spec validation and action validation describe the same problem in the same words.
* The valid path pays nothing extra.
* Scope stays to the messages listed here. A separate issue tracks the rest of the sweep.

## Considered Options

* **A. One shared helper for invalid steps, plus a rewrite of the listed messages.**
* **B. Rewrite each action's invalid-step message by hand.**
* **C. Leave the wording and document it.**

## Decision Outcome

Chosen option: **A**, because one helper keeps 22 actions consistent with spec validation. The listed
rewrites then cover what users hit most.

Behavior decided:

1. **Invalid step.** `invalidStepMessage(step)` in `src/core/utils.ts` validates the step again with
   `structuredErrors: true`, only on the failing path. It returns
   ``Couldn't run the step: its definition isn't valid. <summary>``. The summary comes from
   `summarizeSchemaErrors`, the formatter spec validation uses. A step-level line starts with a capital.
2. **Find.** A shorthand miss reads ``Couldn't find element `<find>`.`` A locator timeout reads
   ``Couldn't find an element within `timeout` (<n> ms).`` A call with no finding field reads
   ``Couldn't find an element: set `selector`, `elementText`, or another finding field.`` An app surface
   miss reads ``Couldn't find an element matching `<json>` on the app surface within <n> ms (locator:
   `<selector>`).``
3. **Skips.** Every `Skipping context` reason becomes `Skipped: <reason>`. For a context on another platform,
   it's ``Skipped: this context targets `<platform>`, not this host.``. For one this system can't run, it's
   ``Skipped: this system can't run a `<platform>` context.``. Plan wording leaves the two messages that had
   it.
4. **Deprecated arguments.** They use the renamed-key wording: ``Warning: `--logLevel` is deprecated.
   Rename it to `--log-level`.`` and ``Warning: `runTests` is deprecated. Rename it to `run`.`` The `-e` flag
   reads ``Warning: `--exit-on-fail` is deprecated. It's now the default, so remove it.`` They print
   through `diag`, and `-q`, `-l silent`, and `-l error` hide them.
5. **Hints and agents.** The debug hint names `--log-level debug`. A non-interactive `install agents` without
   `--agent` asks for a comma-separated list.

### Consequences

* Good: an invalid step names the bad field in one line, the way `doc-detective` names it at load time.
* Good: scripts that branch on `resultCode` (ADR 01194) don't need the text at all.
* Bad: scripts that matched the old text break. The upgrade guide lists the common changes.
* Neutral: some skip reasons still interpolate a driver's error text. The message-style sweep issue
  tracks those.

### Confirmation

Red→green tests cover each rewrite. `test/core-utils-coverage.test.js` covers `invalidStepMessage`, and the
13 action test files now pin its prefix. `test/findElement.test.js` and
`test/debug-findstrategies-coverage.test.js` cover the find messages. `test/browser-fallback.test.js` and
`test/context-resolution.test.js` cover the skips. `test/cli-contract.test.js` pins each deprecation
warning and checks that `-l silent` hides it. `test/hints.test.js` and `test/agents.test.js` cover the
rest. Fixtures can't assert message text, so this change adds none.

## Pros and Cons of the Options

### A. Shared helper plus listed rewrites

* Good: one place decides the invalid-step wording.
* Good: the valid path is unchanged.
* Bad: the failing path validates twice.

### B. Hand-written per action

* Good: each action could word its own fields.
* Bad: 22 copies drift, and none would match spec validation.

### C. Leave and document

* Good: no script breaks.
* Bad: the messages users see most keep breaking the repository's own rule.
