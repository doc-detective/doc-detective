---
status: accepted
date: 2026-08-05
decision-makers: [hawkeyexl]
---

# Flatten the npm script graph so `npm run build` survives cmd.exe's PATH limit

## Context and Problem Statement

On a Windows development machine, `npm run build` failed while `npm run build:common` — a strict
subset of the same work — succeeded. The npm summary blamed the `clean` step in `src/common`, which
suggested a file lock on `dist/`, but running that script standalone always worked. The real error
was buried under npm's lifecycle output:

```
> doc-detective-common@4.37.3 clean
> node -e "require('fs').rmSync('dist', {recursive: true, force: true})"

'node' is not recognized as an internal or external command,
operable program or batch file.
```

`node` was on `PATH` — `where node` from the same shell resolved it. The cause is depth. Every
nested `npm run` prepends its own `node_modules/.bin` entries plus a `node-gyp-bin` path to `PATH`,
and npm never de-duplicates them. Measured on the affected machine:

| npm nesting depth | `PATH` length |
|---|---|
| 0 (shell) | 3,931 |
| 1 | 4,864 |
| 2 | 5,856 |
| 3 | 6,848 |
| 4 | 7,840 |
| 5 | ~8,832 |

cmd.exe truncates the environment block past **8,191** characters, and the tail of `PATH` — where
the Node install sits — is the first casualty. `npm run build` nested five levels
(`build` → `build:common` → common `build` → `compile` → `clean`), overflowing; `npm run build:common`
nested four and stayed just under. That is exactly the observed split.

This is environment-sensitive rather than universal: the baseline `PATH` on this machine is already
3.9 KB (an nvm install carrying five Node versions, plus several tool `bin` directories). CI runners
have short paths and never hit it, so the failure looks like a local anomaly while actually being a
latent fragility in the repo's script graph.

## Decision Drivers

* `npm run build` is the documented entry point in `CLAUDE.md` and `src/common/AGENTS.md`; a
  contributor hitting this loses time on a misleading error.
* The failure mode is silent about its real cause — npm reports the wrong culprit.
* The fix must not change what the build does, only how many processes it takes to get there.
* Whatever headroom we buy has to survive future contributors adding a script layer.

## Considered Options

* **A. Flatten the chain by inlining steps into the composite scripts, and enforce a depth ceiling
  with a test** (chosen).
* **B. Shorten `PATH` on the affected machine.**
* **C. Replace the script chain with a single Node build script.**
* **D. Leave it; document the `npm run build:common && npm run compile && npm run copy:schemas`
  workaround.**

## Decision Outcome

Chosen option: **A**.

`src/common`'s `build` and `compile` now run their steps directly instead of shelling out to
`npm run`, which takes the deepest chain from five levels to three (~6.9 KB, about 1.3 KB of
headroom). The named `clean`, `dereferenceSchemas`, `generate:types` and `compile` scripts remain
for standalone use — they are referenced throughout `src/common/AGENTS.md` — so nothing a
contributor might type disappears.

Inlining duplicates command strings between a composite and its standalone alias, which is exactly
the kind of duplication that drifts silently. [test/build-scripts.test.js](../test/build-scripts.test.js)
closes that: it asserts each composite contains its alias's command **verbatim**, so editing one
without the other fails the suite. The same test walks the script call graph across both
`package.json` files and fails any chain deeper than three `npm run` levels, which is what stops a
future contributor from reintroducing the bug.

**B** fixes one machine and nothing else. **C** is the tidiest end state and worth revisiting if the
build grows, but it trades a declarative, greppable script list for a program that itself needs
maintaining and testing — too much for a fix whose entire content is "spawn fewer processes".
**D** leaves a documented entry point broken.

### Consequences

* Good, because `npm run build` works from a shell with a large `PATH`, and the repo has headroom
  for a longer one.
* Good, because the depth ceiling is now an enforced invariant rather than an accident.
* Bad, because the composite scripts duplicate their aliases' command strings. Mitigated by the
  sync test, which fails loudly on drift.
* Neutral, because the build's behavior, ordering, and outputs are unchanged — this is purely a
  reduction in nested npm processes. It also runs marginally faster, since each avoided level is a
  full npm startup.

### Confirmation

[test/build-scripts.test.js](../test/build-scripts.test.js) fails against the pre-fix `package.json`
files (reporting `root:build (5 levels)` and `root:build:common (4 levels)`) and passes against the
flattened ones. `npm run build` exits 0 on the machine that reproduced the failure, where it
previously failed every time.

## Pros and Cons of the Options

### A. Flatten the chain, enforce a depth ceiling

* Good, because it removes the cause rather than the symptom, for every contributor.
* Good, because the ceiling is machine-checked, so the fix can't silently rot.
* Bad, because of the duplication it introduces (covered by the sync test).

### B. Shorten `PATH` on the affected machine

* Good, because it is a zero-diff fix.
* Bad, because it fixes one workstation and leaves the repo one script layer away from breaking
  again for someone else.

### C. Single Node build script

* Good, because it eliminates nesting entirely and has no duplication.
* Bad, because it replaces a legible list of steps with code that needs its own maintenance, for a
  build that is currently five sequential commands.

### D. Document a workaround

* Good, because it costs nothing now.
* Bad, because the documented entry point stays broken and the error message points at the wrong
  step, so the next person re-debugs it from scratch.
