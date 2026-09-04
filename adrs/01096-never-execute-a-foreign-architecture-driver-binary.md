---
status: accepted
date: 2026-09-04
decision-makers: doc-detective maintainers
---

# Never execute a foreign-architecture driver binary

## Context and Problem Statement

The `build-linux (ubuntu-24.04-arm, linux/arm64, arm64)` leg of the "Docker build" workflow failed on
every run — on `main`, and on pull requests carrying nothing but a docs diff. Its `linux/amd64` twin
passed on the same commits, so the failure was architecture-specific rather than change-specific.

[ADR 01053](01053-best-effort-browser-asset-install.md) already made *installing* browser assets
best-effort, and the log confirms that half works: `[browser] chromedriver — skipped (...)` and the
`RUN doc-detective install all --yes` layer completes. The build then failed later, in the container
smoke test (`src/container/test/runTests.test.cjs`), with:

```
(WARNING) Excluding chrome from available browsers: its chromedriver driver is present but did not
validate (chromedriver exited with code 2: …/chromedriver: 1: ELF: not found
…/chromedriver: 5: Syntax error: Unterminated quoted string)
ENOENT: no such file or directory, stat '/app/<binary garbage>'
Child process closed with code 1
```

The second line is the one that mattered, and it is not a cosmetic artifact of the first. Tracing it
(reproduced end-to-end in a Linux container) gives this chain:

1. Google's Chrome for Testing publishes no native `linux-arm64` chromedriver, and
   `@puppeteer/browsers` maps `BrowserPlatform.LINUX_ARM` to the **x64** asset. A native arm64 host
   therefore has an x86-64 ELF sitting at
   `…/chromedriver/linux_arm-<version>/chromedriver-linux64/chromedriver`.
2. `verifyDriverBinary` runs it via `execFile`. `execve` returns **ENOEXEC** — and glibc's `execvp`,
   which libuv (and therefore Node's `spawn`) goes through, responds to ENOEXEC by **retrying the
   file through `/bin/sh`**.
3. `/bin/sh` then interprets 21 MB of binary as a shell script, **in the caller's working
   directory** (`/app`, the mounted input tree). It reports `ELF: not found` for the first "word" and
   dies on a syntax error at line 5 — but not before any byte sequence that happens to parse as a
   redirection has already **created a file**, whose name is raw binary and therefore not valid
   UTF-8.
4. `qualifyFiles` (`src/core/detectTests.ts`) then scans the input directory. `fs.readdirSync`
   decodes that name lossily into U+FFFD replacement characters, so the re-resolved path no longer
   matches anything on disk, and the **unguarded** `fs.statSync` throws `ENOENT`. The throw escapes
   to the CLI's top-level catch, which prints the message and exits 1 — before a single spec is
   parsed.

So a platform gap in an upstream vendor's binary distribution was turning into arbitrary shell
interpretation of an untrusted 21 MB file inside the user's project directory, and any debris it left
behind was fatal to the run. Two questions follow: how should driver verification handle a binary
this host cannot execute, and how should the multi-arch image's smoke test treat a platform where no
browser is available at all?

## Decision Drivers

* Executing a foreign-architecture binary is not a contained failure. The ENOEXEC → `/bin/sh`
  fallback is a property of glibc, not of our code, and it hands the file's contents to a shell with
  the user's cwd and privileges. "Run it and report the error" is not a safe verification strategy.
* The runtime already degrades correctly once a browser is known to be unavailable — ADR 01008's
  cross-engine fallback and the runner's context gating skip the affected contexts with a diagnostic.
  What was missing was getting *to* that state without collateral damage.
* A single unreadable neighbor in the input directory must never cost the whole run. `readdir`
  listing an entry has never guaranteed it can be `stat`ed (dangling symlinks, permissions holes,
  files removed mid-scan); this bug is one instance of a class.
* The arm64 image genuinely cannot run Chrome today. The smoke test has to tolerate that without
  becoming a gate that passes on an image which runs nothing at all.
* Uncertainty must degrade to today's behavior. A header check that guesses wrong in the *strict*
  direction would refuse a working driver, which is worse than the bug it fixes.

## Considered Options

* **A. Refuse to execute a provably foreign image, plus scratch-cwd hardening, plus a guarded input
  scan** (chosen).
* **B. Guard the input scan only** — catch the `statSync`, leave the driver probe alone.
* **C. Hard-code "no chrome on linux/arm64"** in the runtime or in `linux.Dockerfile`, so the asset is
  never installed or considered on that platform.
* **D. Run the driver probe through an explicit interpreter guard** — e.g. `spawn` with `shell:
  false` and a pre-`access(X_OK)` check.

## Decision Outcome

Chosen option: **A**, in three parts.

1. **`foreignExecutableImageReason(header, {platform, arch})`** (`src/runtime/browsers.ts`) — a pure
   function that reads an executable's first bytes and returns a reason string *only* when it can
   prove the image cannot run on this host. `verifyDriverBinary` reads the first 64 bytes and, on a
   verdict, returns `{ ok: false, error }` **without ever spawning a child process**. It is
   deliberately narrow:
   * Linux/ELF only. macOS runs x86-64 binaries on arm64 through Rosetta 2 and Windows on ARM
     emulates x64, so a mismatch there proves nothing.
   * Only architectures with an unambiguous `e_machine` mapping produce a verdict.
   * A non-ELF image, a truncated header, an unreadable file, or an unmapped architecture yields no
     verdict, and the pre-existing execute-and-report path still runs.
2. **`driverExecOptions`** pins the driver probe's `cwd` to the OS temp directory. This is defense in
   depth for the ENOEXEC cases the header check cannot predict (a well-formed but truncated image, a
   missing dynamic loader): if a shell does end up interpreting the binary, its redirections land in
   a scratch directory instead of the user's input tree. A `--version` probe has no
   working-directory dependency, so relocating it is invisible.
3. **`qualifyFiles`'s directory scan guards its `fs.statSync`**, logging at debug level and skipping
   the entry. One unreadable neighbor costs that entry, not the run.

For the smoke test, the arm64 image keeps attempting Chrome and lets the **runner's existing
availability-driven gating** skip the browser-backed specs (they land as `SKIPPED` with a diagnostic
naming the engine). The gate itself moves from `assert.equal(summary.specs.fail, 0)` to
`assertRunOutcome` (`src/container/test/runOutcome.cjs`): **no failed specs *and* at least one spec
actually passed**. On arm64 the shell / HTTP / link-checking specs still run for real, so the second
half holds — while an image broken badly enough to run nothing no longer slips through on
`fail === 0` alone.

B was rejected as a fix: it converts a crash into a warning while leaving a shell interpreting an
untrusted binary in the user's project on every arm64 run — the debris was the symptom, not the
disease. (Its content is kept, as part 3, for the general class of unreadable entries.) C encodes in
our tree a fact that belongs upstream: the day Google ships a `linux-arm64` chromedriver, a
hard-coded exclusion becomes a silent capability regression, and it would not protect the many other
ways a driver can be unrunnable. D does not work — the fallback lives in glibc's `execvp`, below
Node's `shell` option, and `access(X_OK)` returns success for a foreign-architecture file that is
mode `+x`.

### Consequences

* Good: the arm64 Docker build's smoke test completes. Browser specs SKIP with a diagnostic; shell
  and HTTP specs pass; the image is published instead of being blocked by a platform gap.
* Good: an unrunnable driver is now reported as what it is — "the binary targets x86-64 but this host
  is linux/arm64 (AArch64)" — instead of a page of shell parse errors quoting binary.
* Good: doc-detective no longer lets a shell interpret an untrusted downloaded binary inside the
  user's working directory. That was reachable by any user on a platform whose driver asset doesn't
  match their architecture, not only in CI.
* Good: a corrupt, vanished, or undecodable entry in an input directory no longer aborts detection.
* Bad (accepted): the header check is a heuristic over `e_machine`. A binary that passes it can still
  fail to execute (missing loader, truncated body, wrong libc), so it narrows the ENOEXEC window
  rather than closing it — which is why the scratch-cwd hardening and the guarded scan are part of
  the same decision rather than alternatives to it.
* Bad (accepted): the smoke test no longer proves that browser specs ran on *every* arch. It proves
  no spec failed and at least one passed. Chrome coverage on linux/amd64 (and the fixture bundles)
  remains the place browser behavior is actually gated.
* Neutral: `geckodriver` also fails to install in this image on **both** architectures
  (`Refusing to execute '/opt/doc-detective/browsers'` — the cache probe falls back to the cache
  directory itself when the extracted binary isn't found at the expected name). That is a separate,
  pre-existing defect; `linux/amd64` is green with it, so it is tracked separately rather than folded
  in here.

### Confirmation

* **Red→green unit tests.** `test/runtime-browsers.test.js`: `foreignExecutableImageReason` flags an
  x86-64 ELF on `linux/arm64`, accepts a matching image, and stays silent for non-ELF images, off
  Linux, and for unmapped architectures; `verifyDriverBinary` refuses a foreign image **and the
  injected `exec` is asserted never to have been called**; an unreadable header falls open to the
  spawn path. `driverExecOptions` pins `cwd` to the temp dir.
* **Red→green regression test for the crash.** `test/detecttests-qualify-coverage.test.js` creates a
  directory entry whose raw name is not valid UTF-8 alongside a valid spec. Before the fix this
  reproduced the exact CI failure — `ENOENT: no such file or directory, stat
  '…/���-side-effect'` thrown from `qualifyFiles` — and after it, detection returns
  the valid spec. POSIX-only (a Windows filename is UTF-16 by construction, so the failure cannot be
  built there); verified red then green by running the file under `node:22-slim`.
* **Gate rule unit test.** `test/container-run-outcome.test.js` covers `assertRunOutcome`: accepts an
  arm64-shaped run (some passed, browser specs skipped), rejects any failure, rejects an all-skipped
  run, rejects a missing summary.
* **End-to-end.** The published Linux image, with the built `dist` mounted over it and its
  chromedriver's ELF `e_machine` patched to an unhandled value to force ENOEXEC: the driver is
  refused by the header check, `/app` gains no shell-created entries, and the run completes with
  browser specs skipped instead of crashing.
* **CI.** The `build-linux (ubuntu-24.04-arm, linux/arm64, arm64)` leg of the "Docker build" workflow
  passes, with `build-linux (ubuntu-latest, linux/amd64, amd64)` unchanged as the control. This is
  only observable on the pull request because
  [ADR 01097](01097-build-pull-request-images-from-the-branch.md) lands alongside it: the image
  otherwise installs `doc-detective@latest` from npm, so a PR build would exercise the published
  runtime and stay red until this fix was released.

No Doc Detective feature fixture accompanies this change: it adds no user-facing knob (no step type,
action option, config/CLI flag, engine, or output format), and its trigger — a driver binary built
for another CPU architecture — cannot be authored in a spec. The container smoke test *is* the
end-to-end fixture for this behavior, and it now runs on both architectures.

## Pros and Cons of the Options

### A. Refuse a provably foreign image + scratch cwd + guarded scan

* Good: removes the cause (shell interpretation of an untrusted binary), not just the visible
  symptom.
* Good: fails open on every uncertain input, so it cannot refuse a driver that would have worked.
* Good: benefits every user on a mismatched platform, not only the Docker build.
* Bad: three coordinated changes rather than a one-line catch; the header check is a heuristic and
  needs a new `e_machine` entry if Node ever reports an architecture not in the table (which, failing
  open, degrades to today's behavior rather than breaking).

### B. Guard the input scan only

* Good: one line, fixes the observed crash.
* Bad: leaves a shell interpreting a 21 MB untrusted binary in the user's project on every affected
  run, and leaves the debris behind — it just stops complaining about it.

### C. Hard-code "no chrome on linux/arm64"

* Good: trivially makes the arm64 build green.
* Bad: encodes an upstream vendor's current matrix as our permanent behavior, becoming a silent
  capability regression the day it changes; and it addresses exactly one of the many ways a driver
  binary can be unrunnable.

### D. Interpreter guard around the probe

* Good: would be the most general fix if it worked.
* Bad: it doesn't. The retry lives in glibc's `execvp`, beneath Node's `shell` option, and an
  `access(X_OK)` check passes for a mode-`+x` foreign-architecture file.
