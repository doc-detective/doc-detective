---
status: accepted
date: 2026-11-05
decision-makers: doc-detective maintainers
---

# Raise the Node floor to 24.15 in 5.0

Supersedes [ADR 00166](00166-node-22-engines-floor.md).

## Context and Problem Statement

Doc Detective declares `^22.22.0 || >=24.0.0`. Node 22 reaches end of life on April 30, 2027, about three
months after the planned 5.0.0 GA on January 12, 2027. Raising the floor is a breaking change, so leaving
it out of 5.0 means a second major almost immediately. [ADR 01146](01146-cli-v5-contract.md) wants users
to absorb one migration, not a series. Which floor should 5.0 declare?

## Decision Drivers

- Users should migrate once, and the next forced major should be as far away as is practical.
- The floor must cover a line that users, and GitHub-hosted runners, can actually get.
- The floor must not need to rise during v5 because of a dependency bump.
- CI should already cover the floor. It runs the full OS grid and all fixtures on Node 24.

## Considered Options

- **A. `>=24.15.0`, with Node 26 tested.**
- **B. `>=24.0.0`.**
- **C. `>=26.0.0`.**
- **D. Keep Node 22, and raise the floor in its own major in April 2027.**

## Decision Outcome

Chosen option: **A**. `engines.node` is `>=24.15.0`, the main test grid stays on Node 24, and two Ubuntu
cells run Node 26 in place of the old Node 22 cells. The next forced major is around April 30, 2028, when
Node 24 reaches end of life.

Container images, CI, and tooling move to Node 24. As in ADR 00166, there's no runtime version gate, so
an older Node gets npm's `EBADENGINE` warning at install rather than a refusal.

The Node 26 cells use `continue-on-error`. The `coverage-merge` job has `needs: test`, so a failing cell
would otherwise suppress a required check. Make them blocking once they've been green through an RC.

### Consequences

- Good: no second major three months after GA, and 15 months until the next forced one.
- Good: `appium-uiautomator2-driver` 9, `appium-xcuitest-driver` 13, and the semantic-release plugins
  already need 24.15, so bumping them won't move the floor.
- Bad: users on Node 22 must move Node as part of this migration.
- Bad: GitHub-hosted runners default to Node 22. The Action has to run the CLI on the runner's own Node 24,
  and workflows that install the CLI themselves need `setup-node`.
- Bad: the release job moves from npm 10 to npm 11, and it has a history of lockfile corruption. See
  [release operations](../docs/maintenance/release-operations.md).
- Bad: the `main` ruleset requires the `node 22` test checks, so it has to change just before the GA merge.

### Confirmation

- `test/engines-floor.test.js` asserts the floor, and that every production dependency admits it.
- `test/npm-test-workflow.test.js` asserts the placeholder job reports the required `node 24` contexts.
- After an RC's `chore(release)` commit, `npm ci` passes on Linux and Windows.

## Pros and Cons of the Options

### A. `>=24.15.0`, with Node 26 tested

- Good: covers the supported line hosted runners already cache, and nothing needs to move during v5.
- Bad: forces a major in April 2028.

### B. `>=24.0.0`

- Good: admits a few more patch versions.
- Bad: a driver bump that needs 24.15 would raise the floor during v5, which is itself a breaking change.

### C. `>=26.0.0`

- Good: moves the next forced major to April 2029.
- Bad: excludes Node 24 while it's still supported, until April 2028.
- Bad: hosted runners only cache Node 22 and 24, so the Action would download Node 26 on every run.
- Bad: CI has never run on it, and it will have been LTS for about 11 weeks at GA.

### D. Raise the floor in its own major

- Good: a smaller 5.0, and later majors cost less once Action majors pin CLI majors.
- Bad: two migrations in about three months.
