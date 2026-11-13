---
status: accepted
date: 2026-11-10
decision-makers: doc-detective maintainers
---

# Hosted runs turn automatic capture off

Amends [ADR 00163](00163-doc-detective-platform-runner-entrypoint.md) and
[ADR 01177](01177-capture-screenshots-and-recordings-by-default.md).

## Context and Problem Statement

ADR 01177 turned `autoScreenshot` and `autoRecord` on by default. A local or CI run then leaves a screenshot after
every step and a video of every context.

Online, the hosted service, runs the CLI through `bin/runner-entrypoint.js`. Its tests drive customer pages. With
the new default, every hosted run would capture those pages and store the images and video on the platform. The
customer never asked for that.

What should a hosted run capture when nothing asks for it?

## Decision Drivers

- A hosted run doesn't store images or video of a customer's pages unless the customer asks.
- A spec or test that asks for capture still gets it.
- One place sets the hosted defaults, beside the other platform overrides.

## Considered Options

- **A. The entrypoint sets both keys to `false` at the config level.**
- **B. Keep the CLI default in hosted runs.**
- **C. Online sets them in the config snapshot it sends.**

## Decision Outcome

Chosen option: **A**.

`buildEffectiveConfig` sets `autoScreenshot: false` and `autoRecord: false`, beside `outputDir`, `output`, and
`exitOnFail`. It overrides any value in the repository's config or the snapshot.

| Where the key is set | Hosted run |
|---|---|
| Nowhere | No automatic capture |
| Repository config or snapshot, any value | No automatic capture |
| A spec or test, `true` | Captures, since core resolves `test ?? spec ?? config` |
| A spec or test, `false` | No automatic capture |

Authored `screenshot` and `record` steps are unaffected.

### Consequences

- Good: hosted runs store no customer images or video unless a spec or test asks.
- Good: hosted runs skip the recording preflight and the image-package install when nothing asks for capture.
- Bad: a repository config's `autoScreenshot: true` doesn't apply in hosted runs. The spec or test level does.
- Neutral: local and CI runs keep the ADR 01177 defaults.

### Confirmation

`test/runner-entrypoint.test.js`: `buildEffectiveConfig` sets both keys to `false` when the snapshot leaves them
unset, and when it sets them to `true`.

## Pros and Cons of the Options

### A. The entrypoint sets both keys to `false`

- Good: one line per key, beside the existing platform overrides.
- Good: a spec or test can still opt in.
- Bad: the repository config can't opt a whole hosted project in.

### B. Keep the CLI default

- Good: hosted and local runs match.
- Bad: every hosted run stores images and video of customer pages.

### C. Online sets them in the snapshot

- Good: the platform owns its policy.
- Bad: the snapshot carries the project's own settings, so a project could turn capture back on.
- Bad: the policy would live in two repositories, and an older Online build would skip it.
