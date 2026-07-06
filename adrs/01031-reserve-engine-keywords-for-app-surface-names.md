---
status: accepted
date: 2026-07-06
decision-makers: [hawkeyexl]
---

# Reserve browser engine keywords: reject them as app-surface names

## Context and Problem Statement

A bare-string `surface` reference is identity-only: the runner resolves it against the surface
registries at runtime. The `surface_v3` schema documents the resolution contract for bare strings —
a browser engine keyword (`chrome` | `firefox` | `safari` | `webkit` | `edge`) targets that browser
(`byEngineName`: "Browser engine keyword. Targets that browser."), and any other string names a
process or app surface.

`startSurface.name` (the app-surface registry name) accepted **any** non-empty string, including
engine keywords. Because the app-side handlers (`find` / `click` / `type` / `screenshot`) resolve a
bare-string surface against the app registry **before** the browser-engine interpretation
(`resolveAppSurfaceRef` in `src/core/tests/appSurface.ts` runs ahead of `parseSurfaceRef`), an app
surface named `chrome` would shadow the browser: `{ "click": { …, "surface": "chrome" } }` would
target the app, contradicting the schema's documented contract. The same shadowing applies to any
step that accepts an app surface reference — including the phase A6 mobile-interaction steps
(`swipe`), which is where the adversarial schema review surfaced this (see ADR 01030's context;
the defect predates A6).

Names that differ only by case (`Chrome`) or that are **derived** rather than explicit (launching
`chrome.exe` with no `name` defaults the registry name to `chrome`) collide the same way, because
bare-string engine matching is case-insensitive and the default name is the executable basename.

How do we prevent an app surface from ever capturing a browser-engine keyword?

## Decision Drivers

- The `byEngineName` schema description is a published contract: an engine keyword must always
  target that browser. Silent shadowing is a correctness trap an author can't see.
- Browser sessions already solve the identical collision for their own registry: a session may not
  be named after a foreign engine keyword (`engineKeywordNameConflict` in
  `src/core/tests/browserSessions.ts`). App surfaces should be consistent with that precedent.
- Validation-time rejection beats runtime reinterpretation: an author who names an app surface
  `chrome` almost certainly made a mistake, and an early, explicit error is more debuggable than a
  step that silently targets a different surface kind.
- Derived default names (`chrome.exe` → `chrome`) can't be caught by schema validation, so a
  schema-only fix is incomplete.

## Considered Options

- **(a) Reject engine keywords as app-surface names** — schema `not.enum` on `startSurface.name`
  plus a case-insensitive runtime guard covering derived defaults.
- **(b) Resolve engine keywords before the app registry** — reorder the runtime lookup so a bare
  engine keyword never reaches `resolveAppSurfaceRef`.
- **(c) Document the shadowing** — keep the behavior, change the `byEngineName` description.

## Decision Outcome

Chosen option: **(a) Reject engine keywords as app-surface names**, because it keeps the
`byEngineName` contract exactly as documented, matches the existing browser-session precedent, and
fails at the point of the mistake (the `startSurface` step) instead of at a later, unrelated step.

Two layers, mirroring the browser-session guard:

1. **Schema**: `startSurface.name` gains `"not": { "enum": ["chrome", "firefox", "safari",
   "webkit", "edge"] }`, so the canonical keywords are rejected at validation time — the contract
   config-file and spec authors see.
2. **Runtime**: `startAppSurface` rejects (FAIL, with guidance) any resolved registry name —
   explicit **or derived from the app identifier** — whose lowercased form is an engine keyword.
   This catches case variants (`Chrome`) and default names (`chrome.exe` → `chrome`) the schema
   can't express.

### Consequences

- Good: `surface: "<engine keyword>"` provably always targets that browser; the schema description
  stays true without edits to the resolution order.
- Good: consistent reservation semantics across browser-session names and app-surface names.
- Bad: launching a browser executable as a *native app* (e.g. automating Chrome's own window
  chrome via UIA) now requires an explicit non-keyword `name`. The runtime error says exactly that.
- Neutral: no existing fixture or test named an app surface after an engine keyword.
- Neutral: the keyword list now lives in three places with no automated cross-check — the
  `surface_v3` `byEngineName`/`browser` enums, the `startSurface_v3` `not.enum`, and the runtime
  `RESERVED_ENGINE_KEYWORDS` set in `src/core/tests/browserSurface.ts`. If a sixth engine is ever
  added, update all three (the schema tests in `src/common/test/validate.test.js` iterate the
  keyword list, so a partial update fails there first).

### Confirmation

- Negative schema cases in `src/common/test/validate.test.js` (explicit `name: "chrome"` rejected).
- Runtime unit tests in `test/app-surface.test.js`: explicit case-variant name (`Chrome`) fails
  with keyword guidance; derived default name from a `chrome.exe` app identifier fails with the
  same guidance. The rejection is a step FAIL, which the fixture gate (PASS/SKIPPED only) cannot
  assert, so the precise assertions live in mocha per the feature-fixture policy.

## Pros and Cons of the Options

### (a) Reject engine keywords as app-surface names

- Good: preserves the documented `byEngineName` contract with zero resolution-order changes.
- Good: symmetric with `engineKeywordNameConflict` for browser-session names.
- Good: errors at the authoring mistake, not at a distant consuming step.
- Bad: reserves five names an app author might legitimately want (mitigated: explicit rename).

### (b) Resolve engine keywords before the app registry

- Good: no reserved names; every `startSurface.name` remains legal.
- Bad: an app surface named `chrome` becomes silently unreachable by bare string — the author gets
  no error, just steps that target the wrong surface kind (now in the opposite direction).
- Bad: diverges from the browser-session precedent, which rejects rather than reorders.

### (c) Document the shadowing

- Bad: turns a published guarantee ("targets that browser") into "usually targets that browser",
  breaking existing specs' assumptions based on registry contents.
- Bad: the trap remains; documentation doesn't surface it at authoring time.
