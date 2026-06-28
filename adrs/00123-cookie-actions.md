---
status: accepted
date: 2025-08-10
decision-makers: doc-detective maintainers
---

# saveCookie / loadCookie step types

## Context and Problem Statement

Tests that begin behind authentication had no way to persist a logged-in browser session between runs or to seed a session from a saved cookie file — every spec had to re-drive the full login flow. Doc Detective needed step types to export the current browser cookies to disk and to import them back. What should those step types' contract be, including the storage format and how a cookie's source (file vs. variable) is specified?

## Decision Drivers

* Authenticated test flows need to persist and reuse browser sessions.
* A widely-interoperable on-disk cookie format is preferable to a bespoke one.
* Cookies should be sourced either from a file path or an environment variable, but not ambiguously both.
* The step shape should follow the v3 action-as-key convention (`00096`).

## Considered Options

* **A. `saveCookie` / `loadCookie` action-as-key steps using the Netscape cookie format, string-or-object shape, XOR `path`/`variable`** (chosen).
* **B. A single `cookie` step with a `mode: save|load` field.**
* **C. JSON-only cookie serialization.**

## Decision Outcome

Chosen option: **A**, because two explicitly-named verbs read clearly in documentation, the Netscape cookie format is broadly interoperable with other tooling, and an XOR between `path` and `variable` prevents an ambiguous "which source wins" situation at the schema level.

Contract decided:

* `saveCookie` / `loadCookie` action-as-key step types, each accepting a string shorthand or an object.
* Object fields: cookie `name` (pattern-validated), `path` or `variable` (mutually exclusive — XOR), and `domain`.
* On-disk Netscape cookie format; runner parse/format with `sameSite: Lax` and an environment-variable fallback for the cookie source.
* The resolver registers both as `driverActions`.

### Consequences

* Good: authenticated sessions persist across runs without re-driving login.
* Good: Netscape format interoperates with browsers and other tools.
* Good: XOR `path`/`variable` removes source ambiguity at validation time.
* Neutral: cookie `sameSite` handling is later expanded (see `00155`).

### Confirmation

Schema in doc-detective-common (`620fc810`, `f28e41f`, `73933f0`, `c3d9e8b`, `9ce01f7`); runner parse/format in core (`b80cb9d`, `b456783`); resolver `driverActions` registration (`96e53763`).

## Pros and Cons of the Options

### A. saveCookie/loadCookie + Netscape + XOR
* Good: clear verbs; interoperable format; unambiguous source.
* Bad: two step types instead of one.

### B. Single cookie step with mode
* Good: one step type.
* Bad: mode field is less self-documenting than named verbs.

### C. JSON-only serialization
* Good: trivial to emit.
* Bad: not interoperable with browser cookie tooling.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common `620fc810`, `f28e41f`, `73933f0`, `c3d9e8b`, `9ce01f7`; core `b80cb9d`, `b456783`; resolver `96e53763`. Inventory ref: BACKFILL-INVENTORY.md Seq 183. Related: `00096` (v3 action-as-key family), `00155` (cookie sameSite expansion).
