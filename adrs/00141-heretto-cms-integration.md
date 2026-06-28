---
status: accepted
date: 2025-12-16
decision-makers: doc-detective maintainers
---

# Heretto CMS integration

## Context and Problem Statement

Doc Detective tests live next to documentation source, but a large class of users author in a
component CMS (Heretto) where the "source" is not a checked-out file but content fetched through a
publishing API. Doc Detective had no way to point a test run at CMS-hosted content, nor to push the
artifacts a run produces (screenshots) back into that CMS. The question: how do users configure a
Heretto connection, reference CMS content as a test source, and round-trip updated screenshots back
to the CMS — without leaking credentials into reports?

## Decision Drivers

* CMS-authored docs must be testable without a manual export/checkout step.
* Credentials (API token) must be schema-typed as a secret and kept out of report output.
* Multiple CMS connections must be addressable by name from a source reference.
* Screenshots captured during a run should be able to flow back to the CMS, but only when changed.
* Re-runs must produce stable, collision-safe spec identifiers for CMS-sourced content.

## Considered Options

* **A. First-class `integrations.heretto[]` config + `heretto:` source refs + screenshot uploader round-trip** (chosen).
* **B. A standalone pre-step that shells out to Heretto's API and writes files to a temp dir.**
* **C. Treat CMS content like any remote `http(s)://` source and ignore upload.**

## Decision Outcome

Chosen option: **A**, because CMS round-tripping (download content, run tests, upload changed
screenshots) is a coherent integration contract that the resolver and reporter both need to know
about, not something a generic fetch can express.

The contract:

1. **Config**: `integrations.heretto[]` — an array of named connections, each with
   `name`, `organizationId`, `username`, `apiToken` (schema `format: password` so it is treated as
   a secret), and `scenarioName`.
2. **Source refs**: a test source may be written as `heretto:<name>`, resolved via the Heretto
   publishing API (a ZIP download of the published content). Modeled in the
   `sourceIntegration_v3` schema.
3. **Screenshot round-trip**: a screenshot uploader pushes captured images back to the CMS;
   `uploadOnChange` defaults to `true`, each upload carries a `changed` flag, and results surface
   on `report.uploadResults`.
4. **Identity**: CMS-sourced specs get collision-safe `specId`s so repeated runs don't clash.

Origin spans common (schema), core (runner integration), and resolver (source fetching) packages —
later re-exposed in the merged monorepo as the in-repo Heretto loader (`00150`).

### Consequences

* Good: CMS-authored documentation is testable in place; screenshots flow back automatically.
* Good: `apiToken` is a typed secret (`format: password`), keeping it out of plain report output.
* Good: `uploadOnChange` avoids needless writes; the `changed` flag makes uploads auditable.
* Bad: introduces a vendor-specific integration surface across three packages to maintain.
* Neutral: only Heretto is supported; other CMS vendors would each need their own integration entry.

### Confirmation

Shipped across common `ea835d1`, `8ad7460` (`sourceIntegration_v3`, `integrations.heretto[]`), core
`f0ae77`, `be8c485` (runner integration + uploader), and resolver `15c58e0`, `b7345ab`, `79e02b4`
(source fetching). Confirmed by the `sourceIntegration_v3` schema, the `report.uploadResults`
shape, and `heretto:` ref resolution.

## Pros and Cons of the Options

### A. First-class integration + source ref + uploader
* Good: full download/run/upload round-trip; typed-secret credentials; named connections.
* Bad: vendor-specific surface across schema, runner, and resolver.

### B. Standalone pre-step shelling to the API
* Good: no schema/runner changes.
* Bad: no upload round-trip; credentials live in step text; not addressable by name.

### C. Reuse generic remote-source fetching
* Good: no new code.
* Bad: can't authenticate, can't upload, can't model CMS scenarios.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commits `ea835d1`, `8ad7460`;
core `f0ae77`, `be8c485`; resolver `15c58e0`, `b7345ab`, `79e02b4`. Inventory ref:
BACKFILL-INVENTORY.md Seq 202. Related: `00080` (remote test-source fetching), `00090` (OpenAPI
integration), `00150` (in-repo Heretto loader re-exposure).
