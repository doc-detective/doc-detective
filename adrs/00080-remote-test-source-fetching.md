---
status: accepted
date: 2024-05-03
decision-makers: doc-detective maintainers
---

# Fetch remote http(s) test sources to a temp dir and clean up after the run

## Context and Problem Statement

Test sources were assumed to be local files on disk, but users wanted to point Doc Detective at
documentation hosted at a URL (a published doc page or raw file). The resolver had no way to consume
a remote source, and downloading repeatedly or into the project tree would be wasteful and leave
debris. How should a source given as a URL be turned into something the local detect/parse pipeline
can read, and how is the downloaded artifact cleaned up?

## Decision Drivers

* Users should be able to test documentation served over the network, not just local files.
* A remote source must be materialized to a local path the existing pipeline can read unchanged.
* Downloaded files must not pollute the project tree and must be removed after the run.
* Fetching must be scoped to web URLs (`http(s)://`) and not misfire on other path-like strings.

## Considered Options

* **A. Detect sources starting with `http`, fetch via axios into an md5-named file under
  `os.tmpdir()`, use it as the local source, and `cleanTemp()` after the run (later tightened to
  `http(s)://` only)** (chosen).
* **B. Require users to download remote docs themselves before running.**
* **C. Stream remote content in memory without a temp file.**

## Decision Outcome

Chosen option: **A** (`core`, commits `ba7317`, `70e292`, `4ded9e`):

1. **Detection + fetch**: a source whose path starts with `http` is fetched via axios; the content is
   written to `os.tmpdir()` under an md5-hash-derived filename and used as the local source for the
   detect/parse pipeline.
2. **Cleanup**: `cleanTemp()` removes the downloaded artifacts after the run completes.
3. **Tightening**: the prefix check is later narrowed from `http` to `http(s)://` so only genuine web
   URLs are fetched.

## Pros and Cons of the Options

### A. Fetch to tmpdir + cleanup (chosen)
* Good: remote docs are testable; the existing local pipeline is reused unchanged; no project debris.
* Bad: a network round-trip per remote source; tmp content is a transient cache, not pinned.

### B. User pre-downloads
* Good: no fetch code; fully explicit.
* Bad: clumsy UX; defeats the point of pointing at a live URL.

### C. In-memory streaming
* Good: no temp file.
* Bad: every pipeline stage that reads from a path would need a non-file code path.

### Consequences

* Good: URL sources work end-to-end with the local detection/parsing pipeline.
* Good: md5-named temp files are removed after the run, leaving the workspace clean.
* Bad: each run re-downloads remote sources (no persistent cache).
* Neutral: the `http`→`http(s)://` tightening avoids fetching non-URL path-like strings.

### Confirmation

Remote fetch into `os.tmpdir()` (md5 name) and `cleanTemp()` in `doc-detective-core` (`ba7317`,
`70e292`); the `http(s)://`-only tightening in `4ded9e`.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commits `ba7317`, `70e292`,
`4ded9e`. Inventory ref: BACKFILL-INVENTORY.md Seq 118. Related: `00004` (recursive directory walk +
extension filtering), `00101` (v3 spec/test resolution).
