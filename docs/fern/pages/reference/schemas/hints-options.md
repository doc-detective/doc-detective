---
title: "Hints options"
---

Options for the post-run hints feature. After a test run, Doc Detective may print one short, contextual hint with code samples and links to encourage further engagement. Hints are shown only on a TTY and only at the default `info` log level.

## Referenced In

- [config](/reference/schemas/config)

## Fields

Field | Type | Description | Default
:-- | :-- | :-- | :--
enabled | boolean | Required. If `true`, Doc Detective may print one applicable hint after a test run. Disable from the CLI with `--no-hints`. | `true`

## Examples

```json
{
  "enabled": true
}
```

```json
{
  "enabled": false
}
```
