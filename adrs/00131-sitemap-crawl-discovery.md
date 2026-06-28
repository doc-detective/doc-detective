---
status: accepted
date: 2025-10-30
decision-makers: doc-detective maintainers
---

# Sitemap crawl discovery

## Context and Problem Statement

Doc Detective discovers test sources by walking input files and directories, but a documentation
site's full URL surface is not always reachable from a local file tree — many published pages are
only enumerated in the site's `sitemap.xml`. Authors wanting to test every page a site advertises
had to list them by hand. Should the resolver be able to expand its input set by crawling a
`sitemap.xml`, and how should that behavior be opted into so the default stays a predictable
local-file walk?

## Decision Drivers

* Site-wide coverage should be derivable from the site's own `sitemap.xml` rather than hand-listed.
* Crawling reaches the network, so it must be opt-in and off by default.
* The contract must be a simple, validated config field consistent with other `config_v3` flags.
* Default discovery (local file/directory walk) must be unchanged when crawling is not requested.

## Considered Options

* **A. A `crawl` boolean config field (default `false`) that, when true, parses `sitemap.xml` to
  discover additional files to test** (chosen).
* **B. Always crawl when an input looks like a site root.**
* **C. A separate `crawl` CLI subcommand outside the normal resolve pipeline.**

## Decision Outcome

Chosen option: **A**, because a single validated boolean keeps the discovery contract uniform with
the rest of `config_v3` and makes the network-touching behavior explicit. The contract: `config.crawl`
is a boolean defaulting to `false`; when `true`, the resolver crawls `sitemap.xml` to discover
additional files to test and folds them into the normal detect/resolve pipeline. When `false` (the
default), discovery is the existing local file/directory walk with no network access (commit
`856ce9a`, `doc-detective-common`).

### Consequences

* Good: site-wide test coverage derivable from the published sitemap with one flag.
* Good: default behavior unchanged; no surprise network calls.
* Bad: crawling depends on the sitemap being present and accurate.
* Neutral: discovered URLs still flow through the same resolution/validation as listed inputs.

### Confirmation

`config_v3` schema carries the `crawl` boolean (default `false`); shipped in `doc-detective-common`
commit `856ce9a`. Behavior is confirmed by the off-by-default resolve path remaining a pure local
walk.

## Pros and Cons of the Options

### A. `crawl` boolean (opt-in, default false)
* Good: uniform with other config flags; explicit opt-in for network access.
* Bad: relies on a well-formed `sitemap.xml`.

### B. Implicit crawl on site-root input
* Good: zero configuration.
* Bad: surprising network access; hard to predict what gets tested.

### C. Separate crawl subcommand
* Good: isolates crawling from normal resolution.
* Bad: a second discovery path to maintain; breaks the single merged-config model.

## More Information

Recorded retrospectively (ADR backfill). Origin: `doc-detective-common` commit `856ce9a`. Inventory
ref: BACKFILL-INVENTORY.md Seq 191. Related: `00004` (recursive directory walk + extension
filtering), `00080` (remote test-source fetching).
