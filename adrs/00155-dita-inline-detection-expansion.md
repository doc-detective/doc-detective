---
status: accepted
date: 2026-04-18
decision-makers: doc-detective maintainers
---

# DITA inline detection expansion (order-flexible data regexes, XML entity decoding)

## Context and Problem Statement

DITA support (`00126`) detected inline tests/steps embedded as
`<data name="doc-detective" value="…">` elements, but the detection regexes assumed a fixed
attribute order (`name` before `value`) and did not decode XML entities (`&amp;`, `&lt;`,
`&quot;`) inside the captured `value`, so authors who wrote attributes in the other order or
used escaped characters silently got no tests. Separately, the cookie actions' `sameSite`
field needed normalization to a WebDriver-acceptable form. How should DITA inline detection
tolerate real-world XML, and how should `sameSite` be normalized?

## Decision Drivers

* DITA/XML attributes are order-independent; detection must not depend on attribute order.
* `value` content can contain XML-escaped characters that must be decoded before parsing.
* Detection should match how authors actually write `<data>` elements, not one canonical form.
* WebDriver requires a normalized `sameSite` value when loading cookies.

## Considered Options

* **A. Order-flexible `<data>` regexes + XML entity decoding in `parseObject`, plus `sameSite` normalization** (chosen).
* **B. Require a canonical attribute order and pre-decoded values; document the constraint.**
* **C. Switch DITA detection to a full XML parser instead of regexes.**

## Decision Outcome

Chosen option: **A**, because tolerating natural attribute ordering and escaped content is
what makes detection robust against hand-authored DITA, and the regex approach (consistent
with the rest of the inline-detection pipeline) stays lightweight. The `<data name=doc-detective value=…>`
detection regexes in `fileTypes.ts` were made order-flexible (match regardless of whether
`name` or `value` comes first), and `parseObject` now decodes XML entities in captured
values before parsing. The cookie `sameSite` value is normalized for WebDriver in
`loadCookie.ts`.

### Consequences

* Good: DITA inline tests are detected regardless of `<data>` attribute order.
* Good: XML-escaped characters in `value` are decoded, so escaped JSON parses correctly.
* Good: `loadCookie` `sameSite` is WebDriver-acceptable.
* Neutral: detection stays regex-based, consistent with other fileTypes.
* Bad: order-flexible regexes are more complex than fixed-order ones.

### Confirmation

Shipped in `fileTypes.ts` (order-flexible regexes, entity decoding in `parseObject`) and
`loadCookie.ts` (`sameSite` normalization) (commit `ab56a39f`, PR #250). Confirmed by DITA
inline detection over reordered/escaped `<data>` elements.

## Pros and Cons of the Options

### A. Order-flexible regexes + entity decoding
* Good: robust against real-world DITA; lightweight.
* Bad: more complex regexes.

### B. Require canonical form
* Good: simplest regexes.
* Bad: silently drops valid but differently-ordered/escaped authoring.

### C. Full XML parser
* Good: fully correct XML handling.
* Bad: heavier dependency; diverges from the regex-based detection pipeline.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `ab56a39f` (PR #250).
Inventory ref: BACKFILL-INVENTORY.md Seq 217. Related: `00126` (DITA support), `00123`
(cookie actions), `00148` (fileTypes module + detection refactor).
