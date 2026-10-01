---
status: accepted
date: 2026-08-24
decision-makers: doc-detective maintainers
---

# Align the node engines floor with the dependency tree, and guard it with a test

## Context and Problem Statement

[ADR 00166](00166-node-22-engines-floor.md) established `engines.node` as the machine-readable
statement of which Node versions Doc Detective supports. The reasoning was that an install-time
`EBADENGINE` is far better UX than a confusing mid-run failure. It set the floor at `>=22.12.0`,
matching what `@puppeteer/browsers` v3 required at the time.

That declaration is written by hand. The dependency floors backing it move every time a dependency
is bumped, and nothing compared the two. It rotted:

| Dependency | Supports |
|---|---|
| `posthog-node` | `^20.20.0 \|\| >=22.22.0` |
| `@inquirer/prompts` | `>=23.5.0 \|\| ^22.13.0 \|\| ^20.17.0` |
| `@apidevtools/json-schema-ref-parser` | `>=22.19.0` |
| `appium`, `appium-chromium-driver`, `appium-geckodriver`, `appium-safari-driver` | `^20.19.0 \|\| ^22.12.0 \|\| >=24.0.0` |
| `yargs` | `^20.19.0 \|\| ^22.12.0 \|\| >=23` |

A user on Node 22.12–22.21 therefore installed a package whose manifest promised support. They then
got a wall of `EBADENGINE` warnings that the manifest said should not happen. That's the exact
confusion `00166` set out to prevent, arriving through the same channel it chose as the remedy.

This predates and is independent of the dependency sweep in `d4604af5`. That sweep introduced
`@apidevtools/json-schema-ref-parser` v16 (`>=22.19.0`). But `posthog-node`'s `>=22.22.0` was
already the binding constraint, so the effective floor did not move. Only the number of
dependencies disagreeing with the declaration changed.

Two questions follow: what should the range be, and how do we stop it rotting again?

## Decision Drivers

* The declared support contract should be true; a wrong `engines` is worse than a loose one,
  because it converts a clear failure into a contradiction.
* Node 23 is not merely "above the floor". The appium family excludes that line outright
  (`^20.19.0 || ^22.12.0 || >=24.0.0`), so a simple minimum version cannot express the real
  support set.
* The check must be mechanical. The rot happened precisely because keeping the number current was
  a manual step nobody owned.
* CI must keep passing on the Node lines it already tests (22 and 24).

## Considered Options

* **A. Raise `engines.node` to `^22.22.0 || >=24.0.0` and add a test asserting it is a subset of
  every production dependency's range** (chosen).
* **B. Raise `engines.node` to `>=22.22.0`, no test.**
* **C. Hold the dependencies back so `>=22.12.0` stays true.**
* **D. Drop `engines` and document a recommended Node version instead.**

## Decision Outcome

Chosen option: **A**.

`engines.node` becomes `^22.22.0 || >=24.0.0`. That is the widest range every production dependency
actually supports, and it matches the Node lines CI tests. The two-branch form is not cosmetic. A
flat `>=22.22.0` admits Node 23, which the appium family (`^20.19.0 || ^22.12.0 || >=24.0.0`) does
not support, so the excluded line has to be stated.

[test/engines-floor.test.js](../test/engines-floor.test.js) makes the invariant executable. For each
package in `dependencies` and `optionalDependencies` it reads the *installed* copy's `engines.node`
and asserts `semver.subset(declared, dependencyRange)`. Every Node version we admit must be one the
dependency admits. Subset, not a floor comparison, because the Node 23 gap above is invisible to a
minimum-version check.

`semver.subset` is a conservative decision procedure: on some unions of ranges it answers `false`
for a pair that is in fact a subset. `yargs` (`^20.19.0 || ^22.12.0 || >=23`) is one such case.
Probing it version by version shows it accepts every Node release `>=22.22.0`, yet `subset` reports
a violation against that range. The imprecision only ever errs toward "tighten `engines`", never
toward a false pass, which is the safe direction for a guard. It also does not fire against the
range chosen here. Read a failure as "prove this is still compatible", not as proof of breakage.

`devDependencies` are excluded deliberately. They do not reach consumers, and their engines
routinely outrun ours. `@semantic-release/git` currently wants `^22.22.2 || >=24.15`, which says
nothing about what the published package requires.

Scope note: only the root manifest is governed. `docs/package.json` is a private manifest for the
Fern docs site with its own dependency set, and CI installs Fern through `setup-fern-cli` rather
than from that manifest.

### Consequences

* Good: the published support contract is true again, and `EBADENGINE` recovers its meaning.
* Good: the invariant is enforced mechanically, so a future dependency bump that raises a floor
  fails a test instead of silently invalidating the manifest.
* Good: the declared range now matches the CI matrix exactly (Node 22 and 24).
* Bad: users on Node 22.12–22.21 who previously installed with warnings now see `EBADENGINE`
  naming the real floor. This surfaces an incompatibility that already existed rather than
  creating one.
* Neutral: Node 23 is explicitly excluded. It is an odd-numbered line, long past end-of-life, and
  was never tested here.
* Neutral: raising the floor is not a breaking change under semver for this package. `engines` is
  advisory, and without `engine-strict` npm warns rather than fails.

### Confirmation

`package.json` `engines.node` is `^22.22.0 || >=24.0.0`, and
[test/engines-floor.test.js](../test/engines-floor.test.js) fails if it ever admits a Node version a
production dependency does not. Verified red against the previous `>=22.12.0` (it named all eight
disagreeing dependencies) and green after the change. Node 22.23.2 and 24.19.0 both satisfy the new
range. Those are what the CI matrix resolves today.

## Pros and Cons of the Options

### A. `^22.22.0 || >=24.0.0` plus a subset test

* Good: true today, and mechanically kept true.
* Good: expresses the excluded Node 23 line, which a floor cannot.
* Bad: the range is harder to read at a glance than a single floor.

### B. `>=22.22.0`, no test

* Good: one-line change; fixes today's inaccuracy.
* Bad: still wrong for Node 23, which the appium family excludes.
* Bad: no guard, so it rots again on the next bump. That's the failure mode this ADR exists to end.

### C. Hold dependencies back

* Good: preserves the widest install surface.
* Bad: pins the project to old releases, including security fixes, to protect a Node line that is
  itself unsupported by upstream.
* Bad: `posthog-node` already required `>=22.22.0` several releases back; unwinding it means
  reverting unrelated updates.

### D. Drop `engines`, document instead

* Good: no install-time friction.
* Bad: reverses `00166` on the strength of a bookkeeping failure rather than a change of reasoning.
* Bad: returns failures to mid-run, where they are hardest to diagnose.

## More Information

Amends [00166](00166-node-22-engines-floor.md), which remains accepted. This ADR changes the value
of the floor and adds enforcement, not the decision to declare one. Related: `00130` (drop Node 18
from CI), `01048` (PR gate latency, which records the Node 22 + 24 matrix).
