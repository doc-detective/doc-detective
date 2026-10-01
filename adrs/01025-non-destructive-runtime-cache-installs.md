---
status: accepted
date: 2026-07-05
decision-makers: doc-detective maintainers
---

# Record runtime-cache packages as dependencies so JIT installs stop pruning siblings

## Context and Problem Statement

Heavy runtime dependencies are installed lazily into `<cacheDir>/runtime`. Those are webdriverio,
appium plus drivers, sharp, ffmpeg, node-pty, and more. They install through
`npm install --prefix <runtimeDir> --no-save <pkg>@<range>` against a runtime `package.json` that
declared **no dependencies** (`--no-save` meant npm never wrote any).

npm's arborist computes an install's ideal tree from `package.json` plus the CLI-requested adds.
With a dependency-less manifest, **every already-installed sibling is extraneous, and reify deletes
it**. Every single-package JIT install silently destroyed the rest of the cache. Reproduced
bidirectionally with real npm: installing appium + the NovaWindows driver wiped
`@homebridge/node-pty-prebuilt-multiarch`; installing node-pty wiped appium and the driver. The
trigger is package-dependent. Small script-less pairs like pngjs/pixelmatch happened to survive,
which is why the bug went unnoticed. The packages that matter here reliably prune.

Consequences observed in the wild:

* **[Issue #501](https://github.com/doc-detective/doc-detective/issues/501)**, the frozen Windows
  CI jobs. The app-surface preflight's mid-run driver install pruned node-pty's files out from under
  the already-loaded module. The next `pty.spawn` then froze the process synchronously and forever;
  see [ADR 01024](01024-watchdog-conpty-allocation-behind-worker-timeout.md) for the mechanism.
* Silent capability loss. In a fresh process the pruned dep fails to resolve. It either JIT
  reinstalls, which churns because each reinstall prunes the *other* siblings and thrashes
  indefinitely, or the feature lands SKIPPED. One observed case: a mixed app plus `tty` run whose `tty` step skipped with
  "node-pty is not installed" moments after node-pty had been verified present).
* Inexplicable half-states: caches whose Appium extension manifest listed a driver whose package
  directory was gone.

## Decision Drivers

* Installs into the runtime cache must be **additive**. Installing one capability must never
  remove another.
* Existing user caches (dependency-less manifests, packages accumulated from batch installs) must
  be protected from the *first* post-upgrade install, not only from later ones.
* Some packages permanently fail to install on a platform, such as the best-effort PTY backend on an
  exotic arch. Such a package must **not** get wedged into the manifest, where its failure would
  break every subsequent install.
* Keep the shim's own `package.json` and lockfile untouched, the reason `--no-save` was chosen
  originally. The fix must confine itself to the cache directory.

## Considered Options

1. **Maintain the runtime `package.json#dependencies` ourselves**: before each install, record
   every managed package physically present in the cache; after a successful install, record the
   new arrivals. Keep `--no-save`.
2. Drop `--no-save` and let npm write `dependencies`.
3. Pass `--install-strategy` / prune-suppressing flags. No such npm flag disables extraneous-prune
   during reify.
4. One npm invocation per *complete* desired set (reinstall everything every time). Correct but
   multiplies install time and network use by the cache size.

## Decision Outcome

Chosen option: **1, self-maintained `dependencies`**, through `recordRuntimeDependencies` in
[src/runtime/loader.ts](../src/runtime/loader.ts). It's called before the npm spawn, which protects
existing siblings from *this* reify. It's called again after success, which protects the new
arrivals from the *next* one.

Rules:

* Candidate names = `installed.json`'s package list ∪ the manifest's current `dependencies`. Both
  are doc-detective-managed sets, so hoisted transitives are never promoted to direct dependencies.
* **Only names physically on disk are recorded**, meaning `node_modules/<name>/package.json` exists.
  A failed or pruned install is never resurrected into future ideal trees. That's what keeps a
  permanently-failing best-effort dep from poisoning every later install. It also self-corrects
  pre-fix caches whose `installed.json` is out of sync with disk.
* Ranges come from the shim's declared constraint (`getDeclaredVersion`). For legacy entries the
  current shim no longer declares, it falls back to the previously recorded range, then to
  `^installedVersion`.
* Recording is best-effort: a failure to write the manifest must never break the install itself
  (worst case is one pre-fix-style install).

Option 2 was rejected because npm only records the packages *it* installs. The first post-upgrade
install against an existing dependency-less cache would still prune everything accumulated before
it. A seeding pass is needed regardless, at which point self-maintenance with `--no-save` is one
code path instead of two writers of the same file.

### Consequences

* Good: JIT installs are additive; the #501 prune chain is severed at the root. Verified with real
  npm: with dependencies recorded, the exact install that pruned before (node-pty) preserves its
  siblings.
* Good: existing caches are seeded on their first post-upgrade install; nothing is resurrected that
  is not physically present.
* Neutral: the runtime `package.json` now carries a `dependencies` map (it is documented as
  auto-managed; users were already told not to edit it).
* Neutral: npm now also *keeps recorded siblings up to date* during unrelated installs, and may
  fetch metadata for them. Installs already hit the network by definition.

### Confirmation

* [test/runtime-loader.test.js](../test/runtime-loader.test.js): sequential installs preserve both
  packages' entries. A pre-fix cache, where the package is present on disk and in `installed.json`
  but absent from `dependencies`, is seeded with a `^installedVersion` fallback range. A recorded-but-pruned package
  is **not** resurrected.
* Real-npm verification (documented in #501): control reproduces the prune with the actual
  packages; the same sequence with recorded dependencies preserves siblings.
* End-to-end,
  [test/core-artifacts/apps/app-then-tty.spec.json](../test/core-artifacts/apps/app-then-tty.spec.json)
  runs the driver-install → `tty` interleaving in one process. It runs on every apps-group CI leg.

## Pros and Cons of the Options

### Option 1: self-maintained dependencies (chosen)

* Good: one writer of the manifest; deterministic; covers pre-fix caches via seeding.
* Good: the on-disk-presence rule doubles as garbage-collection of stale records.
* Bad: a second place besides `installed.json` mirrors "what is installed". Deriving one from the
  other on every install keeps them consistent.

### Option 2: let npm `--save`

* Good: least code.
* Bad: it does not protect pre-existing unrecorded packages, so it still needs a seeding pass. It
  also gives two writers of the manifest, and npm rewrites formatting and ordering on its own
  schedule.

### Option 3: a prune-disabling npm flag

* Fatal: does not exist.

### Option 4: always install the full set

* Good: trivially correct.
* Bad: turns every JIT install into a full-cache reinstall (minutes, gigabytes); punishes exactly
  the first-run experience the JIT path exists to protect.
