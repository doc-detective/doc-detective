# Design: run-performance improvements (five phases)

Status: **proposed** (2026-07-14). Produced from a full-pipeline performance hunt across startup,
resolution, runner, driver/session, and reporting paths. Every finding below was verified against
code with file:line evidence; refuted candidates (JIT-install network cost on steady-state runs,
per-call AJV schema compilation, `recordRuntimeDependencies` on the no-install path) are excluded.
Companion plan: [warm-phase.md](warm-phase.md) (already shipped) covers provisioning overlap; this
plan covers everything else a run pays.

## Problem

A run pays large, measurable costs that have nothing to do with executing tests:

- **Fixed startup tax.** `probeBrowserEnvironment` spawns `node <appium> driver list` (~17s by its
  own comment) to learn what a filesystem lookup already knows
  ([config.ts:749-801](../../src/core/config.ts)). The self-update registry check (up to 3s) is
  awaited serially before anything else ([cli.ts:169-197](../../src/cli.ts)).
- **Per-session tax.** Every `(test × context)` job starts and tears down a full driver session
  ([tests.ts:4204](../../src/core/tests.ts), `:4928`), ~1–3s each. `appiumIsReady` sleeps 1s
  *before* its first `/status` check ([tests.ts:5418-5434](../../src/core/tests.ts)), and servers
  are started with readiness awaited serially ([tests.ts:1766-1776](../../src/core/tests.ts)).
- **Per-step tax.** Pretty-printed `JSON.stringify` of the full step and result objects is built
  on every step regardless of log level ([tests.ts:4612](../../src/core/tests.ts), `:4730-4733`);
  `evaluateExpression` compiles a fresh `new Function` per evaluation
  ([expressions.ts:487](../../src/core/expressions.ts)); `replaceEnvs` re-walks the step with a
  fresh regex per string node, per attempt ([utils.ts:1461-1510](../../src/utils.ts)).
- **Per-file tax.** Spec files are read twice and validated 3–5× each, with a full
  `JSON.parse(JSON.stringify(...))` deep clone per validation
  ([validate.ts:143](../../src/common/src/validate.ts), [files.ts:191-211](../../src/core/files.ts));
  detection regexes are recompiled ~36×/markdown file
  ([common detectTests.ts:20-31](../../src/common/src/detectTests.ts)); qualify/parse and remote
  fetches are strictly serial ([detectTests.ts:257](../../src/core/detectTests.ts), `:421`).
- **Per-screenshot tax.** Captures are written to disk, read back and sync-decoded for compare,
  re-encoded on size mismatch, and the crop path does write → re-read → extract → rename
  ([saveScreenshot.ts:519](../../src/core/tests/saveScreenshot.ts), `:592-614`, `:654-655`,
  `:699-714`) — up to ~5 PNG encode/decode passes + 4 disk ops per step.
- **Run-end tax.** The whole results tree is walked ≥4× (info-level dump at
  [core/index.ts:254-256](../../src/core/index.ts), json reporter, runFolder JSON, HTML build),
  and the PostHog flush ([telem.ts:97-102](../../src/core/telem.ts)) holds the event loop open
  after everything else finishes.

## Decisions (settled, 2026-07-14)

1. **Driver presence is a filesystem question, not an Appium question.** The `appium driver list`
   spawn is replaced by direct `resolveHeavyDepPath()`/`npmInstalled()` checks — the mechanism
   already used at [config.ts:1054-1092](../../src/core/config.ts). This serves *all* platforms
   (browser drivers and native Windows/macOS/iOS/Android drivers) identically; no gating on
   "browser runs only."
2. **Session reuse is default-on where reset is provably complete, and only there.** No opt-in
   flag. Chromium-family engines get reuse with a deterministic CDP reset protocol; engines
   without a verifiable global state clear (Firefox, Safari) and native app surfaces keep today's
   fresh-session behavior. Any reset failure falls back to a fresh session (fail-closed). Users
   get an escape hatch (`freshSession: true` on a context), not an opt-in.
3. **Self-update overlaps resolution; it still completes before the first test executes.**
   The check starts concurrently with input detection/resolution and is joined before test
   execution, preserving the "update before the run" guarantee. `config.autoUpdate` already gates
   it from resolved config ([cli.ts:169-173](../../src/cli.ts)) — no new preference plumbing.
4. **Validation deep clones keep their safety guarantees.** The clone exists because AJV
   `useDefaults` mutates and candidate-schema probing must not contaminate the caller's object.
   The improvement is *when* to clone (only for the winning, mutating pass) and *how*
   (`structuredClone` where JSON-value semantics are guaranteed), never *whether* callers'
   objects stay unmutated.
5. **Log arguments are lazy.** No call site builds a string that the level check will discard.
   `log()` already stringifies objects passed directly ([core/utils.ts:1324](../../src/core/utils.ts));
   call sites pass objects, not pre-interpolated `JSON.stringify` templates.

## Phase 1 — free latency (no observable behavior change)

Pure waste removal; no ADRs (mechanical), no docs impact. Each item is its own red→green cycle.

| # | Change | Anchor | Win |
|---|---|---|---|
| 1.1 | Pass objects to `log()`/level-guard instead of eager `JSON.stringify` templates: per-step STEP/RESULT ([tests.ts:4612](../../src/core/tests.ts), `:4730-4733`), per-context CONTEXT (`:4097`), the resolveTests call sites (`:148-329` incl. the two whole-tree stringifies at `:315`/`:329`), CLI version/config dumps ([cli.ts:146-150](../../src/cli.ts)) | per step / 2× whole tree per run | CPU + allocations on every run at default level |
| 1.2 | `appiumIsReady`: probe `/status` immediately, then poll at 250ms (drop the leading 1s sleep) ([tests.ts:5427](../../src/core/tests.ts)) | per server (browser pool ≤4, app surface, warm probe) | ≥1s × servers |
| 1.3 | Overlap server readiness: keep serial spawn (port-rebind race), pre-allocate ports, `Promise.all` the readiness waits ([tests.ts:1766-1776](../../src/core/tests.ts)) | once per run | ~(N−1)×spawn+poll |
| 1.4 | Memoize compiled expression evaluators in a `Map` keyed by preprocessed source + arg signature ([expressions.ts:487](../../src/core/expressions.ts)) | per conditional/routed step | repeated `new Function` JIT |
| 1.5 | `replaceEnvs`: hoist the constant regex to module scope; substitute once before the retry loop instead of per attempt ([utils.ts:1461-1510](../../src/utils.ts), call at [tests.ts:5078](../../src/core/tests.ts)) | per step × attempt | allocations + redundant re-walks |
| 1.6 | Telemetry: call `sendTelemetry` before reporters/hints run, `await client.shutdown(timeoutMs)` after they finish ([telem.ts:97-102](../../src/core/telem.ts), [core/index.ts:262](../../src/core/index.ts)) — flush overlaps reporter I/O, bounded worst case, no dropped events (no `unref`) | once per run | full PostHog round-trip off the exit path |
| 1.7 | Detection micro-fixes: single `statSync` (or `readdirSync(..., { withFileTypes: true })`) ([detectTests.ts:345-346](../../src/core/detectTests.ts), `:390-391`); hoist `allowedExtensions` to a per-run `Set` (`:79-82`); cache compiled `safeRegExp` per `(pattern, flags)` and drop the no-op `Array.from` rebuild ([common detectTests.ts:20-31](../../src/common/src/detectTests.ts)) | per walked entry / per file | thousands of syscalls; ~36 compiles/file |

1.7's regex cache lives in `src/common` — follow [src/common/AGENTS.md](../../src/common/AGENTS.md)
and its tdd-coverage skill.

## Phase 2 — startup path (contract-adjacent; ADRs)

| # | Change | Anchor | Win |
|---|---|---|---|
| 2.1 | Replace `probeBrowserEnvironment`'s `appium driver list` spawn with direct package-presence checks for every managed driver (browser *and* native platforms) | [config.ts:749-801](../../src/core/config.ts) → mechanism from `:1054-1092` | ~17s fixed, every driver-touching run |
| 2.2 | JIT preflight patches the app cache with the just-installed descriptors instead of `clearAppCache` — the driver list didn't change, only the browser binary did | [core/index.ts:193](../../src/core/index.ts), cache at [config.ts:670](../../src/core/config.ts), `:820-821` | second ~17s probe on fresh-machine runs |
| 2.3 | Start `checkForUpdate` concurrently with detection/resolution; join (and `selfUpdate` re-exec if newer) before the first test executes | [cli.ts:169-197](../../src/cli.ts) | up to 3s registry latency hidden behind resolution |
| 2.4 | Demote the full results-tree `info` dump to `debug` (reporters already render results); serialize the canonical JSON once and share it between the json and runFolder reporters | [core/index.ts:254-256](../../src/core/index.ts), [utils.ts:539](../../src/utils.ts), `:654`, `:664` | ≥2 full-tree serializations; terminal flood |
| 2.5 | Delete the stray `console.log(payload)` on the orchestration-API report-back path | [utils.ts:1176](../../src/utils.ts) | noise; large inspect on API runs |

ADRs: 2.1 (probe mechanism becomes presence-based — document the "present ≠ functional" trade and
the retained `verifyDriverBinary` layer), 2.3 (update-check ordering guarantee), 2.4 (terminal
output contract change). Docs impact: 2.4 touches what users see at default log level.

## Phase 3 — resolution & validation efficiency

| # | Change | Anchor | Win |
|---|---|---|---|
| 3.1 | Read + parse each spec file once: thread the parsed object/raw content from `isValidSourceFile` qualification through `parseTests`; pass known `objectType` into `resolvePaths` to skip the config_v3-then-spec_v3 probe | [detectTests.ts:91](../../src/core/detectTests.ts), `:430`; [files.ts:191-211](../../src/core/files.ts), `:530`, `:627` | ~2 reads + ~4-5 validations → 1 read + ~2 validations per file |
| 3.2 | `validate()` clone strategy: probe candidate schemas with non-mutating check-only validators (no `useDefaults`), clone **once** for the winning mutate-with-defaults pass only (today: one clone per candidate, up to 12 for `step_v3` at [validate.ts:167](../../src/common/src/validate.ts)); use `structuredClone` on the detection path where inputs are guaranteed JSON values (they came from `JSON.parse`/YAML) | [validate.ts:143](../../src/common/src/validate.ts), `:167` | dominant detection CPU on step-heavy specs |
| 3.3 | Memoize `loadDescription` by resolved description path for the run (specs re-dereference the same OpenAPI doc per test today); reuse the `definition` already attached in `setConfig` | [resolveTests.ts:152-183](../../src/core/resolveTests.ts), `:246`, `:288`; [openapi.ts:14-27](../../src/core/openapi.ts) | T+1 reads + dereferences → 1 per document |
| 3.4 | Lazy-import `json-schema-faker` / `@apidevtools/json-schema-ref-parser` inside the functions that use them (module-load `createGenerator` runs on every run via the `config.ts:11` static import chain, OpenAPI or not) | [openapi.ts:2-6](../../src/core/openapi.ts) | tens of ms cold start, unconditional today |
| 3.5 | Concurrent qualify/parse via the existing `runConcurrent` helper (remote `fetchFile`/axios reads benefit most; keep ditamap/heretto splice sequencing) | [detectTests.ts:257](../../src/core/detectTests.ts), `:421`; helper at [core/utils.ts:106](../../src/core/utils.ts) | wall-clock ≈ max instead of sum for file I/O |

3.2 changes `src/common` validation internals — behavior contract (callers' objects never mutated;
returned object carries defaults) is preserved and pinned by tests before refactoring. ADR for
3.2's clone-semantics decision; 3.1/3.3–3.5 are mechanical (no ADR) but 3.3 needs a fixture
asserting OpenAPI-bound runs still resolve identically with multiple tests sharing a description.

## Phase 4 — in-memory screenshot pipeline

Replace the disk round-trip chain with one buffer flow:

1. Capture via `takeScreenshot()` (base64 → `Buffer`) instead of `saveScreenshot(filePath)`
   ([saveScreenshot.ts:519](../../src/core/tests/saveScreenshot.ts)).
2. Crop on the buffer (`sharp(buffer).extract(...)`) — eliminates the write → `sharp(filePath)`
   re-read → `cropped_*.png` temp write → `renameSync` cycle (`:592-614`).
3. Compare decoded buffers directly — eliminates `PNG.sync.read(fs.readFileSync(...))` read-backs
   (`:654-655`); on dimension mismatch stay in sharp's raw pipeline instead of re-encoding to PNG
   and re-decoding (`:699-714`).
4. Write the final PNG to disk exactly once, at the end.

Same files land on disk with the same names and compare semantics — behavior-preserving, so no
ADR; the existing capture fixtures in [test/core-artifacts/capture/](../../test/core-artifacts/capture)
gate it, plus a permutation covering crop + variation-compare together (the worst-case path).
This also directly cuts the per-step cost of `autoScreenshot` runs (`resolveAutoScreenshot`,
[tests.ts:3494](../../src/core/tests.ts)), which funnel every driver step through this pipeline.

## Phase 5 — default-on browser session reuse (tiered reset)

The biggest ceiling: today every `(test × context)` job pays a full session start + teardown
([tests.ts:4204](../../src/core/tests.ts), `:4928`). Design principle (Decision 2): **reuse is the
default wherever reset is provably complete; everywhere else nothing changes.**

### Reset protocol (Chromium family: Chrome, Edge, chromium engine)

Order matters — WebDriver ends the session when its last window closes, so the fresh window opens
*first*:

1. `browser.newWindow('about:blank')` → switch to the new handle.
2. Close every other window handle.
3. CDP global clears (this is why Chromium qualifies — one call covers all storage classes):
   - `Storage.clearDataForOrigin(origin: "*", storageTypes: "all")` — cookies, local/session
     storage, IndexedDB, WebSQL, service workers, cache storage.
   - `Network.clearBrowserCookies` + `Network.clearBrowserCache` (belt-and-suspenders for the
     network stack).
   - `Browser.resetPermissions` — granted permission grants.
   - `Emulation.clearDeviceMetricsOverride` + `Emulation.clearGeolocationOverride` — any
     emulation state a test set.
4. Reapply the incoming context's window size/viewport and navigate `about:blank`.
5. **Fail-closed:** if any step throws or times out, discard the session and start fresh — the
   reset is an accelerator, never a new failure mode (same posture as the warm phase).

### Why cookie-clear + new window alone isn't enough

`deleteAllCookies` (WebDriver classic) is scoped to the *current document's domain*, and window
close doesn't touch localStorage/IndexedDB/service workers/permissions. That's exactly why:

- **Firefox (gecko):** no CDP-equivalent global clear on modern releases → keeps fresh sessions.
- **Safari:** no reliable programmatic clear → keeps fresh sessions.
- **Native app surfaces (Windows/macOS/iOS/Android):** a session *is* the app instance; relaunch
  is the isolation model → out of scope, unchanged.

### Pool mechanics

- Reuse pool keyed by the full capability signature (engine, headless, args, proxy — everything
  except resettable state like window size), scoped per Appium server/runner worker, so the
  existing ChromeDriver-contention design ([tests.ts:1720](../../src/core/tests.ts)) is untouched.
- A context only draws from the pool on an exact signature match; otherwise fresh session.
- `freshSession: true` on a context (schema addition, `context_v3`) forces today's behavior.
- Run-end teardown unchanged: pooled sessions are owned by the run and swept in the existing
  `finally` block.

### Confidence mechanism (gates the phase)

Per the feature-fixture rule, a `sessions/` leakage fixture suite asserts **non-leakage across the
reuse boundary for every state class**, per engine: cookie, localStorage, sessionStorage,
IndexedDB, cache storage, service worker registration, granted permission, viewport override,
window count. Each fixture is a pair of tests in one spec — test A plants the state, test B (same
context signature, therefore a reused session) asserts absence. A companion fixture asserts
`freshSession: true` still yields a cold session. These run on every Chromium platform leg; the
phase does not ship until every leg passes. ADR records the tiering decision and the fail-closed
rule; docs impact: contexts/session reference page (new `freshSession` field + which engines pool).

### Expected win

For a spec with N Chromium tests: N×(1–3s) session cycles → 1 session start + (N−1) resets
(~100–300ms each). On small-test-heavy suites this is the largest single wall-clock reduction in
the plan.

## Sequencing rationale

Phase 1 is risk-free and immediately measurable, and 1.2 makes Phase 5's per-reset economics
better. Phase 2 removes the dominant *fixed* costs (17s probe) before per-test costs matter.
Phase 3 scales with suite size and is contained in detection/validation. Phase 4 is contained in
one action. Phase 5 is last because it carries the only real semantic risk and depends on its
fixture suite existing first.

Every phase lands with the repo's standard trio where applicable: ADR (noted per phase) +
fixtures + docs-impact assessment. Measurement: reuse the `report.warm`-style timing block to add
coarse phase timings (startup, resolution, execution, reporting) so each phase's win is visible in
run output rather than asserted.
