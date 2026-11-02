---
name: docs-as-spec
description: Build a user-facing feature by writing its internal spec and user-facing page first, marking each checkable sentence as a claim, stopping for human review of the spec, proving each claim with a failing test, having an independent agent try to disprove it, then pinning survivors with manni cite. Use when the user asks for docs-first or spec-driven work, or to pin docs claims. Skip for bug fixes, refactors and dependency bumps.
---

Follow [docs/design/docs-as-spec-process.md](../../../docs/design/docs-as-spec-process.md), which explains why. These are the steps, in order. The rest of [CLAUDE.md](../../../CLAUDE.md) still applies: ADR, fixtures, docs assessment, and red → green.

**Step 4 is a hard stop.** No implementation starts until a person has approved the spec, or pre-approved it.

## 1. Research

Measure anything the spec will assert as a number or a default. Keep probes under `.tmp/`. Record the results in the spec.

Measure the content the feature is for, not whatever page is handy. Sample widely before a number sets a default or rules an option out. Say what you didn't measure.

## 2. Spec

Write these, and nothing that implements them:

- `docs/design/<slug>.md`: the internal spec. Status line, problem, measurements, decisions, deferred work.
- The user-facing page under `docs/fern/pages/docs/`. Consult [docs/content-strategy/](../../../docs/content-strategy/) first, and record the page in the IA map. Write it in plain language: what a reader sees and does. Exact scores, color values, and constants go in the internal spec, even when a test found them. A plain sentence is still a checkable one.
- `adrs/NNNNN-<slug>.md`: decisions and trade-offs, with `status: proposed`. List the claim IDs in *Confirmation*, or link to the table that does.

Put a marker directly above each sentence a reader could check, with a blank line above the marker:

```md
<!-- cite find-image-default-threshold -->
The default threshold is 0.9.
```

MDX uses `{/* cite find-image-default-threshold */}`. IDs are kebab-case and unique per page. Mark defaults, limits, field names, outputs, and failure and skip behavior. Don't mark rationale.

Run this. Every marker should report `marker-orphan`, which is your to-do list:

```bash
npx @hawkeyexl/manni cite check <page>
```

## 3. Map claims to proofs

Add a table to the spec mapping each claim to one proof: a mocha test, a fixture test, or an inline doc test. Name the proof after the claim ID. Rewrite or drop a claim nobody can prove. Group the build into waves whose files don't overlap.

Confirm mechanically that every marker ID appears in the table, and every table ID has a marker.

## 4. Get human review, and stop

A person reviews the spec before any implementation starts. An agent can't clear this gate, whether that's you, a subagent, or another session.

Set the spec's status to `spec in review`. Then end your turn with:

- Links to the spec, the page, and the ADR, and the number of claims.
- The decisions most worth challenging, including every default you chose without being asked.
- What you deferred, and what you couldn't measure.

Until the person answers, don't write product code, schema changes, tests, fixtures, or dependency changes. Spec edits and read-only research are fine.

Approval has to come from that person, explicitly. Either of these counts:

- Approval of this version of the spec.
- A pre-approved go-ahead: the person told you, before or while you wrote the spec, to build without stopping for review. Still send the summary above, so they can object, then carry on.

These don't count:

- Silence, or moving on to another topic.
- Review comments with no approval in them. They mean make the changes and ask again.
- A general request to start the work that says nothing about skipping review.
- Approval of an earlier version, when the claims have changed since.
- A review from a bot, a subagent, or another session.

If they ask for changes, make them and ask again, unless they approved with those changes included.

On approval, set the spec's status to `approved by <name> on <date>`, or `pre-approved by <name> on <date>`, and the ADR's `status` to `accepted`. Commit the spec by itself, so the diff of what was approved stays readable.

## 5. Build

Red → green, one claim at a time. Confirm each test fails for the expected reason before writing the code. For parallel waves, spawn subagents with the spec path and their claim IDs rather than a summary of this conversation.

Commit as you go. `manni cite` resolves sources through `git ls-files`.

Run proofs under a hard limit, such as `timeout -k 5 300 npx mocha ...`. A test runner's own timeout can't fire when the microtask queue is spinning, and the pilot lost 70 minutes that way.

When a step produces an artifact, open it at least once. A passing check can't tell you that a blur missed something.

If building shows that a claim can't hold, stop that claim and go to the person who approved the spec. Don't edit the sentence to match what you built.

## 6. Verify

Spawn a fresh agent. Give it the spec path, the page path, and the code. Don't give it your conclusions. Tell it to assume every claim is false until the code or a real run proves it. Tell it to report per claim: holds, fails, or unprovable, with `file:line` evidence. Tell it that a test's name isn't evidence, and to read each sentence literally the way a user relying on it would. Tell it to report what the page should warn about but doesn't.

Treat its report as leads. Reproduce each finding before acting on it: a failing test for a code fix, a real run for a changed sentence.

For each failure, fix the code. If the spec is what's wrong, propose the changed sentence to the person who approved it, and wait. Propose what a reader should see on the page, in plain language, not a transcript of what the test measured. Never soften a sentence just to make it pass.

## 7. Pin

Only for claims that held. Commit the implementation and proofs first, because manni pins only committed lines. Pin each claim to its implementation and to its proof, using two entries on one marker:

```bash
npx @hawkeyexl/manni cite add <page>:<line> <impl-file>:<lines> --id <claim-id> --marker
```

```bash
npx @hawkeyexl/manni cite add <page>:<line> <proof-file>:<lines> --id <claim-id>-proof --marker
```

`--marker` adopts a placeholder marker that's already there, and the second command joins it. With no marker yet, the first command adds a line, so the sentence moves down one for the second. This needs manni 4.28.0 or later. When a sentence also states a limit, add a proof of the limit to the same marker, such as `<claim-id>-limit-proof`.

Cite the narrowest lines that decide the claim. A wide range goes stale on every nearby edit.

Check that every claim has both entries. `cite add` without `--marker` can clear `marker-orphan` without pinning the sentence, so "no orphans" doesn't prove a claim is pinned.

## 8. Ship

This must pass before the PR:

```bash
npx @hawkeyexl/manni cite check
```

Say in the PR who approved the spec, which claims were pinned, what the verifier found, and what changed as a result. A PR is a second human review of the code. It doesn't replace the review in step 4.

## When a pin goes stale

- `source-moved`: run `manni cite update`. The lines are intact.
- `source-changed`: reread the sentence against the new lines. If it still holds, run `manni cite update --accept --only <id>`. If it doesn't, the code or the sentence must change.
- `claim-changed`: someone edited the sentence. Recheck it against the source, then accept it.

Re-pinning without rereading defeats the point. A change to what an approved claim promises needs that claim's owner to review it, the same as the original spec.
