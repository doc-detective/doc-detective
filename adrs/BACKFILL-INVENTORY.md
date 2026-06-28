# ADR Backfill Inventory (cross-repo, authoritative)

> **Working document — not an ADR.** This is the candidate list of historical
> behavior/contract decisions to backfill as MADR ADRs in the reserved
> `00001`–`00999` range. **Review and prune this before any ADRs are authored.**
> Delete this file once the backfill is complete.

## Purpose

The five formerly-separate repos — `doc-detective` (the CLI wrapper),
`doc-detective-common` (schemas/validation), `doc-detective-core` (the engine),
`doc-detective-resolver` (detection/parsing), and `docker-images` — are now one
monorepo. Only one ADR exists today
([`01000`](01000-gate-advanced-ordering-under-concurrent-runners.md)). This
inventory reconstructs the **contract-affecting decisions** made from 2022-04
through 2026-06 across **all five repos** so they can be recorded
retrospectively.

"Contract-affecting" = a new step/action type, config or CLI flag,
engine/driver, output format/reporter, schema/validation contract,
precedence/default/gating rule, recording behavior, detection/parsing pipeline,
the GitHub Action contract, or Docker image base/runtime decision. Pure
refactors, dep bumps, test-only, CI plumbing, and typo/doc changes are excluded.

## How discovery was done

This inventory is backed by an **exhaustive, diff-level audit spanning all five
repos** — **3,156 commits total**:

1. **The merged monorepo** (`doc-detective`): all **992** commits, tiled into 16
   batches of 62 (no overlap, no gaps), read commit-by-commit and classified
   (behavior/contract-changing vs. excluded) with concrete diff evidence (the
   actual field/flag/file/default/function that changed).
2. **The four pre-merge upstream repos**, an additional **2,164** commits:
   `doc-detective-common` **663**, `doc-detective-core` **1,160** unique,
   `doc-detective-resolver` **218**, and `docker-images` **123** — each swept in
   batch findings (common cm-01…cm-10, core co-01…co-16, resolver rs-01…rs-04,
   docker dk-01…dk-02), deduplicated **by decision, not by commit**.

The upstream sweep is what makes this inventory authoritative on **dates**. From
~2023 the monorepo un-bundled its engine into the standalone `core`, its schemas
into `common`, and its detection into `resolver`; those (plus the image) were
merged back in during 2026-02/03. As a result, **many monorepo "decisions" from
2023–2026 are not decisions at all** — they are dependency bumps or
re-exposures of a contract that was actually authored earlier in `common`,
`core`, or `resolver`. The upstream commits carry the **true authoring dates**
the monorepo dep-bumps obscured. Where a monorepo row and an upstream row
describe the same contract, they are **merged into one row** dated to the
earliest (upstream) origin, with the monorepo PR/date preserved as a note.

The monorepo's **2022 genesis** (its earliest ~54 rows) is the shared
`doc-detective` / pre-split `core` genesis — those ARE real first-introduction
decisions and predate everything in the standalone repos, so they are kept and
tagged repo `doc-detective`.

Conventional commits were only adopted in 2025; 2022–2024 is freeform, which is
why a full diff sweep (not `feat:`/`fix:` mining) was needed across every repo.

### Corrections the diff audit forced on the old inventories

- **Initial engine was `selenium-webdriver`, not Puppeteer.** Genesis commit
  `9c52a7c3` (2022-04-22) ships `selenium-webdriver ^4.1.1` and a
  `Builder.forBrowser('chrome')` scaffold. Puppeteer (`5bef4db5`, 2022-04-28)
  was added a week later as the recording-engine experiment and became the
  runner engine over the following weeks.
- **The 3.0.0 breaking redesign's true date is upstream, not the 2026 import.**
  The monorepo wrapper flipped to `config_v3` in a single commit `58496132`
  (2025-04-18, Seq 100). But the **v3 contract itself** — `step_v3`
  action-as-key, `config_v3`, `context_v3`, the `compatibleSchemas` auto-
  transform — was authored in `doc-detective-common` **starting 2025-02-07**
  (`d4deb0fe`, `48a72a1e`), restructured through **2025-03-10/11** (`066f35f`,
  `6e20b59`), with the `core` runner adopting it **2025-03-12** (`3ef45157`).
  The earlier "undated / needs verification" framing is now resolved (see § Resolved).
- **The v1→v2 engine/CLI/config split is dated.** `2023-01-29` (engine
  un-bundled, `6b277e95`…`ec163278`) + `2023-04-12/14` (v2 CLI/`config_v2`
  contract, `01ef13f9`…`d7b45e19`); 2.0.0 shipped `2023-07-24` (`95e3c848`).
- **`runCoverage` / `suggestTests` were real shipped CLI entrypoints** added
  2022-10 / 2023-06 and **removed** by the 3.0.0 redesign (upstream `core`
  2025-04-10 `12dd65e0`; wrapper 2025-04-18 `58496132`) — a full add→remove
  lifecycle.
- **OpenAPI / Arazzo / unified-`outputs` are core/common decisions, not 2026
  imports.** In the monorepo their commits are dep-bumps only; the features were
  authored upstream (OpenAPI common 2024-09-04 `30e9b7df` / core 2024-09-05
  `47466440`; Arazzo core 2025-09-28/10-01 `d900af7`; unified `outputs` core
  2025-04-13 `0df134cb`).
- The original tool name was **`doc-unit-test`** (renamed to Doc Detective at
  `1bf19c06`).

### Resolved (formerly "still needs verification")

The schema-structural decisions previously parked as undated now have concrete
first-contract dates from the upstream `common`/`core` audit, and are placed in
the master table at those dates:

- **v2→v3 action-as-key redesign** (`step_v3`, action IS the key) — **2025-02-07**,
  common `d4deb0fe` (runner side core 2025-03-24 `a0f4915`; resolver detection
  2025-05-12 `0a626c4d`).
- **`compatibleSchemas` / `transformToSchemaKey` auto-transform** — **2025-02-07**,
  common `48a72a1e` (public const `compatibleSchemas` 2025-02-08 `bba8e199`;
  exported 2025-03-17 `e84666d`).
- **config_v2 → config_v3 restructure** — schema **2025-03-11**, common `6e20b59`;
  runner **2025-03-12**, core `3ef45157`.
- **context_v2 → context_v3 restructure** — schema **2025-03-10**, common `066f35f`;
  browsers-array redesign **2025-03-23** `5383e68`; runner `resolveContexts`
  2025-03-25 core `3710089`.
- **OpenAPI integration for httpRequest** — schema **2024-09-04**, common
  `30e9b7df`; engine **2024-09-05**, core `47466440`.
- **Arazzo support** — **2025-09-28/10-01**, core `d900af7`.
- **Unified `outputs` object** — **2025-04-13**, core `0df134cb`.

The only items that remain genuinely undated are listed in
[§ Still needs verification](#still-needs-verification) (now nearly empty).

## ⚠️ Dating caveats (read before trusting the dates)

- **Upstream commit dates are real authoring dates** (not import dates).
  Confidence `C` is mostly **H**; **M** marks features whose contributing hashes
  span several days/weeks (date = first-touch); **L** marks the handful left
  without a precise day.
- **Monorepo merge dates are NOT decision dates.** `doc-detective-common` was
  merged on **2026-02-28** (`2ae9b831`), `core` **2026-02-26** (`5b8df475`),
  resolver/detection folded in **2026-03**. The *decisions* those imports carry
  are dated to their upstream introduction commits, with the merge noted.
- **Sequential IDs are PROVISIONAL.** ADRs will be numbered `00001`+ in date
  order *after* pruning/correcting this list (pruning renumbers everything). The
  `Seq` column is just the current proposed order.

## Exclusions / already-covered

- **`01000` (gate advanced ordering under `concurrentRunners`, 2026-06-22,
  `158c83e6`)** is already authored — the worked example. Listed in-table at its
  date for completeness but flagged **(authored)**; not to be re-authored.
- **Mocha-from-Jest migration (2023-04-17 `8ed8e939`, 2024-10-10 era)** — test
  infra, not a user contract. Default = drop.
- Release-pipeline / CI workflow items (Docker-build dispatch, `npm-publish.yml`,
  semantic-release setup) are *project-infra* decisions — arguably ADR-worthy,
  marked `infra`/`docker`; decide as a group whether infra gets ADRs.

---

## Inventory (sorted strictly by date; provisional sequential IDs)

Legend — **Theme**: `engine` engines/drivers · `step` step/action types ·
`config` config/CLI · `schema` schemas/validation · `record` recording ·
`report` output/reporters · `resolve` resolver/input detection/parsing ·
`action-gh` GitHub Action · `docker` · `infra` project-infra · `runner`
runner/scheduler · `install` install/runtime provisioning · `validation`
AJV/transform · `telemetry`. **Repo(s)**: `doc-detective` (CLI wrapper /
pre-split core genesis) · `core` · `common` · `resolver` · `docker`. **C** =
confidence in date (H/M/L). A row's `Source` lists the **primary (earliest)
hash** and, where a monorepo dep-bump/re-exposure exists, an *"exposed in
monorepo …"* note with the PR.

### 2022

| Seq | Date | Theme | Repo(s) | Decision | Source (hash/PR#) | Evidence | C |
|----|------|-------|---------|----------|--------|----------|---|
| 1 | 2022-04-22 | engine | doc-detective | Tool is a CLI driven by **selenium-webdriver** (`Builder.forBrowser('chrome')`); pkg `doc-unit-test`, GPL-3.0 | 9c52a7c3 | `package.json` `bin:{test}`, `selenium-webdriver ^4.1.1`; `bin/index.js` Builder/By/Key/until scaffold | M |
| 2 | 2022-04-23 | config | doc-detective | CLI flag surface + file-config-overridden-by-args precedence: `--config/-c`, `--testFile/-f`, `--testDir/-d`, `--imageDir/-i`, `--videoDir/-v`, `--recursive/-r`, `--ext/-e` | c15c6d70, 3121b69a, d5b07b3f, 6b9f3a32 | yargs `.option(...)` defs; arg→config override block; `--ext` comma split | M |
| 3 | 2022-04-23 | config | doc-detective | fileType test-comment contract: per-extension `openTestStatement`/`closeTestStatement`/`open/closeBlockTestStatement`; `fileTypes[]` keyed by `extensions`; `testExtensions` allow-list | 8673d5d8, 0fb1987b, 5dcbea40 | `bin/config.json` `fileTypes[].extensions`, `// test` (md), `<!-- test`/`-->` (html); `testExtensions` | M |
| 4 | 2022-04-25 | resolve | doc-detective | Recursive directory walk + extension filtering (`recursive` default true, `excludeExtensions`/`testExtensions`) | a4332bc7, 8ceb72ff | `bin/config.json` `recursive`; recursive dir walk + ext filter | M |
| 5 | 2022-04-27 | config | doc-detective | `seleniumServer` config field (remote Selenium URL) | f4d28e35 | `bin/config.json` `seleniumServer:""` | M |
| 6 | 2022-04-28 | engine | doc-detective | Add **puppeteer** + puppeteer-screen-recorder as recording-engine experiment alongside selenium | 5bef4db5 | `package.json` `puppeteer ^13.7.0`, `puppeteer-screen-recorder ^2.0.2` | M |
| 7 | 2022-05-03 | schema | doc-detective | testDefinition + testResult contracts; tests without `id` get generated UUID; action enum `open/find/click/sendKeys/wait/screenshot/recordStart/recordStop/imageDiff` | 8d16362a, c2656b66 | `ref/testDefinition.json`, `ref/testResult.json`; uuid; `setTest` id gen | M |
| 8 | 2022-05-04 | step | doc-detective | `wait` `duration` semantics **seconds → milliseconds**; `open`/`screenshot`/`recordStart`/`wait` implemented | ae7174a2, 3063f6a3, 03cbee27 | `index.js`; `ref/testDefinition.json` "In milliseconds" | M |
| 9 | 2022-05-06 | step | doc-detective | `find` locator collapsed to a single **`css`** selector field (element_*/xpath removed) | 565cfa43, b5eac578 | findElement; `element_*`→`css` | M |
| 10 | 2022-05-06 | runner | doc-detective | One browser session per test run (Builder hoisted out of per-action loop) | 0247859b | Builder above action loop | M |
| 11 | 2022-05-07 | step | doc-detective | `click` action | 0581b404 | `runAction` `case "click"` → findElement + clickElement | M |
| 12 | 2022-05-07 | step | doc-detective | `type` action (`action.keys`, `trailingSpecialKey`); `matchText`/`curl` added to enum; matchText assertion | 4cbb04aa, 47f0fb70, 1c2fae2c | `typeElement`; enum `matchText`/`curl`; `matchText()` | M |
| 13 | 2022-05-09 | step | doc-detective | `screenshot` action enabled | 1b9f3b05 | un-comments `screenshot(action,page)` in switch | M |
| 14 | 2022-05-09 | report | doc-detective | testDefinition gains `status` + per-action `result{status,description,image,video}` output contract; default `testFile` "sample.md" | 51504a4 | config + `ref/testDefinition.json` | M |
| 15 | 2022-05-10 | config | doc-detective | Substring-based test-statement parser; drop `open/closeBlockTestStatement`; exit(1) on missing fileType options | ba6cc96 | `config.json` + `index.js` setTests | M |
| 16 | 2022-05-11 | report | doc-detective | JSON output to file + `inputPath`/`outputPath` (renamed `input`/`output`); `outputResults()` writes `results.json` | 0282efc, a45341b | `config.json`; `index.js` | M |
| 17 | 2022-05-13 | report | doc-detective | Per-test PASS/WARNING/FAIL rollup; results mutated onto `test.status`/`action.result`; returns `tests` object | 60dca37 | `src/lib/tests.js` | M |
| 18 | 2022-05-14 | config | doc-detective | Merge image+video dirs into `mediaDirectory`; `--imageDir`/`--videoDir` → `--mediaDir` | 5842757, d732600 | `testDefinition.json` + `utils.js` | M |
| 19 | 2022-05-17 | config | doc-detective | `browserOptions` config `{headless, path}` (executablePath) + `height`/`width` viewport via `--browserHeight`/`--browserWidth` | 6ce5ef9, 34cf0a4 | `src/config.json` + `utils.js` | M |
| 20 | 2022-05-17 | record | doc-detective | Recording support: `startRecording`/`stopRecording` wired into switch; recorder auto-closed per test; `--no-sandbox` always-on | 5884206, 4dbdb1b | `src/lib/tests.js` | M |
| 21 | 2022-05-18 | step | doc-detective | `moveMouse` action (+ install-mouse-helper cursor overlay) and `scroll` action | 86a9b92, bd33e4e | `tests.js` + install-mouse-helper.js | M |
| 22 | 2022-05-20 | record | doc-detective | `.gif` output via ffmpeg `convertToGif()` | b585acf | `src/lib/utils.js` | M |
| 23 | 2022-05-22 | step | doc-detective | `runShell` action (exec shell cmd, `env`-file support, exitCode) | 710de40 | `src/lib/tests.js` | M |
| 24 | 2022-05-27 | record | doc-detective | Screenshot matching (`matchPrevious`, pixelmatch/pngjs threshold compare) | 10c94783 | tests.js + pixelmatch/pngjs deps | M |
| 25 | 2022-05-29 | config | doc-detective | `verbose` config + `--verbose/-v` flag (replaces hardcoded debug gating) | 9d9f21c | `config.json` + `utils.js` | M |
| 26 | 2022-06-16 | step | doc-detective | `checkLink` action (axios GET status check) | c33f36e | tests.js + axios dep | M |
| 27 | 2022-08-16 | runner | doc-detective | Export `run(config)` for programmatic use; `setArgs`/`setConfig` no-op when argv absent; silence ffmpeg output | d1d18d9, 1fc9717 | `src/index.js`, `src/lib/utils.js` | M |
| 28 | 2022-08-22 | config | doc-detective | `run(config, argv)` signature + in-memory config resolution (no longer requires `argv.config`); `cli/index.js` entrypoint | cb84e40, d04968b | `setConfig` accepts in-memory config; `setArgs` returns `{}` | M |
| 29 | 2022-08-25 | schema | doc-detective | BREAKING: flatten `gifOptions.{fps,width}` → top-level `gifFps`/`gifWidth` action fields | eac84c1 | startRecording reads `action.gifFps/gifWidth`; `testDefinition.json` | M |
| 30 | 2022-09-06 | report | doc-detective | Analytics feature: `config.analytics.{send,userId,detailLevel,customServers}`, `sendAnalytics()`, GA + custom-server delivery, `-a` CLI args, server validation | e416127, 9bbc392, d983b7b, 4d49b7f (PR #3) | `analytics` config block + `analytics.js` | M |
| 31 | 2022-09-15 | step | doc-detective | "Supercharged find": `find` gains nested sub-actions `matchText`/`moveMouse`/`click`/`type` (run against found element); moveMouse removed from click | 8610f20, 93664ce, d742ef2 | `find` branch executes sub-objects with injected `css` | M |
| 32 | 2022-09-16 | step | doc-detective | Env-var support across actions: `runShell`/`type`/`matchText`/`checkLink` gain `env`; `setEnvs()`; `dotenv` dep; top-level `config.env`; `-e` remapped `--ext`→`--env` | 9ba206a, a69d957, e2a8220 | `setEnvs`, `dotenv`; yargs `env` takes `-e` | M |
| 33 | 2022-09-16 | step | doc-detective | `wait` gains `css` (waitForSelector); default duration 1000→10000ms; `wait` added as find sub-action; css timeout FAILs | 982c366, 494c99e | `page.waitForSelector(css,{timeout})`; try/catch→FAIL | M |
| 34 | 2022-09-20 | config | doc-detective | Config-system rewrite: `logLevel` enum replaces boolean `verbose`; committed `src/config.json` defaults; per-field validation; headless boolean normalization | 3be28b2, 50bfdf4, c297b1a (PR #6) | `logLevel:"info"`; detailLevel/extensions validation; `"false"` honored | M |
| 35 | 2022-09-21 | config | doc-detective | `setBrowserPath`: empty `browserOptions.path` short-circuits to default Chromium instead of cwd | 1579e4b9 | `setBrowserPath` guard | M |
| 36 | 2022-09-22 | config | doc-detective | `setup`/`cleanup` lifecycle hooks: config fields, `--setup`/`--cleanup` flags, env `DOC_SETUP`/`DOC_CLEANUP`; `-s`/`-c` short aliases removed | 3fd6a364, 09ade5f1, eb721fdc, 119cbf40 | extra tests run before/after `input` tests | M |
| 37 | 2022-09-23 | record | doc-detective | ffmpeg autoloaded via `@ffmpeg-installer/ffmpeg` (drops system-ffmpeg-on-PATH requirement) | 3fd29eca | `require("@ffmpeg-installer/ffmpeg").path` | M |
| 38 | 2022-09-26 | engine | doc-detective | Browser fallback: on puppeteer launch failure, try platform-specific default browser paths (chromium/chrome/firefox per linux/darwin/win32) | 2f25959a | platform-keyed path fallback before error | M |
| 39 | 2022-09-27 | step | doc-detective | `httpRequest` action (`uri/method/headers/params/requestData/statusCodes` + sanitization); deep array/object comparison + `responseHeaders`/`responseData`; `$ENV` substitution | 77bcb850, 2db85f0d, 359bcbf3, e44bbab1, 52ef39f3 | `src/lib/tests/httpRequest.js` | M |
| 40 | 2022-10-01 | record | doc-detective | startRecording `overwrite` option (PASS+skip when file exists); stopRecording in-progress guard | 0d0e282f, d3ee9eda | record.js | M |
| 41 | 2022-10-03 | record | doc-detective | `.webm` support + `height` resize (formats `[.mp4,.webm,.gif]`); deprecated `gifFps`/`gifWidth`→`fps`/`width` fallback; default filename `${uuid}.mp4` | 6abaca60, ad3278b5 | startRecording payload | M |
| 42 | 2022-10-04 | record | doc-detective | Failed-test recording: defaults `saveFailedTestRecordings`(true)/`failedTestDirectory`, env vars, baseline auto-record, test-level overrides, `<id>-<ts>.mp4`, deleted on pass; FPS floor 30 | 5dbe360d, d422ae14, c7aed407, 5d62d84d, 344474ad | tests.js gates startRecording on save flag; targetFps re-encode | M |
| 43 | 2022-10-04 | config | doc-detective | fileType statement keys renamed `open/closeTestStatement`→`actionStatementOpen/Close`; add test start/end statement concept + parsing | d06fcc0c, 21a8e7eb, 17acc84f | `config.json` key renames; `parseTests` start/end parsing | M |
| 44 | 2022-10-05 | resolve | doc-detective | Config resolution `defaultConfig` fallback tier (precedence argv > env > config > defaultConfig) | 7ec6865a | setEnv/Input/Output/Setup/Cleanup append `|| defaultConfig.X` | M |
| 45 | 2022-10-07 | runner | doc-detective | Browser page created only for GUI tests via `browserActions` allowlist; `moveMouse`/`scroll` skip (PASS) when no recording active | d7d33fb6, f3e35adb | tests.js `browserActions[]`; moveMouse/scroll early-return PASS | M |
| 46 | 2022-10-10 | config | doc-detective | File-download support: `downloadDirectory` config + `--downloadDir` flag; `Page.setDownloadBehavior allow` | 82ceda6f | `config.json`; `setDownloadDirectory` | M |
| 47 | 2022-10-13 | report | doc-detective | Coverage-analysis feature: `coverage.js`, `coverage` export + `cli/coverage.js` + `npm run coverage`, `coverageOutput` config/CLI/env; multi-line/array markup matching | da2fdba, 030f231, 8efab8d (PR #9) | coverage.js; `coverageOutput` | M |
| 48 | 2022-10-17 | config | doc-detective | Content-coverage markup config: `fileType.markup{}` (onscreenText/hyperlink/lists/codeBlock/interaction regex arrays) + `testIgnoreStatement`; per-markup `includeInCoverage`/`includeInSuggestions` | fb3dcca5, 1ff77c07, f136afa3 (PR #9) | `markup{}` block in config | M |
| 49 | 2022-10-19 | step | doc-detective | `moveMouse` default `alignH/alignV:"center"`, `offsetX/Y:0`; `find` always runs the `wait` sub-action (synthesizes `wait={}`) | 61c5db68, 9a3285b7 | moveMouse defaults; `if undefined action.wait={}` | M |
| 50 | 2022-10-24 | resolve | doc-detective | `suggest` CLI command: `npm run suggest`, `cli/suggest.js`, `testSuggestionOutput` config; intent detection + builders write sidecar test files | 9f3240d3, f6be91d5 (PR #12) | `src/lib/suggest.js`; `testSuggestionOutput` | M |
| 51 | 2022-10-24 | runner | doc-detective | Browser pages opened in incognito context by default; analytics globally disabled (`sendAnalytics` commented out) | 900347f7, 745d0b4b, 0eb8c6b1 | `createIncognitoBrowserContext`; `// sendAnalytics` | M |
| 52 | 2022-10-25 | config | doc-detective | Env-var parsing rewrite: `loadEnvs` resolves `$VAR` inside sub-strings (not just whole-value); string-or-object | 42aacdd5 | `loadEnvs`/`loadEnvsForString` in utils.js | L |
| 53 | 2022-10-25 | step | doc-detective | httpRequest `envsFromResponseData` (array of `{name,jqFilter}` via node-jq) | 499b4934 (PR #13) | envsFromResponseData handling | M |
| 54 | 2022-11-08 | step | doc-detective | httpRequest rename `headers`→`requestHeaders`, `params`→`requestParams` (old names kept as fallback); runners return report values to callers | 3da8a767, 30c3249f (PR #14) | defaultPayload + fallback `loadEnvs(requestHeaders)||loadEnvs(headers)` | M |

### 2023

| Seq | Date | Theme | Repo(s) | Decision | Source (hash/PR#) | Evidence | C |
|----|------|-------|---------|----------|--------|----------|---|
| 55 | 2023-01-26 | schema | common | First step-type schema shape: `action` enum, `additionalProperties:false`, `required`; adopt JSON-Schema **draft 2020-12** | common `fd19d0fc`,`c580937b` | runShell.schema.json; `$schema` draft-2020-12 | H |
| 56 | 2023-01-27 | schema | common | `analytics_v1` telemetry payload: `detailLevel` enum (run/tests/action-simple/action-detailed), tests/actions counters | common `40444178`,`f9e6b879` | analytics.schema.json | H |
| 57 | 2023-01-29 | runner | doc-detective | **v1→v2 split**: delete the bundled engine (`src/lib/*`, all action impls, 215-line `src/config.json`, 1084-line `utils.js`); repo becomes a thin wrapper requiring `doc-detective-core`; strip runtime deps | doc-detective `6b277e95`,`dd61edc2`,`44d58fb3`,`ec163278` | mass deletion + `require("doc-detective-core")` | M |
| 58 | 2023-01-30 | schema | common | Core v1 action vocabulary: 13 step schemas (checkLink/click/find/goTo/httpRequest/matchText/moveMouse/screenshot/scroll/start+stopRecording/type/wait); button + method enums | common `b9e3a6b6` | per-action *.schema.json | H |
| 59 | 2023-01-31 | validation | common | Adopt **AJV**; `examples` become contract fixtures (must self-validate); `validate(schemaKey,object)` API | common `5641f5fc`,`83e02223` | validate() | H |
| 60 | 2023-02-01 | schema | common | Dynamic loader builds schema map from `*.schema.json` filenames; `<name>_v<n>` flat naming; dynamic `$id`=`file://…` + relative-`$ref` rewrite | common `ada73318`,`6b9b8d62`,`dde6be9c`,`f79ce35d`,`a13ba446` | loader | H |
| 61 | 2023-02-04 | schema | common | `test_v1` testObject: `tests[]` container, each `actions[]` is `oneOf` `$ref` to every v1 step — the spec-file contract | common `d7dca149` | test_v1 | H |
| 62 | 2023-02-09 | engine | core | Adopt **Appium/WebdriverIO** drivers for Chrome+Firefox; runner lifecycle = in-process Appium → poll `/sessions` → `wdio.remote` → deleteSession (Puppeteer→Appium pivot) | core `9968861f`,`f8a5b3f7`,`bac9ef13` | driver lifecycle | H |
| 63 | 2023-02-20 | validation | common | AJV `useDefaults:true` (mutating), `coerceTypes:true`, ajv-formats/keywords/errors, `allErrors`, dynamic `uuid` default for step ids | common `76d145c4`,`a19b2e9c`,`e1e3293b` | AJV opts | M |
| 64 | 2023-02-21 | schema | common | `config_v1` config-file contract: input/setup/cleanup, recursive, output, testExtensions, fileTypes markup, browser headless/path/dims, analytics | common `6f8ad104` | config_v1 | H |
| 65 | 2023-02-28 | engine | core | spec/test `contexts` = `{application, platforms[]}`; runner computes platform+arch, skips test when no context matches; app supported only if installed AND platform matches | core `9c6ce82d`,`01cc3fd9`,`8f51b195` | context gating | M |
| 66 | 2023-03-04 | runner | core | `runStep` keyed on `step.action`; standard `{status,description}`; unknown action → FAIL; result roll-up FAIL>WARNING>PASS across step→context→test→spec; Appium warm-up gated by `isAppiumRequired` | core `db3d7108`,`0ae5d767`,`3f7d1ad4` | dispatch + rollup | H |
| 67 | 2023-03-05 | schema | common | v2 step era begins: `action` enum→**`const`**, add inline `id`(uuid)/`description`, `dynamicDefaults.id`, `transform:["trim"]` | common `0ef47719`,`92aa4e94` | goTo_v2, runShell_v2 | H |
| 68 | 2023-03-10 | step | core+common | Per-action handlers validate `*_v2`, `loadEnvs(step)`, auto-prepend `https://`; runShell spawnCommand FAIL on exitCode/stderr; httpRequest axios+node-jq; checkLink/httpRequest schema (statusCodes default [200], method +put) | core `658dc629`,`891ebe9e`,`69b00b2f`,`19aab6f9`; common `c796d8a9`,`aeed490a`,`572dce0` | v2 handlers | H |
| 69 | 2023-03-13 | schema | common | v2 family merge (PR#3): checkLink/goTo/httpRequest/runShell; `find` `wait{duration}`→flat `timeout` (default 500), `moveMouse`→`moveTo` bool, matchText→plain string | common `fc675f1`,`3cd919e`,`001ec85`,`19f48bc4` | v2 family | H |
| 70 | 2023-03-13 | step | core | `find` gains inline `click`/`moveTo`/`typeKeys` sub-actions; standalone matchText/click/type/scroll/moveMouse removed; matchText folds into find | core `6231c95f`,`e78421d`,`c59506b` | find redesign | H |
| 71 | 2023-03-14 | step | common+core | Authored typeKeys_v2, wait_v2, saveScreenshot_v2, setVariables_v2, startRecording_v2; core wires wait/typeKeys/saveScreenshot/setVariables handlers; `config.mediaDirectory="."` default | common `8edb3a4`,`754a611`,`4b78396`,`ada5323`,`a434506`; core `b82f30a`,`6288cf8`,`3dc4d32` | new v2 steps | M |
| 72 | 2023-03-17 | record | core | startRecording/stopRecording + OBS-websocket path scaffolded then disabled/commented; recording actions stubbed out of driverActions (OBS never shipped) | core `71796d2`,`42e9f88`,`648a094`,`16aa1b9` | OBS stub | M |
| 73 | 2023-03-22 | schema | common | `context_v2` (app/platform sets), `test_v2`, `spec_v2` container; `strictSchema:false` so external `$ref` in anyOf validates | common `2806f51`,`86af251`,`1977b54`,`45708f3` | context/test/spec v2 | H |
| 74 | 2023-03-26 | schema | common | `config_v2` (532L) lands; required fileType/markup/telemetry fields; defaults input/output="."/recursive=true; `$ref` drop `file://` prefix | common `846c852`,`012ebe8`,`f89a167`,`120c5c0` | config_v2 | H |
| 75 | 2023-03-31 | config | core | Config/runner rewrite: removed legacy utils.js config-validation + analytics.js (telemetry dropped); new `setConfig()` validates config_v2 (exit 1), detects environment; `test()`→`runTests()`; env-var support | core `11d97dd`,`ffb0750`,`75af7fa` | setConfig/runTests | H |
| 76 | 2023-04-02 | schema | common | Add `file` string to spec & test (source path association) | common `20d8b6b` | spec/test `file` | H |
| 77 | 2023-04-03 | engine | core | `getAvailableApps` returns `{name,path}[]`; Chrome/Chromium detect (disabled, Firefox-only auto-install this era); coverage/suggest entrypoints hard-block exit(1) | core `d13c7e9`,`5121b2b`,`47436755` | app detection | M |
| 78 | 2023-04-07 | schema | common | `src_schemas/`(authored)→`output_schemas/`(dereferenced) split; `dereferenceSchemas.js` preprocessing; runtime consumes deref'd; later strips `$id` | common `6431916`,`d2410d4`,`c9906fc`,`632c593` | deref pipeline | H |
| 79 | 2023-04-09 | runner | core | Each step gets uuid if no `id`; `getDefaultContexts()` from runTests.contexts filtered by support, fallback ["chrome","firefox"] | core `2f84a47`,`652457f` | identity/contexts | H |
| 80 | 2023-04-14 | config | doc-detective | **v2 CLI/config contract**: `setArgs()` declares `--config/-c`, `--input/-i`, `--output/-o`, `--setup`, `--cleanup`, `--recursive/-r`, `--logLevel/-l`; `setConfig()` AJV-validates **`config_v2`**, exits(1), overlays flag overrides; `outputResults()` writes `testResults-<ts>.json` | doc-detective `61bebeb4`,`18f5921a`,`d7b45e19` (npm scripts collapse `01ef13f9`) | src/utils.js; src/runTests.js | M |
| 81 | 2023-04-15 | schema | common | `config.fileTypes` default Markdown def (.md/.mdx) with markup→action map (onscreenText→find, image/hyperlink→checkLink/goTo); default timeouts 500→5000ms | common `24999`,`fe9c03b`,`5305fdb`,`56deeeb` | default Markdown fileType | H |
| 82 | 2023-04-21 | runner | core | Appium spawned as child process (`spawn`, tree-kill); source-vs-module path detection; `spawnCommand` `{shell:true,windowsHide:true}` | core `b1551734`,`2b6a3b95`,`04adc5bc` | Appium spawn | M |
| 83 | 2023-05-01 | install | core | postinstall re-enables Appium driver deps; installs gecko+chromium drivers if absent; `inContainer()` helper (IN_CONTAINER env or /proc cgroup) | core `b2b460b5`,`6a127c34`,`d9460eba` | driver auto-install. Wrapper delegates to this postinstall 2023-07-28 (`c187cbe2`,`725d2897`) | H |
| 84 | 2023-05-10 | runner | core | `coverage()` stub → real `runCoverage()`: line-coverage `checkTestCoverage`/`checkMarkupCoverage`, remote-ID matching | core `b6919f6d`,`b76400c5`,`369dfc0a` | runCoverage. Wrapper `runCoverage` CLI entrypoint 2023-06-06 (`a9b234c1`) | H |
| 85 | 2023-06-03 | engine | core | Chrome/Chromium detection enabled in getAvailableApps; version-matched chromedriver installed + tracked as its own app; `appium:executable` cap | core `2e427314`,`9c93993e`,`b19a6c50` | Chrome+chromedriver | H |
| 86 | 2023-06-09 | runner | core | `suggest()` stub → real `suggestTests()`: runCoverage then `getSuggestions`; intent model; per-action builders; skip list items | core `c7f3caf4`,`360787c8`,`2a93d1b8` | suggestTests. Wrapper `suggestTests` CLI entrypoint 2023-06-25 (`b354eddf`) | M |
| 87 | 2023-07-24 | runner | doc-detective | **v2.0.0 release**: restructure to `src/` (`runTests.js`/`runCoverage.js`/`suggestTests.js`/`utils.js`); new `fileTypes`/markup sample config; Jekyll docs + old cli/sample removed | doc-detective `95e3c848` | 46-file restructure | M |
| 88 | 2023-07-21 | docker | docker | **Base image contract**: `FROM ubuntu:20.04`→`24.04`→`node:23-slim`; Chrome + Node; `doc-detective` global; `ENV CONTAINER=true`; `ENTRYPOINT ["npx","doc-detective"]`; `ARG DOC_DETECTIVE_VERSION`; license MIT→AGPL-3.0 | docker `0289de4`,`807f70c`,`fad250f`,`f781751` | Dockerfile. (Monorepo also introduces a multiarch build 2023-08-20 `f962d5c5`) | H |
| 89 | 2023-08-24 | schema | common | Drop `format:uri`, widen URL `pattern` to allow `$ENV` refs; in-file `$ref` → local `#/definitions/…`; deref removes `$id` | common `ec5b192`,`aeb0ec1`,`632c593` | $ENV URLs | H |
| 90 | 2023-09-08 | schema | common | Default markup moved onto setup/cleanup `markup`; drop defaults from input/recursive/markupToInclude | common `b0d33a7` | config default reshuffle | H |
| 91 | 2023-09-08 | engine | core+common | Per-context browser `app.options` width(1200)/height(800)/headless(true); wired into Firefox/Chrome driver args; schema adds `app.options` | core `076982d5`; common `7f99cba`,`e593fee` | app.options | H |
| 92 | 2023-09-11 | engine | core | `isDriverRequired` — driver started only if test has contexts or a step uses a driverAction; arch via os.arch() | core `11da5c8d`,`85f768bf` | per-test driver gating | H |
| 93 | 2023-10-11 | schema | common+core | Test-level string `setup`/`cleanup` (spec run before/after, steps prepended/appended + re-validate); `detectSteps` boolean (default true) | common `537855c`,`a40e5ee`; core `6e330c03`,`2b327d8f` | setup/cleanup + detectSteps | H |
| 94 | 2023-10-20 | schema | common+core | Markup `actions[]` as `{name,params}` objects + action enum; runner auto-generates tests from markup regex (find→aria, goTo/checkLink→url, typeKeys→keys), `detectSteps:false` skip, testIgnore | common `eaecc43`,`2010fd5`; core `27e69c3d`,`883e35d9`,`48e2456f`,`e98c0ba5` | markup auto-detect engine | H |
| 95 | 2023-10-23 | schema | common+core | goTo/checkLink `url` pattern gains leading-`/` relative support; `hostname`→renamed `origin` (prepended to url); checkLink default statusCodes [200]→[200,201,202] | common `c21275c`,`254ed5b`,`6ee7bfc`; core `bf0a0023`,`950391b0` | relative URL + origin | H |
| 96 | 2023-10-26 | schema | common+core | `saveScreenshot.directory` (auto-created); `path` relative-to-directory; visual-diff `maxVariation`(0-100) + `overwrite` enum true/false/byVariation; runner pixel-diff via pixelmatch/pngjs | common `25414d3`,`46ff084`,`207593a`,`ecb3d3d`; core `10953bac`,`d60b67a` | saveScreenshot dir + visual diff | H |
| 97 | 2023-10-27 | report | core | saveScreenshot/recording skip status canonicalized `SKIP`→`SKIPPED` verdict string | core `1a7b309`,`c4f03130` | SKIP→SKIPPED | H |
| 98 | 2023-11-02 | step | core | Auto-detect uses only first action per markup rule; multiple steps on a line ordered by `line.indexOf(match)`; post-collection validate-filter | core `996114`,`796667` | markup ordering | M |
| 99 | 2023-12-14 | schema | common | `stopRecording_v2` action; standalone `moveTo` action (selector, alignment enum, offset, duration 500); `find.moveTo` bool→object; start/stopRecording in test steps union | common `aef6d5f`,`f842cda` | stopRecording + moveTo | H |
| 100 | 2023-12-16 | record | core | Recording pivots OBS→**FFmpeg**: gdigrab desktop capture cropped to browser viewport (devicePixelRatio, even rounding); Firefox/headless SKIP guards; `moveTo` in-page cursor overlay (recording-only) | core `a8ccba`,`911d3f`,`c1b16e`,`e8fb05`,`0b2b78`,`ad15d66` | OBS→FFmpeg | H |

### 2024

| Seq | Date | Theme | Repo(s) | Decision | Source (hash/PR#) | Evidence | C |
|----|------|-------|---------|----------|--------|----------|---|
| 101 | 2024-01-03 | config | core | `setConfig` derives runTests.downloadDirectory & mediaDirectory (fallback ?.output ?? config.output); stopRecording waits for download then FFmpeg-converts (yuv420p) | core `ac76f88`,`f480075`,`33bb083` | media/download dirs | H |
| 102 | 2024-01-10 | schema | common | startRecording drops `fps`, adds `directory`+`overwrite`(false), path lowercase-ext-only; typeKeys `delay`(100, recording-only); find.moveTo/click default false | common `1560a01`,`b16347b`,`2a6ac4c`,`dcbe568`,`91590cb` | startRecording rework | H |
| 103 | 2024-01-10 | step | core | When recording, typeKeys splits into single chars typed with setTimeout(step.delay); else all at once | core `1ac361` | per-keystroke delay | H |
| 104 | 2024-01-19 | config | doc-detective | `--output` arg also maps to `config.runTests.output` and triggers runTests-object creation | doc-detective `48a350db` | `setConfig` `config.runTests.output = args.output` | M |
| 105 | 2024-01-22 | engine | core+common | Safari driver support (mac CFBundle detect, automationName Safari); browser detection `@eyeo/get-browser-binary`→`@puppeteer/browsers`; OBS code retired; schema browser enum narrowed to chrome/firefox/safari + `driverPath` | core `25e1c6`,`fd7535`,`e5a8f16`,`1a914a`; common `1f1850f`,`69360255`,`a44fd49` | Safari + detection rewrite | H |
| 106 | 2024-01-31 | engine | core | Microsoft Edge browser engine; chromedriver folded into chrome/edge app as `driver`; recording restricted to `chrome` only (drop chromium/edge) | core `61b50800` | Edge + recording chrome-only | H |
| 107 | 2024-02-08 | report | core | Step report spreads full stepResult (status→result, description→resultDescription) so extra fields flow; context-fail reads `step.result==="FAIL"`; runShell stops failing on stderr (only exitCode) | core `039c0353`,`300a592` | step shape + verdict fix | H |
| 108 | 2024-03-08 | config | doc-detective | `doc-detective` CLI bin with `runTests`/`runCoverage` subcommand dispatch; `src/index.js` `main(argv)` switch; outputDir from `runTests.output`/`runCoverage.output` ‖ `output`; writes `${type}-${Date.now()}.json` | doc-detective `2a46f67c`…`21b3e78d` | `package.json` `bin:{doc-detective}` | M |
| 109 | 2024-03-15 | schema | common | AsciiDoc fileType; Markdown +`.markdown`; **`detectSteps` default true→false** (step detection now opt-in); HTML/XML fileType | common `a33d272`,`a6d80a1`,`9d6029d`,`e89cd0d` | AsciiDoc + detectSteps flip | H |
| 110 | 2024-03-16 | schema | common+core | runShell `exitCodes`(default [0]), `output`/`stdio` expectation (literal or `/regex/`), `setVariables`→env from output; find.setVariables (env from element text) | common `1ea040a`,`370dac7`,`9c96fde`,`4bcd256`; core `2a65d013`,`37d86cee` | runShell exitCodes/output | H |
| 111 | 2024-03-29 | doc-detective | doc-detective | Auto-load `.doc-detective.json` from CWD then overlay CLI args (precedence file → args) | doc-detective `0602caa7` | `fs.existsSync(.doc-detective.json)` → `setConfig` | M |
| 112 | 2024-03-29 | telemetry | core+common | Anonymous PostHog telemetry `src/telem.js` (runTests/runCoverage events, system/dist meta, opt-out via `telemetry.send===false`); schema `telemetry.send` default false→**true** (opt-out) + defaultCommand enum | core `aa6e96fb`; common `1ad91c0`,`7c3e925` | telem.js. Wrapper `setMeta()` populates `DOC_DETECTIVE_META` 2024-03-30 (`a43c3be3`,`09bd1d22`) | H |
| 113 | 2024-03-29 | record | core | Don't unlink recording when targetPath===downloadPath (would delete artifact) | core `af62d1ad`,`31e9eb79`,`7dbc8d46` | post-process guard | H |
| 114 | 2024-03-29 | resolve | core | `loadEnvs` rewritten: recursive in-place `$VAR` walk; whole-string match → object substitution; drops unconditional JSON.parse coercion | core `7a9e3c84` | loadEnvs semantics | H |
| 115 | 2024-03-30 | config | doc-detective | Interactive command picker (prompt-sync) when no/invalid command; unrecognized command `exit(1)`; `config.defaultCommand` fallback (removed in 3.0.0, Seq 144) | doc-detective `226c360f`,`da8ec02c` | prompt-sync `prompt()`; `defaultCommand` | L |
| 116 | 2024-04-16 | engine | core | Default browser fallback order → `["firefox","chrome","safari","edge"]` (was chromium-first); only first available app selected | core `054ee6ae`,`4b7434` | Firefox-first fallback | H |
| 117 | 2024-04-22 | engine | core | App availability gated on installed Appium driver; Appium invocation → `npx appium`; browserName caps fixed (edge→MicrosoftEdge); recording gated headed-chrome; mac platformName remap removed | core `b43787`,`190fbd`,`ae6990`,`b9e346`,`46430f` | driver-availability gating | H |
| 118 | 2024-05-03 | resolve | core | Sources starting `http` fetched via axios, md5-hashed into os.tmpdir, used as local source; `cleanTemp()` after run; later tightened to http(s):// only | core `ba7317`,`70e292`,`4ded9e` | remote test fetching | H |
| 119 | 2024-05-03 | resolve | common+core | Markup detect rewritten for multi-regex `matchAll` + built-in actionMap with `$n` capture-group substitution; schema markup actions accept bare-name OR full step-def `$ref` | core `3dc533`; common `a07d6da`,`0a5b4e8`,`0cea515` | capture-group substitution | H |
| 120 | 2024-06-12 | schema | common | httpRequest `responseParams` marked Deprecated; non-standard `deprecated:true` keyword removed (AJV ignores it), intent kept in description | common `20d3b29`,`a4cd3b5` | deprecate responseParams | H |
| 121 | 2024-06-21 | schema | common | Re-introduce full-step `$ref` shapes in markup `actions`; `navigationLink` regex→goTo; hyperlink→checkLink only; drop default actions from emphasis/codeInline/codeBlock | common `209e5b77` | multi-action detectSteps re-land | H |
| 122 | 2024-06-26 | record | doc-detective | Bundle `@ffmpeg-installer/ffmpeg` at the wrapper level (recording without system ffmpeg) | doc-detective `f764c49a` | `package.json` dep | M |
| 123 | 2024-06-29 | schema | common+core | runShell/httpRequest `timeout`(60000); `savePath`/`saveDirectory`/`maxVariation`/`overwrite` output-save with Levenshtein variation diff; `allowAdditionalFields`(true) strict response matching; `workingDirectory`(".") | common `d196a560`,`da53d5b2`,`dbf80a01`,`a09a3fea`,`8a3ac5cd`; core `4bf886`,`1e4a1c`,`19c72d`,`95426e23`,`e2c48af0`,`4a15af63` | timeouts + output-save/diff | H |
| 124 | 2024-06-29 | resolve | core | Duplicate declared test `id` rewritten to `${id}-${uuid}` so they no longer collide | core `8e7187e4` | de-dup | H |
| 125 | 2024-07-11 | report | doc-detective | `outputResults()` accepts a `.json` file path OR a directory; file → auto-increment `-N.json` on collision; recursive mkdir | doc-detective `2cf919b7` | `outputResults` rework | M |
| 126 | 2024-07-12 | engine | core | GH-Actions display handling → generic headless-retry: if driverStart throws, retry once with headless=true, else SKIPPED; `--no-sandbox` for containers | core `29edc94f`,`67152362`,`296927a6` | headless retry fallback | M |
| 127 | 2024-07-24 | schema | common+core | Config `relativePathBase` (enum cwd/file, default cwd); public `resolvePaths(config,object,file,…)` export; `validate()` returns `result.object`; setup/cleanup resolved relative to file | common `67afcc58`,`74dcd63f`,`f44268e8`; core `e81f9da9`,`a657675b`,`4a15af63` | relativePathBase + resolvePaths. Wrapper async `setConfig`+`resolvePaths(configPath)` 2024-07-26 (`a1e8e03`,`e29b082`) | H |
| 128 | 2024-08-01 | record | core | Default step-recording filename ext `.webm`→`.mp4` when path unset (changes output container) | core `e1fd1d97` | default ext | H |
| 129 | 2024-08-08 | step | core | runShell/spawnCommand runs everything through a shell (`bash -c`/`cmd /c`) instead of arg-splitting — enables pipes/redirects | core `79003c4` | spawnCommand via shell | H |
| 130 | 2024-08-09 | resolve | core | test-level `detectSteps` overrides config-level (test false always skips); deep-clone action per match to prevent shared-reference corruption | core `e8063e5`,`f790038` | detectSteps precedence | H |
| 131 | 2024-08-26 | schema | common+core | saveScreenshot `crop` object: `{selector(required), padding}`; runner crops to element bounding rect via sharp + devicePixelRatio | common `d8fc52c6`; core `8ba7f87`,`15411b8`,`38505fb` | selector-based crop | H |
| 132 | 2024-09-04 | integrations | common+core | **OpenAPI for httpRequest**: schema `openApi` object + top-level `oneOf[url, openApi]` + config `integrations.openApi[]`; core `src/openapi.js` operation engine (example seeding, schema validation, mock-response, YAML defs); spec/test openApi arrays; `definitionPath`→`descriptionPath` | common `30e9b7df`,`2edf0919`,`a3e2ffc7`,`a8305d89`,`f85089aa`,`b4f2525c`,`8fe87a84`,`c90e3598`; core `47466440`,`c18bf49`,`74fa0fb`,`4a81d2a`,`c33731a`,`d4287474` | OpenAPI. (Monorepo openapi series is dep-bumps only) | H |
| 133 | 2024-09-05 | validation | common | AJV `allowUnionTypes:true` so union-type fields (openApi examples) validate | common `ffb61141` | allowUnionTypes | H |
| 134 | 2024-09-20 | validation | common | `validate(schemaKey,object,addDefaults=true)`: "Schema not found" instead of crash; addDefaults=false deep-clones to avoid mutation; `readFile()` loader (JSON/YAML/remote via axios) | common `0b525780`,`52f5e24a`,`381be266` | missing-schema guard | H |
| 135 | 2024-09-28 | integrations | core | **Arazzo support**: `src/arazzo.js` translates Arazzo 1.0 → Doc Detective spec (workflows→tests, steps→httpRequest, sourceDescriptions→openApi[]); OpenAPI resolution reordered before validation; negative-test 4xx/5xx no longer auto-FAIL | core `d900af7`,`556a04a`,`a84a616`,`d0cbf2b`,`379b729` | arazzo.js | H |
| 136 | 2024-10-24 | runner | doc-detective | Pre-run dependency check (`src/checkDependencies.js`): inside the repo with no `node_modules`, prompt to `npm install` (readline) or abort; handle missing/unparseable package.json | doc-detective `a630b3d`…`0728668` (PR #98) | checkDependencies | M |

### 2025

| Seq | Date | Theme | Repo(s) | Decision | Source (hash/PR#) | Evidence | C |
|----|------|-------|---------|----------|--------|----------|---|
| 137 | 2025-01-18 | schema | common | find_v2 `click.button` field (left/right/middle); context_v2 viewport width/height | common `e76cfdcd`,`04338977` | find click button + viewport | H |
| 138 | 2025-01-20 | step | common+core | New `runCode` action: language enum (python/bash/javascript), code→temp script, interpreter dispatch, exitCodes; wired into runStep; viewport sizing resize; `wdio:enforceWebDriverClassic`; crop scrolls into view | common `65ee3f5f`,`cf9d95dc`,`41048407`; core `54c4010`,`9666276`,`25468b8`,`0484726`,`26cb7a8`,`b3d113f` | runCode | H |
| 139 | 2025-02-07 | schema | common | **v3 action-as-key redesign**: `step_v3` — action IS the key (no `action` field), `anyOf` requires exactly one action key; `stepId` replaces `id`; first v3 actions checkLink/goTo/runShell/type; `outputs`/`variables` patternProperties; AJV 8.17.1, v3.0.0-dev | common `d4deb0fe`,`d2dbaaf6`,`61e6d1a4`,`7603167a`,`5555154a`,`a568869f`,`bba8e199`,`d8411ae0` | step_v3. Runner side Seq 142; resolver detection Seq 156; wrapper flip Seq 144 | H |
| 140 | 2025-02-07 | validation | common | **`transformToSchemaKey` v2→v3 engine**: `validate({schemaKey,object,addDefaults})`; `transformToSchemaKey` + `supportedTransformations`/`compatibleSchemas` mapping v2 steps → v3 action-key shape (`id→stepId`, setVariables→variables, byVariation→aboveVariation) | common `48a72a1e`,`bba8e199`,`88c74335`,`5259530e` | auto-transform. Public const `bba8e199` (2025-02-08); exported `e84666d` (2025-03-17) | H |
| 141 | 2025-03-06 | schema | common | v3 action-key schemas: endRecord→stopRecord, screenshot (maxVariation 0–1 default 0.05), record, loadVariables, find/click, httpRequest_v3, openApi_v3, context_v3, test/spec/report_v3; statusCodes default [200,301,302,307,308] | common `2330f7f`,`6e81b39`,`0dd383e`,`3edb971`,`f2b1fd3`,`c9b8859`,`066f35f`,`4063380`,`245c792`,`3c429f0`,`84fb2f5` | v3 family | H |
| 142 | 2025-03-10 | schema | common | **context_v2→v3 restructure**: new `context_v3` platforms/browsers + v2→v3 conversion in validate | common `066f35f` | context_v3 | H |
| 143 | 2025-03-11 | schema | common | **config_v2→v3**: new `config_v3` (input, fileTypes anyOf string/object, inlineStatements, integrations); `configId` uuid; draft-07; remove markupToInclude; markup stays array | common `6e20b59`,`42f9d06`,`c10f727`,`6d522a3`,`a36fe84`,`16b978e`,`c7760db` | config_v3 | H |
| 144 | 2025-03-12 | config | core | **runner v3 adoption**: config_v2→v3 (`validate({schemaKey:"config_v3"})`, beforeAny/afterAll, drop legacy runTests block); action rename setVariables→loadVariables; env helpers loadEnvs/replaceEnvs split; envVariables→loadVariables config key | core `3ef45157`,`a44e89e`,`eee1170`,`84602e5`,`1f6a497`,`543e54f`,`e0632163` | v3 runner. Full v3 schema family release (common PR #105) `33aa165`,`7dced13`,`e4f1bcf` | H |
| 145 | 2025-03-13 | resolve | core | isValidSourceFile `spec_v2`→`spec_v3`; test `setup`/`cleanup`→`before`/`after`; allowedExtensions ".json"→"json"; object-arg resolvePaths; defaultFileTypes (markdown) with inlineStatements regexes; `parseContent` matchAll engine; `$n` substitution; spec keys id/file→specId/contentPath | core `367a701`,`7bbacda`,`e857b37`,`736b599`,`11ba3e2`,`d31daf1`,`c1682b0`,`05162740`,`e2d8d14`,`d4a451d` | v3 spec/test resolution | H |
| 146 | 2025-03-23 | schema | common | **context browsers redesign**: context replaces per-browser chrome/firefox/safari keys with unified `browsers` array; `browserName` enum [chrome,firefox,safari,webkit] (safari≡webkit); browser requires `name`; `contextId` uuid | common `5383e68`,`54344fb`,`86dff292`,`07827f09` | browsers array | H |
| 147 | 2025-03-24 | engine | core | `driverActions` redefined to v3 action-as-key set; appium-required tests `step[action]`; default contexts from `config.runOn`; `resolveContexts` expands runOn into platform×browser; Safari→webkit; goTo/wait actions to v3 | core `a0f4915`,`3710089`,`8ce90ab`,`8c533f4`,`bde92de` | v3 driverActions + resolveContexts | H |
| 148 | 2025-03-26 | report | core | getDriverCapabilities/isDriverRequired object-arg + flattened context; viewport from context.browser.viewport; step id key `id`→`stepId`; report objects rebuilt fresh; unknown action → FAIL | core `8c17e59`,`97a043c`,`fdea584`,`02a6df6`,`3a44c981`,`25e3fb81` | v3 object-arg + stepId | H |
| 149 | 2025-03-27 | step | core | Action handlers migrated to object-keyed `step.<action>` dispatch, destructured `{config,step,driver}`, `step_v3` validation, string/bool shorthand; per-step `variables` from outputs→process.env; goTo string shorthand + protocol/origin; checkLink default statusCodes [200,301,302,307,308] | core `b430e99d`,`98965be1`,`d00d08cb`,`94a887a7`,`f168ba61`,`535fa08a` | v3 action handlers | H |
| 150 | 2025-03-28 | step | core | httpRequest nested `request.{params,headers,body}` & `response.{headers,body}`; `actualResponse`; body type-match; headers lowercased; maxVariation as %; mock via openApi.mockResponse; allowAdditionalFields default true. Plus `isRelativeUrl()` (relative URL w/o origin FAILs) | core `8692728a`,`15273ef2`,`eaaf14ab`,`30774eb3` | httpRequest v3 rewrite | H |
| 151 | 2025-04-01 | resolve | core+common | Unified common `readFile` (JSON+YAML); isValidSourceFile validates JSON **and YAML** against spec_v3; allowedExtensions +yaml/yml; `parseObject`; markdown inline regexes widened multiline | core `5c75c9ef`,`9c854c4f`,`11f3e3c4` | YAML test specs | H |
| 152 | 2025-04-03 | step | core | find string shorthand (selector-or-text probe), combined selector+text match, defaults (timeout 5000, moveTo/click/type false), removed find-level setVariables, nested sub-steps, `outputs.element`; moveTo ungated from recording; crop delegates to findElement; new `click` action | core `32b5ce9e`,`d1a1efb1`,`b4c43c9d`,`79ecdf1e` | find overhaul | H |
| 153 | 2025-04-08 | record | core | startRecording/stopRecording → `step.record` object; headless check context.browser.headless; engine gate chrome; download→os.tmpdir; auto-stop injects synthetic stopRecord; recording key recording→record | core `68198f21`,`b7e1853d`,`3a44c981` | v3 record/stopRecord | H |
| 154 | 2025-04-10 | engine | core | Dropped Edge browser caps; Chrome caps simplified (browserName forced chrome); removed unconditional --no-sandbox. Plus `runCoverage`/`suggestTests` **removed** from test surface (analysis.js/suggest.js, -943 lines) | core `0ef0f10d`,`12dd65e0`,`177f8102`,`9f426e6` | drop Edge + remove coverage/suggest | H |
| 155 | 2025-04-12 | step | core | New `src/expressions.js`: resolves `{{…}}`/standalone expressions over meta values, `jq` (jq-web), JSONPath (jsonpath-plus), regex `extract`; node-jq→jq-web; array-index access; embedded-expr await fix | core `2dd868be`,`8299f1f2`,`c71bdb21`,`02b46089` | expressions runtime | H |
| 156 | 2025-04-13 | report | core | **Unified `outputs` object**: step results restructured (runShell exitCode/stdio, httpRequest outputs.response w/ statusCode); `metaValues` tree threaded into runStep for expression context; element outputs pruned to {text} | core `0df134cb`,`5de8d2cc`,`535fa08a`,`1118129f` | unified outputs. Plus v2→v3 expression migration (common `2902138a`,`0feb35b1`,`e030315b`,`31b76334`) | H |
| 157 | 2025-04-14 | report | core | goTo waits for document.readyState=complete (default 15000); timeout → result **WARNING** (third verdict state) not FAIL | core `dcec4374` | goTo timeout → WARNING | H |
| 158 | 2025-04-15 | step | core | find/click treat `/…/` as regex via `findElementByRegex` (scans all elements, foundBy:"regex"); text filter accepts regex | core `cdf7dfe9` | regex element matching | H |
| 159 | 2025-04-17 | config | core | Markdown statements test/test-end wording + MDX/JSX `{/* test */}` and `[comment]: # (test)` styles; new AsciiDoc (asciidoc_1_0) + HTML (html_1_0) default fileTypes | core `89dbc12b`,`f2e6f30d` | default fileType inline overhaul | H |
| 160 | 2025-04-18 | schema | common | v3 click/find/screenshot refinements: click requires selector OR elementText (anyOf); find root-level anyOf string/object; type inputDelay 100; screenshot path shorthand + additionalProperties:false; checkLink URL pattern anchored; openApi requires descriptionPath OR operationId. Full per-action `*_v3` family materialized (PR #106/#108) | common `cfb72661`,`7a45da78`,`75cee469`,`1a97bbe5`,`32f75e82`,`2235525f`,`9e8771d6`,`d198351e` | v3 refinements | H |
| 161 | 2025-04-18 | config | doc-detective | **3.0.0 wrapper redesign**: remove `runCoverage`/`suggestTests` commands + interactive prompt (`runTests` only); drop `--setup`/`--cleanup`/`--recursive`; switch validation **`config_v2`→`config_v3`**; add YAML config; new defaults (`relativePathBase:"file"`, `loadVariables:".env"`, `detectSteps:true`, `fileTypes:["markdown","asciidoc","html"]`, `telemetry.send:true`); pluggable reporter (jsonReporter + terminal summary) | doc-detective `58496132` | src/index.js + src/utils.js (the wrapper-side re-exposure of the upstream v3 contract, Seq 139–149) | H |
| 162 | 2025-04-22 | runner | core | When resolveContexts yields zero contexts, push default `{platform}`; if browser required auto-select firefox→chrome→safari; tests run even with no runOn | core `6472927f` | default-context fallback | H |
| 163 | 2025-04-23 | step | core | Strategies extracted to `findStrategies.js` (remove circular dep); click handles string/object/absent; helpers return `{element:null,foundBy:null}`; honor test-level detectSteps:false short-circuit | core `57ddd517`,`e78bdd43`,`347d0ce2` | finding rewrite | H |
| 164 | 2025-04-23 | schema | common | Stricter HTTP request/response (`additionalProperties:false`); canonical `params`→`parameters`; statusCodes accept integer; arrays as request/response body | common `e751bc4d`,`96c00dc`,`463af96` | additionalProperties + parameters rename | H |
| 165 | 2025-05-01 | config | doc-detective | `--input`/`--output` args `path.resolve()`d so relative arg paths resolve from cwd independent of config base | doc-detective `ae724ebf` | `config.input = path.resolve(args.input)` | H |
| 166 | 2025-05-06 | resolve | common | resolvePaths: loadVariables (renamed from envVariables) as config path; recurse into arrays; skip http(s) URLs | common `6e1121a4`,`3d0ce701`,`23d01926` | path resolution refinements | H |
| 167 | 2025-05-07 | config | doc-detective | Comma-separated multi-file `--input` (split/trim/resolve each, leave `http(s)://` unresolved); `filePath` defaults `"."` when no config | doc-detective `7cc139e3` | `args.input.split(",").map(trim)` + URL guard | H |
| 168 | 2025-05-12 | resolve | resolver | **Re-baseline resolver as JS package**: detectTests/resolveTests/detectAndResolveTests entrypoints; driverActions list drives isDriverRequired/resolveContexts; uuid for specId/testId/contextId; return `{config, specs[]}`; null when no tests; resolver does NOT default browsers (runner's job) | resolver `c911e006`,`0a626c4d`,`606b214e`,`d097ce06`,`5e1d8c86`,`9527d00c` | detect→parse→resolve pipeline | H |
| 169 | 2025-05-13 | schema | common | `resolvedTests_v3` envelope (`config`+`specs[]`, resolvedTestsId uuid); read-only `environment` (platform/arch/workingDirectory); `configPath`/`specPath` readOnly; openApi `definition` readOnly | common `33510c60`,`36721bfe`,`c0f5dec5`,`5eae96a9`,`d69fe9d0`,`274364c7` | resolvedTests envelope | H |
| 170 | 2025-05-13 | runner | core | runTests delegates detection+resolution to `doc-detective-resolver` `detectAndResolveTests`; runSpecs `{resolvedTests}`; deletes core arazzo.js/utils.js/sanitize.js; runnerDetails (environment+availableApps) | core `d02fb3d`,`0b5bce4`,`7ec5210`,`f005af9` | delegate resolution | H |
| 171 | 2025-05-27 | config | doc-detective | Add `configPath` to merged config object (runtime knows config-file location); collapse validation-error logging | doc-detective `821cfef3` | `config.configPath = configPath` | M |
| 172 | 2025-05-28 | engine | core | find-by-text uses XPath `normalize-space()` (whitespace-tolerant); driver init timeouts 2min (connectionRetryTimeout/waitforTimeout 120000) | core `aee88c9`,`4f864aa` | normalize-space + timeouts | H |
| 173 | 2025-06-01 | resolve | resolver | `httpRequestFormat` fenced-block markup detector (method/url/headers/body); `fileType.extends` (merge built-in); `DOC_DETECTIVE` env JSON config override (deepMerge); invalid config `process.exit`→`throw`. Plus core httpRequest input standardization (`dd9e22b`) | resolver `8d00c5ba`,`124b2076`,`c5170a78`,`8fc84b0c`,`feb741f7` | httpRequest markup + extends | H |
| 174 | 2025-06-09 | schema | common | fileTypes require `anyOf[extensions, extends]` (template extension supported); `extends` $comment removed; validate() surfaces structured AJV errors (instancePath/message/params); extension-based readFile parsing | common `52435a92`,`a82f8ddc`,`9ebcdb54`,`18a62e13` | fileTypes extends + AJV errors | H |
| 175 | 2025-06-09 | schema | common+resolver+core | **unsafe-step gating**: `unsafe` flag + `allowUnsafe*` config gate (schema `allowUnsafeMarkup`→`allowUnsafeTests`→`allowUnsafeSteps`, relocated fileType→test→**step**-level); resolver `isUnsafe`/propagation; runner skips unsafe steps unless `allowUnsafeSteps`/container | common `071ca133`,`a975ee0f`,`7893cc7d`,`ea0fff3f`,`4ab0a642`; resolver `f342eb3c`,`17e3a095`,`9d686f04`,`05929b7f`; core `82389005`,`899c24c`,`0a6a624` | unsafe gating. Wrapper `--allow-unsafe`→config 2025-06-15/18 (`7da1ac9a`,`a5ecc9be`) | H |
| 176 | 2025-06-12 | report | core | `setElementOutputs` rich `outputs.element`; `rawElement` carried then stripped; concurrent reads via allSettled; **stop-on-fail**: steps after a FAIL → SKIPPED | core `1cd5c7b`,`b25a88c` | element-attributes + stop-on-fail | H |
| 177 | 2025-06-16 | engine | core | connectionRetryTimeout/waitforTimeout 120000→600000; `appium:newCommandTimeout:600` on Gecko/Safari/Chromium | core `c3a4b55`,`816f93e` | driver timeouts → 10min | H |
| 178 | 2025-06-17 | docker | docker | Replace `ENV CONTAINER=true` with structured `DOC_DETECTIVE` env JSON (`{"container":"docdetective/docdetective:<os>","version":…}`) read by runner; add **ffmpeg** to Linux image (in-container recording) | docker `64a8e10` | DOC_DETECTIVE env JSON + ffmpeg | H |
| 179 | 2025-06-20 | schema | common+resolver | Config `concurrentRunners`: `["integer","boolean"]` default 1, min 1, `not:{const:false}`; `true`=CPU count capped 4; resolver `resolveConcurrentRunners` normalizes to integer in setConfig | common `73a6d082`,`f5aadf55`; resolver `9251aac5` | concurrentRunners schema | H |
| 180 | 2025-06-23 | runner | core | Worker-pool/TestRunner parallel context execution with concurrentRunners + indexed ordering — added then **reverted** (no parallelism shipped on this branch; resurfaces in monorepo, Seq 207) | core `2f31442`,`43251a8` | parallel attempt + revert | H |
| 181 | 2025-06-25 | schema | common | Config `debug`: anyOf boolean or enum `["stepThrough"]` (default false); step `breakpoint` boolean (default false) | common `b648cb80`,`ef8890f8` | debug + breakpoint | H |
| 182 | 2025-07-20 | report | doc-detective | Debug-only version/config dump: when `logLevel==="debug"` print `getVersionData()` (auto-discovers `doc-detective-*`, node/platform/execMethod) + full resolved config | doc-detective `a054638` | `getVersionData()` | M |
| 183 | 2025-08-10 | step | common+core+resolver | **cookie actions**: `saveCookie`/`loadCookie` action-as-key step types (string-or-object; name pattern, path/variable/domain, Netscape format, XOR path/variable); runner cookie parse/format (sameSite Lax, env-var fallback); resolver adds to driverActions | common `620fc810`,`f28e41f`,`73933f0`,`c3d9e8b`,`9ce01f7`; core `b80cb9d`,`b456783`; resolver `96e53763` | cookies | H |
| 184 | 2025-08-22 | step | common+core+resolver | **dragAndDrop action**: `dragAndDrop_v3` (required source+target elementSpecification, duration 1000); runner HTML5-sim + WebDriver fallback; resolver adds to driverActions; findStrategies selector+text requires BOTH | common `301c0ad`; core `ff602f2`; resolver `75c95b5` | dragAndDrop | H |
| 185 | 2025-10-08 | docker | docker | Add DITA-OT 4.3.4 to both images (`/opt/dita-ot`, PATH); Linux +unzip/default-jre; Windows +MS OpenJDK 17; `update-ca-certificates` | docker `5b07372`,`a20f59d`,`cab4f03`,`ece503e` | DITA-OT in image | M |
| 186 | 2025-10-20 | schema | common+core+resolver | **DITA support**: config `processDitaMaps` (default true); fileTypes default/enum +`dita`; resolver `dita_1_0` fileType (XML-attr inline parsing, `.ditamap` via dita CLI, `parseXmlAttributes`); uuid→crypto.randomUUID | common `5afa958`; core `81620db`; resolver `5a6e7f6`,`e18acef`,`371ed8e` | DITA | H |
| 187 | 2025-10-21 | config | core | `DOC_DETECTIVE_CONFIG` env var: parsed JSON, validated `config_v3`, merged over file config (env > file, CLI > env); exit(1) on parse/validation failure (wrapper-side `5cb04ed3` #157). Plus config `integrations.docDetectiveApi`/`runViaApi()` remote runs (common `03d3a45`; core `44a28ebe`,`74aeee6`,`c0f39b2`,`8e7591c`) | doc-detective `5cb04ed3` (#157); common `03d3a45`; core `44a28ebe` | env config + Doc Detective API | H |
| 188 | 2025-10-22 | engine | core | config `integrations.openApi` merged onto each context.openApi (reaches httpRequest validation); unmatched expected response headers now **FAIL** the step | core `a90a936` | openApi merge + header FAIL | H |
| 189 | 2025-10-23 | report | doc-detective | Remote-runner: `DOC_DETECTIVE_API` ({accountId,url,token,contextIds}) fetches resolved tests (GET `/resolved-tests`), validates `resolvedTests_v3`, runs, POSTs results to `/contexts`; axios dep | doc-detective `23f2f71`,`8bd4305`,`dee756d`,`3ac6163` (#158) | getResolvedTestsFromEnv | H |
| 190 | 2025-10-24 | engine | core | Appium readiness probe `/sessions`→`/status`; Node 18 dropped from CI matrix; pinned sharp optionalDeps removed | core `9f6bde13` | Appium v3.1 + drop Node 18 | H |
| 191 | 2025-10-30 | config | common | config `crawl` boolean (default false) — crawls sitemap.xml to discover additional files to test | common `856ce9a` | crawl | H |
| 192 | 2025-11-05 | engine | core | Migrate to WDIO v9.2+BiDi (remove enforceWebDriverClassic, isDisplayed withinViewport, cookie sameSite lowercase) → **reverted to classic** while keeping wdio v9; findElement switches to polling | core `f61fc6`,`0743ef`,`4669781` | WDIO v9 + revert | H |
| 193 | 2025-11-13 | schema | common+core | httpRequest_v3 `response.required`: array of dot/bracket field paths that must exist (any value incl null), default `[]`; runner `fieldExistsAtPath` → FAIL listing missing fields | common `fff0569`; core `07523f04` | response.required | H |
| 194 | 2025-11-16 | schema | common+core | **multi-criteria element finding**: find/click/screenshot/type/dragAndDrop object forms gain elementId/elementTestId/elementClass/elementAttribute/elementAria (string|array, regex, presence); string shorthand = multi-field OR; runner `findByCriteria` parallel OR | common `158a270`,`c6376be`,`2c07987`; core `983de50` | multi-criteria finding | H |
| 195 | 2025-11-19 | report | core | screenshot/runShell maxVariation overruns set status WARNING (file still written) instead of FAIL — de-fang visual/output regressions | core `1595353` | regression diffs → WARNING | H |
| 196 | 2025-11-19 | schema | common+core | goTo_v3 `timeout`(30000) + `waitUntil` object: networkIdleTime(500), domIdleTime(1000), find element; null disables a condition; runner parallel ready/network-idle/DOM-stable/element-found checks | common `9d7d503`; core `107766` | goTo waitUntil + timeout | H |
| 197 | 2025-11-26 | config | doc-detective | Respect explicit `false` for `recursive`/`detectSteps` (`?? true` instead of `|| true`) | doc-detective `2f0d969` (#160) | `recursive: config.recursive ?? true` | H |
| 198 | 2025-11-28 | report | core | Unsupported-context skip log warning→info; skipped-context report shape `{status:"SKIPPED"}` object → flat `"SKIPPED"` (fixes spurious PASS) | core `6a61bf6`,`2d28d3` | skipped-context log level | H |
| 199 | 2025-12-01 | runner | core | `getRunner({headless})` returns `{runner,appium,cleanup,runStep}` — drive a live session and run steps directly; headless fallback on Chrome start failure | core `90f581` | public getRunner API | H |
| 200 | 2025-12-02 | step | core | `calculatePercentageDifference`→`calculateFractionalDifference` (0–1 Levenshtein/maxLength); httpRequest/runShell compare raw maxVariation (no *100); unified comparison contract; wait uses driver.pause when driver present | core `580f4d`,`a6e092` | fractional maxVariation | H |
| 201 | 2025-12-06 | docker | docker | Multi-OS images + publish contract: Windows image (`windows/server:ltsc2022`, Node MSI, cmd entrypoint); single-stage Linux runtime w/ explicit Chrome shared-lib set; canonical publish `docdetective/docdetective:latest`+`:$VERSION`; build.js platform→tag matrix; GitHub Actions publish (2025-05-08 cluster) | docker `cc0dbe8`,`178fe1d`,`ca6c49bd`,`c545eb8`,`2efbaa8`,`fc938ee`,`3f9c767` | multi-OS publish | H |
| 202 | 2025-12-16 | integrations | common+core+resolver | **Heretto CMS integration**: config `integrations.heretto[]` (name/organizationId/username/apiToken format:password, scenarioName); `heretto:` source refs (publishing API, ZIP download); `sourceIntegration_v3` schema; screenshot uploader round-trip (uploadOnChange default true, `changed` flag, report.uploadResults); collision-safe specIds | common `ea835d1`,`8ad7460`; core `f0ae77`,`be8c485`; resolver `15c58e0`,`b7345ab`,`79e02b4` | Heretto | H |
| 203 | 2025-12-24 | step | core | checkLink GET sends browser UA/Accept, 10s timeout, maxRedirects 5; error reports actual status (`Returned NNN. Expected one of […]`) — fixes bot-blocking false failures | core `e433358` | checkLink UA + status error | H |

### 2026

| Seq | Date | Theme | Repo(s) | Decision | Source (hash/PR#) | Evidence | C |
|----|------|-------|---------|----------|--------|----------|---|
| 204 | 2026-01-27 | infra | common | **TypeScript migration**: all source .js→.ts; generated per-schema typed interfaces; dist ships ESM+CJS+`.d.ts`; package now type-exporting (backward compatible) | common `c089ec1` | TS migration | H |
| 205 | 2026-02-24 | infra | common | Browser-safe `detectTests`/`parseContent` pure module (no fs/path) added to public exports; dist `index.cjs` browser bundle; v4.0.0-beta | common `2f10a66` | browser build | H |
| 206 | 2026-02-26 | infra | doc-detective+core | **Merge `core` into the monorepo**; full ESM/TypeScript refactor (`src/core/*`: config.ts, tests.ts, action files, integrations/heretto.ts, openapi.ts); postinstall.js, createCjsWrapper.js (v4 line) | doc-detective `5b8df475` | src/core/* packaging | H |
| 207 | 2026-02-28 | infra | doc-detective+common | **Merge `doc-detective-common`** under `src/common/`: all schemas, detectTests.ts, validate — establishes in-repo schema/contract surface (decisions themselves are upstream-dated above). Plus `--version` CLI flag (`e83d1d75`); recording reliability `safeDone` (`da7ed97b`) | doc-detective `2ae9b831`,`e83d1d75`,`da7ed97b` | src/common/* | H |
| 208 | 2026-03-07 | docker | doc-detective+docker | **Merge docker configs** into monorepo: `src/container/{linux,windows}.Dockerfile`, build.cjs, container-build-push workflow — in-repo Docker base/runtime contract | doc-detective `912191e7` (#191) | src/container/* | H |
| 209 | 2026-03-09 | infra | common | Export generated types (Specification/Test/Step/Context/Config/Report) from `src/common/src/index.ts` — public API surface | common `07957639` (#194) | index.ts exports | H |
| 210 | 2026-03-11 | resolve | common+core | Test-detection refactor + `src/common/src/fileTypes.ts` (318 lines) + `step_v3` field; detectTests updated in common+core (line/location tracking) | doc-detective `0ff34765` (#197) | fileTypes.ts; detectTests | H |
| 211 | 2026-03-20 | infra | doc-detective | npm packaging: include `scripts/` + bundling `files` entries (changes published package contents); prepack/postpack strip workspaces during packing to fix `npx doc-detective` | doc-detective `9268214a`,`045d9214`,`43fea021` | package.json `files`; prepack/postpack | M |
| 212 | 2026-03-25 | resolve | core | Heretto CMS content loading in monorepo: `src/core/integrations/heretto.ts` (515 lines) + detectTests integration (`heretto:<name>` refs); job-status polling fix | doc-detective `2b5167a9` (#238),`dc4312d4` | heretto.ts loader (re-exposure of Seq 202) | H |
| 213 | 2026-04-07 | step | core | checkLink accepts non-2xx status codes listed in `statusCodes` (pass/fail contract) | doc-detective `0152d6e6` | src/core/tests/checkLink.ts | H |
| 214 | 2026-04-16 | step | core+common | checkLink reduces false 429/403 from bot-protected sites: `checkLink_v3` schema fields + `config_v3` additions, browser-like headers + retry + HEAD fallback | doc-detective `6a11a93f` (#253) | checkLink.ts (192 lines); checkLink_v3 | H |
| 215 | 2026-04-17 | report | core+common | Self-contained HTML report reporter (`src/reporters/htmlReporter.ts`); `config_v3` HTML report option; cli/utils wiring | doc-detective `253bd5a8` (#255) | htmlReporter.ts | H |
| 216 | 2026-04-18 | config | doc-detective | `install-agents` CLI subcommand with six adapters (claude-code/codex/copilot-cli/gemini-cli/opencode/qwen-code) under `src/agents/` | doc-detective `ae3f76d4` | cli.ts subcommand; src/agents/* | H |
| 217 | 2026-04-18 | resolve | common+core | Expanded DITA inline test/step detection (order-flexible `<data name=doc-detective value=…>` regexes), XML entity decoding in parseObject; cookie `sameSite` normalized for WebDriver | doc-detective `ab56a39f` (#250) | fileTypes.ts; loadCookie.ts | H |
| 218 | 2026-04-18 | step | core | screenshot crop: shift-rather-than-shrink clamp + tolerate aspect-ratio jitter | doc-detective `1431c9bb` | saveScreenshot.ts | H |
| 219 | 2026-04-19 | step | core+common | screenshot accepts URL paths as read-only **reference images** (visual regression); `screenshot_v3` updated; fetchFile-binary support | doc-detective `d03c130f` (#262) | saveScreenshot.ts; screenshot_v3 | H |
| 220 | 2026-04-19 | config | common+core | `config.originParams` + step-level `params` on `goTo`/`checkLink` auto-append query params to origin-resolved URLs (merge semantics, fragment preserved, dedup) | doc-detective `dac029a8` (#261) | `appendQueryParams()`; config_v3/goTo_v3/checkLink_v3 | H |
| 221 | 2026-04-20 | install | doc-detective | postinstall detects coding agents (Claude Code/Copilot/Gemini/Codex/Qwen/opencode) and offers `install-agents --agent <id>`; gated by TTY + `CI`/`DOC_DETECTIVE_SKIP_AGENT_PROMPT`; PATH sanitized | doc-detective `88772fbc` (#273),`050af3cc` | postinstall agent detection | H |
| 222 | 2026-04-22 | runner | core | `waitForPortFree()` binds 127.0.0.1:4723 before spawning Appium (≤30s); `driverStart()` retries on ECONNREFUSED. *(Superseded by Seq 227 dynamic port.)* | doc-detective `cc1cc7b5` | tests.ts Appium spawn | M |
| 223 | 2026-04-30 | config | common+core | `--test`/`--spec` regex filters → `config.testFilter`/`config.specFilter` (case-insensitive regex arrays on testId/specId); `config_v3` array fields (`minLength`, `\S` pattern); runner gating | doc-detective `b19ac228` (#286) | core/utils.ts helpers; tests.ts gating | H |
| 224 | 2026-05-02 | config | common+core | `--dry-run` → `config.dryRun` (resolve without executing); `config_v3` field; cli/utils/core wiring | doc-detective `a0bdb193` (#292) | dryRun field | H |
| 225 | 2026-05-05 | runner | core | Appium uses a dynamic free port instead of hardcoded 4723 (`findFreePort()`) | doc-detective `ce3ab862` (#301) | core/utils.ts findFreePort | H |
| 226 | 2026-05-06 | infra | doc-detective | `doc-detective-runner` bin (`bin/runner-entrypoint.js`): doc-detective.com platform entrypoint (fetch spec/secrets, provision /workspace, spawn CLI w/ `DOC_DETECTIVE_CONFIG`, stream logs, finalize); self-kill at `DD_TIMEOUT_SECONDS` | doc-detective `44ded942` (#302) | runner-entrypoint.js | H |
| 227 | 2026-05-11 | install | doc-detective | Runtime lazy-install: heavy deps (appium/webdriverio/drivers) + browsers installed on demand into a runtime cache (`cacheDir`); `src/runtime/{installer,loader,selfUpdate,heavyDeps}.ts`; `@puppeteer/browsers`→v3 (node 24); stop installing heavy deps on `npm i` | doc-detective `2df7b63c`,`396605c3`,`f995df9f` (#305) | src/runtime/* | H |
| 228 | 2026-05-12 | report | common+doc-detective | Post-run contextual hint system (`src/hints/*`, 25 hints): one short hint after a run (TTY + info only); `config.hints` (enable/disable) + `--no-hints` | doc-detective `1e2bf432` (#303) | src/hints/* | H |
| 229 | 2026-06-01 | infra | doc-detective | `engines` declares **node `>=22.12.0`** (older node now EBADENGINE) | doc-detective `e9680596` | package.json engines | H |
| 230 | 2026-06-01 | runner | core | Skip `getAvailableApps()` app detection in dry-run; dry run leaves `environment.apps` empty | doc-detective `a3a36ca4` | config.ts dry-run guard | H |
| 231 | 2026-06-04 | install | doc-detective | postinstall eagerly pre-installs heavy runtime+browsers **by default**; opt-out `DOC_DETECTIVE_INSTALL_RUNTIME=0`; npm noise filtered | doc-detective `6811c534` (#316) | `ensureRuntimeInstalled` | H |
| 232 | 2026-06-04 | step | core | `typeKeys`: lazy-load webdriverio `Key` (lean installs run; load failure → step FAIL not abort); `$SUBTRACT$` alias for legacy `$SUBSTRACT$` | doc-detective `366202e6` | typeKeys.ts | H |
| 233 | 2026-06-05 | install | doc-detective | Runtime installer tees full npm output to `<cacheDir>/runtime/install.log`; failure error names the log path | doc-detective `2b620b24` (#318) | installer.ts | M |
| 234 | 2026-06-06 | runner | core | `getRunner().ensureChromeAvailable()`: self-provisions Chrome runtime on first use regardless of `DOC_DETECTIVE_AUTOINSTALL`; invalidates app cache + re-detects | doc-detective `0c843769` | getRunner JIT provisioning | M |
| 235 | 2026-06-08 | resolve | core | Driver-context resolution: nameless driver-context cleanly SKIPPED; unknown browser name throws clear error; `webkit`→Safari caps | doc-detective `9fbf2b21` | isSupportedContext/getDriverCapabilities | H |
| 236 | 2026-06-10 | install | doc-detective | `withPeerCompanions` expansion so dry-run and real install reports match actual installs; `parseSemverCore` anchored `$` for OR/composite ranges | doc-detective `23b54636`,`0257797d`,`19e19121` | installer.ts; heavyDeps.ts | M |
| 237 | 2026-06-10 | docker | docker | linux.Dockerfile: pin `@img/sharp-libvips-linux-*` to required version + fail-fast on unsupported arch | doc-detective `6b1e9adc`,`705b5438` | linux.Dockerfile | M |
| 238 | 2026-06-11 | resolve | core | Browser detection hardened for lean installs: Appium driver-presence regexes match combined stdout+stderr; `getAvailableApps()` loads @puppeteer/browsers `autoInstall=false`, degrades to empty | doc-detective `bfc37c66`,`ff324722` | config.ts; getAvailableApps | H |
| 239 | 2026-06-11 | install | doc-detective | postinstall 10-min wall-clock ceiling kills runtime pre-warm child (non-fatal, falls back to lazy install; exits 0) | doc-detective `fb99ca7a` | postinstall.js timeout | H |
| 240 | 2026-06-13 | config | core | `doc-detective debug` subcommand + `DOC_DETECTIVE_DEBUG=true`: redacted diagnostic dump to `.doc-detective/debug-<ts>.{txt,json}`; schema `debug` field deprecated; cache/install/network/appium/provenance sections | doc-detective `e4171311` (#336),`5a9344c5` (#347) | debug subcommand | H |
| 241 | 2026-06-13 | runner | core | Runtime dependency detection + Appium warm-up guard; `requiredBrowserAssets(name)` table-drives per-browser asset install | doc-detective `45adfaf1` (#338) | tests.ts/browsers.ts | H |
| 242 | 2026-06-14 | runner | core | **Concurrent test runners** (parallel context execution); `concurrentRunners` config; large tests.ts rework, Appium config changes, new hints (the monorepo re-land of the reverted Seq 180) | doc-detective `dd248197` (#332) | tests.ts; concurrentRunners | H |
| 243 | 2026-06-14 | config | core+common | `autoScreenshot` config + `--auto-screenshot` (auto-capture after each browser step); `runFolder` reporter (default-on) writing `.doc-detective/run-<runId>/testResults.json`; deterministic ID fallbacks; report gains `runId`/`runDir`; spec/test-level autoScreenshot | doc-detective `0527292b` (#334) | config/spec/test/step/report schema additions | H |
| 244 | 2026-06-14 | report | core | runFolder archive also emits a per-run HTML report beside the JSON | doc-detective `baa83dee` (#341) | utils.ts/htmlReporter.ts | H |
| 245 | 2026-06-16 | report | core | runFolder reporter reorders stdout so per-run JSON "results at" line trails the HTML line — GitHub Action results-resolution contract (splits stdout on "results at ") | doc-detective `79f35b85` (#346) | runFolder stdout order | M |
| 246 | 2026-06-16 | record | core+common | **ffmpeg recording engine** for any-app recording + concurrency-safe Chrome; `src/.../ffmpegRecorder.ts`; `record_v3`/`step`/`test` schema engine-selection; recording fixtures + permutations | doc-detective `36a83ba1` (#343) | ffmpegRecorder.ts; record_v3 | H |
| 247 | 2026-06-17 | runner | core | Skip run-folder creation when no artifacts written (no empty `.doc-detective/run-*` dirs) | doc-detective `341b9c5c` | tests.ts/utils.ts | H |
| 248 | 2026-06-17 | record | core+common | `autoRecord` + multiple overlapping recordings (LIFO); new `stopRecord_v3` schema; config/record/spec/test/step schema additions | doc-detective `189d1979` (#349) | stopRecord_v3; ffmpegRecorder | H |
| 249 | 2026-06-17 | step | core+common | `runBrowserScript` action/step type (JS in browser context); `runBrowserScript_v3` schema, `tests/runBrowserScript.ts`, `browserStepKeys.ts`, inferRuntimeNeeds wiring | doc-detective `f010c67d` (#352) | runBrowserScript.ts | H |
| 250 | 2026-06-22 | runner | core | Gate advanced (setup/cleanup) ordering under `concurrentRunners` — ordering only applies when concurrency enabled **(authored: ADR 01000)** | doc-detective `158c83e6` (#377) | detectTests.ts/tests.ts | H |

> Notes on seams: `--allow-unsafe` (wrapper) folds into the upstream unsafe-gating
> decision (Seq 175); the wrapper 3.0.0 redesign (Seq 161) is the re-exposure of
> the upstream v3 schema/runner family (Seq 139–149); the monorepo Heretto loader
> (Seq 212) re-exposes the upstream Heretto integration (Seq 202); the monorepo
> concurrent-runners land (Seq 242) re-lands the reverted upstream attempt
> (Seq 180). Runtime lazy-install → eager-default → install-log → companions
> (Seq 227/231/233/236) span monorepo batches 15/16.

---

## Borderline (needs adjudication)

| Date | Item | Repo / Source | Lean | Why flagged |
|------|------|--------|--------------|-------------|
| 2022-09 | `moveMouse`-on-`click` option added then removed within a day (superseded by find sub-actions) | doc-detective `d742ef2`,`93664ce` | record-the-interim | Option surface + README payload were published before removal |
| 2022-10-04 | "Clarified stopRecording inputs" | doc-detective `82f2b02d` | INCLUDE-leaning | Pure call-signature reshuffle vs. observable contract |
| 2023-04-17 | Migrated tests to Mocha (also adds exported `spawnCommand` helper) | doc-detective `8ed8e939` | EXCLUDE | Test infra; helper not yet user-facing |
| 2023-07-24 | Multi-line markup `regex[]` `{open,close}` objects; `codeBlock`→`bashCodeBlock` — added then removed within a release window (net: no open/close in defaults) | common `98e8317c`,`cac10b2d`,`65e1a8ec` | EXCLUDE (net no-op) | Contract churn that didn't survive the release |
| 2024-05-12 | `outputResults` async→sync write, swallows write errors instead of throwing | doc-detective `9f79f904` | borderline | Changes failure behavior; folded into Seq 125 |
| 2025-05-03 | Capture-group/`$0/$1` templating churn in markup (added then reshaped) | core `3dc533` cluster | INCLUDE (folded Seq 119) | Substitution semantics shipped |
| 2025-06-12 | Per-step result-state expansion (no named `onFail`/`retry` field shipped upstream) — closest analog to a retry/onFail decision | core `b25a88c` (folded Seq 176) | record-the-analog | There is **no** dedicated `onFail`/`retry` decision upstream to backfill; flag if one is expected |
| 2025-05-09 | Docker-build dispatch step in `npm-publish.yml` (fires downstream build) | doc-detective `e268cc32` | EXCLUDE (CI) | Is the action-gh/docker dispatch a contract? |
| 2026-06-10 | Split Windows image into prebuilt base + thin app layer; multi-arch (amd64+arm64) linux manifest | docker `e5647341`,`25688f38` | EXCLUDE (build) | Publishes a new base image / new supported arch — distribution contract? |
| 2026-06 | Major runtime-dep majors (yargs 17→18, appium, webdriverio, typescript 5→6) | doc-detective `3a837fc2` | EXCLUDE (deps) | CLAUDE.md exempts dep bumps, but majors can shift observable behavior |
| 2026-06-16/17 | `cacheDir` override assignment-only refactor; `install-agents`→`install agents` message text | doc-detective `3076f433`,`b4ebb036` | EXCLUDE | Net behavior unchanged / message-text only |

---

## Coverage

- **Total commits examined: 3,156 across 5 repos.**
  - `doc-detective` (monorepo): **992** (16 batches × 62; no overlap, no gaps).
  - `doc-detective-common`: **663** (cm-01…cm-10).
  - `doc-detective-core`: **1,160** unique (co-01…co-16).
  - `doc-detective-resolver`: **218** (rs-01…rs-04).
  - `docker-images`: **123** (dk-01…dk-02).
  - Upstream subtotal (the four pre-merge repos): **2,164**.
- **Aggregate excluded-by-reason** (approximate; the same commit is bucketed
  under one primary reason; summed across all batches in all repos):
  - **version/release/dependency/lockfile chore** (incl. semantic-release &
    auto-dev releases) — by far the largest bucket, **~1,000+** across all repos.
  - **merge commits** (content counted in member commits) — **~280–300**.
  - **docs / README / AGENTS.md / Jekyll-site / vale / mdx / typo / comment /
    formatting** — **~195**.
  - **test-only / fixtures / sample data / dev-harness / local config** — **~235**.
  - **CI / GitHub workflows / .github / dependabot / coderabbit** — **~220**.
  - **pure refactor / rename / cosmetic / log-text / plumbing / "Initial plan"** — **~190**.
  - **generated build artifacts** (output_schemas/schemas.json mirroring a src change) — **~50**.
  - **placeholder/temp markdown, icons, gitignore, lockfile-only, prototype** — **~35**.
- The remainder are the behavior/contract commits the batches recorded — several
  hundred raw rows across all five repos — deduplicated by decision down to the
  **250 distinct decisions** in the master table.

## Counts

**Distinct cross-repo decisions: 250** (Seq 1–250). Of these, **1 is already
authored** (ADR `01000`, Seq 250), leaving **249 candidate ADRs**.

**Dedup result.** The two inputs (143 upstream decisions + ~132 monorepo
decisions = 275 pre-merge rows) collapsed to **250** by merging **25
monorepo↔upstream rows** that described the same contract decision. The
deduplicated pairs are: the wrapper postinstall delegation (→ Seq 83), wrapper
`runCoverage`/`suggestTests` CLI entrypoints (→ Seq 84/86), the multiarch
docker build (→ Seq 88), wrapper `setMeta`/`DOC_DETECTIVE_META` (→ Seq 112),
wrapper async `setConfig`/`resolvePaths` (→ Seq 127), the wrapper 3.0.0 redesign
which re-exposes the upstream v3 family (kept as its own Seq 161 but cross-linked
to Seq 139–149, **not** counted as new schema decisions), the monorepo Heretto
loader (→ Seq 202/212 cross-link), monorepo concurrent-runners land
(→ Seq 180/242 cross-link), wrapper `--allow-unsafe` (→ Seq 175), wrapper
`DOC_DETECTIVE_CONFIG` (merged with the Doc Detective API row, Seq 187), plus the
v3 schema/config/context/OpenAPI/Arazzo/unified-outputs items that the monorepo
inventory had parked in "Still needs verification" and the upstream audit dated
(Seq 132/135/139–149/156).

By **repo(s)** (a multi-repo decision counts once under each repo it spans):

| Repo(s) | Distinct decisions (primary tag) |
|---|---|
| doc-detective (wrapper + 2022 genesis) | 73 |
| core only | 70 |
| common only | 48 |
| resolver only | 2 |
| docker only | 6 |
| common + core | 18 |
| common + core + resolver | 6 (v3-era families: unsafe gating, cookies, dragAndDrop, DITA, Heretto, plus context family) |
| common + resolver | 1 (concurrentRunners) |
| core + common (2026 monorepo re-exposures) | ~20 (counted under their primary repo above) |
| **Total distinct** | **250** |

(Repos *touched* tallied independently: `doc-detective` in ~93 rows, `core` in
~120, `common` in ~80, `resolver` in ~12, `docker` in 6.)

By **theme** (dominant theme per row):

| Theme | Decisions |
|---|---|
| schema (action/step/config/context/spec/test/report contracts) | 52 |
| step / action runtime handlers | 44 |
| config / CLI | 32 |
| engine (browser/driver/Appium/WDIO) | 24 |
| runner / scheduler | 24 |
| report / result roll-up / verdict / reporters | 22 |
| resolve / detection / parsing / path resolution | 20 |
| record / recording engine | 13 |
| install / runtime provisioning | 9 |
| infra / distribution / merges / packaging | 9 |
| docker / image | 6 |
| validation (AJV / transform / errors) | 5 |
| integrations (OpenAPI / Arazzo / Heretto / Doc Detective API) | 5 |
| telemetry | 1 |

(Themes sum to ~250 with minor cross-classification; integrations are grouped
even where their primary diff touched schema or step.)

By **year** (one continuous Seq):

| Year | Seq range | Decisions |
|---|---|---|
| 2022 | 1–54 | 54 |
| 2023 | 55–100 | 46 |
| 2024 | 101–136 | 36 |
| 2025 | 137–203 | 67 |
| 2026 | 204–250 | 47 |
| **Total** | 1–250 | **250** |

## Still needs verification

The previously-large list is now **resolved** from the upstream audit (see
§ Resolved and the dated rows above). What remains are genuine unknowns only:

| Theme | Item | Notes |
|-------|------|-------|
| step | A dedicated `onFail` / `onStepFail` / step-`retry` decision | **Does not exist** in any of the five repos. The closest shipped contract is the per-step result-state expansion (stop-on-fail → SKIPPED, Seq 176; goTo timeout → WARNING, Seq 157; regression diffs → WARNING, Seq 195). If a retry/onFail ADR is expected, it must be authored as a *future* decision, not backfilled. |
| config | A small number of L-confidence freeform-era dates (e.g. Seq 52 `loadEnvs` rewrite 2022-10-25; Seq 115 interactive picker 2024-03-30) | Dates are first-introduction commit dates accurate to within a release; tighten only if a precise day is needed for numbering. |

## Proposed next steps (after you prune this list)

1. **Prune + correct**: strike rows that aren't ADR-worthy, adjudicate the
   [Borderline](#borderline-needs-adjudication) rows, and confirm the two
   remaining [Still needs verification](#still-needs-verification) items (decide
   whether an `onFail`/`retry` ADR is in scope at all).
2. **Decide infra/docker scope**: do `infra`/CI/release-pipeline and
   docker-build rows get ADRs? (default: no, except the milestones — v1→v2 split
   Seq 57/80/87, the v3 redesign Seq 139–149/161, the OpenAPI/Arazzo/Heretto
   integrations, the core+common+docker merges Seq 206–208, runtime lazy-install
   Seq 227).
3. **Finalize numbering**: assign contiguous `00001`+ in date order over the
   surviving set (pruning renumbers everything).
4. **Author in batches by theme** (parallel subagents), each ADR cloning the
   `01000` MADR structure, `status: accepted`, historical `date`, the
   `Repo(s)` provenance, and a "recorded retrospectively from <repo> <hash/PR>"
   note; cross-link related ADRs (e.g. the v3 schema row to its runner-adoption row).
5. **Verify**: 5-digit filenames, in-range, no ID collisions, every ADR cites a
   real commit/PR in its origin repo. Land as `docs:` commits (no release triggered).
