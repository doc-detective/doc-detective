---
status: accepted
date: 2023-10-23
decision-makers: doc-detective maintainers
---

# Relative URL and origin resolution

## Context and Problem Statement

`goTo` and `checkLink` required fully qualified URLs, so documentation that referenced site-relative
paths (`/docs/start`) couldn't be tested without hard-coding the host into every step. There was also
a `hostname` field whose name didn't convey that its value is prepended to the URL. And `checkLink`
only accepted `200`, failing on legitimate `201`/`202` responses. How should relative URLs, the host
prefix, and acceptable link statuses be expressed?

## Decision Drivers

* Documentation commonly uses site-relative links; tests should accept them.
* The host-prefix field name should describe what it does (prepend to the URL).
* `checkLink` should accept the common 2xx success codes, not just `200`.
* Changes must stay backward-compatible for absolute-URL tests.

## Considered Options

* **A. Allow leading-`/` relative URLs resolved against a renamed `origin` field; widen `checkLink` default statusCodes to `[200,201,202]`** (chosen).
* **B. Require absolute URLs only; document a workaround.**
* **C. Infer the origin from the first absolute URL seen in the run.**

## Decision Outcome

Chosen option: **A**, because relative links are how documentation actually references a site, and an
explicitly named `origin` makes the prefix obvious. The `goTo`/`checkLink` `url` pattern gains
leading-`/` relative support; the host field `hostname` is renamed `origin` and is prepended to a
relative `url` to form the absolute address. `checkLink`'s default acceptable `statusCodes` widens
from `[200]` to `[200,201,202]`.

### Consequences

* Good: documentation site-relative links are directly testable.
* Good: `origin` clearly names the prepended base; one place to point at staging vs. production.
* Good: `checkLink` no longer fails on `201`/`202` successes by default.
* Neutral: the rename leaves `hostname` as legacy terminology in older specs.

### Confirmation

Shipped in common `c21275c`, `254ed5b`, `6ee7bfc` (url pattern, `hostname`→`origin`, statusCodes
default) and core `bf0a0023`, `950391b0` (origin prepend resolution). Exercised by `goTo`/`checkLink`
fixtures using relative paths against an `origin`.

## Pros and Cons of the Options

### A. Relative URLs + `origin` prefix + wider statusCodes
* Good: matches real documentation; clear naming; fewer false failures.
* Bad: a rename to carry alongside the old `hostname` term.

### B. Absolute URLs only
* Good: nothing to resolve.
* Bad: forces host into every step; brittle across environments.

### C. Infer origin from first absolute URL
* Good: no new field.
* Bad: implicit, order-dependent, surprising.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commits `c21275c`, `254ed5b`,
`6ee7bfc`; doc-detective-core commits `bf0a0023`, `950391b0`. Inventory ref: BACKFILL-INVENTORY.md
Seq 95. Related: `00022` (checkLink action), `00158` (originParams query appending).
