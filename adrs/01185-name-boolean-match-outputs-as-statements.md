---
status: accepted
date: 2026-11-10
decision-makers: doc-detective maintainers
---

# Name boolean match outputs as statements

## Context and Problem Statement

Steps expose booleans that say whether something matched. Their names follow two patterns:

| Action | Output |
|---|---|
| `runShell`, `runCode`, `type` | `stdioMatched` |
| `screenshot` | `aspectRatioMatch` |
| `stopRecord` | `resolutionMatch` |
| `httpRequest` | `headersMatch`, `bodyMatches` |
| `runBrowserScript` | `outputMatches` |

Authors read these in `if`, `assertions`, and `variables`, such as `$$outputs.stdioMatched == true`. A
past-tense verb, a noun, and a present-tense statement mean the same thing. So an author can't guess a name from its
neighbors, and a wrong guess resolves to nothing rather than to an error.

Which form should every boolean match output take?

## Decision Drivers

- One pattern, so an author can predict a name.
- The names read as a condition in `if` and `assertions`.
- Version 5 is the one chance to rename outputs without an alias.
- Fewest renames.

## Considered Options

- **A. A present-tense statement, `<thing>Matches`, renaming the three that differ.**
- **B. A past-tense verb, `<thing>Matched`, renaming four.**
- **C. Leave the names as they are.**

## Decision Outcome

Chosen option: **A**.

| Action | Version 4 | Version 5 |
|---|---|---|
| `runShell`, `runCode`, `type` | `stdioMatched` | `stdioMatches` |
| `screenshot` | `aspectRatioMatch` | `aspectRatioMatches` |
| `stopRecord` | `resolutionMatch` | `resolutionMatches` |

`bodyMatches` and `outputMatches` already fit. `headersMatch` fits too: `headers` is plural, so it reads as a
statement already. The implicit assertion statements use the new names, such as `$$outputs.stdioMatches == true`.

There's no alias. Outputs are results, not names users write as keys, so the rename rule's alias doesn't cover them.
An old name in an expression resolves to nothing, as any unknown output does. The upgrade guide lists each rename.

### Consequences

- Good: every boolean match output reads as a statement, so a name is predictable.
- Good: no output is renamed twice.
- Bad: an `if` or assertion that reads an old name stops matching, and nothing warns about it. The upgrade guide is the
  only notice.
- Neutral: the result's `assertions` show the new statements, so a script that matched on a statement's text needs the
  new name.

### Confirmation

- `test/runShell.test.js`, `test/saveScreenshot.test.js`, and `test/recording-verify.test.js` assert the new output,
  its statement, and that the old key is absent.
- Fixtures: `process/output-names.spec.json` reads `$$stdioMatches` on `runShell`, `runCode`, and `type`.
  `capture/screenshot-variation.spec.json` reads `$$aspectRatioMatches`, and `recording/recording-outputs.spec.json`
  reads `$$resolutionMatches`. Each checks that the old name has no verdict.

## Pros and Cons of the Options

### A. `<thing>Matches`

- Good: three renames, and it matches the newest outputs.
- Good: it reads naturally in a condition.

### B. `<thing>Matched`

- Good: past tense fits a result.
- Bad: four renames, including `bodyMatches` and `outputMatches`, which are already in use.

### C. Leave them

- Good: no migration.
- Bad: authors keep guessing, and a wrong guess fails silently.
