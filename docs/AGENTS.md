# Instructions for AI agents

This repository contains files to generate a [Fern Docs](https://buildwithfern.com) website to document the tool `doc-detective` tool. Doc Detective is a documentation testing framework.

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
- You can find a test example at `fern/pages/docs/get-started/installation/sample.spec.json`.

- **DO:** When you change documentation related to a feature, review the corresponding `.spec.json` file to see if the test needs to be updated.

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
