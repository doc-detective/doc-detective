# Includes: a missing file

A missing include warns and leaves the directive in place. The page's own steps still run.

<!-- test {"testId": "includes-missing", "description": "A missing include warns and doesn't fail the page (ADR 01210)."} -->

{{#include _partials/does-not-exist.md}}

<!-- step {"runShell": "node -e \"process.exit(0)\""} -->

<!-- test end -->
