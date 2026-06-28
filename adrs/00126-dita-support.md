---
status: accepted
date: 2025-10-20
decision-makers: doc-detective maintainers
---

# DITA fileType and .ditamap processing

## Context and Problem Statement

Doc Detective supported Markdown, AsciiDoc, and HTML source files, but not DITA — an XML-based documentation format where inline test markup lives in XML attributes and where a `.ditamap` aggregates many topics. Teams writing DITA had no way to detect and run tests from their sources. How should DITA be added as a first-class fileType, and how should `.ditamap` aggregation be handled?

## Decision Drivers

* DITA shops need the same detect-and-run pipeline as Markdown/AsciiDoc/HTML.
* DITA inline markup lives in XML attributes, not fenced code blocks or comments.
* `.ditamap` files reference topics and must be resolved through the DITA toolchain.
* DITA processing should be toggleable for users who don't want map expansion.

## Considered Options

* **A. A `dita_1_0` resolver fileType (XML-attribute inline parsing) plus a `processDitaMaps` config switch that resolves `.ditamap` via the `dita` CLI** (chosen).
* **B. Pre-convert DITA to HTML and run the HTML fileType.**
* **C. DITA topic support only, no `.ditamap` aggregation.**

## Decision Outcome

Chosen option: **A**, because parsing DITA's XML attributes directly preserves the source-to-test line mapping that pre-conversion would lose, and routing `.ditamap` through the official `dita` CLI handles topic aggregation correctly rather than reimplementing map resolution.

Contract decided:

* Config `processDitaMaps`, boolean, default `true`.
* `fileTypes` default/enum gains `dita`.
* Resolver `dita_1_0` fileType: XML-attribute inline parsing, `.ditamap` resolution via the `dita` CLI, and a `parseXmlAttributes` helper.
* UUID generation migrated to `crypto.randomUUID`.

### Consequences

* Good: DITA sources participate in the full detect/parse/resolve/run pipeline.
* Good: `.ditamap` aggregation reuses the official toolchain.
* Neutral: requires DITA-OT in the environment (provided by the images per `00125`).
* Neutral: inline `<data>` detection is later expanded for order-flexibility and entity decoding (`00155`).

### Confirmation

Schema in doc-detective-common `5afa958`; core `81620db`; resolver `5a6e7f6`, `e18acef`, `371ed8e`.

## Pros and Cons of the Options

### A. Native dita_1_0 fileType + processDitaMaps
* Good: preserves line mapping; correct map aggregation.
* Bad: depends on an external Java toolchain.

### B. Pre-convert to HTML
* Good: reuses HTML fileType.
* Bad: loses source line mapping; lossy.

### C. Topics only
* Good: simpler.
* Bad: ignores the central `.ditamap` aggregation DITA users rely on.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common `5afa958`; core `81620db`; resolver `5a6e7f6`, `e18acef`, `371ed8e`. Inventory ref: BACKFILL-INVENTORY.md Seq 186. Related: `00125` (DITA-OT in images), `00155` (DITA inline detection expansion), `00076` (AsciiDoc/HTML fileTypes).
