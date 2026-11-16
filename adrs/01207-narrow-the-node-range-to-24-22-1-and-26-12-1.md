---
status: accepted
date: 2026-11-15
decision-makers: doc-detective maintainers
---

# Narrow the Node range to `^24.22.1 || >=26.12.1`

Amends [ADR 01148](01148-node-24-15-engines-floor.md), which remains accepted. This ADR changes the
value of `engines.node`. The reasoning for a Node 24 floor, and the subset guard from
[ADR 01095](01095-align-the-node-engines-floor-with-the-dependency-tree.md), stand.

## Context and Problem Statement

Doc Detective declares `>=24.15.0`. Two production dependencies have since published releases whose
own `engines.node` is narrower than that:

| Dependency | Supports |
|---|---|
| `webdriverio` 10.2.0, and the `@wdio/*` 10.2.0 packages | `>=22.23.4 <23 \|\| >=24.22.1 <25 \|\| >=26.12.1` |
| `@inquirer/prompts` 8.8.0 | `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` |

`webdriverio` is an `optionalDependencies` entry, and npm treats an engine mismatch on an optional
dependency as a failed install. On Node 24.15 through 24.22.0, `npm ci` skips `webdriverio` 10.2.0
without an error. `@inquirer/prompts` 8.8.0 drops Node 25, which `>=24.15.0` admits.
`test/engines-floor.test.js` fails on both.

ADR 01148 wanted a floor that wouldn't rise during v5 because of a dependency bump. That held for the
bumps it anticipated, and these two weren't among them. Do we hold both dependencies back, or move
the range?

## Decision Drivers

- The declared range must be true. Every Node version it admits must be one every production
  dependency admits (ADR 01095).
- The browser stack should take upstream fixes. `webdriverio` drives every browser and app surface.
- The range must cover versions users and GitHub-hosted runners can get. `setup-node` with
  `node-version: 24` resolves to the newest 24.x.
- A wrong `engines` is worse than a narrow one (ADR 01095). Bringing the declaration back in line
  with the dependency tree is a correction.

## Considered Options

- **A. `^24.22.1 || >=26.12.1`, and take both updates.**
- **B. Keep `>=24.15.0`, and hold `webdriverio` at 10.1.0 and `@inquirer/prompts` at 8.7.x.**
- **C. `^24.22.1 || >=26.0.0`, and take only `@inquirer/prompts`.**

## Decision Outcome

Chosen option: **A**. `engines.node` is `^24.22.1 || >=26.12.1` in `doc-detective` and
`doc-detective-common`. `webdriverio` moves to 10.2.0 and `@inquirer/prompts` to `^8.8.0`.

The range drops three bands that `>=24.15.0` admitted:

- Node 24.15.0 through 24.22.0.
- All of Node 25.
- Node 26.0.0 through 26.12.0.

As in ADR 01148, there's no runtime version gate. A Node version
outside the range gets npm's `EBADENGINE` warning at install rather than a refusal.

This ships as a `fix`, not a breaking change. That's a maintainer decision, and it amends ADR 01148's
statement that raising the floor is breaking. A change to `engines.node` that follows the production
dependencies' own ranges corrects the declaration, and it releases as a patch.

### Consequences

- Good: the declaration is true again, and the subset guard passes without holding anything back.
- Good: `webdriverio` and `@inquirer/prompts` take upstream releases again.
- Good: CI, the container images, and `setup-node` with `node-version: 24` already run versions in
  the range.
- Bad: the supported range narrows in a patch release, which ADR 01148 set out to avoid. Users on the
  dropped bands must update Node. Both floors are patch releases from October 2026, so the range
  admits only recent patch versions.
- Bad: on a dropped band, npm skips `webdriverio` during `npm ci` in a source checkout, with only an
  `EBADENGINE` warning to explain it.
- Bad: the `upgradeNodeVersion` hint checks the major version only. It doesn't fire on Node 25, or on
  an old 24.x or 26.x patch. Those rely on npm's warning.
- Neutral: Node 25 reached end of life in June 2026, so dropping it costs little.

### Confirmation

- `test/engines-floor.test.js` asserts the range's floor, the excluded bands, and that every
  production dependency admits the range.
- A fresh `npm ci` installs `webdriverio` on Node 24.22.3 and Node 26 in Linux containers.

## Pros and Cons of the Options

### A. `^24.22.1 || >=26.12.1`, and take both updates

- Good: one true range, and no held-back dependencies.
- Bad: the supported range narrows inside v5.

### B. Keep `>=24.15.0`, and hold both dependencies back

- Good: the range doesn't move, as ADR 01148 intended.
- Bad: the browser stack stops taking `webdriverio` fixes until the next major.
- Bad: every later release of either dependency needs the same hold.

### C. `^24.22.1 || >=26.0.0`, and take only `@inquirer/prompts`

- Bad: it isn't a true range. `webdriverio` 10.2.0 excludes Node 26.0.0 through 26.12.0, so it would
  stay held at 10.1.0 anyway.
