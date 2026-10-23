---
title: Verification pins in Markdown
---

# Install

<!-- meta sha256-e9827e2fe23730da33b30b89bd5e5c2a24704b0ded97a1d95f5269910f1cd4b8 {"verified-by":[{"tool":"doc-detective","check":"md-list"}]} -->
1. Run `npm i doc-detective`.
2. Run `npx doc-detective --help`.

<!-- meta sha256-dd3f66a24b7536683140e30b29ac9df8808b67b26454658a506702b7ae44f9bc {"verified-by":[{"tool":"doc-detective","check":"md-inline"}]} --> A sentence that shares the statement's line.

<!-- cite stacked-entry -->
<!-- meta sha256-0069466e5722edf66ee630eaeb5e42bb313b3006eca03ddb7f87bc9579237a96 {"verified-by":[{"tool":"doc-detective","check":"md-stacked"}]} -->
A paragraph under a stacked cite marker,
wrapped over two lines.

<!-- meta sha256-cd9c34aa8a96451b08a314d84b7b5868c72cedd185a7e09e1946388ad4bd3c87 {"verified-by":[{"tool":"doc-detective","check":"md-fence"}]} -->
```bash
npx doc-detective --input docs
```

[comment]: # (meta sha256-93a47d0c13a73b34d5577d9a6c48111428664ed09a231d54ba2455088ec78298 {"verified-by":[{"tool":"doc-detective","check":"md-link-form"}]})
A paragraph under the link-reference form.

<!-- meta sha256-5350d592a43d19c623c40e1d6512f49877e8ddd9c6b673a42f1ff48af6d52743 {"verified-by":[{"tool":"doc-detective","check":"md-heading"}]} -->
## Run it

Body text the heading statement does not pin.

A span such as `<!-- meta {"verified-by":[{"tool":"doc-detective","check":"md-list"}]} -->` is code, and nothing reads it.
