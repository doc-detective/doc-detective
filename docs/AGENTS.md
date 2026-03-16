# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## What This Repository Is

This is the documentation site for [Doc Detective](https://doc-detective.com), a documentation testing framework. The site is built with [Fern](https://buildwithfern.com) and published at `docs.doc-detective.com`.

This is a **separate project** from the main `doc-detective` package (in `../`). It focuses on documentation content only.

## Commands

```bash
npm install          # Install dependencies (also installs mdx2vast and doc-detective globally)
npm start            # Start local dev server at http://localhost:3000
npm run test         # Run Doc Detective tests on the docs themselves
```

## Architecture

### Framework: Fern

Fern is the docs platform. Configuration lives in:
- `fern/docs.yml` — site structure, navigation tabs, branding, layout (primary config file)
- `fern.config.json` — Fern organization and version (`doc-detective`, `4.15.1`)

### Content Structure

All page content lives in `fern/pages/`, organized by navigation tab:

| Tab | Path | Purpose |
|-----|------|---------|
| Home | `fern/pages/index.mdx` | Landing page |
| Documentation | `fern/pages/docs/` | Main docs (get-started, config, tests, input-formats, actions, selectors, contribute) |
| Tutorials | `fern/pages/tutorials/` | Step-by-step tutorials |
| Reference | `fern/pages/reference/` | Glossary and schema reference pages |
| Support | `fern/pages/support.mdx` | Support page |

Pages use `.mdx` (MDX) format. The navigation tree is defined in `fern/docs.yml` — adding a new page requires both creating the file and adding it to `docs.yml`.

### Doc Detective Self-Testing

The docs use Doc Detective to test their own content. Test specs are `.spec.json` files placed alongside the page content they test. Run `npm run test` to execute them via the globally installed `doc-detective` CLI.

### Schema Reference Pages

The `fern/pages/reference/schemas/` directory contains generated or maintained schema documentation corresponding to Doc Detective's JSON schemas.

## Key Constraints

- Node `^22.12.0 || ^24.11.1` and npm are required (see `package.json` engines).
- The `postinstall` script globally installs `mdx2vast` and `doc-detective@latest`. `mdx2vast` is required for the Vale docs linter to work. `doc-detective` is required for `npm run test` to work.
- Navigation is defined in `fern/docs.yml`. New pages must be registered there to appear in the site.
