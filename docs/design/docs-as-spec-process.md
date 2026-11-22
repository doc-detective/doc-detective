# Design: docs as the spec

Status: **pilot** (2026-11-01). The first pilot is
[visual-element-matching.md](visual-element-matching.md). The procedure lives in the
[`docs-as-spec` skill](../../.claude/skills/docs-as-spec/SKILL.md). Adopt it for a change by following
the skill. Nothing requires it yet.

## Problem

[CLAUDE.md](../../CLAUDE.md) already makes a behavior change ship with an ADR, fixtures, and a docs
assessment. Three gaps remain:

- **Nothing ties a sentence to the code that makes it true.** `docs/design/` holds 79 plain line-range
  links such as `config.ts:749-801`. Each is an unpinned citation that goes stale without anyone
  noticing.
- **Docs follow code.** A page written after the build describes what was built, so it can't catch a
  build that missed what was intended.
- **Long agent sessions degrade.** Decisions made early compete with everything that came later.
  [GSD Core](https://github.com/open-gsd/gsd-core) calls this context rot, and answers it with
  fresh-context subagents working from files.

## The unit of work is a claim

A claim is a sentence, in an internal spec or a user-facing page, that a reader could check. It gets a
kebab-case ID when it's drafted, and that ID threads through everything downstream:

| Where | How the ID appears |
|---|---|
| The sentence | A marker above it: `<!-- cite find-image-default-threshold -->`, or `{/* cite … */}` in MDX |
| The proof | The test's name, or a fixture's test `id` |
| The pin | The entry `id` in `<page>.citations.yaml` |
| The run | `verified-by.check` in a `meta` statement, where a Doc Detective test proves the page |

A claim's state comes from the tools, so there's no ledger to keep:

| State | What shows it |
|---|---|
| Drafted | `manni cite check` reports `marker-orphan`, exit 1 |
| Approved | The spec's status line names the person who approved it |
| Proved | Its test passes |
| Verified | The independent verifier's report lists it as holding |
| Pinned | `manni cite check` reports it `current` |
| Drifted | `manni cite check` reports `source-changed`, exit 1 |

## The loop

1. **Research.** Measure what the spec will assert. Defaults come from measurements, not intuition.
2. **Spec.** Write the internal spec and the user-facing page before any code. Mark each checkable
   sentence. Record decisions in an ADR.
3. **Map.** Map every claim to one proof. Group the work into waves that don't touch the same files.
   A claim with no possible proof gets rewritten or dropped.
4. **Human review.** A person reviews the spec, and work stops until they approve it. No agent can clear
   this gate.
5. **Build.** Red → green per claim, using subagents that get the spec and their claims rather than
   the conversation.
6. **Verify.** A fresh agent that didn't write the code tries to disprove each claim. A mismatch means
   fixing the code, or going back to the person who approved the spec. It never means softening the
   sentence to fit.
7. **Pin.** Claims that survive get pinned to the implementation and to the proof.
8. **Ship.** A normal PR, with no orphan markers left.
9. **Drift.** A later PR that changes a cited line fails, and the annotation names the sentence.

## What a pin does and doesn't prove

These results come from running manni 4.27.2 in a throwaway repository:

| What changed | Result | Exit |
|---|---|---|
| Marker with no pin yet | `marker-orphan` | 1 |
| `meta` statement added above the marker | still `current` | 0 |
| Comment added above the cited code | `source-moved` warning, fixed by `cite update` | 0 |
| Cited code changed | `source-changed` | 1 |
| Test assertion weakened, code untouched | `source-changed` | 1 |
| Pinned sentence edited to a false value | `claim-changed` warning | 0 |
| New false sentence pinned to an unrelated line | `current` | 0 |

The last two rows set the design:

- **A pin isn't proof.** It records that someone checked, and raises a flag when the checked lines
  change. It can't tell whether the sentence was true. So Verify is independent, and it comes first.
- **Prose edits must gate too.** [manni.config.yaml](../../manni.config.yaml) sets `claim-changed` to
  `error`, because the default warning lets a pinned sentence change without a recheck.

The fifth row is why every claim pins both ends. A pin on the code alone wouldn't notice a test being
weakened until the claim it proves.

## Decisions

1. **A person approves the spec before anything is built.** The spec is what everything downstream is
   checked against, so a wrong spec produces a build that passes verification and is still wrong. It's
   also the cheapest point to change direction. Approval has to be explicit, but it can come in advance. A
   person can pre-approve a spec by saying to build without stopping for review. Silence never counts. The
   spec's status line records who approved it and how. A later change to what an approved claim promises
   goes back to that person.
2. **Reuse the existing homes.** ADRs hold decisions, `docs/design/` holds specs, and fixtures hold
   proofs. There's no `.planning/` directory and no `STATE.md`, because the tools already report state.
3. **Capture GSD rather than install it.** Installing it adds about 64 agent files and 230 workflow
   entries, a parallel artifact tree that overlaps the homes above, and no pinning step. The parts worth
   having are fresh-context subagents, a plan check, non-overlapping waves, an adversarial verifier, and
   a bypass for small work. A `SKILL.md` carries those.
4. **Don't pin ADRs.** An ADR records a decision at a point in time, so a later change would raise an
   alarm on something never meant to stay current. Pin the spec, and let the ADR's *Confirmation*
   section name the claim IDs.
5. **Pin only where drift hurts someone.** That means defaults, limits, field names, skip and failure
   behavior, and outputs. Rationale isn't checkable. Generated reference pages already follow their
   schemas through a CI drift check, so pinning them adds nothing.
6. **Keep red doc tests off `main`.** The fixture gate allows only PASS or SKIPPED. A draft page whose
   inline test can't pass yet therefore stays on its feature branch until the feature lands.
7. **Gate citations only for now.** The gate runs `manni cite check` rather than `manni check`, so
   adopting this doesn't also adopt metadata validation across the docs.

## When to skip the loop

Bug fixes, dependency bumps, refactors, and one-line changes don't need it. The test is whether the
change adds a sentence a user or a future maintainer would rely on. If it doesn't, the existing rules
in [CLAUDE.md](../../CLAUDE.md) are enough.

## What the pilot taught

The pilot was [finding elements by image](visual-element-matching.md), with 40 claims.

**The loop was worth its cost, and verification was the step that earned it.** All 63 proof tests and the
real-browser fixture passed before verification. A fresh agent then reported 12 of the 40 claims as failing, in 37
minutes and about 370,000 tokens. Every failure reproduced. They included four actions discarding the reason a
match failed, `all` leaving copies of a logo unblurred, and failure advice that could produce a false pass. The
author's proofs test what the author thought of, and that's the gap this step exists to close.

**Review changed the design before any code existed.** The approver rejected shape-only matching in a comment on
one sentence. That reversal cost a spec revision and some measurements, not a rewrite.

**A finding isn't page copy.** The first changed sentences carried test results onto the page, with hex values and RGB
distances, and the approver sent them back. The page now says what a reader sees and does. The spec keeps a table of
what each plain phrase means exactly, so the claims stay checkable. Verification also added four warnings, for 44 claims.

**Look at real output.** A passing fixture hid the `all` bug until someone looked at the blurred screenshot. A step
that produces an artifact needs its artifact opened at least once.

**Pinning is cheap at pin time.** 30 claims took about 10 minutes with a throwaway script that found each range by
pattern rather than by line number. Since manni 4.28.0, `cite add` adopts a placeholder marker, so nothing has to be deleted first.

**One round of verification may not be enough.** A second independent check, run on the first round's fixes, found 5 of 20 claims
failing and 3 warnings missing. Three of those were code bugs. Run another round after a round that changes the code.

**What verification costs falls on the spec's sentences.** Most of the 12 failures needed a code fix, but 7 were
sentences that said more than the code does. Examples include "every", "any", and "the best score wins". Sentences that can be tested
literally are what make the check useful, and they're also what makes it find so much.

## Open questions

The pilot ran on one branch over one day, so it couldn't answer these:

- How much friction do pins add on busy files over time? `src/core/tests.ts` is 6,592 lines with 43 commits in the
  last 90 days, and every moved line means a sidecar rewrite.
- Do sidecar rewrites conflict across concurrent PRs?
