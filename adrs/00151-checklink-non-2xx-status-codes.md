---
status: accepted
date: 2026-04-07
decision-makers: doc-detective maintainers
---

# checkLink accepts listed non-2xx status codes

## Context and Problem Statement

The `checkLink` step verifies that a documented URL is reachable, and its `statusCodes`
field already defaulted to a list of acceptable codes (`[200, 301, 302, 307, 308]`).
But the runtime pass/fail logic in `src/core/tests/checkLink.ts` treated any non-2xx
response as a failure even when the response code was explicitly listed in `statusCodes` —
so a documented endpoint that legitimately returns `401`, `403`, or `404` (a page that is
*expected* to be gated or absent) could not be asserted. Should `checkLink` honor any
status code the author lists in `statusCodes`, regardless of its class?

## Decision Drivers

* The `statusCodes` field is the author's explicit contract — it should be authoritative.
* Documentation legitimately references endpoints that return non-2xx codes (auth-gated,
  intentionally-removed, redirect chains).
* Pass/fail must be a pure membership test, not a hardcoded 2xx class check.
* No schema change — the field already exists; only the runtime comparison was wrong.

## Considered Options

* **A. Pass when the actual status code is a member of the listed `statusCodes`, regardless of class** (chosen).
* **B. Keep 2xx-only success; add a separate `expectFailure` flag for non-2xx.**
* **C. Leave behavior as-is; require a `runShell`/`httpRequest` workaround for non-2xx checks.**

## Decision Outcome

Chosen option: **A**, because `statusCodes` is the existing, documented contract and the
only defensible semantics is "the response code must be one of the codes the author
declared." `checkLink` now passes the step whenever the actual HTTP status code appears in
the resolved `statusCodes` list — including non-2xx codes — and fails only when it does
not. The default list is unchanged, so authors who never set `statusCodes` see no
behavior change; the fix only affects authors who explicitly list a non-2xx code.

### Consequences

* Good: authors can assert intentionally non-2xx endpoints without a workaround.
* Good: no schema or field surface change; pure runtime correction.
* Neutral: the default acceptable set is unchanged, so common cases behave identically.
* Bad: a typo'd non-2xx code in `statusCodes` now silently passes a "broken" link — the
  author owns the list.

### Confirmation

Shipped in `src/core/tests/checkLink.ts` (commit `0152d6e6`). Confirmed by the pass/fail
membership test over the listed `statusCodes` and exercised end-to-end through the runner.

## Pros and Cons of the Options

### A. Membership test over listed statusCodes
* Good: honors the author's explicit contract; minimal change.
* Bad: a wrong listed code passes silently.

### B. Separate expectFailure flag
* Good: explicit intent marker.
* Bad: duplicates what `statusCodes` already expresses; larger surface.

### C. Require a workaround
* Good: zero code change.
* Bad: forces `httpRequest` for a link check; poor authoring experience.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `0152d6e6`. Inventory
ref: BACKFILL-INVENTORY.md Seq 213. Related: `00022` (checkLink action), `00152`
(checkLink bot-protection mitigation), `00142` (checkLink browser UA + status error).
