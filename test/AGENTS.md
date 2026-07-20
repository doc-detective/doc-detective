# Testing & CI triage guide

Hard-won knowledge about running this repo's test suites locally and diagnosing CI failures.
Repo-wide rules (TDD, fixtures, commit conventions) live in [../CLAUDE.md](../CLAUDE.md).

## Local environment gotchas

- **Port 8092 collisions.** The mocha hooks ([hooks.js](hooks.js)) start the test servers via
  `createTestServers()`, whose ports are hardcoded in [server/instances.js](server/instances.js)
  (8092 main / 8093 API); on `EADDRINUSE` the hooks log `Test server (<name>) already running` and
  continue against the existing listener (so watch for that line when debugging). Two failure
  modes: parallel worktree sessions running mocha at the same time, and orphaned servers left
  behind by a killed run. Either way, dynamically-seeded fixtures 404 (e.g.
  `url-reference-fixture.png` in core-screenshot tests) and browser sessions can die with "invalid
  session id". Before trusting failures in the core-screenshot/core-core suites, find the listener
  — `Get-NetTCPConnection -LocalPort 8092 -State Listen` on Windows, `ss -ltnp 'sport = :8092'` or
  `lsof -iTCP:8092 -sTCP:LISTEN` on Linux/macOS — and inspect the owning process's command line (it
  may be mocha from a sibling `.claude/worktrees/*` checkout, or a days-old orphan). Wait or kill
  only orphaned listeners, then rerun.
- **Browserless worktrees fail the browser-dependent tests.** A worktree with no Chrome/Firefox/
  Appium installed and no network to lazy-provision fails browser-dependent tests with "Chrome
  browser is not available" or step-count assertions (`0 !== 1`, `undefined (reading 'result')`)
  because browser contexts skip. These are environmental, not regressions. Verify: (a) the failing
  test files are browser/driver-dependent and untouched by your change, (b) the core fixture pass
  ("All core specs pass under concurrentRunners=2") still passes, (c) if unsure,
  `git stash push -- src test`, `npm run compile`, re-run one failing test — it fails identically
  on base.
- **Don't trust a browser-engine recording failure seen while another run was live.** Two
  doc-detective processes on one machine (the CLI while `npm test` runs, or parallel worktree
  sessions) used to share the Chrome capture title and the download path whenever their context ids
  matched — the common `default` / `windows-chrome` — which surfaced as `Recording download timed
  out`, a truncated `.webm` (`Read error at pos. 37`), or, worst, two runs silently producing
  byte-identical videos. Both keys are now per-process (ADR 01076). If you see these symptoms
  anyway, check for a concurrent run *before* suspecting Chrome: reproduce with nothing else
  running, and compare against the `fixtures / recording (windows-latest|macos-latest)` CI jobs,
  which exercise the browser engine headed on the same managed Chrome build.
- **Killed runs leave debris.** Killing mocha mid-flight orphans its test server and can leave
  stray artifacts: modified root `image.png`/`reference.png` baselines, `screenshot-boolean.png`,
  `rec-perm-*.gif`, and scratch files under `test/core-artifacts/`. Scope-check and restore these
  (`git checkout -- image.png` etc.) before committing — subagents are especially prone to leaving
  them behind.
- **Running a fixture through the CLI pollutes `npm test`.** `doc-detective runTests` writes its
  per-run reports to a `.doc-detective/` directory beside the input — so running a fixture from
  `test/core-artifacts/` leaves `test/core-artifacts/.doc-detective/`, and
  [select-fixture-bundles.test.js](select-fixture-bundles.test.js) then fails with `bundle dirs
  must match on-disk group dirs exactly` (actual gains `'.doc-detective'`): it enumerates the group
  directories *on disk* and can't tell your run output from a new fixture group. It's local
  pollution, not a regression — remove the directory and re-run:

  ```bash
  rm -rf test/core-artifacts/.doc-detective                                    # bash
  Remove-Item -Recurse -Force test/core-artifacts/.doc-detective              # PowerShell
  ```

  Two ways to avoid it: point `--output` somewhere under `.tmp/`, or clean up before the full
  suite. Fixture artifacts themselves (`*.mp4`, `*.checkpoints/`) are gitignored and harmless to
  leave, but the run directory is not harmless.

## Fixture concurrency & the resource-aware scheduler

The combined core fixture suite ([core-core.test.js](core-core.test.js), driven by
[core-artifacts/config.json](core-artifacts/config.json)) runs in one `concurrentRunners: 2` pass;
the runner's resource-aware scheduler (ADR 01001 area, `createResourceRegistry`/`runResourceAware`
in `src/core/utils.ts`) keeps it safe:

- **Recordings serialize on a `"display"` mutex on every platform** — per-context Xvfb displays do
  NOT make concurrent recordings safe (driver sessions still clobber each other → "invalid session
  id"). While any recording is present in a run, all driver contexts serialize; only non-driver
  (HTTP/shell) work stays parallel. The runner sets `report.recordingSerialized = true`, surfaced
  to consumers (e.g. hints) as `results.recordingSerialized`.
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
| `mobile-web-ios (macos)` (or another iOS leg) fails in a `wda-check` step with `Error: No elements matched selector or text` (log tail also shows `Terminate orphan process … (Simulator)`) | iOS-simulator/WebDriverAgent timing flake: the WebView content hadn't rendered when the `find` ran. Distinct from the session-timeout row above (the session started fine here). Sibling legs and reruns pass. **Not code** when the diff can't touch iOS/mobile-web rendering (e.g. an install-script or diagnostic-string change) | Confirm the change class can't affect iOS mobile-web, then `gh run rerun --job <jobId>` once the run completes |
| A bundled fixture leg (e.g. `web-plumbing (ubuntu)`) fails on `guards/expression-embedded-failure` with `Error: Returned exit code 1. Expected one of [0]` | Transient shell/runner blip on a `runShell`/`runCode` step — the spec passes on adjacent commits and on rerun. The `guards/` group rides inside the `web-plumbing` bundle, so the failing leg name doesn't name the spec; read the log for the actual `specId`. **Not a regression** when the diff can't touch shell execution | Verify it passed on an adjacent commit, then rerun the failed job after the run completes |
| `vale` job fails with `##[error]Vale and reviewdog exited with status code: 1` while the log shows `reviewdog: fail to get diff: GET https://api.github.com/repos/.../pulls/<n>: 503` | GitHub API outage collateral — reviewdog couldn't fetch the PR diff. The workflow sets `fail_on_error: false`, so vale *lint findings* can never fail this job; only infrastructure errors do. Check [githubstatus.com](https://www.githubstatus.com/) | Wait for GitHub to recover, then `gh run rerun <runId> --failed`. Don't chase docs style — `vale --minAlertLevel=error` locally (from `docs/`) confirms content is clean |
| An android leg fails fast (~6m vs its usual ~14m) with `Emulator "dd-*" exited (code 1) before finishing boot`, and the emulator's own stderr ends in `FATAL \| Not enough space to create userdata partition. Available: <n> MB … need 7372.80 MB` | Runner disk pressure, not code — the AVD needs ~7.4 GB and hosted ubuntu runners land just under it (observed: 7183 MB available, ~97% of need), so it tips on runner-image variation while sibling PRs pass. The emulator buries the reason: read the `description` of the failing step in the results JSON, not just the summary line | Rerun once the run completes (`gh run rerun <runId> --failed` is refused while it's still queued/in-progress). If it survives reruns, free runner disk in the workflow rather than touching the fixture |

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
