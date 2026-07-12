# Instructions for AI agents

This repository contains files to generate a [Fern Docs](https://buildwithfern.com) website to document the tool `doc-detective` tool. Doc Detective is a documentation testing framework.

## Content strategy (read first)

Before drafting or restructuring any page, consult the content strategy in [content-strategy/](content-strategy/) — the audiences, personas, Critical User Journeys (CUJs), and information architecture that govern this site. The site is **organized by user intent (persona + journey), not by document type**. Identify the persona and CUJ a page serves, sequence the content by that journey, deep-link into the Reference shelf rather than duplicating it, and record any new page in [content-strategy/information-architecture.md](content-strategy/information-architecture.md). See [content-strategy/README.md](content-strategy/README.md) for the full workflow.

## Repository layout

- `README.md` explains the repository, and provides onboarding instructions for working with the documentation.
- `.vale.ini` configures the Vale style linter.
- `.vale/styles` contains rules for the Vale style linter.
- `fern/fern.config.json` sets basic options for the Fern CLI.
- `fern/docs.yml` configures the Fern Docs site, including navigation and metadata.
- `fern/pages` contains documentation content.
- `fern/snippets` contains reusable Markdown snippets.
- `fern/assets` contains documentation-related files, such as images, that can be re-used or that need to be centralized.
- `fern/components` contains standalone React components for Fern Docs pages.

## Development setup

- Install dependencies with `npm install`.
- Start a local docs preview server with `fern docs dev`. The site will be available at `http://localhost:3000`.

## Testing documentation

This project uses Doc Detective to test its own documentation.

- Run documentation tests with `npm run doc-detective`.
- Tests are defined in `*.spec.json` files. These files contain a series of steps that Doc Detective executes against the live documentation site to ensure it's accurate.
- You can find a test example at `fern/pages/docs/get-started/sample.spec.json`.

- **DO:** When you change documentation related to a feature, review the corresponding `.spec.json` file to see if the test needs to be updated.

### Test servers

Two Doc Detective configs live at the docs root:

- `.doc-detective.json` — used in CI ([`.github/workflows/test-docs.yml`](../.github/workflows/test-docs.yml)). Its `beforeAny`/`afterAll` start and stop only the static fixture server (`test/server/start.js`, port `8092`), which the inline tests on the action reference pages target.
- `.doc-detective.preview.json` — for local runs. It layers a second background process on top of the static server that starts the **Fern docs preview server** (`fern docs dev --legacy`, port `3000`), so you can write and run tests against the rendered docs site itself. Run with:

  ```bash
  npx doc-detective --config docs/.doc-detective.preview.json
  ```

The setup/teardown specs are in `test-setup/`. The docs preview uses the `--legacy` server because the default preview bundle can take several minutes to build and is prone to a `pnpm` patch error on some platforms; the legacy server starts in seconds. This second server is intentionally **not** wired into the CI config so `test-docs.yml` stays fast and network-independent.

## Documentation pages

- Documentation pages are MDX (`.mdx`) files in subdirectories of `fern/pages`.
- Navigation settings are in `fern.docs.yml`.
- Documentation pages support [Fern frontmatter](https://buildwithfern.com/learn/docs/configuration/page-level-settings.md).
- Documentation pages support [Fern Docs MDX components](`https://buildwithfern.com/learn/docs/writing-content/components/overview.md`).

**DO:**
  - Use frontmatter titles instead of level 1 Markdown headings (`#`) to maintain consistency with Fern Docs conventions
  - Use frontmatter descriptions
  - Use short frontmatter sidebar titles if the main title is long
  - Use Fern Docs MDX components when they improve the reader experience
  - Use the context7 MCP server (if available) to learn about Fern Docs when writing documentation pages
**DO NOT:**
  - Use level 1 Markdown headings `#`
  - Use the `.md` file extension.

### Custom React components

No custom React components at this time.

### Content style

- Documentation must follow the [Google Developer Style Guide](https://developers.google.com/style).
- The Vale linter implements these style rules.

### User-impact lens (applies to every docs change, including bot-authored PRs)

Filter every addition through: **what does the user need to know, and does it solve their pain
point?** Do not document functionality merely because it exists — the code is the record of *what
it does*. Only document things with direct user impact: something users configure, run, rely on,
or get burned by.

- When a PR (especially a Promptless one) adds a paragraph, ask whether a real user hits it.
- Cut or soften narrow edge cases and internal-mechanics detail; keep the practical "here's what
  you set and what happens."
- Prefer trimming over documenting a corner case. Rare edge cases tied to internal mechanics — or
  to unmerged behavior — are noise.

This aligns with the persona/CUJ organization in [content-strategy/](content-strategy/): pages
serve journeys, not an exhaustive mirror of the code surface.

Style guide key principles:

> Tone and content
> 
> - Be conversational and friendly without being frivolous.
> - Don't pre-announce anything in documentation.
> - Use descriptive link text.
> - Write accessibly.
> - Write for a global audience.
> 
> Language and grammar
> 
> - Use second person: "you" rather than "we."
> - Use active voice: make clear who's performing the action.
> - Use standard American spelling and punctuation.
> - Put conditions before instructions, not after.
> - For usage and spelling of specific words, see the word list.
> 
> Formatting, punctuation, and organization
> 
> - Use sentence case for document titles and section headings.
> - Use numbered lists for sequences.
> - Use bulleted lists for most other lists.
> - Use description lists for pairs of related pieces of data.
> - Use serial commas.
> - Put code-related text in code font.
> - Put UI elements in bold.
> - Use unambiguous date formatting.
> 
> Images
> 
> - Provide alt text.
> - Provide high-resolution or vector images when practical.
