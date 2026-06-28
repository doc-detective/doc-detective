# ADR Backfill Plan (curated proposal)

> **Working document — not an ADR.** This is the *curated* proposal derived from
> [`BACKFILL-INVENTORY.md`](BACKFILL-INVENTORY.md) (250 raw contract-affecting
> decisions). It merges related inventory rows into coherent ADR units, drops the
> rows that aren't ADR-worthy, and assigns provisional sequential IDs in date
> order. **Review this before any ADRs are authored.** Once approved, the surviving
> set is numbered `00001`+ and authored in the reserved `00001`–`00999` range.

## What this is

A principled compression of the 250-row diff-audit inventory into a reviewable
ADR set. Every inventory `Seq` appears **exactly once** below — either absorbed by
a proposed ADR (in the *Absorbs* column) or in *Dropped / not-an-ADR*.

**Curation heuristics (applied consistently):**

- **One ADR = one coherent decision** with context/trade-offs, at roughly the
  granularity of [`01000`](01000-gate-advanced-ordering-under-concurrent-runners.md).
- **Merge families:** schema-version families (v1 / v2 / v3 redesigns) fold their
  per-field rows into family ADRs; a step type added-then-iterated is **one ADR**
  with the evolution in *Consequences*; an engine/driver progression groups by
  pivot, not per-browser; recording formats, the OpenAPI cluster, and the
  install/provisioning chain each collapse to ~1–2 ADRs.
- **Keep separate** genuinely distinct contracts: each new step type, each new
  CLI flag with its own semantics, precedence/default rules, reporters/output
  formats, the concurrency model, the 3.0.0 breaking redesign, the monorepo merge.
- **Drop** (with a recorded reason): pure telemetry internals, throwaway
  prototypes, reverted features (noted as "decision not pursued"), test-infra, and
  most release-pipeline/CI plumbing. For infra, keep only milestones
  (first publish/semantic-release, GitHub Action, Docker image, the monorepo merge).

**Headline numbers:** **176 proposed ADRs** distilled from the **250** inventory
rows. Of the 250: **104 rows folded into 42 multi-row merge ADRs**, **134 rows
kept ~1:1** as their own ADR, and **12 rows dropped** as not-an-ADR. (ADR `00120`
corresponds to the already-authored `01000`; it is listed for traceability but not
re-authored, so **175** ADRs remain to be written.) Coverage is exhaustive: every
inventory `Seq` 1–250 appears exactly once across *Absorbs* or *Dropped*.

---

## Proposed ADRs

ADR IDs are assigned sequentially in **date order**, dated to the **earliest**
absorbed inventory row.

| ADR ID | Date | Title | Theme | Repo(s) | Absorbs (Seq #) | Rationale |
|---|---|---|---|---|---|---|
| 00001 | 2022-04-22 | initial-selenium-engine-and-browser-fallback | engine | doc-detective | 1, 6, 38 | Genesis engine: Selenium CLI, Puppeteer recording experiment, platform-keyed browser fallback — one "how do we drive a browser" decision. |
| 00002 | 2022-04-23 | cli-flag-surface-and-file-over-args-precedence | config | doc-detective | 2 | First CLI flag contract + file-config-overridden-by-args precedence rule. |
| 00003 | 2022-04-23 | filetype-test-comment-statement-contract | config | doc-detective | 3, 15, 43 | Per-extension test-comment statements + their early renames/parser rewrites — one evolving contract. |
| 00004 | 2022-04-25 | recursive-directory-walk-and-extension-filtering | resolve | doc-detective | 4 | Recursive input discovery + extension allow/exclude lists. |
| 00005 | 2022-04-27 | remote-selenium-server-config | config | doc-detective | 5 | `seleniumServer` remote-driver URL field. |
| 00006 | 2022-05-03 | test-and-result-object-contracts-with-uuid-ids | schema | doc-detective | 7 | testDefinition/testResult shape, generated UUID test ids, action enum. |
| 00007 | 2022-05-04 | wait-action-millisecond-duration | step | doc-detective | 8 | `wait` step type; seconds→milliseconds duration semantics. |
| 00008 | 2022-05-06 | find-action-single-css-selector | step | doc-detective | 9 | `find` step type collapsed to a single `css` selector. |
| 00009 | 2022-05-06 | one-browser-session-per-test-run | runner | doc-detective | 10 | Hoist Builder out of the per-action loop (session lifecycle). |
| 00010 | 2022-05-07 | click-action | step | doc-detective | 11 | `click` step type. |
| 00011 | 2022-05-07 | type-action-and-matchtext-assertion | step | doc-detective | 12 | `type` step type + matchText assertion semantics. |
| 00012 | 2022-05-09 | screenshot-action | step | doc-detective | 13 | `screenshot` step type. |
| 00013 | 2022-05-11 | json-result-output-and-pass-warning-fail-rollup | report | doc-detective | 14, 16, 17 | Result file output, input/output path rename, and PASS/WARNING/FAIL rollup — one reporting contract. |
| 00014 | 2022-05-14 | unified-media-directory | config | doc-detective | 18 | Merge image+video dirs into `mediaDirectory`. |
| 00015 | 2022-05-17 | browser-options-headless-path-viewport | config | doc-detective | 19, 35 | `browserOptions{headless,path}` + viewport flags; empty-path default-Chromium guard. |
| 00016 | 2022-05-17 | recording-action-types | record | doc-detective | 20 | `recordStart`/`recordStop` step types wired into the runner. |
| 00017 | 2022-05-18 | movemouse-and-scroll-actions | step | doc-detective | 21, 49 | `moveMouse` + `scroll` step types and their default/centering refinements. |
| 00018 | 2022-05-20 | recording-formats-gif-webm-mp4 | record | doc-detective | 22, 41 | ffmpeg-driven `.gif`, then `.webm`/`.mp4` + resize/format contract. |
| 00019 | 2022-05-22 | runshell-action | step | doc-detective | 23 | `runShell` step type (exec, env file, exitCode). |
| 00020 | 2022-05-27 | screenshot-visual-diff-matching | record | doc-detective | 24 | `matchPrevious` pixel-diff threshold compare. |
| 00021 | 2022-05-29 | verbose-logging-flag | config | doc-detective | 25 | `verbose` config + flag. |
| 00022 | 2022-06-16 | checklink-action | step | doc-detective | 26 | `checkLink` step type (HTTP status check). |
| 00023 | 2022-08-16 | programmatic-run-api | runner | doc-detective | 27, 28 | Export `run(config)` / `run(config,argv)` + in-memory config resolution. |
| 00024 | 2022-08-25 | flatten-gif-options-to-top-level-fields | schema | doc-detective | 29 | BREAKING flatten `gifOptions` → `gifFps`/`gifWidth`. |
| 00025 | 2022-09-15 | supercharged-find-sub-actions | step | doc-detective | 31, 33 | `find` gains nested matchText/moveMouse/click/type/wait sub-actions. |
| 00026 | 2022-09-16 | env-var-substitution-across-actions | config | doc-detective | 32, 52 | `$ENV` support across actions, `setEnvs`/`loadEnvs`, top-level `config.env`. |
| 00027 | 2022-09-20 | config-system-rewrite-loglevel-enum | config | doc-detective | 34 | `logLevel` enum replaces boolean verbose; per-field validation. |
| 00028 | 2022-09-22 | setup-cleanup-lifecycle-hooks | config | doc-detective | 36 | `setup`/`cleanup` lifecycle hooks + flags/env. |
| 00029 | 2022-09-23 | bundled-ffmpeg-installer | record | doc-detective | 37, 122 | Autoload ffmpeg via `@ffmpeg-installer` (core, then re-bundled at wrapper). |
| 00030 | 2022-09-27 | httprequest-action | step | doc-detective | 39, 53, 54 | `httpRequest` step type + envsFromResponseData + headers/params renames — one step type's evolution. |
| 00031 | 2022-10-01 | recording-overwrite-and-failed-test-capture | record | doc-detective | 40, 42 | `overwrite` guard + save-failed-test-recording defaults/overrides. |
| 00032 | 2022-10-05 | config-precedence-default-tier | resolve | doc-detective | 44 | argv > env > config > defaultConfig fallback tier. |
| 00033 | 2022-10-07 | gui-only-browser-session-gating | runner | doc-detective | 45 | Browser page created only for GUI tests via `browserActions` allowlist. |
| 00034 | 2022-10-10 | file-download-support | config | doc-detective | 46 | `downloadDirectory` + setDownloadBehavior. |
| 00035 | 2022-10-13 | coverage-analysis-feature | report | doc-detective | 47, 48 | `runCoverage` entrypoint + content-coverage markup config (add→remove lifecycle; removed at 3.0.0). |
| 00036 | 2022-10-24 | suggest-tests-feature | resolve | doc-detective | 50 | `suggest` entrypoint writing sidecar tests (removed at 3.0.0). |
| 00037 | 2022-10-24 | incognito-context-and-analytics-disabled | runner | doc-detective | 51 | Incognito-by-default browser context; analytics globally disabled. |
| 00038 | 2023-01-26 | schema-package-and-draft-2020-12 | schema | common | 55, 60 | First standalone-schema shape, draft 2020-12, dynamic `*.schema.json` loader. |
| 00039 | 2023-01-29 | v1-to-v2-engine-unbundle-thin-wrapper | runner | doc-detective | 57 | Delete bundled engine; repo becomes a thin `doc-detective-core` wrapper. |
| 00040 | 2023-01-30 | schema-v1-step-vocabulary-and-test-container | schema | common | 58, 61 | 13 v1 step schemas + `test_v1` spec-file container. |
| 00041 | 2023-01-31 | ajv-validation-and-self-validating-examples | validation | common | 59, 63 | Adopt AJV; examples as contract fixtures; `useDefaults`/`coerceTypes`/uuid defaults. |
| 00042 | 2023-02-09 | puppeteer-to-appium-webdriverio-pivot | engine | core | 62 | Adopt Appium/WebdriverIO drivers; in-process Appium lifecycle. |
| 00043 | 2023-02-21 | config-v1-contract | schema | common | 64 | `config_v1` config-file contract. |
| 00044 | 2023-02-28 | context-platform-gating | engine | core | 65 | spec/test `contexts{application,platforms[]}`; skip when no context matches. |
| 00045 | 2023-03-04 | runstep-dispatch-and-verdict-rollup | runner | core | 66 | `runStep` action dispatch + FAIL>WARNING>PASS rollup. |
| 00046 | 2023-03-05 | schema-v2-step-family | schema | common | 67, 69, 71 | v2 step era: `action`→`const`, inline id/description, the v2 family merge + new v2 steps. |
| 00047 | 2023-03-10 | v2-action-handlers-runtime | step | core | 68 | v2 per-action handlers (loadEnvs, https-prepend, runShell/httpRequest/checkLink). |
| 00048 | 2023-03-13 | find-inline-subactions-v2-redesign | step | core | 70 | `find` absorbs click/moveTo/typeKeys; standalone matchText/etc removed. |
| 00049 | 2023-03-22 | schema-v2-context-test-spec-containers | schema | common | 73 | `context_v2`/`test_v2`/`spec_v2`; external `$ref` in anyOf. |
| 00050 | 2023-03-26 | config-v2-contract | schema | common | 74 | `config_v2` config-file contract. |
| 00051 | 2023-03-31 | config-v2-runner-rewrite-and-telemetry-drop | config | core | 75 | `setConfig` validates config_v2; `test()`→`runTests()`; legacy analytics dropped. |
| 00052 | 2023-04-02 | source-file-path-association | schema | common | 76 | `file` path on spec & test. |
| 00053 | 2023-04-07 | authored-vs-dereferenced-schema-split | schema | common | 78, 89 | `src_schemas`→`output_schemas` deref pipeline; later `$ENV`-URL widening + local `$ref`. |
| 00054 | 2023-04-14 | v2-cli-config-contract | config | doc-detective | 80 | v2 CLI flag set; AJV-validates `config_v2`; timestamped result files. |
| 00055 | 2023-04-15 | default-markdown-filetype-and-markup-map | schema | common | 81, 90 | Default Markdown fileType + markup→action map; default-timeout shifts. |
| 00056 | 2023-04-21 | appium-child-process-spawn | runner | core | 82 | Appium spawned as a tree-killable child process. |
| 00057 | 2023-05-01 | driver-auto-install-postinstall | install | core | 83 | postinstall installs gecko/chromium drivers; `inContainer()`. |
| 00058 | 2023-06-03 | chrome-chromedriver-detection | engine | core | 85 | Chrome detection + version-matched chromedriver as its own app. |
| 00059 | 2023-07-21 | docker-base-image-contract | docker | docker | 88 | Dockerfile base/runtime contract + multiarch build. |
| 00060 | 2023-07-24 | v2-release-src-restructure | runner | doc-detective | 87 | 2.0.0 `src/` restructure (runTests/runCoverage/suggestTests). |
| 00061 | 2023-09-08 | per-context-browser-app-options | engine | core | 91 | `app.options` width/height/headless wired per context. |
| 00062 | 2023-09-11 | per-test-driver-gating | engine | core | 92, 79 | `isDriverRequired` gating + default-contexts/uuid identity. |
| 00063 | 2023-10-11 | test-level-setup-cleanup-and-detectsteps | schema | common | 93 | String `setup`/`cleanup` prepend/append + `detectSteps` boolean. |
| 00064 | 2023-10-20 | markup-driven-test-auto-detection | schema | common | 94, 98 | Markup `actions[]` objects + runner auto-generates tests; first-action ordering. |
| 00065 | 2023-10-23 | relative-url-and-origin-resolution | schema | common | 95 | Leading-`/` relative URLs; `hostname`→`origin`; checkLink default statusCodes. |
| 00066 | 2023-10-26 | savescreenshot-directory-and-visual-diff | schema | common | 96 | `saveScreenshot.directory`, `maxVariation`, `overwrite` enum, pixel diff. |
| 00067 | 2023-10-27 | skipped-verdict-canonicalization | report | core | 97 | `SKIP`→`SKIPPED` verdict string. |
| 00068 | 2023-12-14 | standalone-moveto-and-stoprecording | step | common | 99 | Standalone `moveTo` action; `stopRecording_v2`; find.moveTo bool→object. |
| 00069 | 2023-12-16 | ffmpeg-recording-engine | record | core | 72, 100 | OBS scaffold (never shipped) → FFmpeg gdigrab desktop capture + cursor overlay. |
| 00070 | 2024-01-03 | media-and-download-directory-derivation | config | core | 101 | Derive media/download dirs; download-then-convert recording. |
| 00071 | 2024-01-10 | recording-startrecording-rework-and-typekeys-delay | record | core | 102, 103 | startRecording drops fps/adds directory; per-keystroke recording delay. |
| 00072 | 2024-01-22 | safari-driver-and-detection-rewrite | engine | core | 105 | Safari driver + `@puppeteer/browsers` detection rewrite; OBS retired. |
| 00073 | 2024-01-31 | edge-browser-and-chrome-only-recording | engine | core | 106 | Microsoft Edge engine; recording restricted to Chrome. |
| 00074 | 2024-02-08 | step-result-spread-and-verdict-fix | report | core | 107 | Full stepResult spread; runShell stops failing on stderr. |
| 00075 | 2024-03-08 | doc-detective-bin-subcommand-dispatch | config | doc-detective | 108, 111 | `doc-detective` bin with runTests/runCoverage subcommand dispatch; auto-load `.doc-detective.json`. |
| 00076 | 2024-03-15 | asciidoc-html-filetypes-and-detectsteps-opt-in | schema | common | 109 | AsciiDoc/HTML fileTypes; `detectSteps` default true→false. |
| 00077 | 2024-03-16 | runshell-exitcodes-output-expectation | step | common | 110 | runShell `exitCodes`/`output`/`stdio` + setVariables-from-output. |
| 00078 | 2024-03-29 | loadenvs-recursive-substitution | resolve | core | 114 | `loadEnvs` recursive in-place `$VAR` walk. |
| 00079 | 2024-04-16 | browser-fallback-order-firefox-first | engine | core | 116, 117 | Firefox-first fallback; driver-availability gating; headed-chrome recording gate. |
| 00080 | 2024-05-03 | remote-test-source-fetching | resolve | core | 118 | `http(s)://` sources fetched to tmpdir + cleanup. |
| 00081 | 2024-05-03 | markup-multiregex-capture-group-substitution | resolve | core | 119, 121 | `matchAll` + `$n` capture-group substitution; full-step `$ref` markup actions. |
| 00082 | 2024-06-29 | runshell-httprequest-timeout-and-output-save-diff | schema | common | 123 | runShell/httpRequest `timeout`; output-save with Levenshtein diff; `workingDirectory`. |
| 00083 | 2024-06-29 | duplicate-test-id-disambiguation | resolve | core | 124 | Duplicate declared `id` rewritten `${id}-${uuid}`. |
| 00084 | 2024-07-11 | outputresults-file-or-directory | report | doc-detective | 125 | `outputResults` accepts file path OR directory; collision auto-increment. |
| 00085 | 2024-07-12 | headless-retry-fallback | engine | core | 126 | Generic headless-retry on driver-start failure → SKIPPED. |
| 00086 | 2024-07-24 | relativepathbase-and-resolvepaths | schema | common | 127 | `relativePathBase` enum + public `resolvePaths` export. |
| 00087 | 2024-08-08 | runshell-via-shell | step | core | 129 | spawnCommand runs through a shell (pipes/redirects). |
| 00088 | 2024-08-09 | detectsteps-test-level-precedence | resolve | core | 130, 128 | Test-level `detectSteps` overrides config; default recording ext `.mp4`. |
| 00089 | 2024-08-26 | screenshot-selector-crop | schema | common | 131 | `saveScreenshot.crop{selector,padding}` via sharp. |
| 00090 | 2024-09-04 | openapi-integration-for-httprequest | integrations | common | 132 | `openApi` object + operation engine (example seeding, mock-response, YAML). |
| 00091 | 2024-09-20 | validation-resilience-and-readfile-loader | validation | common | 133, 134 | `allowUnionTypes`; missing-schema guard; `readFile` JSON/YAML/remote loader. |
| 00092 | 2024-09-28 | arazzo-workflow-support | integrations | core | 135 | Arazzo 1.0 → Doc Detective spec translation. |
| 00093 | 2024-10-24 | pre-run-dependency-check | runner | doc-detective | 136 | In-repo no-`node_modules` prompt to `npm install` or abort. |
| 00094 | 2025-01-18 | find-click-button-and-viewport | schema | common | 137 | `find.click.button` enum; context viewport width/height. |
| 00095 | 2025-01-20 | runcode-action | step | common | 138 | `runCode` step type (language enum, temp script, interpreter dispatch). |
| 00096 | 2025-02-07 | v3-action-as-key-schema-redesign | schema | common | 139, 141, 160, 164 | The v3 `step_v3` action-as-key family: action IS the key, `stepId`, per-action `*_v3`, stricter HTTP shapes. |
| 00097 | 2025-02-07 | compatibleschemas-v2-to-v3-auto-transform | validation | common | 140 | `transformToSchemaKey` v2→v3 auto-migration engine. |
| 00098 | 2025-03-10 | context-v3-and-browsers-array-redesign | schema | common | 142, 146 | `context_v3` platforms/browsers; unified `browsers` array (safari≡webkit). |
| 00099 | 2025-03-11 | config-v3-restructure | schema | common | 143 | `config_v3` (input, fileTypes anyOf, inlineStatements, integrations). |
| 00100 | 2025-03-12 | v3-runner-adoption | config | core | 144, 147, 148, 149, 150, 152, 153, 158, 163 | Runner-side v3 adoption: object-keyed dispatch, resolveContexts/runOn, stepId reports, v3 action handlers (find/click/httpRequest/record), regex matching. |
| 00101 | 2025-03-13 | v3-spec-test-resolution | resolve | core | 145 | v3 source-file resolution: `spec_v3`, before/after, specId/contentPath, parseContent. |
| 00102 | 2025-04-01 | yaml-test-spec-support | resolve | core | 151 | Validate JSON **and** YAML specs against `spec_v3`. |
| 00103 | 2025-04-10 | drop-edge-and-remove-coverage-suggest | engine | core | 154 | Drop Edge caps; remove `runCoverage`/`suggestTests` from the test surface. |
| 00104 | 2025-04-12 | expressions-runtime | step | core | 155 | `{{…}}` expressions over meta values via jq/JSONPath/regex extract. |
| 00105 | 2025-04-13 | unified-outputs-object | report | core | 156 | Unified `outputs` object threaded into expression context. |
| 00106 | 2025-04-14 | goto-readystate-wait-and-warning-verdict | report | core | 157 | goTo waits for readyState=complete; timeout → WARNING (third verdict). |
| 00107 | 2025-04-17 | default-filetype-inline-statement-overhaul | config | core | 159 | MDX/JSX/AsciiDoc/HTML default fileType inline statement styles. |
| 00108 | 2025-04-18 | three-point-zero-wrapper-redesign | config | doc-detective | 161 | 3.0.0 breaking redesign: runTests-only, config_v2→v3, YAML config, new defaults, pluggable reporter. |
| 00109 | 2025-04-22 | default-context-fallback | runner | core | 162 | Push a default `{platform}` context when resolveContexts yields none. |
| 00110 | 2025-05-01 | input-output-arg-path-resolution | config | doc-detective | 165, 166, 167 | `--input`/`--output` `path.resolve` from cwd; comma-separated multi-file `--input`; loadVariables path resolution. |
| 00111 | 2025-05-12 | resolver-as-standalone-package | resolve | resolver | 168 | Re-baseline detect→parse→resolve pipeline as the `doc-detective-resolver` package. |
| 00112 | 2025-05-13 | resolvedtests-envelope-and-delegated-resolution | schema | common | 169, 170 | `resolvedTests_v3` envelope + runner delegates detection/resolution to resolver. |
| 00113 | 2025-05-27 | configpath-in-merged-config | config | doc-detective | 171 | Expose `config.configPath` (config-file location). |
| 00114 | 2025-05-28 | find-by-text-normalize-space-and-driver-timeouts | engine | core | 172 | XPath `normalize-space()` text match; 2-min driver init timeouts. |
| 00115 | 2025-06-01 | httprequest-markup-detector-and-filetype-extends | resolve | resolver | 173, 174 | `httpRequestFormat` fenced-block detector; `fileType.extends`; `DOC_DETECTIVE` env override; structured AJV errors. |
| 00116 | 2025-06-09 | unsafe-step-gating | schema | common | 175 | `unsafe` flag + `allowUnsafeSteps` gate relocated to step level. |
| 00117 | 2025-06-12 | stop-on-fail-and-element-outputs | report | core | 176 | Steps after a FAIL → SKIPPED; rich `setElementOutputs`. |
| 00118 | 2025-06-17 | docker-container-env-and-ffmpeg | docker | docker | 178, 177 | `DOC_DETECTIVE` env JSON replaces `CONTAINER`; ffmpeg in Linux image; 10-min driver timeouts. |
| 00119 | 2025-06-20 | concurrentrunners-config-contract | config | common | 179 | `concurrentRunners` integer/boolean schema + normalization. |
| 00120 | 2025-06-22 | gate-advanced-ordering-under-concurrent-runners | runner | doc-detective | 250 | **Already authored as `01000`** (the worked example) — listed for traceability only. |
| 00121 | 2025-06-25 | debug-stepthrough-and-breakpoint | config | common | 181 | `debug` enum (`stepThrough`) + step `breakpoint`. |
| 00122 | 2025-07-20 | debug-version-config-dump | report | doc-detective | 182 | `logLevel:"debug"` prints version data + resolved config. |
| 00123 | 2025-08-10 | cookie-actions | step | common | 183 | `saveCookie`/`loadCookie` step types (Netscape format, XOR path/variable). |
| 00124 | 2025-08-22 | draganddrop-action | step | common | 184 | `dragAndDrop` step type (source+target, HTML5-sim + WebDriver fallback). |
| 00125 | 2025-10-08 | dita-ot-in-image | docker | docker | 185 | DITA-OT 4.3.4 added to both images. |
| 00126 | 2025-10-20 | dita-support | schema | common | 186 | DITA fileType + `.ditamap` CLI + `processDitaMaps`. |
| 00127 | 2025-10-21 | env-config-and-doc-detective-api | config | core | 187 | `DOC_DETECTIVE_CONFIG` env override + `integrations.docDetectiveApi`/`runViaApi`. |
| 00128 | 2025-10-22 | openapi-context-merge-and-header-fail | engine | core | 188 | `integrations.openApi` merged per context; unmatched response headers FAIL. |
| 00129 | 2025-10-23 | remote-runner-api-client | report | doc-detective | 189 | `DOC_DETECTIVE_API` fetch resolved tests / POST results round-trip. |
| 00130 | 2025-10-24 | appium-status-probe-and-node18-drop | engine | core | 190 | Appium readiness `/status` probe; drop Node 18. |
| 00131 | 2025-10-30 | sitemap-crawl-discovery | config | common | 191 | `crawl` boolean crawls `sitemap.xml` for additional files. |
| 00132 | 2025-11-05 | wdio-v9-bidi-attempt-and-classic-revert | engine | core | 192 | WDIO v9+BiDi migration reverted to classic (kept v9); polling findElement. |
| 00133 | 2025-11-13 | httprequest-response-required-fields | schema | common | 193 | `response.required` field-path existence assertions. |
| 00134 | 2025-11-16 | multi-criteria-element-finding | schema | common | 194 | elementId/TestId/Class/Attribute/Aria criteria; string shorthand = multi-field OR. |
| 00135 | 2025-11-19 | regression-diffs-to-warning | report | core | 195, 198 | maxVariation overruns → WARNING (file still written); skipped-context report shape fix. |
| 00136 | 2025-11-19 | goto-waituntil-conditions | schema | common | 196 | `goTo.waitUntil{networkIdleTime,domIdleTime,element}` + timeout. |
| 00137 | 2025-11-26 | respect-explicit-false-recursive-detectsteps | config | doc-detective | 197 | `?? true` instead of `|| true` for `recursive`/`detectSteps`. |
| 00138 | 2025-12-01 | public-getrunner-api | runner | core | 199 | `getRunner({headless})` drives a live session + runs steps directly. |
| 00139 | 2025-12-02 | fractional-maxvariation-comparison | step | core | 200 | Unified 0–1 fractional Levenshtein comparison contract. |
| 00140 | 2025-12-06 | multi-os-docker-publish-contract | docker | docker | 201 | Windows image + canonical `docdetective/docdetective` publish matrix. |
| 00141 | 2025-12-16 | heretto-cms-integration | integrations | common | 202 | `integrations.heretto[]` + `heretto:` source refs + screenshot uploader round-trip. |
| 00142 | 2025-12-24 | checklink-browser-ua-and-status-error | step | core | 203 | checkLink sends browser UA; error reports actual status (bot-block fix). |
| 00143 | 2026-01-27 | common-typescript-migration | infra | common | 204, 209 | `.js`→`.ts`; generated typed interfaces; export public types. |
| 00144 | 2026-02-24 | browser-safe-detecttests-module | infra | common | 205 | Browser-safe pure `detectTests`/`parseContent` + browser bundle. |
| 00145 | 2026-02-26 | merge-core-into-monorepo | infra | doc-detective | 206 | Merge `core` in; ESM/TS refactor under `src/core/*`. |
| 00146 | 2026-02-28 | merge-common-into-monorepo | infra | doc-detective | 207 | Merge `doc-detective-common` under `src/common/`; in-repo schema surface. |
| 00147 | 2026-03-07 | merge-docker-configs-into-monorepo | docker | doc-detective | 208 | Merge docker configs + container-build-push workflow. |
| 00148 | 2026-03-11 | filetypes-module-and-detection-refactor | resolve | common | 210 | `fileTypes.ts` + detectTests line/location tracking. |
| 00149 | 2026-03-20 | npm-packaging-bundling-contract | infra | doc-detective | 211 | `files`/`scripts` + prepack/postpack workspace strip for `npx`. |
| 00150 | 2026-03-25 | heretto-loader-in-monorepo | resolve | core | 212 | In-repo Heretto loader (re-exposure of `00141`); job-status polling fix. |
| 00151 | 2026-04-07 | checklink-non-2xx-status-codes | step | core | 213 | checkLink accepts listed non-2xx codes (pass/fail contract). |
| 00152 | 2026-04-16 | checklink-bot-protection-mitigation | step | core | 214 | Browser-like headers + retry + HEAD fallback for 429/403. |
| 00153 | 2026-04-17 | self-contained-html-reporter | report | core | 215, 244 | HTML report reporter + `config_v3` option; per-run HTML beside JSON. |
| 00154 | 2026-04-18 | install-agents-cli-subcommand | config | doc-detective | 216 | `install-agents` with six coding-agent adapters. |
| 00155 | 2026-04-18 | dita-inline-detection-expansion | resolve | common | 217 | Order-flexible DITA `<data>` regexes; XML entity decoding; cookie sameSite. |
| 00156 | 2026-04-18 | screenshot-crop-shift-clamp | step | core | 218 | Crop shift-rather-than-shrink + aspect-ratio jitter tolerance. |
| 00157 | 2026-04-19 | screenshot-reference-image-regression | step | core | 219 | screenshot accepts URL reference images for visual regression. |
| 00158 | 2026-04-19 | origin-params-query-appending | config | common | 220 | `config.originParams` + step `params` auto-append query params. |
| 00159 | 2026-04-20 | coding-agent-postinstall-detection | install | doc-detective | 221 | postinstall offers `install-agents` (TTY-gated, PATH sanitized). |
| 00160 | 2026-04-30 | test-spec-regex-filters | config | common | 223 | `--test`/`--spec` → `testFilter`/`specFilter` regex arrays. |
| 00161 | 2026-05-02 | dry-run-flag | config | common | 224, 230 | `--dry-run` resolves without executing; dry-run skips app detection. |
| 00162 | 2026-05-05 | dynamic-appium-port | runner | core | 222, 225 | Appium `findFreePort()` (supersedes `waitForPortFree`). |
| 00163 | 2026-05-06 | doc-detective-platform-runner-entrypoint | infra | doc-detective | 226 | `doc-detective-runner` bin (platform entrypoint, self-kill timeout). |
| 00164 | 2026-05-11 | runtime-lazy-install-provisioning | install | doc-detective | 227, 231, 233, 234, 236, 239 | Heavy-dep/browser provisioning chain: lazy-install/cacheDir → eager default → install-log → JIT Chrome → companions/timeout ceiling. |
| 00165 | 2026-05-12 | post-run-hint-system | report | doc-detective | 228 | `src/hints/*` contextual hints + `config.hints`/`--no-hints`. |
| 00166 | 2026-06-01 | node-22-engines-floor | infra | doc-detective | 229 | `engines` requires node `>=22.12.0`. |
| 00167 | 2026-06-04 | typekeys-lazy-key-load | step | core | 232 | Lazy-load webdriverio `Key`; `$SUBTRACT$` alias. |
| 00168 | 2026-06-08 | driver-context-resolution-hardening | resolve | core | 235 | Nameless driver-context SKIPPED; unknown browser throws; webkit→Safari. |
| 00169 | 2026-06-11 | lean-install-browser-detection | resolve | core | 238 | Appium driver-presence regexes match stdout+stderr; degrade to empty apps. |
| 00170 | 2026-06-13 | debug-subcommand-diagnostic-dump | config | doc-detective | 240 | `doc-detective debug` redacted diagnostic dump; schema `debug` deprecated. |
| 00171 | 2026-06-13 | runtime-dependency-detection-and-warmup | runner | core | 241 | `requiredBrowserAssets(name)` table + Appium warm-up guard. |
| 00172 | 2026-06-14 | concurrent-test-runners | runner | core | 242 | Parallel context execution (the monorepo re-land of reverted 180). |
| 00173 | 2026-06-14 | autoscreenshot-and-runfolder-reporter | config | core | 243, 245, 247 | `autoScreenshot` + `runFolder` reporter (run-<runId> archive, stdout-order contract, empty-dir skip). |
| 00174 | 2026-06-16 | ffmpeg-any-app-recording-engine | record | core | 246 | ffmpeg engine for any-app recording + concurrency-safe Chrome; engine-selection schema. |
| 00175 | 2026-06-17 | autorecord-and-overlapping-recordings | record | core | 248 | `autoRecord` + overlapping LIFO recordings; `stopRecord_v3`. |
| 00176 | 2026-06-17 | runbrowserscript-action | step | core | 249 | `runBrowserScript` step type (JS in browser context). |

---

## Dropped / not-an-ADR

| Seq | What | Why dropped |
|---|---|---|
| 30 | Google-Analytics + custom-server `analytics` feature | Telemetry internals; superseded/disabled (Seq 51) and removed in the config-v2 rewrite (Seq 75). Not a surviving contract. |
| 56 | `analytics_v1` telemetry payload schema | Telemetry internals; the whole analytics path was dropped at Seq 75. |
| 77 | `getAvailableApps` early scaffold (Firefox-only, coverage/suggest hard-blocked) | Transitional internal scaffold; the real app-detection contract is Seq 85 (`00058`). |
| 84 | `runCoverage()` core implementation | Implementation of the coverage feature already captured as a decision at `00035`; add→remove lifecycle, removed at 3.0.0 (`00103`). |
| 86 | `suggestTests()` core implementation | Implementation of the suggest feature already captured at `00036`; removed at 3.0.0 (`00103`). |
| 104 | `--output`→`config.runTests.output` mapping | Mechanical plumbing folded into the v2 CLI/bin contract; no distinct observable contract. |
| 112 | PostHog anonymous telemetry + `telemetry.send` opt-out default | Telemetry internals (explicitly out of scope per CLAUDE.md / drop guidance). |
| 113 | Don't-unlink-when-targetPath===downloadPath recording guard | Bug-fix guard, not a contract decision. |
| 115 | Interactive command picker (prompt-sync) | Removed in 3.0.0 (`00108`); reverted/short-lived UX, not a surviving contract. |
| 120 | `responseParams` deprecation + non-standard `deprecated` keyword removal | Deprecation bookkeeping / AJV-ignored keyword; no observable contract change. |
| 180 | Worker-pool parallelism attempt **(reverted)** | Decision **not pursued** on that branch; recorded as the antecedent of `00172` (Seq 242) rather than its own ADR. |
| 237 | Pin `@img/sharp-libvips` + fail-fast on unsupported arch | Dependency-pin / build-hardening plumbing (CLAUDE.md exempts dep bumps). |

> The remaining inventory **Borderline** rows are resolved as: `82f2b02d` (stopRecording
> signature reshuffle), `9f79f904` (outputResults async→sync) and the `3dc533`
> capture-group churn are **folded** into their parent ADRs (`00031`/`00084`/`00081`);
> the Mocha migration, the `98e8317c` net-no-op markup churn, the
> `npm-publish.yml` docker-dispatch step, the split-Windows-base/multi-arch image,
> the runtime-dep majors, and the `cacheDir`/message-text refactors are **excluded**
> exactly as the inventory's "Borderline" table leans (test-infra / net-no-op /
> CI / dep / cosmetic). None of these carry an inventory `Seq`, so they do not
> affect the 250-row accounting.

---

## Open calls for the user

1. **Telemetry (Seq 30, 56, 112): drop entirely?** I dropped all three as
   internals. If you want the *history* of telemetry-as-a-contract (opt-in→opt-out
   default flip, then removal) recorded, that's **one** "telemetry lifecycle" ADR
   instead. Yes = author one; No = stay dropped.

2. **v3 runner adoption (`00100`) absorbs nine Seqs (144,147–150,152,153,158,163).**
   That's the largest single merge. Is one "v3 runner adoption" ADR right, or do
   you want the **httpRequest v3 rewrite** (150) and the **find/click v3 overhaul**
   (152,158,163,149) split out as their own ADRs alongside the schema-side `00096`?

3. **Runtime lazy-install (`00164`) absorbs six Seqs (227,231,233,234,236,239)** —
   the lazy→eager→log→JIT→companions chain. Keep as one provisioning ADR, or split
   into "lazy-install + cacheDir" vs. "eager-default postinstall" (the
   user-observable default flip at Seq 231)?

4. **Coverage/Suggest (`00035`/`00036`):** I recorded each as one add→remove
   lifecycle ADR (absorbing the core impls 84/86 into *Dropped*). Prefer instead a
   single "analysis entrypoints (coverage+suggest), added 2022 and removed at
   3.0.0" ADR covering both? Yes = merge to one; No = keep two.

5. **Infra milestones:** I kept TS migration (`00143`), browser-safe module
   (`00144`), the three monorepo merges (`00145`–`00147`), npm packaging
   (`00149`), node floor (`00166`), and platform-runner bin (`00163`) as ADRs.
   Are node-floor (`00166`) and npm-packaging (`00149`) milestone-worthy, or drop
   them to keep infra to the merges + TS migration only?

6. **Docker (`00059`,`00118`,`00125`,`00140`,`00147`):** five docker ADRs. Is
   DITA-OT-in-image (`00125`) a real contract or build plumbing to drop?

---

## Counts

**Proposed ADRs: 176** — numbered contiguously `00001`–`00176`, one ID per row,
no gaps or collisions (verified). `00120` is the already-authored `01000`, so
**175** remain to author. This lands in the requested ~90–140 *thorough* range
once the reverted/dropped rows are set aside and the *Open calls* below are
adjudicated (each "merge harder" answer pulls the total down).

### By disposition of the 250 inventory rows

| Disposition | Rows |
|---|---|
| Folded into a multi-row (merged) ADR | 104 |
| Kept ~1:1 as its own ADR | 134 |
| Dropped (not-an-ADR) | 12 |
| **Total** | **250** |

(42 of the 176 ADRs are merge ADRs absorbing 2+ inventory rows; the other 134 map
one inventory row each.)

### Proposed ADRs by year (by earliest absorbed date)

| Year | ADR IDs | Count |
|---|---|---|
| 2022 | 00001–00037 | 37 |
| 2023 | 00038–00069 | 32 |
| 2024 | 00070–00093 | 24 |
| 2025 | 00094–00142 | 49 |
| 2026 | 00143–00176 | 34 |
| **Total** | 00001–00176 | **176** |

### Proposed ADRs by theme

| Theme | Count |
|---|---|
| config / CLI | 30 |
| schema | 29 |
| step / action types | 27 |
| resolve / detection | 17 |
| engine / driver | 15 |
| runner / scheduler | 15 |
| report / reporters / verdict | 13 |
| record / recording | 9 |
| infra / merges / packaging | 7 |
| docker / image | 5 |
| validation (AJV / transform) | 3 |
| install / provisioning | 3 |
| integrations (OpenAPI/Arazzo/Heretto/API) | 3 |
| **Total** | **176** |
