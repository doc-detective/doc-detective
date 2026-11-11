---
status: accepted
date: 2026-09-04
decision-makers: doc-detective maintainers
---

# Never execute a foreign-architecture driver binary

## Context and Problem Statement

The `build-linux (ubuntu-24.04-arm, linux/arm64, arm64)` leg of the "Docker build" workflow failed on
every run, both on `main` and on pull requests carrying nothing but a docs diff. Its `linux/amd64` twin
passed on the same commits, so the failure was architecture-specific rather than change-specific.

[ADR 01053](01053-best-effort-browser-asset-install.md) already made *installing* browser assets
best-effort, and the log confirms that half works. It reports chromedriver as skipped, and the
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
2. `verifyDriverBinary` runs it via `execFile`, and `execve` returns **ENOEXEC**. That reaches
   glibc's `execvp`, which libuv (and therefore Node's `spawn`) goes through, and it responds to
   ENOEXEC by **retrying the file through `/bin/sh`**.
3. `/bin/sh` then interprets 21 MB of binary as a shell script, **in the caller's working
   directory** (`/app`, the mounted input tree). It reports `ELF: not found` for the first "word",
   then dies at line 5 on a syntax error. Before dying it runs any byte sequence that happens to
   parse as a redirection, which **creates a file**. That file's name is raw binary, so it is not
   valid UTF-8 text.
4. `qualifyFiles` (`src/core/detectTests.ts`) then scans the input directory. `fs.readdirSync`
   decodes that name lossily into U+FFFD replacement characters. The re-resolved path no longer
   matches anything on disk, so the **unguarded** `fs.statSync` throws `ENOENT`. The throw escapes
   to the CLI's top-level catch, which prints the message and exits 1, before a single spec is
   parsed.

So a platform gap in an upstream vendor's binary distribution was turning into arbitrary shell
interpretation of an untrusted 21 MB file. That happened inside the user's project directory, and
any debris the shell left behind was fatal to the run. Two questions follow. How should driver
verification handle a binary this host cannot execute? And how should the multi-arch image's smoke
test treat a platform where no browser is available at all?

## Decision Drivers

* Executing a foreign-architecture binary is not a contained failure. The ENOEXEC → `/bin/sh`
  fallback is a property of glibc, not of our code. It hands the file's contents to a shell with
  the user's cwd and privileges. "Run it and report the error" is not a safe verification strategy.
* The runtime already degrades correctly once a browser is known to be unavailable. ADR 01008's
  cross-engine fallback and the runner's context gating skip the affected contexts with a diagnostic.
  What was missing was getting *to* that state without collateral damage.
* A single unreadable neighbor in the input directory must never cost the whole run. `readdir`
  listing an entry has never guaranteed it can be `stat`ed (dangling symlinks, permissions holes,
  files removed mid-scan). This bug is one instance of a class.
* The arm64 image genuinely cannot run Chrome today. The smoke test has to tolerate that without
  becoming a gate that passes on an image which runs nothing at all.
* Uncertainty must degrade to today's behavior. A header check that guesses wrong in the *strict*
  direction would refuse a working driver, which is worse than the bug it fixes.

## Considered Options

* **A. Refuse to execute a provably foreign image, plus scratch-cwd hardening, plus a guarded input
  scan** (chosen).
* **B. Guard the input scan only.** Catch the `statSync`, and leave the driver probe alone.
* **C. Hard-code "no chrome on linux/arm64"** in the runtime or in `linux.Dockerfile`, so the asset is
  never installed or considered on that platform.
* **D. Run the driver probe through an explicit interpreter guard**, for example `spawn` with
  `shell: false` and a pre-`access(X_OK)` check.

## Decision Outcome

Chosen option: **A**, in three parts.

1. **`foreignExecutableImageReason(header, {platform, arch})`** (`src/runtime/browsers.ts`) is a
   pure function. It reads an executable's first bytes and returns a reason string *only* when it
   can prove the image cannot run on this host. `verifyDriverBinary` reads the first 64 bytes and, on a
   verdict, returns `{ ok: false, error }` **without ever spawning a child process**. It is
   deliberately narrow:
   * Linux/ELF only. macOS runs x86-64 binaries on arm64 through Rosetta 2 and Windows on ARM
     emulates x64, so a mismatch there proves nothing.
   * A verdict needs the *host* architecture to be in the `e_machine` table. When it isn't, there is
     nothing to compare against and the helper stays silent. An unmapped value in the *binary's*
     `e_machine` is the opposite case. The host is known, so the mismatch is proven, and the image
     is refused under a generic `ELF machine 0x…` label.
   * Several inputs yield no verdict at all. Those are a non-ELF image, a truncated header, or a
     header whose `EI_DATA` declares no valid byte order. An unreadable file and an unmapped host
     architecture do the same. In each case the pre-existing execute-and-report path still runs.
2. **`driverExecOptions`** pins the driver probe's `cwd` to the OS temp directory. This is defense in
   depth for the ENOEXEC cases the header check cannot predict. Those include a well-formed but
   truncated image, and a missing dynamic loader. If a shell does end up interpreting the binary,
   its redirections land in a scratch directory instead of the user's input tree. A `--version` probe has no
   working-directory dependency, so relocating it is invisible.
3. **`qualifyFiles`'s directory scan guards its `fs.statSync`**, logging at debug level and skipping
   the entry. One unreadable neighbor costs that entry, not the run.

For the smoke test, the arm64 image keeps attempting Chrome. The **runner's existing
availability-driven gating** then skips the browser-backed specs, which land as `SKIPPED` with a
diagnostic naming the engine. The gate itself moves from `assert.equal(summary.specs.fail, 0)` to
`assertRunOutcome` (`src/container/test/runOutcome.cjs`): **no failed specs *and* at least one spec
actually passed**. On arm64 the shell, HTTP, and link-checking specs still run for real, so the
second half holds. An image broken badly enough to run nothing no longer slips through on
`fail === 0` alone.

B was rejected as a fix. It converts a crash into a warning, while leaving a shell interpreting an
untrusted binary in the user's project on every arm64 run. The debris was the symptom, not the
disease. (Its content is kept, as part 3, for the general class of unreadable entries.) C encodes in
our tree a fact that belongs upstream. The day Google ships a `linux-arm64` chromedriver, a
hard-coded exclusion becomes a silent capability regression. It would also not protect the many
other ways a driver can be unrunnable. D does not work. The fallback lives in glibc's `execvp`,
below Node's `shell` option, and `access(X_OK)` returns success for a foreign-architecture file that
is mode `+x`.

### Consequences

* Good: the arm64 Docker build's smoke test completes. Browser specs SKIP with a diagnostic; shell
  and HTTP specs pass; the image is published instead of being blocked by a platform gap.
* Good: an unrunnable driver is now reported as what it is. The message reads "the binary targets
  x86-64 but this host is linux/arm64 (AArch64)", instead of a page of shell parse errors quoting
  binary.
* Good: doc-detective no longer lets a shell interpret an untrusted downloaded binary inside the
  user's working directory. That was reachable by any user on a platform whose driver asset doesn't
  match their architecture, not only in CI.
* Good: a corrupt, vanished, or undecodable entry in an input directory no longer aborts detection.
* Bad (accepted): the header check is a heuristic over `e_machine`. A binary that passes it can
  still fail to execute, through a missing loader, a truncated body, or the wrong libc. So it
  narrows the ENOEXEC window rather than closing it. That is why the scratch-cwd hardening and the
  guarded scan are part of the same decision, rather than alternatives to it.
* Bad (accepted): the smoke test no longer proves that browser specs ran on *every* arch. It proves
  no spec failed and at least one passed. Chrome coverage on linux/amd64 (and the fixture bundles)
  remains the place browser behavior is actually gated.
* Neutral: `geckodriver` also fails to install in this image on **both** architectures, with
  `Refusing to execute '/opt/doc-detective/browsers'`. The cache probe falls back to the cache
  directory itself when the extracted binary isn't found at the expected name. That is a separate,
  pre-existing defect; `linux/amd64` is green with it, so it is tracked separately rather than folded
  in here.

### Confirmation

* **Red→green unit tests.** `test/runtime-browsers.test.js` covers the helper.
  `foreignExecutableImageReason` flags an x86-64 ELF on `linux/arm64`, accepts a matching image, and
  decodes a big-endian header in its own byte order. It stays silent for non-ELF images, off Linux,
  for an unmapped host architecture, and for a header whose `EI_DATA` declares no byte order.
  `verifyDriverBinary` refuses a foreign image, **and the injected `exec` is asserted never to have
  been called**. An unreadable header falls open to the spawn path. `driverExecOptions` pins `cwd` to the temp dir.
* **Red→green regression test for the crash.** `test/detecttests-qualify-coverage.test.js` creates a
  directory entry whose raw name is not valid UTF-8 alongside a valid spec. Before the fix this
  reproduced the exact CI failure, `ENOENT: no such file or directory, stat
  '…/���-side-effect'` thrown from `qualifyFiles`. After the fix, detection returns
  the valid spec. This test is POSIX-only, because a Windows filename is UTF-16 by construction, so
  the failure cannot be built there. Verified red then green by running the file under
  `node:22-slim`.
* **Gate rule unit test.** `test/container-run-outcome.test.js` covers `assertRunOutcome`. It
  accepts an arm64-shaped run, where some specs passed and browser specs skipped. It rejects any
  failure, an all-skipped run, and a missing summary. It also rejects a `fail` count that is
  missing, non-numeric, negative, or fractional, rather than coercing it to zero.
* **End-to-end.** The published Linux image ran with the built `dist` mounted over it. Its
  chromedriver's ELF `e_machine` was patched to an unhandled value, to force ENOEXEC. The driver is
  refused by the header check, and `/app` gains no shell-created entries. The run completes with
  browser specs skipped instead of crashing.
* **CI.** The `build-linux (ubuntu-24.04-arm, linux/arm64, arm64)` leg of the "Docker build" workflow
  passes, with `build-linux (ubuntu-latest, linux/amd64, amd64)` unchanged as the control. This is
  only observable on the pull request because
  [ADR 01097](01097-build-pull-request-images-from-the-branch.md) lands alongside it. The image
  otherwise installs `doc-detective@latest` from npm. A PR build would then exercise the published
  runtime, and stay red until this fix was released.

No Doc Detective feature fixture accompanies this change. It adds no user-facing knob, meaning no
step type, action option, config or CLI flag, engine, or output format. Its trigger is a driver
binary built for another CPU architecture, which cannot be authored in a spec. The container smoke test *is* the
end-to-end fixture for this behavior, and it now runs on both architectures.

## Pros and Cons of the Options

### A. Refuse a provably foreign image + scratch cwd + guarded scan

* Good: removes the cause (shell interpretation of an untrusted binary), not just the visible
  symptom.
* Good: fails open on every uncertain input, so it cannot refuse a driver that would have worked.
* Good: benefits every user on a mismatched platform, not only the Docker build.
* Bad: three coordinated changes rather than a one-line catch. The header check is a heuristic, and
  needs a new `e_machine` entry if Node ever reports an architecture not in the table. That case
  fails open, so it degrades to today's behavior rather than breaking.

### B. Guard the input scan only

* Good: one line, fixes the observed crash.
* Bad: leaves a shell interpreting a 21 MB untrusted binary in the user's project on every affected
  run, and leaves the debris behind. It just stops complaining about it.

### C. Hard-code "no chrome on linux/arm64"

* Good: trivially makes the arm64 build green.
* Bad: encodes an upstream vendor's current matrix as our permanent behavior. That becomes a silent
  capability regression the day it changes. It also addresses exactly one of the many ways a driver
  binary can be unrunnable.

### D. Interpreter guard around the probe

* Good: would be the most general fix if it worked.
* Bad: it doesn't. The retry lives in glibc's `execvp`, beneath Node's `shell` option, and an
  `access(X_OK)` check passes for a mode-`+x` foreign-architecture file.
