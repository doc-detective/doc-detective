---
name: fern-docs-check
description: >
  Validate the Fern documentation site for Doc Detective. Use this skill
  whenever you add, move, or edit pages; update navigation in docs.yml;
  change fern.config.json; or prepare a docs-related PR. Catches broken
  config, orphaned pages, missing navigation entries, and bad internal links
  before they reach CI.
---

# Fern Docs Check Skill

You are validating the **Doc Detective** documentation site, built with Fern
and located in `docs/fern/`. The live site is at docs.doc-detective.com.

---

## Quick Reference

| Check | Command / Method |
|---|---|
| Config validation | `fern check` |
| Config + warnings | `fern check --warnings` |
| Broken links | `fern check --strict-broken-links` |
| Local preview | `npm start` (from `docs/`) |
| Doc Detective tests | `npm run test` (from `docs/`) |

---

## Setup

All commands run from the `docs/` directory. Node >=22.12.0 and npm >=10.9.2
are required.

```bash
cd docs
npm install   # also installs mdx2vast and doc-detective globally
```

Check that the Fern CLI is available:

```bash
npx fern --version
```

The expected CLI version is in `fern/fern.config.json` under `"version"`.

---

## Workflow

### Step 1 — Run `fern check`

```bash
cd docs
npx fern check --warnings
```

`fern check` validates:
- `fern/fern.config.json` — required `organization` and `version` fields
- `fern/docs.yml` — site config, navigation, instances, colors, redirects
- All file paths referenced in `docs.yml` — must exist and be resolvable

`fern check` is **silent on success**. Any output indicates a problem.

If the workspace has changed pages or navigation, also run:

```bash
npx fern check --strict-broken-links
```

This catches broken internal links but is slower — use it before PRs or when
modifying navigation/redirects.

### Step 2 — Check navigation coverage

Every page file under `fern/pages/` must be referenced in `fern/docs.yml`
navigation to appear on the site. Fern silently ignores unlisted pages — it
does not error on them.

Manually verify:
1. Any new `.mdx` files are registered in `fern/docs.yml` under the correct
   tab and section.
2. Any deleted or moved files are removed from `fern/docs.yml`. Stale paths
   will cause `fern check` to fail.

### Step 3 — Validate internal links

Internal links in MDX pages must use the URL path from `docs.yml` navigation,
**not** the file path. The URL path is derived from navigation slugs, not
folder structure.

**Wrong** — using file paths:
```markdown
[Overview](./getting-started/overview)
[Overview](../getting-started/overview.mdx)
[Overview](/fern/pages/docs/intro)
```

**Right** — using the URL slug from docs.yml:
```markdown
[Overview](/get-started/overview)
```

To find the correct URL for a page:
1. Open `fern/docs.yml`
2. Find the page's entry in `navigation`
3. The URL is built from the tab slug + section slugs + page slug, not the
   file path

### Step 4 — Spot-check docs.yml structure

Review `fern/docs.yml` for common mistakes:

- **Duplicate slugs** in navigation — each section/page slug must be unique
  within its parent scope
- **Circular redirects** — a redirect source should not also be a redirect
  destination in another rule
- **Invalid hex colors** — `colors.accent-primary.light/dark` and
  `colors.background.light/dark` must be valid CSS hex values
- **Missing favicon/logo paths** — referenced asset files must exist under
  `fern/`

### Step 5 — Optional: local preview

To visually confirm changes before pushing:

```bash
cd docs
npm start    # starts fern docs dev at http://localhost:3000
```

Use this when making structural navigation changes or adding new pages —
`fern check` validates config but doesn't render the site.

---

## Output

### If all checks pass

Report:
```
fern check: passed
Navigation: all pages registered
Links: no issues found
```

### If issues are found

Report each issue with:
- Which check caught it (`fern check`, navigation audit, link check)
- The file and line/section where the problem is
- What the fix is

Fix all issues before completing the task.

---

## Key Files

| File | Purpose |
|---|---|
| `fern/fern.config.json` | Organization name and Fern CLI version |
| `fern/docs.yml` | Full site config: navigation, colors, instances, redirects |
| `fern/pages/` | All MDX content pages |
| `.vale.ini` | Vale style linter config (used by CI) |
| `package.json` | Scripts: `start` (dev server), `test` (Doc Detective tests) |

---

## Doc Detective-Specific Notes

- **Self-testing** — the docs use Doc Detective to test their own content. Run
  `npm run test` to execute `.spec.json` tests embedded in the docs. This is
  separate from Fern validation.
- **Fern CLI version** — the version in `fern/fern.config.json` must match
  the `fern-api` package version in `package.json`. If they diverge, update
  both together.
