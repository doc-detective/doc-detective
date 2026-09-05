---
status: accepted
date: 2026-09-05
decision-makers: [hawkeyexl]
---

# Keep bot chatter out of the automated review prompt

## Context and Problem Statement

The `review` check is the "Claude PR Review - Auto" workflow, in
[.github/workflows/claude-pr-review.yml](../.github/workflows/claude-pr-review.yml). It failed on
every run of one pull request, while passing on others. On PR #713 it failed 16 times out of 16.
PR #714 and PR #715 passed, in an overlapping window, with the same workflow and the same model.
That rules out a bad model id, an expired `CLAUDE_CODE_OAUTH_TOKEN`, and quota.

Each failing run reports the same result record, identical to the millisecond:

```json
{"type":"result","subtype":"success","is_error":true,"duration_ms":81,
 "num_turns":1,"total_cost_usd":0,"modelUsage":{}}
```

Zero cost and an empty `modelUsage` mean no model call happened. The action then surfaces
`##[error]Claude result reported subtype success with is_error:true`, which GitHub renders as
"Claude encountered an error after 0s" with no diagnostic at all.

The failing run's log prints the assembled prompt between `===== FINAL PROMPT =====` and its
closing rule. Measuring that span from the log gives 166,450 characters, attributed by comment
author:

| Source | Share | Characters |
|---|---|---|
| `github-actions`, reviewdog's Vale batches | 62% | 103,549 |
| `coderabbitai` | 27% | 45,397 |
| `claude`, the action's own failure comments | 7% | 11,713 |
| Metadata, PR body, and the review instructions | 2% | 3,893 |
| `hawkeyexl`, the human author | 1% | 1,899 |

So 96% of what the action sent was automated commentary, and 1% was the human. The diff is not in
the prompt at all. `<formatted_context>` carries counts rather than content, including the line
`Changed Files: 100 files`.

Two properties of that composition matter. The volume is one. The other is that `claude` appears in
its own input. Every failure posts "Claude encountered an error after 0s" as a PR comment, and tag
mode reads PR comments. So each failure enlarges the next run's prompt, and the check degrades as
it fails.

## Decision Drivers

* A review gate that reads 96% automated chatter is not reviewing the change under review.
* The failure is silent. "Claude encountered an error after 0s" names no cause. That is why
  [docs/maintenance/release-operations.md](../docs/maintenance/release-operations.md) recorded it as
  a flake to ignore. It was dismissed repeatedly before anyone read the result record.
* A self-reinforcing failure has to be broken at the loop, not waited out.
* The size correlation with pull-request size is real but indirect. A large PR attracts more
  automated review output. The comment volume is the direct cause, so that is what to fix.
* Agent-authored pull requests still need reviewing. Whatever filters context must not also stop
  those PRs from triggering a review.

## Considered Options

* **A. Exclude high-volume bot actors from comment context** with the action's
  `exclude_comments_by_actor` input (chosen).
* **B. Drop `track_progress`.** Tag mode is what pulls GitHub context in, so turning it off removes
  the comments along with the tracking comment.
* **C. Allowlist instead of blocklist**, with `include_comments_by_actor` naming humans.
* **D. Leave it, and clean up bot comments by hand** when a PR's review check starts failing.

## Decision Outcome

Chosen option: **A**. The workflow sets:

```yaml
exclude_comments_by_actor: 'github-actions[bot],coderabbitai[bot],claude[bot]'
```

That removes the three sources measured above, which is 96% of the prompt, and leaves human review
comments, the PR body, and the instructions. It uses a documented input rather than working around
the action, and it keeps `track_progress` and its tracking comment.

`claude[bot]` is listed for a different reason than the other two. It is small at 7%. But it is the
term that makes the failure compound, so excluding it converts a degrading check into a stable one.

**`exclude_comments_by_actor` filters comment context. `allowed_bots` governs who may trigger a
review.** They are separate inputs, and `allowed_bots` keeps `claude[bot]` so agent-authored
branches are still reviewed. Conflating them would silently stop reviewing most of this
repository's pull requests.

Option **B** works but is blunt: it discards human review comments and the tracking comment along
with the noise. Option **C** fails open in the wrong direction. A new bot is added to a repo far
more often than a new human, and an allowlist silently drops a new contributor's comments.
Option **D** is manual work that recurs on every busy PR, and it does not break the loop.

### Consequences

* Good: the prompt drops to roughly 4% of its previous size on the measured PR. What remains is
  the change under review plus human commentary.
* Good: the failure no longer compounds, because the action stops reading its own errors.
* Good: no change to which pull requests get reviewed.
* Bad, and accepted: a review comment left by a bot is now invisible to the reviewer. CodeRabbit
  findings in particular will not be visible as prior context, so the two reviewers may repeat each
  other. That is preferable to a review that cannot run.
* Bad, and accepted: this reduces the input rather than bounding it. A pull request with enough
  human review comments could still assemble a large prompt. No threshold is introduced here
  because none is known: the logs show the rejection is instant and local, but not what limit it
  enforces. See Confirmation.
* Neutral: the workflow keeps `--model claude-sonnet-4-6`. It was suspected during triage, then
  cleared, since the same string succeeds on smaller pull requests.

### Confirmation

* **Red→green test.** [test/claude-review-workflow.test.js](../test/claude-review-workflow.test.js)
  asserts `exclude_comments_by_actor` is set and names each measured bot. It asserts `claude[bot]`
  separately as the loop-breaker, and asserts that `allowed_bots` and `track_progress` are
  unchanged. Against the previous workflow two of the four fail. Against this one all four pass.
* **The measurement is reproducible from CI.** Pull a failing job's log, take the span between
  `===== FINAL PROMPT =====` and the closing rule, and attribute lines to the most recent
  `[... at <timestamp>]:` header. The table above was produced that way, from job run
  33936870483 on this repository.
* **A natural experiment ran while this was open, and it supports the diagnosis.** All 200 of
  reviewdog's inline comments on PR #713 were deleted, by reviewdog itself, once Vale went clean.
  The prompt did not shrink at all. The next failing run assembled a larger one, of 194,827
  characters, still dominated by `github-actions`. That run failed the same way, and recorded no
  model usage. The reason is that reviewdog's bulk is not in its inline comments. It is in the
  review summaries it posts when it has more findings than it can attach. Those are headed
  "Remaining comments which cannot be posted as a review comment to avoid GitHub Rate Limit". Pruning inline comments never touches those. So deleting comments by hand does not
  fix this, which is the concrete reason option **D** fails.
* **Post-merge.** The `review` check passes on a pull request carrying a large automated-comment
  history. The definitive case is a rerun on PR #713 itself, which is the PR that produced the
  measurement.
* **What is not claimed.** The exact rejection is not identified. An identical `duration_ms: 81`
  across runs, with no usage recorded, indicates a synchronous give-up rather than an API refusal,
  which would vary in timing. This decision therefore removes the input that demonstrably
  correlates with the failure rather than asserting a specific limit. If the check fails again with
  a much smaller prompt, that is a new mode and this reasoning does not cover it.

## Pros and Cons of the Options

### A. Exclude high-volume bot actors (CHOSEN)

* Good: targets the measured 96%, using a documented input.
* Good: breaks the compounding loop.
* Good: keeps tag mode, the tracking comment, and human comments.
* Bad: a blocklist needs an edit when a new noisy bot is added to the repository.

### B. Drop `track_progress`

* Good: one deleted line, and the context goes away.
* Bad: it also removes human review comments and the tracking comment, so it pays for the fix with
  review quality.

### C. Allowlist humans with `include_comments_by_actor`

* Good: new bots are excluded without an edit.
* Bad: it fails in the worse direction. A new human contributor's comments are dropped silently,
  and the list needs an edit far more often than a blocklist does.

### D. Clean up bot comments by hand

* Good: no configuration change.
* Bad: it does not work. Deleting reviewdog's 200 inline comments on PR #713 left the prompt
  larger than before. The bulk sits in review summaries, which pruning never touches.
* Bad: it recurs on every busy pull request, it is destructive to a shared PR's history, and it
  leaves the compounding loop in place.
