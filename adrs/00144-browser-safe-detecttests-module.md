---
status: accepted
date: 2026-02-24
decision-makers: doc-detective maintainers
---

# Browser-safe detectTests / parseContent module

## Context and Problem Statement

`detectTests` and `parseContent` — the functions that scan documentation content and emit
candidate tests — were coupled to Node built-ins (`fs`, `path`), so they could only run server-side.
Tooling that wants to preview "what tests would this content produce" inside a browser (editors,
playgrounds, web dashboards) had no way to call this logic without a Node backend. Should
`doc-detective-common` expose a pure, browser-safe detection path, and ship a browser bundle for it?

## Decision Drivers

* Content detection should be runnable in a browser for live previews and authoring tools.
* The browser path must not import `fs`/`path` or other Node-only built-ins.
* It must remain a public, stable export so external tools can depend on it.
* It must reuse the same detection logic, not fork a parallel implementation.

## Considered Options

* **A. Add a pure, no-fs/no-path `detectTests`/`parseContent` module to public exports + ship a browser bundle** (chosen).
* **B. Keep detection Node-only; tell browser consumers to call a server endpoint.**
* **C. Bundle the existing Node module with fs/path shims/polyfills for the browser.**

## Decision Outcome

Chosen option: **A**, because content-string detection is inherently pure — it operates on text, not
the filesystem — so extracting a fs/path-free variant lets the same logic run in any JavaScript
environment without shims or a backend hop.

The contract:

* `detectTests` and `parseContent` are exposed as a **pure module** with no `fs`/`path` (and no
  other Node-only) imports — they take content in and return detected tests out.
* These functions are added to the package's **public exports**.
* `dist` ships an `index.cjs` browser bundle so the module is consumable in a browser.
* First released in `v4.0.0-beta`.

### Consequences

* Good: detection runs in the browser for live previews and authoring tools, no backend required.
* Good: the same logic backs both server and browser paths (no fork).
* Bad: the pure module must stay disciplined — accidentally importing a Node built-in breaks the
  browser bundle.
* Neutral: file-based discovery (walking directories) still lives in the Node/resolver path; only
  content-string detection is browser-safe.

### Confirmation

Shipped in common `2f10a66` (`v4.0.0-beta`). Confirmed by the public `detectTests`/`parseContent`
exports being free of `fs`/`path` imports and by the `dist` `index.cjs` browser bundle.

## Pros and Cons of the Options

### A. Pure module + browser bundle
* Good: real browser support; shared logic; clean public export.
* Bad: requires ongoing discipline to keep Node built-ins out.

### B. Server endpoint only
* Good: no extraction work.
* Bad: every browser tool needs a backend; higher latency; not embeddable.

### C. Bundle Node module with polyfills
* Good: no source split.
* Bad: fragile fs/path shims; larger, slower bundle; leaks Node assumptions.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commit `2f10a66`. Inventory
ref: BACKFILL-INVENTORY.md Seq 205. Related: `00143` (TypeScript migration), `00148`
(`fileTypes.ts` + detection refactor), `00146` (merge common into the monorepo).
