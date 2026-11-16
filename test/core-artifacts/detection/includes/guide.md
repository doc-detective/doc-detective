# Includes: Markdown

Each include below adds a step that sets a variable. The last step checks them all, so the test fails if any include didn't resolve or ran out of order. The partials also hold steps that fail, outside the selected sections, and run only if a selection or the partial-exclusion rule breaks.

<!-- test {"testId": "includes-markdown", "description": "mdBook, MkDocs snippets, and Fern includes, with sections and anchors (ADR 01209)."} -->

{{#include _partials/book.md:setup}}

--8<-- "_partials/snippets.md:install"

<Markdown src="_partials/fern.md" />

<!-- step {"runShell": "node -e \"process.exit(process.env.INC_MD_BOOK === 'book' && process.env.INC_MD_SNIP === 'snip' && process.env.INC_MD_FERN === 'fern' ? 0 : 1)\""} -->

<!-- test end -->
