---
status: accepted
date: 2026-04-16
decision-makers: doc-detective maintainers
---

# checkLink bot-protection mitigation (browser headers, retry, HEAD fallback)

## Context and Problem Statement

`checkLink` already sent a browser-like User-Agent and Accept header (`00142`), but
bot-protected and rate-limited sites still returned spurious `429` (Too Many Requests) and
`403` (Forbidden) responses that failed otherwise-valid documented links. The audit needed
`checkLink` to distinguish a genuinely broken link from a defensive bounce by a CDN or WAF,
without flagging every protected URL as a failure. How should `checkLink` mitigate
bot-protection false negatives, and what new contract surface (in `checkLink_v3` and
`config_v3`) does that require?

## Decision Drivers

* `429`/`403` from bot-protection are false failures, not broken links.
* Real reachability should still be confirmed, not assumed.
* Mitigation must be configurable so authors can tune retries/timeouts for strict sites.
* Some servers reject `GET` from automation but answer `HEAD` — and vice versa.

## Considered Options

* **A. Browser-like headers + bounded retry on `429`/`403` + `HEAD`-method fallback, with new `checkLink_v3` and `config_v3` fields** (chosen).
* **B. Treat `429`/`403` as automatic PASS (assume protection).**
* **C. Add only a retry count, no method fallback or header tuning.**

## Decision Outcome

Chosen option: **A**, because the goal is to actually reach the URL the way a browser would,
not to paper over protection by assuming success. `checkLink` (rewritten in
`src/core/tests/checkLink.ts`, ~192 lines) sends fuller browser-like request headers,
retries on `429`/`403` responses, and falls back to a `HEAD` request when the primary
method is bounced — only failing the step when every attempt still resolves outside the
acceptable `statusCodes`. The behavior is governed by new fields added to the `checkLink_v3`
step schema and corresponding `config_v3` additions, so retry/header behavior is tunable
rather than hardcoded.

### Consequences

* Good: dramatically fewer false failures from CDN/WAF-protected documentation links.
* Good: configurable per-step (`checkLink_v3`) and globally (`config_v3`).
* Good: `HEAD` fallback recovers servers that reject automated `GET`.
* Bad: more network round-trips per check (retry + fallback) on protected URLs.
* Neutral: a truly broken link still fails after exhausting retries and the fallback.

### Confirmation

Shipped in `src/core/tests/checkLink.ts` with `checkLink_v3` and `config_v3` schema
additions (commit `6a11a93f`, PR #253). Confirmed by the retry/HEAD-fallback path and the
new schema fields validating against `config_v3`/`checkLink_v3`.

## Pros and Cons of the Options

### A. Headers + retry + HEAD fallback (configurable)
* Good: real reachability with tunable mitigation.
* Bad: extra requests; larger step/config surface.

### B. Auto-PASS 429/403
* Good: trivially removes false failures.
* Bad: masks genuinely broken protected links; not a real check.

### C. Retry count only
* Good: simplest mitigation.
* Bad: misses servers that only answer HEAD; less effective.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `6a11a93f` (PR #253).
Inventory ref: BACKFILL-INVENTORY.md Seq 214. Related: `00142` (checkLink browser UA +
status error), `00151` (checkLink non-2xx status codes), `00158` (origin params / query
appending).
