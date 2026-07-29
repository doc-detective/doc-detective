---
status: accepted
date: 2026-07-29
decision-makers: doc-detective maintainers
---

# Resolve symlinks in the runner entrypoint's "am I the entry module?" guard

## Context and Problem Statement

`bin/runner-entrypoint.js` ends with a guard so the test suite can `import` its helpers without
executing `main()`:

```js
const isEntry = import.meta.url === `file://${process.argv[1]}`;
if (isEntry) { main().then(...).catch(...) }
```

That comparison holds when the file is invoked by its real path (`node bin/runner-entrypoint.js`),
which is how every test and every local invocation ran it. It does **not** hold when the file is
invoked the way it actually ships.

`package.json` registers `doc-detective-runner` as a `bin`, and npm installs `bin` entries as
**symlinks**: `/usr/local/bin/doc-detective-runner` → `../lib/node_modules/doc-detective/bin/runner-entrypoint.js`.
When the container's entrypoint runs `doc-detective-runner`, `process.argv[1]` is the *symlink*
path, while `import.meta.url` is the *realpath* under `node_modules`. The two are never equal, so
`isEntry` is `false`, `main()` is never called, the module merely defines and exports its functions,
and **Node exits 0 having done nothing and printed nothing**.

This shipped. The doc-detective.com platform sets Fly's `init.entrypoint` to
`["doc-detective-runner"]`, so every dispatched run booted a machine that pulled the image, started,
ran for ~4 seconds, and exited cleanly:

```text
INFO Preparing to run: `doc-detective-runner` as root
INFO Main child exited normally with code: 0
```

No `/spec` call, no log lines, no finalize, exit 0. Server-side the run sat at `status='starting'`
with `machine_started_at` NULL (that column is stamped by the `/spec` handler) until watchdog Sweep A
reaped it as `cold_start_exceeded`. The failure was maximally misleading in three directions at once:
Fly reported success, the platform reported a cold-start timeout, and the platform's HTTP logs showed
no request at all — so the natural hypotheses were all about *networking* (deployment protection, DNS,
egress, an unreachable `PUBLIC_APP_URL`), none of which were true. Diagnosing it took an extended
multi-session investigation that also produced [ADR 01045](01045-surface-spec-fetch-failures-in-finalize.md),
whose extra error reporting could never have fired here — the code that would report was never reached.

The bug is invisible to the existing test suite by construction: the tests either `import` the module
(where `isEntry: false` is the *desired* outcome) or call `main()` directly. Nothing exercised the
one path that production uses — spawning the file through a symlink.

## Decision Drivers

* The published `bin` must actually run. This is the only invocation form real users and the platform
  container ever use, and it was the one form with no test coverage.
* The failure mode must not be silent. A guard that evaluates false costs an exit-0 no-op with zero
  diagnostics — strictly worse than a crash.
* The guard must keep working for its original purpose: `import`ing the module from tests must not
  run `main()`.
* Correctness beyond the symlink case: the hand-built `file://${...}` template is also wrong for
  Windows paths (`file://C:\...`) and for any path containing a space, `#`, or `?`.

## Considered Options

* **A. Resolve `process.argv[1]` with `realpathSync` and convert with `pathToFileURL` before
  comparing** (chosen).
* **B. Drop the guard; always call `main()`, and have tests import a separate module.** Would require
  splitting the file into a library module plus a thin bin wrapper (as `bin/doc-detective.js` does,
  which is a one-line `import "../dist/cli.js"` and therefore never had this bug).
* **C. Compare basenames, or check `process.argv[1]` ends with `doc-detective-runner`.** Cheap, but
  matches on a filename rather than an identity — a differently-named symlink or a same-named file
  elsewhere both misbehave.
* **D. Use `require.main === module`.** Not available in ESM; the file is `"type": "module"`.

## Decision Outcome

Chosen option: **A**. The guard now resolves the symlink and builds the URL properly:

```js
const isEntry = (() => {
	const argv1 = process.argv[1];
	if (!argv1) return false;
	try {
		return import.meta.url === pathToFileURL(realpathSync(argv1)).href;
	} catch {
		return false;
	}
})();
```

`realpathSync` collapses the npm bin symlink to the same real path `import.meta.url` reports.
`pathToFileURL` handles drive letters and percent-encoding, fixing the Windows and special-character
cases in the same change. The `try/catch` covers an unresolvable `argv[1]` (deleted file, permission
error) by falling back to "not the entrypoint" — the pre-existing behavior, so the guard can never
throw during module load.

Option B is arguably the more robust structure and matches `bin/doc-detective.js`, but it is a larger
refactor of a file that is otherwise working, and it does not by itself prevent a future guard
elsewhere from repeating the mistake. Option C trades a correctness bug for a subtler one. Option D
is unavailable in ESM.

## Consequences

* **Good** — `doc-detective-runner` executes `main()` when invoked through its installed symlink, so
  platform runs actually start. This unblocks the entire Fly dispatch path.
* **Good** — Windows and special-character paths are handled correctly, a latent bug fixed for free.
* **Good** — the regression is now covered by a test that spawns the file *through a symlink*, the
  exact production shape, closing the coverage gap that let this ship.
* **Neutral** — one added `realpathSync` at startup (a single stat-level syscall).
* **Note** — the diagnostics added in ADR 01045 remain correct and become reachable for the first
  time; that ADR's reasoning is unaffected, its code simply never ran in production before this fix.

## Confirmation

* New `runner-entrypoint: bin entry guard` describe block in `test/runner-entrypoint.test.js` spawns
  the entrypoint via a symlink in a tmpdir with no `DD_*` env, and asserts exit code **1** plus
  `entrypoint crashed` / `DD_API_BASE` in the output. Before the fix this test observed exit **0**
  with completely empty output; after, it passes. A companion test asserts real-path invocation still
  works, and the symlink test skips on Windows hosts that can't create symlinks unprivileged.
* Full `test/runner-entrypoint.test.js` suite green (54 passing, up from 52) with no regressions to
  the import-without-running behavior every other test in the file depends on.
* Manually reproduced before the fix: `node bin/runner-entrypoint.js` logged a fatal and exited 1,
  while `node <symlink-to-it>` produced no output and exited 0 — matching the Fly machine logs
  exactly.

## Pros and Cons of the Options

### A. `realpathSync` + `pathToFileURL` before comparing

* Good: minimal diff; keeps the guard's original purpose intact.
* Good: fixes the Windows/special-character URL construction in the same stroke.
* Neutral: one extra syscall at startup.
* Bad: still an idiom that is easy to get subtly wrong in a future copy-paste — mitigated by the
  comment and the regression test.

### B. Split into library module + thin bin wrapper

* Good: removes the failure mode structurally rather than fixing one instance of it; mirrors
  `bin/doc-detective.js`, which never had the bug precisely because it has no guard.
* Bad: larger refactor with a bigger blast radius on a file that otherwise works; changes the public
  export surface that `test/runner-entrypoint.test.js` imports from.

### C. Basename / suffix match on `process.argv[1]`

* Good: trivially symlink-proof.
* Bad: matches on name rather than identity; a same-named file in another location, or a symlink
  installed under a different name, both give the wrong answer.

### D. `require.main === module`

* Bad: not available in ESM, and the package is `"type": "module"`.
