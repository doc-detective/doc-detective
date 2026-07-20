---
status: accepted
date: 2026-07-17
decision-makers: [hawkeyexl]
---

# The screenshot path pattern gates the extension, not the character set

## Context and Problem Statement

`screenshot_v3`'s `path` pattern accepted **any** Windows absolute path (`[A-Za-z]:[\/\\].*\.(?:png|PNG)` — `.*` is unrestricted) but limited every other path to `[A-Za-z0-9_.\/\\-]`. A space, parentheses, `~`, an apostrophe, or any non-ASCII character anywhere in a macOS/Linux path failed `step_v3` validation:

| path | before |
|---|---|
| `C:\Users\jane doe\docs (v2)\shot.png` | accepted |
| `/Users/jane doe/docs/shot.png` | **rejected** |
| `/home/u/café/shot.png` | **rejected** |

`/Users/jane doe/...` is an ordinary macOS home directory, so the schema made non-Windows projects second-class for no stated reason.

It also silently degrades two features that synthesize screenshot steps with **absolute** paths derived from wherever the user's project happens to live — the author never typed the path, so the failure looks like a tool bug:

- `captureAutoScreenshot` ([src/core/tests.ts](../src/core/tests.ts)) logs a warning and drops the capture.
- Recording checkpoints ([src/core/tests/recordingCheckpoints.ts](../src/core/tests/recordingCheckpoints.ts)) record an errored entry, which surfaces as `checkpointErrors` → WARNING per [ADR 01072](01072-checkpoint-screenshots-for-recording-spans.md). Every checkpoint in the span fails identically, so drift detection is off while reporting as if it ran.

Was the charset load-bearing? No. It never bounded *where* a screenshot could be written — `../../../secrets/x.png` passed then and passes now. It only rejected legitimate characters in otherwise-valid paths, so it bought nothing and cost non-Windows users the feature.

## Decision Drivers

- Users of every OS should get identical validation; a mac path with a space is not more suspicious than the equivalent Windows path.
- Internally-synthesized absolute paths must validate wherever the project lives.
- The one real constraint — the capture is a PNG, and the runtime encodes PNG — must keep being enforced at the schema layer, which is the only contract config-file users see.
- The schema must not pretend to be a security boundary it isn't (traversal was already accepted; path containment for URL references is a runtime guard in `saveScreenshot`).

## Considered Options

1. **Gate the extension only** — accept any path ending in `.png`/`.PNG`, keeping the URL and `$VAR` branches.
2. Extend the charset with the characters seen in practice (space, `~`, `()`, `'`, …).
3. Add a second POSIX-absolute branch mirroring the Windows one, leaving relative paths restricted.

## Decision Outcome

Chosen option: **1 — gate the extension only**. The pattern becomes:

```
^(?:https?:\/\/.+\.(?:png|PNG)(?:\?.*)?|.*\.(?:png|PNG)|\$[A-Za-z0-9_]+)$
```

The three branches now say exactly what the field means: an `http(s)` URL to a PNG (optionally with a query string, for signed URLs), **any path to a PNG**, or a `$VAR` reference.

The Windows-specific branch is **removed as redundant**, not loosened: `.*\.(?:png|PNG)` already subsumes `[A-Za-z]:[\/\\].*\.(?:png|PNG)`. Keeping it would leave a branch that can never match anything the general branch doesn't. This is purely a widening — every string accepted before is still accepted.

`.` doesn't match newlines in ECMA-262 without the `s` flag, so a multi-line value is still rejected; that incidental property is unchanged from the old Windows branch. A `$comment` on the field records why the charset is deliberately absent, so it isn't "restored" later as a hardening measure.

### Consequences

- Good, because macOS/Linux projects in ordinary directories (spaces, accents, parentheses) can take screenshots at all, and autoScreenshot/checkpoints stop failing on paths the user never typed.
- Good, because validation no longer depends on the host OS's path conventions.
- Good, because the pattern is simpler and states one rule instead of four overlapping ones.
- Neutral, because it accepts weird-but-legal filenames (`"  .png"`). They were already accepted on Windows, and the filesystem is the authority on what a valid name is.
- Bad, because a typo'd path is caught slightly later (at write time, with an OS error) rather than by the pattern — but the pattern never caught misdirected paths anyway, only mis-charactered ones, and the extension check still catches the common `.jpg`/`.gif` mistake.

### Confirmation

- Schema tests in [src/common/test/validate.test.js](../src/common/test/validate.test.js) (`screenshot path pattern`): absolute POSIX paths with a space, parentheses, `~`, an apostrophe, and non-ASCII are accepted; every previously-valid form (relative, POSIX plain, Windows absolute with spaces, URL, URL with query, `$VAR`, `.PNG`) still is; and `.jpg`, `.gif`, `shot.png.exe`, and extensionless targets are still rejected.
- Verified against the pattern read directly out of the schema (not a hand-copy) before and after: the Windows/POSIX asymmetry is gone and both non-PNG negatives still reject.
- `npm run build:common` regenerates the dereferenced schemas and types; `npm run docs:build-schema-refs` regenerates the reference pages, whose only diff is the pattern string.

## Pros and Cons of the Options

### 1. Gate the extension only

- Good, because it's the actual contract: the runtime writes a PNG.
- Good, because one rule replaces the OS-conditional maze, and it can't drift out of parity again.
- Bad, because the schema stops rejecting exotic filenames — which it only ever did off-Windows.

### 2. Extend the charset

- Bad, because it's whack-a-mole: the next report is a `#`, a `+`, a CJK directory, or an emoji, and Windows would still be more permissive than everywhere else.
- Bad, because it keeps implying the charset means something.

### 3. Add a POSIX-absolute branch

- Bad, because it fixes absolute paths while leaving *relative* paths restricted (`docs (v2)/shot.png` would still fail) — the same bug, smaller.
- Bad, because it grows the pattern to four branches with three near-identical tails.
