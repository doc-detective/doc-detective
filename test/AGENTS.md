# Testing & CI triage guide

Hard-won knowledge about running this repo's test suites locally and diagnosing CI failures.
Repo-wide rules (TDD, fixtures, commit conventions) live in [../CLAUDE.md](../CLAUDE.md).

## Local environment gotchas

- **Port 8092 collisions.** The mocha hooks ([hooks.js](hooks.js)) start a local test server
  hardcoded to port 8092 and silently continue if it's "already running". Two failure modes:
  parallel worktree sessions running mocha at the same time, and orphaned servers left behind by a
  killed run. Either way, dynamically-seeded fixtures 404 (e.g. `url-reference-fixture.png` in
  core-screenshot tests) and browser sessions can die with "invalid session id". Before trusting
  failures in the core-screenshot/core-core suites, check
  `Get-NetTCPConnection -LocalPort 8092 -State Listen` and inspect the owning process's command
  line (it may be mocha from a sibling `.claude/worktrees/*` checkout, or a days-old orphan). Wait
  or kill only orphaned listeners, then rerun.
- **Browserless worktrees fail ~22 browser-dependent tests.** A worktree with no Chrome/Firefox/
  Appium installed and no network to lazy-provision fails browser-dependent tests with "Chrome
  browser is not available" or step-count assertions (`0 !== 1`, `undefined (reading 'result')`)
  because browser contexts skip. These are environmental, not regressions. Verify: (a) the failing
  test files are browser/driver-dependent and untouched by your change, (b) the core fixture pass
  ("All core specs pass under concurrentRunners=2") still passes, (c) if unsure,
  `git stash push -- src test`, `npm run compile`, re-run one failing test — it fails identically
  on base.
- **Killed runs leave debris.** Killing mocha mid-flight orphans its test server and can leave
  stray artifacts: modified root `image.png`/`reference.png` baselines, `screenshot-boolean.png`,
  `rec-perm-*.gif`, and scratch files under `test/core-artifacts/`. Scope-check and restore these
  (`git checkout -- image.png` etc.) before committing — subagents are especially prone to leaving
  them behind.

## Fixture concurrency & the resource-aware scheduler

The combined core fixture suite ([core-core.test.js](core-core.test.js), driven by
[core-artifacts/config.json](core-artifacts/config.json)) runs in one `concurrentRunners: 2` pass;
the runner's resource-aware scheduler (ADR 01001 area, `createResourceRegistry`/`runResourceAware`
in `src/core/utils.ts`) keeps it safe:

- **Recordings serialize on a `"display"` mutex on every platform** — per-context Xvfb displays do
  NOT make concurrent recordings safe (driver sessions still clobber each other → "invalid session
  id"). While any recording is present in a run, all driver contexts serialize; only non-driver
  (HTTP/shell) work stays parallel. The runner reports this via `result.recordingSerialized`.
- **Never set `concurrentRunners` in the shared `core-artifacts/config.json`.** Other suites load
  the same file (e.g. `appium-port-conflict.test.js`, which probes single-Appium port-conflict
  behavior); a leaked `concurrentRunners: 2` starts a second Appium server while port 4723 is held
  and cascades into hundreds of unrelated browser failures. Set it on the specific concurrent pass
  only.

## Coverage ratchets

- **Root coverage gates on the cross-platform union** of the full matrix (3 OS × node 22/24), not
  a single OS. Each matrix cell uploads pruned raw V8 coverage; a `coverage-merge` job merges and
  reports (see `.github/workflows/test.yml`, `scripts/prune-coverage.cjs`,
  `scripts/merge-coverage.cjs`, `scripts/check-coverage-ratchet.cjs`).
  - `tsconfig.json` pins `newLine: "lf"` — raw V8 coverage encodes character offsets into the
    emitted `dist/**/*.js`, so dist must be byte-identical across OS. **Do not revert.**
  - **The union wobbles ~0.4pp run-to-run** (flaky E2E cells cover slightly different
    browser/driver functions). When re-baselining `coverage-thresholds.json`, set each value BELOW
    the lowest observed run and keep `tolerance` ≈ 0.4. Never set thresholds to a single run's
    peak.
  - **Downward re-baselines are allowed with justification** for code exercised only
    out-of-process: the fixture jobs run through the GitHub Action, so their runtime is invisible
    to in-process mocha V8 coverage. Cover what's hermetically coverable first, then re-baseline
    with the rationale in the commit message.
  - You can't measure the union locally (it needs all matrix cells) — set thresholds at or below
    the observed CI union so the floor (threshold − tolerance) clears it.
- **`src/common`'s ratchet baseline is a genuine 100%** on all four metrics. If the common ratchet
  fails, it's likely a real regression from your change — but `npm run compile` in `src/common`
  first, or mocha can't import `dist/index.js` and c8 reports 0%.

## CI flake triage playbook

**Always read the actual job logs first** (`gh run view --job <id> --log`, or
`gh run view <run-id> --log-failed` to jump straight to the failed steps; pipe to `tail` for the
end) before blaming a workflow or mocha timeout — most of the entries below were misdiagnosable
from config alone.

Known flake signatures and dispositions:

| Signature | Diagnosis | Action |
|---|---|---|
| `All providers failed for firefox nightly_<buildId>` in the install step | Per-runner download blip (firefox `latest` resolves to a Nightly on rotating mirrors), not a buildId-gone or code regression — sibling matrix jobs install the same build fine | `gh run rerun --job <jobId>` (or `gh run rerun <runId> --failed` once the run completes). A `non-functional`/`Refusing to execute` driver error is code, not a flake |
| iOS leg fails with `POST /session ... aborted due to timeout` | Likely a cold WebDriverAgent build: the macOS runner pool serves mixed Xcode images with per-image WDA caches, so a leg landing on the rarer image pays a 10–25 min xcodebuild. The runner retries session timeouts when a slow-startup ceiling was declared (ADR 01033) | Check the WDA cache-restore line in the log and whether the retry fired before blaming the fixture |
| Windows legs: DLL-init crash `0xC0000142`, or a one-off goTo timeout | Transient runner issues | Rerun failed jobs after the run completes |
| `npm test` dies with exit code 124 | Historically the runner-entrypoint self-kill watchdog leaking a timer into mocha (fixed in #368). Exit 124 here can be a literal `process.exit(124)` — don't assume a GNU `timeout(1)` wrapper | Read the log tail for what actually exited |
| TS2307 `Cannot find module 'webdriverio'` at compile | An optionalDependency install was silently skipped; compile-time types must not reference optional packages via `typeof import(...)` (fixed via local type stubs in #369; `pngjs` is a latent twin) | Fix the type coupling, don't chase npm |

## CI environment reference

- **Hosted macOS runners pre-grant TCC permissions at image-build time** (Accessibility to
  Xcode-Helper/osascript/bash, ScreenCapture to bash, AppleEvents to osascript). This is why
  mac2/WDA app sessions and ffmpeg avfoundation recording fixtures work on `macos-latest` with no
  grant step. Runtime `sqlite3` inserts into TCC.db are unreliable on modern images — don't add
  them. The apps×windows/macos fixture legs set `DD_FIXTURES_REQUIRE_PASS=1`
  ([../scripts/check-fixture-results.cjs](../scripts/check-fixture-results.cjs)) so an image
  regression fails loudly instead of reading as all-SKIPPED green.
- **Android AVD home must be pinned.** `avdmanager` and the `emulator` binary resolve the AVD
  directory from different env vars on hosted runners; the shared `androidAvdHome()` helper in
  `src/runtime/androidInstaller.ts` pins `ANDROID_AVD_HOME` for both. Symptom of a regression:
  emulator dies instantly with `Unknown AVD name` — visible only when the emulator's stdout AND
  stderr are both captured.
- **Non-skip Android runs happen only on Linux with KVM**; mac/win/no-KVM legs capability-SKIP by
  design.

## CodeQL false positives on managed-tool execution

CodeQL's `js/command-line-injection` flags places where the CLI executes its own managed toolchain
from a path derived from user config (e.g. `verifyDriverBinary` running a cached WebDriver's
`--version` via `execFile`). This is a false-positive class: the "user-provided value" is the
user's own config, there's no shell, and the path is allowlisted. Code-level barriers (basename
sets, anchored regexes) do **not** satisfy the taint query — don't burn time trying. Resolution is
to dismiss the alert:

```bash
gh api -X PATCH repos/<owner>/<repo>/code-scanning/alerts/<n> \
  -f state=dismissed -f dismissed_reason="false positive" -f dismissed_comment="..."
```

Dismissing a security alert requires explicit repo-owner authorization first. This matters because
CodeQL is the one merge-blocking check (see
[../docs/maintenance/release-operations.md](../docs/maintenance/release-operations.md)).
