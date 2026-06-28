---
status: accepted
date: 2024-05-03
decision-makers: doc-detective maintainers
---

# Markup multi-regex capture groups with `$n` substitution and full-step `$ref` actions

## Context and Problem Statement

Auto-detection turns documentation markup into test steps by matching `fileType.markup`
regexes. The early engine matched one action per markup rule and only carried bare action
names, so a single line could not yield multiple steps and a matched URL or selector could
not be threaded into the generated step. How should markup detection extract structured
data from a line (e.g. the href and link text of a Markdown link) and map it onto a fully
specified step, rather than just naming an action?

## Decision Drivers

* A single documentation line can imply more than one testable action.
* Matched substrings (URLs, link text, selectors) must flow into the generated step's fields.
* Markup authors need to specify the whole step shape, not only an action name.
* The detection contract must stay schema-validated (markup `actions` is part of the config schema).

## Considered Options

* **A. Rewrite detection around `matchAll` multi-regex with a built-in `actionMap` and `$n`
  capture-group substitution, and let markup `actions` accept a bare action name OR a full
  step-definition `$ref`** (chosen).
* **B. Keep single-match detection and add a separate post-processing pass to expand actions.**
* **C. Require authors to hand-write tests instead of inferring from markup.**

## Decision Outcome

Chosen option: **A**, because capture-group substitution is the natural way to thread matched
text into a step, and `matchAll` lets one rule emit several steps. The detect engine was
rewritten to iterate matches with `matchAll`, resolve each against a built-in `actionMap`, and
substitute `$n` placeholders with the corresponding capture group; the schema was widened so a
markup `actions` entry can be a bare action name OR a full step-definition `$ref`
(core `3dc533`; common `a07d6da`, `0a5b4e8`, `0cea515`, Seq 119).

This was refined shortly after: full-step `$ref` shapes were re-introduced in markup `actions`,
`navigationLink` regexes mapped to `goTo`, `hyperlink` mapped to `checkLink` only, and default
actions were dropped from `emphasis`/`codeInline`/`codeBlock` (common `209e5b77`, Seq 121).

The net contract: markup rules match with `matchAll`, capture groups substitute into step
fields via `$n`, and an action entry is either a bare name or a full `$ref` step definition.

### Consequences

* Good: one markup line can generate multiple, fully populated steps.
* Good: matched URLs/text/selectors flow directly into generated step fields.
* Good: authors can specify complete step shapes in markup config.
* Bad: `$n` substitution adds a templating layer detection must parse and validate.
* Neutral: this v1/v2-era detection is later re-baselined in the resolver and v3 inline statements.

### Confirmation

Shipped across core `3dc533` and common `a07d6da`/`0a5b4e8`/`0cea515` (capture-group engine),
then common `209e5b77` (full-step `$ref` re-land). Markup `actions` shape is part of the
config/fileType schema; generated steps validate against the step schemas.

## Pros and Cons of the Options

### A. matchAll + actionMap + `$n` + `$ref` actions
* Good: multi-step per line; structured substitution; full step control.
* Bad: templating/substitution complexity in the detector.

### B. Single-match + post-processing expansion
* Good: smaller change to the matcher.
* Bad: two passes; substitution still unsolved.

### C. Hand-written tests only
* Good: no detection complexity.
* Bad: defeats the auto-detection value proposition.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commit `3dc533`,
doc-detective-common commits `a07d6da`, `0a5b4e8`, `0cea515`, `209e5b77`. Inventory ref:
BACKFILL-INVENTORY.md Seq 119, 121. Related: `00064` (markup-driven auto-detection),
`00076` (detectSteps opt-in), later resolver/v3 inline-statement ADRs.
