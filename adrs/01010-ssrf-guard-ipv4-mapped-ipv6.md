---
status: accepted
date: 2026-06-30
decision-makers: doc-detective maintainers
---

# SSRF guard: detect IPv4-mapped IPv6 private addresses

## Context and Problem Statement

The SSRF guard `assertUrlHostIsPublic` / `isPrivateOrLoopbackAddress`
([src/core/utils.ts](../src/core/utils.ts)) refuses binary URL fetches (`fetchFile`, and the
`checkLink`/`httpRequest`-adjacent paths) whose host is a private/loopback/link-local address, so a
documentation spec can't be used to reach internal infrastructure (incl. the
`169.254.169.254` cloud-metadata endpoint).

While writing coverage tests ([#426](https://github.com/doc-detective/doc-detective/pull/426)) we
found a **bypass** ([#427](https://github.com/doc-detective/doc-detective/issues/427)): IPv4-mapped
IPv6 addresses defeat the guard. The previous code recursed on the embedded v4 by string-stripping
the prefix:

```ts
if (normalized.startsWith("::ffff:")) {
  return isPrivateOrLoopbackAddress(normalized.replace("::ffff:", ""));
}
```

The WHATWG `URL` parser normalizes `::ffff:10.0.0.1` to **hex** form `::ffff:a00:1`. After stripping
`::ffff:`, the remainder is `a00:1`, which is neither a valid IPv4 (`net.isIPv4`) nor a standalone
IPv6 (`net.isIPv6`), so the function returned `false` (treated as public). Every IPv4-mapped private
address — e.g. `http://[::ffff:a00:1]/x` (10.0.0.1) or `http://[::ffff:a9fe:a9fe]/x`
(169.254.169.254) — slipped past the guard.

The documented contract ("refuses private/loopback") was always the intent; this is a parsing gap,
not a contract change.

## Decision Drivers

* Close the bypass for the form real input actually arrives in (hex-normalized), not just the
  dotted form.
* No new dependency; keep the guard a small pure function.
* Preserve existing behavior: public mapped addresses (e.g. `::ffff:8.8.8.8`) stay allowed, and all
  existing private/public classifications are unchanged.
* Make the fixed branch unit-testable and deterministic.

## Considered Options

* **Reconstruct the dotted IPv4 from the mapped tail in-place** (string/bitmath, no deps).
* **Add an IP-parsing library** (e.g. `ipaddr.js`) to canonicalize mapped addresses.
* **Reject all `::ffff:` addresses outright** (treat any IPv4-mapped host as suspicious).

## Decision Outcome

Chosen: **reconstruct the dotted IPv4 from the mapped tail in-place**. For a `::ffff:` address (whose
IPv6 validity is already established), parse the one-or-two hex groups the WHATWG URL parser leaves in
the tail (`a00:1`, or `1` when the high group is zero) as the low 32 bits, rebuild `a.b.c.d`, and
recurse through the existing IPv4 range checks. The parser always emits the hex form, so a
dotted-decimal tail is never produced; the only non-hex path is a defensive `!hexMatch` guard that
`net.isIPv6` already precludes (marked `c8 ignore`).

### Consequences

* Good: every IPv4-mapped private/loopback/link-local address is now refused, via the same IPv4
  range table — one source of truth. No new dependency.
* Good: public mapped addresses remain allowed (`::ffff:8.8.8.8` → `8.8.8.8` → public).
* Neutral: a previously-(wrongly)-reachable URL shape is now refused. This is a security fix, so the
  behavior change is intended; no valid public fetch is affected.
* Trade-off: rejecting all `::ffff:` outright was simpler but would block legitimate public mapped
  addresses, so it was not chosen.

### Confirmation

Unit tests in [test/core-utils-coverage.test.js](../test/core-utils-coverage.test.js) assert that
`::ffff:a00:1` (10.0.0.1), `::ffff:7f00:1` (127.0.0.1), `::ffff:a9fe:a9fe` (169.254.169.254), and
`::ffff:c0a8:1` (192.168.0.1) are rejected, while `::ffff:8.8.8.8` stays allowed. The full root
coverage suite runs under the ratchet job.

## Docs impact

The SSRF guard's documented behavior ("refuses private/loopback hosts") is **unchanged** — this fix
makes the implementation honor it for IPv4-mapped IPv6. No user-facing flag, option, or output
changes; no documentation page requires updates.

## Pros and Cons of the Options

### Reconstruct dotted IPv4 in-place
* Good: no dependency; reuses the existing range table; small and pure.
* Bad: hand-rolled bit math (covered by tests).

### IP-parsing library
* Good: canonicalizes every IPv6 form robustly.
* Bad: a new runtime dependency for a few lines of logic; larger surface.

### Reject all `::ffff:` outright
* Good: simplest.
* Bad: blocks legitimate public IPv4-mapped addresses; over-broad.
