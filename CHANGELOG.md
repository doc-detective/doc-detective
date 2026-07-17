# [4.35.0](https://github.com/doc-detective/doc-detective/compare/v4.34.0...v4.35.0) (2026-07-17)


### Features

* **annotate:** persistent annotations for recordings ([#666](https://github.com/doc-detective/doc-detective/issues/666)) ([60e8f7f](https://github.com/doc-detective/doc-detective/commit/60e8f7f80019b2994cb2855bc735aa91c06d1551)), closes [#662](https://github.com/doc-detective/doc-detective/issues/662)
* **hints:** recommend mobile platforms when a browser floors a viewport ([#657](https://github.com/doc-detective/doc-detective/issues/657)) ([7121df3](https://github.com/doc-detective/doc-detective/commit/7121df33ab369e97799cd02aba5387a8d97bcd86))
* **screenshot:** declarative screenshot annotations ([978eeef](https://github.com/doc-detective/doc-detective/commit/978eeef8cb41e56101de39d8251fe578f75b5b98))

# [4.34.0](https://github.com/doc-detective/doc-detective/compare/v4.33.0...v4.34.0) (2026-07-17)


### Bug Fixes

* **record:** don't let a failed promote mask a verify FAIL ([3db1a84](https://github.com/doc-detective/doc-detective/commit/3db1a8428bb9924705f20e6efd95c50f087fa1bf))
* **record:** don't let verify guards report verdicts without evidence ([b753a71](https://github.com/doc-detective/doc-detective/commit/b753a7184f4c128ee7544b0d49fe60edf06d1da2))


### Features

* **record:** structural verify guards for the produced video ([7dc8205](https://github.com/doc-detective/doc-detective/commit/7dc8205ea6c875a5f506c3c7b335791ab4e9693b))

# [4.33.0](https://github.com/doc-detective/doc-detective/compare/v4.32.0...v4.33.0) (2026-07-17)


### Bug Fixes

* **hints:** correct refreshStaleRecording URL (drop spurious get-started/ segment) ([2391e3d](https://github.com/doc-detective/doc-detective/commit/2391e3d503fc4d8bc1cf5151855927202d586aa2))
* **record:** address review — multi-session checkpoints, seed safety, ADR accuracy ([28d92bf](https://github.com/doc-detective/doc-detective/commit/28d92bf74d4eadf6d69adfd52b61318aca857b61)), closes [#655](https://github.com/doc-detective/doc-detective/issues/655) [#656](https://github.com/doc-detective/doc-detective/issues/656)
* **record:** harden checkpoint capture and reporting after review ([e14d6d9](https://github.com/doc-detective/doc-detective/commit/e14d6d9d3efb949966bd308adfc2fb75cb1f648c))
* **record:** harden span verdicts and promote after review ([3f37bb7](https://github.com/doc-detective/doc-detective/commit/3f37bb76e726d6879a6bc1f62a0a82c27df9c609))
* **record:** isolate browser recordings per process, not just per context ([54c1c7b](https://github.com/doc-detective/doc-detective/commit/54c1c7ba6e24dac054f693f315d29e86e1c395a4))
* **record:** keep comparing checkpoints when the capture is skipped ([1ef9996](https://github.com/doc-detective/doc-detective/commit/1ef999612ec0306efbe163ed7e89102e018eaa48))
* **record:** report promote failures honestly in aboveVariation spans ([0c4f1d5](https://github.com/doc-detective/doc-detective/commit/0c4f1d562a401e7b087295dc1bfcf97b1b6df1fc)), closes [#651](https://github.com/doc-detective/doc-detective/issues/651)
* **schema:** gate the screenshot path on its extension, not its charset ([30738d2](https://github.com/doc-detective/doc-detective/commit/30738d2a05c69a82e30fa311993601e42ab8aa08))


### Features

* **record:** checkpoint config schema and shared artifact naming ([26be0a7](https://github.com/doc-detective/doc-detective/commit/26be0a76848718e02a2aa2c11e29026f8a64069e))
* **record:** checkpoint screenshots for recording spans ([5a4d3fe](https://github.com/doc-detective/doc-detective/commit/5a4d3fe17681bc06ec3b58c9445068064b38bfb4))
* **record:** overwrite aboveVariation and headless staleness detection ([9661147](https://github.com/doc-detective/doc-detective/commit/96611474e6ea9d6f2d9b75bba3d01313d27b4c3c))

# [4.32.0](https://github.com/doc-detective/doc-detective/compare/v4.31.0...v4.32.0) (2026-07-17)


### Bug Fixes

* **record:** clear the metadata probe's watchdog timer on completion ([fd3798b](https://github.com/doc-detective/doc-detective/commit/fd3798bf36dae4915f6cbc4ae487227bc01a82df))


### Features

* **record:** report recording metadata outputs from stopRecord ([0fd79c7](https://github.com/doc-detective/doc-detective/commit/0fd79c7d56a78fa93c11ae0b62d901fb8811e863))

# [4.31.0](https://github.com/doc-detective/doc-detective/compare/v4.30.0...v4.31.0) (2026-07-16)


### Features

* surface true viewport & screenshot dimensions when a browser floors a request ([#644](https://github.com/doc-detective/doc-detective/issues/644)) ([48dc75e](https://github.com/doc-detective/doc-detective/commit/48dc75e7f4cc826f2e8e94a665dffcfb3f7bd779))

# [4.30.0](https://github.com/doc-detective/doc-detective/compare/v4.29.1...v4.30.0) (2026-07-15)


### Features

* **lsp:** Doc Detective language server (DSL/LSP) ([#641](https://github.com/doc-detective/doc-detective/issues/641)) ([346f3be](https://github.com/doc-detective/doc-detective/commit/346f3bef2cda75fd22726027aaf156f85bdf5918))


### Performance Improvements

* **core:** in-memory screenshot pipeline (phase 4) ([#639](https://github.com/doc-detective/doc-detective/issues/639)) ([dee71b2](https://github.com/doc-detective/doc-detective/commit/dee71b29256e226ad89bad0279ed4ad32a00e522))

## [4.29.1](https://github.com/doc-detective/doc-detective/compare/v4.29.0...v4.29.1) (2026-07-15)


### Bug Fixes

* **core:** default log level to info so 2-arg calls stop dropping messages ([#633](https://github.com/doc-detective/doc-detective/issues/633)) ([c07a893](https://github.com/doc-detective/doc-detective/commit/c07a89301d8aa322e9a61adb83744d181b131999)), closes [src/utils.ts#log](https://github.com/src/utils.ts/issues/log)
* **core:** match find elementText against whole element text ([#634](https://github.com/doc-detective/doc-detective/issues/634)) ([f2173b2](https://github.com/doc-detective/doc-detective/commit/f2173b2944d2daf87645396c94fe728b018b1140))


### Performance Improvements

* **core:** resolution & validation efficiency (phase 3) ([#638](https://github.com/doc-detective/doc-detective/issues/638)) ([78c9986](https://github.com/doc-detective/doc-detective/commit/78c99868d79542f71b9f6fcaba06ef026ebf3a5f))
* **core:** startup-path latency removal (phase 2) ([#635](https://github.com/doc-detective/doc-detective/issues/635)) ([ecb27ea](https://github.com/doc-detective/doc-detective/commit/ecb27eaaf59bdf24cd63fdd2933925277a04c0d5))

# [4.29.0](https://github.com/doc-detective/doc-detective/compare/v4.28.0...v4.29.0) (2026-07-14)


### Features

* **core:** inline always-on warm phase (resolve → warm → run → sweep) ([#628](https://github.com/doc-detective/doc-detective/issues/628)) ([e5a9449](https://github.com/doc-detective/doc-detective/commit/e5a94498d54482507e0b0505a088d0f112630db2))


### Performance Improvements

* **core:** eliminate per-run/step/file waste (phase 1) ([#632](https://github.com/doc-detective/doc-detective/issues/632)) ([12a2312](https://github.com/doc-detective/doc-detective/commit/12a2312e8264b299b7cbe180c03b0a7c696cd5be))

# [4.28.0](https://github.com/doc-detective/doc-detective/compare/v4.27.0...v4.28.0) (2026-07-14)


### Bug Fixes

* **container:** align smoke-test fixture with runShell's bash default ([#624](https://github.com/doc-detective/doc-detective/issues/624)) ([e7aaf1c](https://github.com/doc-detective/doc-detective/commit/e7aaf1c35ef750b27abe51e8ecca50ef4c72ccd9)), closes [#610](https://github.com/doc-detective/doc-detective/issues/610)


### Features

* **ios:** managed WebDriverAgent prebuild in install ios, auto-consumed by sessions ([#626](https://github.com/doc-detective/doc-detective/issues/626)) ([52a96a3](https://github.com/doc-detective/doc-detective/commit/52a96a32949fd4fd4f2cdb3733eacc8b32ecf8fd))

# [4.27.0](https://github.com/doc-detective/doc-detective/compare/v4.26.8...v4.27.0) (2026-07-13)


### Bug Fixes

* **runtime:** make browser/driver install best-effort like BEST_EFFORT_NPM_DEPS ([#611](https://github.com/doc-detective/doc-detective/issues/611)) ([f2a0ea8](https://github.com/doc-detective/doc-detective/commit/f2a0ea833967173d09cb106254332bf5937a6f28))


### Features

* **runShell:** add shell parameter with cross-platform bash default ([#610](https://github.com/doc-detective/doc-detective/issues/610)) ([7aad08d](https://github.com/doc-detective/doc-detective/commit/7aad08d822999cafc009f363f14846d1a36476a4))

## [4.26.8](https://github.com/doc-detective/doc-detective/compare/v4.26.7...v4.26.8) (2026-07-12)


### Bug Fixes

* **expressions:** quote bare words inside a oneOf array literal ([#609](https://github.com/doc-detective/doc-detective/issues/609)) ([34ce367](https://github.com/doc-detective/doc-detective/commit/34ce3678662b0d481eb22eeeaaeb6a720c95b1c8)), closes [#585](https://github.com/doc-detective/doc-detective/issues/585)

## [4.26.7](https://github.com/doc-detective/doc-detective/compare/v4.26.6...v4.26.7) (2026-07-12)


### Bug Fixes

* **files:** resolve string-shorthand screenshot/record paths via relativePathBase ([#604](https://github.com/doc-detective/doc-detective/issues/604)) ([fa41a71](https://github.com/doc-detective/doc-detective/commit/fa41a711d5b80cf4b176d562af489fe50e1e9b1c))
* **httpRequest:** stop implicitly asserting a JSON-object response body ([#607](https://github.com/doc-detective/doc-detective/issues/607)) ([eb99a88](https://github.com/doc-detective/doc-detective/commit/eb99a88b4e379782853dfcd9c8afc1305ed9ea4b)), closes [#576](https://github.com/doc-detective/doc-detective/issues/576)

## [4.26.6](https://github.com/doc-detective/doc-detective/compare/v4.26.5...v4.26.6) (2026-07-11)


### Bug Fixes

* **runtime:** return null instead of throwing on an unusable cacheDir ([#596](https://github.com/doc-detective/doc-detective/issues/596)) ([5df3400](https://github.com/doc-detective/doc-detective/commit/5df3400a787f8b768b3fdd42e75479dd32e693a7))

## [4.26.5](https://github.com/doc-detective/doc-detective/compare/v4.26.4...v4.26.5) (2026-07-10)


### Bug Fixes

* **detect:** stop dropping legacy v2 inline steps ([#595](https://github.com/doc-detective/doc-detective/issues/595)) ([115985c](https://github.com/doc-detective/doc-detective/commit/115985ce6ca5c3321150fc717319f39a3f32bcd0))

## [4.26.4](https://github.com/doc-detective/doc-detective/compare/v4.26.3...v4.26.4) (2026-07-10)


### Bug Fixes

* **core:** process-surface teardown is best-effort and always deregisters ([#599](https://github.com/doc-detective/doc-detective/issues/599)) ([3b108c5](https://github.com/doc-detective/doc-detective/commit/3b108c5e614ad8a7d2fbd51b320b7cfe28aaaa1a))
* **core:** retry process-surface init crash under concurrent startup ([#547](https://github.com/doc-detective/doc-detective/issues/547)) ([c65d8c3](https://github.com/doc-detective/doc-detective/commit/c65d8c396bb3424647bd1c972da0cfdd7e958ee1)), closes [#532](https://github.com/doc-detective/doc-detective/issues/532)
* **core:** settle device web element tree after goTo before find ([#545](https://github.com/doc-detective/doc-detective/issues/545)) ([657daa3](https://github.com/doc-detective/doc-detective/commit/657daa31d710af05483f3c5284495820b9c81751)), closes [#547](https://github.com/doc-detective/doc-detective/issues/547)

## [4.26.3](https://github.com/doc-detective/doc-detective/compare/v4.26.2...v4.26.3) (2026-07-10)


### Bug Fixes

* **ci:** stop docker-build.yml app-image jobs from skipping on release chain ([#579](https://github.com/doc-detective/doc-detective/issues/579)) ([2996204](https://github.com/doc-detective/doc-detective/commit/2996204f147c0d53d5319af9e52c94305e2ed270))

## [4.26.2](https://github.com/doc-detective/doc-detective/compare/v4.26.1...v4.26.2) (2026-07-10)


### Bug Fixes

* **platform:** surface /spec fetch failures in finalize instead of an uncaught crash ([#560](https://github.com/doc-detective/doc-detective/issues/560)) ([46c0235](https://github.com/doc-detective/doc-detective/commit/46c0235e45e917b8435df7bf52c91febea600312))

## [4.26.1](https://github.com/doc-detective/doc-detective/compare/v4.26.0...v4.26.1) (2026-07-08)


### Bug Fixes

* **core:** resolve OpenAPI descriptions at runtime for httpRequest steps ([#550](https://github.com/doc-detective/doc-detective/issues/550)) ([315a62c](https://github.com/doc-detective/doc-detective/commit/315a62c581c92309cb1cd126d8fef77a48689323))
* repair broken goTo/closeSurface action links ([#481](https://github.com/doc-detective/doc-detective/issues/481)) ([beb6d85](https://github.com/doc-detective/doc-detective/commit/beb6d853852273c9f2e55605198cd05f9816f9f7))

# [4.26.0](https://github.com/doc-detective/doc-detective/compare/v4.25.1...v4.26.0) (2026-07-08)


### Bug Fixes

* **core:** retry geckodriver startup crash under concurrent context-starts ([#542](https://github.com/doc-detective/doc-detective/issues/542)) ([24bc220](https://github.com/doc-detective/doc-detective/commit/24bc2208e4b818ce5f23ff8ea3b6e02e0ced529a))


### Features

* **app-surface:** app window selectors on desktop drivers ([#536](https://github.com/doc-detective/doc-detective/issues/536)) ([db4b8f1](https://github.com/doc-detective/doc-detective/commit/db4b8f1762bb0faf877827706aeea252e65308a8)), closes [#537](https://github.com/doc-detective/doc-detective/issues/537) [appium-novawindows-driver#85](https://github.com/appium-novawindows-driver/issues/85)
* **start-surface:** generic + parallel startSurface (multi-surface phase 6) ([#539](https://github.com/doc-detective/doc-detective/issues/539)) ([3e136f7](https://github.com/doc-detective/doc-detective/commit/3e136f7898188283172bc354ba85414ff6fa609a))

## [4.25.1](https://github.com/doc-detective/doc-detective/compare/v4.25.0...v4.25.1) (2026-07-07)


### Bug Fixes

* **core:** assign a unique chromedriver port per browser driver ([#535](https://github.com/doc-detective/doc-detective/issues/535)) ([82033a0](https://github.com/doc-detective/doc-detective/commit/82033a0d4ed30dc88b94023bbd392ffb44e5213d))
* **core:** serialize native app-surface driver contexts under concurrency ([#534](https://github.com/doc-detective/doc-detective/issues/534)) ([65fc563](https://github.com/doc-detective/doc-detective/commit/65fc56365a1898adc41e55ead30a819a50db3075)), closes [#532](https://github.com/doc-detective/doc-detective/issues/532) [#532](https://github.com/doc-detective/doc-detective/issues/532)
* **core:** serialize recording native-app contexts under concurrency ([#538](https://github.com/doc-detective/doc-detective/issues/538)) ([4ab3b72](https://github.com/doc-detective/doc-detective/commit/4ab3b72424006e99b916c60e78e957e6eb88fe1a))

# [4.25.0](https://github.com/doc-detective/doc-detective/compare/v4.24.0...v4.25.0) (2026-07-07)


### Features

* **record:** app window and device recording (native-app phase A7) ([#524](https://github.com/doc-detective/doc-detective/issues/524)) ([c177317](https://github.com/doc-detective/doc-detective/commit/c1773176c6cf386d2329f186571d2a0b93b4cbec))

# [4.24.0](https://github.com/doc-detective/doc-detective/compare/v4.23.0...v4.24.0) (2026-07-07)


### Bug Fixes

* **core:** retry native session creation after client timeout abort ([#526](https://github.com/doc-detective/doc-detective/issues/526)) ([d1fb01a](https://github.com/doc-detective/doc-detective/commit/d1fb01a293e747f2293f06701d9c9b81f694dacc))
* **install:** 9-minute npm-child timeout for bulk runtime installs ([#530](https://github.com/doc-detective/doc-detective/issues/530)) ([b364c19](https://github.com/doc-detective/doc-detective/commit/b364c193d398600b788eca8db3b3a8342fc45a37)), closes [#528](https://github.com/doc-detective/doc-detective/issues/528)
* **runtime:** self-repair transient Android SDK download flakes in installAndroid ([#525](https://github.com/doc-detective/doc-detective/issues/525)) ([cb516ca](https://github.com/doc-detective/doc-detective/commit/cb516cadb284642e4c54ad5d0912479118572adb)), closes [#523](https://github.com/doc-detective/doc-detective/issues/523)
* **runtime:** sweep on-disk managed-dep orphans into the runtime manifest ([#528](https://github.com/doc-detective/doc-detective/issues/528)) ([d625248](https://github.com/doc-detective/doc-detective/commit/d62524862b6c166e93ebf7d52318ad145700191b)), closes [#501](https://github.com/doc-detective/doc-detective/issues/501) [#501](https://github.com/doc-detective/doc-detective/issues/501) [package.json#ddRuntimeDependencies](https://github.com/package.json/issues/ddRuntimeDependencies)


### Features

* **app-surface:** mobile interaction vocabulary (native-app phase A6) ([#517](https://github.com/doc-detective/doc-detective/issues/517)) ([d6e4ef5](https://github.com/doc-detective/doc-detective/commit/d6e4ef59a523dfe706750a5c2dad75854ee465ee)), closes [#submit-button](https://github.com/doc-detective/doc-detective/issues/submit-button) [#reveal-by-selector](https://github.com/doc-detective/doc-detective/issues/reveal-by-selector)

# [4.23.0](https://github.com/doc-detective/doc-detective/compare/v4.22.0...v4.23.0) (2026-07-06)


### Bug Fixes

* **ci:** browser unit tests fail on ubuntu/macOS — APPIUM_HOME anchored at a driverless runtime cache ([#522](https://github.com/doc-detective/doc-detective/issues/522)) ([47e49cc](https://github.com/doc-detective/doc-detective/commit/47e49cc9a32584e7b0294b7f48858d9e2b222553))
* **runtime:** stop JIT installs pruning the runtime cache — the actual [#501](https://github.com/doc-detective/doc-detective/issues/501) ConPTY freeze — and guard the tty spawn path ([#510](https://github.com/doc-detective/doc-detective/issues/510)) ([b5dcfc5](https://github.com/doc-detective/doc-detective/commit/b5dcfc507b51adab00d0865e9122f0f9f6b33af3)), closes [microsoft/node-pty#640](https://github.com/microsoft/node-pty/issues/640) [#532](https://github.com/doc-detective/doc-detective/issues/532)


### Features

* **mobile-web:** mobile browsers on managed devices (native-app phase A5) ([#516](https://github.com/doc-detective/doc-detective/issues/516)) ([33ec6fc](https://github.com/doc-detective/doc-detective/commit/33ec6fc55cf2b496ef65e70cb9e271dfba092c65)), closes [#hosted](https://github.com/doc-detective/doc-detective/issues/hosted)

# [4.22.0](https://github.com/doc-detective/doc-detective/compare/v4.21.0...v4.22.0) (2026-07-06)


### Features

* **app-surface:** managed iOS simulators + executable XCUITest app surfaces (phase A4) ([#512](https://github.com/doc-detective/doc-detective/issues/512)) ([99b55fb](https://github.com/doc-detective/doc-detective/commit/99b55fbde3654e034603727e04fd6d74c899296e)), closes [doc-detective/github-action#73](https://github.com/doc-detective/github-action/issues/73)

# [4.21.0](https://github.com/doc-detective/doc-detective/compare/v4.20.0...v4.21.0) (2026-07-05)


### Features

* **apps:** native Android app surfaces + managed emulators (phase A3) ([cb65d2e](https://github.com/doc-detective/doc-detective/commit/cb65d2ece9e3f5e4e4eeff48739dba2347e26c3c))
* native macOS app surfaces via Mac2 (native-app phase A2) ([#502](https://github.com/doc-detective/doc-detective/issues/502)) ([faf5521](https://github.com/doc-detective/doc-detective/commit/faf552125640a64b46a30dad6621d5b44298a970)), closes [#501](https://github.com/doc-detective/doc-detective/issues/501)

# [4.20.0](https://github.com/doc-detective/doc-detective/compare/v4.19.0...v4.20.0) (2026-07-04)


### Features

* native Windows app surfaces via startSurface (native-app phase A1) ([#491](https://github.com/doc-detective/doc-detective/issues/491)) ([2ef5d5c](https://github.com/doc-detective/doc-detective/commit/2ef5d5c92d6af78e3cb9c781d3d4b8982a6675f3)), closes [#483](https://github.com/doc-detective/doc-detective/issues/483)

# [4.19.0](https://github.com/doc-detective/doc-detective/compare/v4.18.0...v4.19.0) (2026-07-03)


### Features

* multiple concurrent browser surfaces (multi-surface Phase 4) ([#483](https://github.com/doc-detective/doc-detective/issues/483)) ([8c521a2](https://github.com/doc-detective/doc-detective/commit/8c521a22c094144ca394692f635eb3b25c369e2d))

# [4.18.0](https://github.com/doc-detective/doc-detective/compare/v4.17.1...v4.18.0) (2026-07-02)


### Bug Fixes

* **click:** run click sub-effect for string shorthand ([#470](https://github.com/doc-detective/doc-detective/issues/470)) ([935a2b1](https://github.com/doc-detective/doc-detective/commit/935a2b101fc39818124d41d0ce05ed78fa28fff9))
* **core:** await Appium server tree-kill so browsers don't orphan ([#480](https://github.com/doc-detective/doc-detective/issues/480)) ([22d019c](https://github.com/doc-detective/doc-detective/commit/22d019c9793a12475f41006e51059e748dca5853))
* **core:** tolerate missing config.environment on pre-resolved API configs ([#478](https://github.com/doc-detective/doc-detective/issues/478)) ([09eee9c](https://github.com/doc-detective/doc-detective/commit/09eee9cb5ca33fe35c876b3b3c7a015edec64a6d))


### Features

* browser multi-tab and multi-window targeting (multi-surface Phase 3) ([#468](https://github.com/doc-detective/doc-detective/issues/468)) ([90233b5](https://github.com/doc-detective/doc-detective/commit/90233b5e2f2f0d9ca043f47839f4fe8795144d2b))

## [4.17.1](https://github.com/doc-detective/doc-detective/compare/v4.17.0...v4.17.1) (2026-07-01)


### Bug Fixes

* **core:** detect IPv4-mapped IPv6 private addresses in the SSRF guard ([#428](https://github.com/doc-detective/doc-detective/issues/428)) ([66c5860](https://github.com/doc-detective/doc-detective/commit/66c5860f9433e21bd55274e9a55e750429ce7a62)), closes [#427](https://github.com/doc-detective/doc-detective/issues/427)
* **core:** emit the spec for runShell-fileType files ([#435](https://github.com/doc-detective/doc-detective/issues/435)) ([1b0fa75](https://github.com/doc-detective/doc-detective/commit/1b0fa75177b8c759be438d0b478298d978d61339))
* **core:** split string headers on the first colon only ([#438](https://github.com/doc-detective/doc-detective/issues/438)) ([bf8a9ee](https://github.com/doc-detective/doc-detective/commit/bf8a9ee11074bc4077790ba195f30f861d4e7f03))
* **expressions:** preserve original {{...}} on embedded-expression failure ([#446](https://github.com/doc-detective/doc-detective/issues/446)) ([91909ec](https://github.com/doc-detective/doc-detective/commit/91909ec7da44f4b19c8eedbb9c7336da6e2fa8ea)), closes [#423](https://github.com/doc-detective/doc-detective/issues/423) [#424](https://github.com/doc-detective/doc-detective/issues/424)
* **httpRequest:** report nested unexpected fields by dot-path ([#443](https://github.com/doc-detective/doc-detective/issues/443)) ([0060d29](https://github.com/doc-detective/doc-detective/commit/0060d297e859a6e89eae4158f64fec9281773bfe))

# [4.17.0](https://github.com/doc-detective/doc-detective/compare/v4.16.0...v4.17.0) (2026-06-30)


### Features

* **reporter:** nest run artifacts as REST-style runs/specs/tests/contexts tree ([#415](https://github.com/doc-detective/doc-detective/issues/415)) ([cc709be](https://github.com/doc-detective/doc-detective/commit/cc709bec3f370a17d4974fad0d869c36f502e95e))

# [4.17.0-nested-run-artifacts.1](https://github.com/doc-detective/doc-detective/compare/v4.16.0...v4.17.0-nested-run-artifacts.1) (2026-06-29)


### Bug Fixes

* **reporter:** collision-resistant path segments, exercise spec-level autoScreenshot inheritance ([9023d87](https://github.com/doc-detective/doc-detective/commit/9023d87ee7c3daf792e34b685a55c6add6bb1995))
* **reporter:** require child-of-runs confinement, cap default 32, add boundary tests ([c30dbb7](https://github.com/doc-detective/doc-detective/commit/c30dbb7d50ba896081137a3a990c283f679920be))


### Features

* **reporter:** nest run artifacts as REST-style runs/specs/tests/contexts tree ([20ce31e](https://github.com/doc-detective/doc-detective/commit/20ce31eff641e7b6f2d0905ce7afb1d44dc63e16))

# [4.16.0](https://github.com/doc-detective/doc-detective/compare/v4.15.3...v4.16.0) (2026-06-29)


### Features

* **runner:** validate browser drivers and fall back across browsers ([#413](https://github.com/doc-detective/doc-detective/issues/413)) ([c52c5c3](https://github.com/doc-detective/doc-detective/commit/c52c5c38fd6437527d7d17d9ec697f553ebe2037))

## [4.15.3](https://github.com/doc-detective/doc-detective/compare/v4.15.2...v4.15.3) (2026-06-28)


### Bug Fixes

* **common:** sync generated schema descriptions with source ([ccd7515](https://github.com/doc-detective/doc-detective/commit/ccd75156547725cecddbbeb427cad2d8049127ac)), closes [#304](https://github.com/doc-detective/doc-detective/issues/304)
* **hints:** drop stale record-video concurrency warning ([2ebcf8b](https://github.com/doc-detective/doc-detective/commit/2ebcf8b0660b5f295f07a6d9f2054676bef7b2e1)), closes [#343](https://github.com/doc-detective/doc-detective/issues/343) [#380](https://github.com/doc-detective/doc-detective/issues/380) [#344](https://github.com/doc-detective/doc-detective/issues/344)

## [4.15.2](https://github.com/doc-detective/doc-detective/compare/v4.15.1...v4.15.2) (2026-06-28)


### Bug Fixes

* **record:** remove hand-edit to generated config schema page ([37d96c2](https://github.com/doc-detective/doc-detective/commit/37d96c2c9dade07343fcf308754fe6081d21598b))
* resolve base-branch merge conflicts ([dc8e0ec](https://github.com/doc-detective/doc-detective/commit/dc8e0ec5dc71c663ec8cbc10d7aa71e63b77c76c))

## [4.15.1](https://github.com/doc-detective/doc-detective/compare/v4.15.0...v4.15.1) (2026-06-27)


### Bug Fixes

* address PR [#394](https://github.com/doc-detective/doc-detective/issues/394) code-review findings (routing/expressions) ([#398](https://github.com/doc-detective/doc-detective/issues/398)) ([3bfea2b](https://github.com/doc-detective/doc-detective/commit/3bfea2bf0e8802008aa7d65fde3f92ed512720f0))
* **expressions:** inline only bare literals; quote all other string operands ([#400](https://github.com/doc-detective/doc-detective/issues/400)) ([e86123b](https://github.com/doc-detective/doc-detective/commit/e86123b9e15f2b07050a7c636c62b67b05a1290f))

# [4.15.0](https://github.com/doc-detective/doc-detective/compare/v4.14.1...v4.15.0) (2026-06-27)


### Bug Fixes

* **build:** decouple compile-time type from optional webdriverio dep ([#369](https://github.com/doc-detective/doc-detective/issues/369)) ([45d931d](https://github.com/doc-detective/doc-detective/commit/45d931d6a9dbf6cd99a2dc722ee22529c1f029f6))
* **expressions:** harden against ReDoS and incomplete string escaping ([dc4f705](https://github.com/doc-detective/doc-detective/commit/dc4f705786f6838b8283dc28c1f1c1f1ac22cc4b))
* **runner:** clear self-kill watchdog when main() completes ([#368](https://github.com/doc-detective/doc-detective/issues/368)) ([ad859a2](https://github.com/doc-detective/doc-detective/commit/ad859a258c4590f57123f24d4fb186aeb6f6ae51))
* **runtime:** resolve pure-ESM heavy deps so appium v3/v5 drivers load ([4d0e98e](https://github.com/doc-detective/doc-detective/commit/4d0e98e8ab36510b1a8d892daf9a8b06beb85e62))
* **schema:** bound retry.delay and type assertion expected/actual ([4a4ae70](https://github.com/doc-detective/doc-detective/commit/4a4ae706f3d54c345b7d841d42687e279d55666b))


### Features

* **assertions:** convert all step actions to the unified expression model ([2af1ee5](https://github.com/doc-detective/doc-detective/commit/2af1ee539ed5363c6bb52e47206df9c3b848ec09)), closes [#355](https://github.com/doc-detective/doc-detective/issues/355)
* **assertions:** evaluate author-written custom assertions at runtime ([9b85713](https://github.com/doc-detective/doc-detective/commit/9b857138a8b7cf94f8762c79e34a78c7b0bacc85))
* dynamic-routing & assertions foundation (schema, expression engine, unified assertions) ([f4230f6](https://github.com/doc-detective/doc-detective/commit/f4230f668e186b411fe331fd03c2e4dffa74c7eb))
* **hints:** surface custom assertions and retry for transient errors ([#376](https://github.com/doc-detective/doc-detective/issues/376)) ([832629c](https://github.com/doc-detective/doc-detective/commit/832629c6add12b440e60b6e20c2e4381ed02c879))
* **routing:** spec-, test-, and step-level guard `if` conditional execution ([#362](https://github.com/doc-detective/doc-detective/issues/362)) ([e209ecd](https://github.com/doc-detective/doc-detective/commit/e209ecdc35927ff250619435ac0878ac4185b36c))
* **routing:** step goToStep action (index-driven step loop) ([#370](https://github.com/doc-detective/doc-detective/issues/370)) ([9a8fdc6](https://github.com/doc-detective/doc-detective/commit/9a8fdc63c06784466c3071d7494c5fa47825df64))
* **routing:** step retry action (limit/delay/backoff) ([#366](https://github.com/doc-detective/doc-detective/issues/366)) ([778a395](https://github.com/doc-detective/doc-detective/commit/778a39588a6b2658d26dda8aca03275a33f4d567))
* **routing:** step-level onPass/onFail/onWarning/onSkip handlers (continue/stop) ([#364](https://github.com/doc-detective/doc-detective/issues/364)) ([102e293](https://github.com/doc-detective/doc-detective/commit/102e293a172dcb9f3c0e66d232be3d2d4067c243))
* **routing:** test-level goToTest action on the sequencer ([#374](https://github.com/doc-detective/doc-detective/issues/374)) ([1b37a27](https://github.com/doc-detective/doc-detective/commit/1b37a27243b2fbdf6e9427d0ee6699bdfe61f379))
* **routing:** test-level routing handlers (continue/stop) via non-breaking sequencer ([#372](https://github.com/doc-detective/doc-detective/issues/372)) ([32bb7a9](https://github.com/doc-detective/doc-detective/commit/32bb7a9d468b740037aa4555b9721baadcdc0c8e))
* **runner:** resource-aware scheduler for shared-display recordings ([#380](https://github.com/doc-detective/doc-detective/issues/380)) ([a5a5900](https://github.com/doc-detective/doc-detective/commit/a5a590062767c5e2a0c1893e4bfaa30ba9a0da40)), closes [#379](https://github.com/doc-detective/doc-detective/issues/379) [#379](https://github.com/doc-detective/doc-detective/issues/379)
* **runner:** run background processes under a PTY for full TUIs (`background.tty`) ([1d12cef](https://github.com/doc-detective/doc-detective/commit/1d12cef2782fac56e50d564d35eb56567beeeda7))
* **runner:** support long-running background processes for runShell/runCode ([#381](https://github.com/doc-detective/doc-detective/issues/381)) ([7f55a32](https://github.com/doc-detective/doc-detective/commit/7f55a32556f23e6004c7c89e6631b40e1aea0146))
* **runner:** type keystrokes to background processes via `surface` ([#386](https://github.com/doc-detective/doc-detective/issues/386)) ([cc885c2](https://github.com/doc-detective/doc-detective/commit/cc885c2cbd97df54254a5ac70a5aed5adccad2db)), closes [384/#385](https://github.com/doc-detective/doc-detective/issues/385)

# [4.15.0-next.1](https://github.com/doc-detective/doc-detective/compare/v4.14.1...v4.15.0-next.1) (2026-06-27)


### Bug Fixes

* **build:** decouple compile-time type from optional webdriverio dep ([#369](https://github.com/doc-detective/doc-detective/issues/369)) ([45d931d](https://github.com/doc-detective/doc-detective/commit/45d931d6a9dbf6cd99a2dc722ee22529c1f029f6))
* **expressions:** harden against ReDoS and incomplete string escaping ([dc4f705](https://github.com/doc-detective/doc-detective/commit/dc4f705786f6838b8283dc28c1f1c1f1ac22cc4b))
* **runner:** clear self-kill watchdog when main() completes ([#368](https://github.com/doc-detective/doc-detective/issues/368)) ([ad859a2](https://github.com/doc-detective/doc-detective/commit/ad859a258c4590f57123f24d4fb186aeb6f6ae51))
* **runtime:** resolve pure-ESM heavy deps so appium v3/v5 drivers load ([4d0e98e](https://github.com/doc-detective/doc-detective/commit/4d0e98e8ab36510b1a8d892daf9a8b06beb85e62))
* **schema:** bound retry.delay and type assertion expected/actual ([4a4ae70](https://github.com/doc-detective/doc-detective/commit/4a4ae706f3d54c345b7d841d42687e279d55666b))


### Features

* **assertions:** convert all step actions to the unified expression model ([2af1ee5](https://github.com/doc-detective/doc-detective/commit/2af1ee539ed5363c6bb52e47206df9c3b848ec09)), closes [#355](https://github.com/doc-detective/doc-detective/issues/355)
* **assertions:** evaluate author-written custom assertions at runtime ([9b85713](https://github.com/doc-detective/doc-detective/commit/9b857138a8b7cf94f8762c79e34a78c7b0bacc85))
* dynamic-routing & assertions foundation (schema, expression engine, unified assertions) ([f4230f6](https://github.com/doc-detective/doc-detective/commit/f4230f668e186b411fe331fd03c2e4dffa74c7eb))
* **hints:** surface custom assertions and retry for transient errors ([#376](https://github.com/doc-detective/doc-detective/issues/376)) ([832629c](https://github.com/doc-detective/doc-detective/commit/832629c6add12b440e60b6e20c2e4381ed02c879))
* **routing:** spec-, test-, and step-level guard `if` conditional execution ([#362](https://github.com/doc-detective/doc-detective/issues/362)) ([e209ecd](https://github.com/doc-detective/doc-detective/commit/e209ecdc35927ff250619435ac0878ac4185b36c))
* **routing:** step goToStep action (index-driven step loop) ([#370](https://github.com/doc-detective/doc-detective/issues/370)) ([9a8fdc6](https://github.com/doc-detective/doc-detective/commit/9a8fdc63c06784466c3071d7494c5fa47825df64))
* **routing:** step retry action (limit/delay/backoff) ([#366](https://github.com/doc-detective/doc-detective/issues/366)) ([778a395](https://github.com/doc-detective/doc-detective/commit/778a39588a6b2658d26dda8aca03275a33f4d567))
* **routing:** step-level onPass/onFail/onWarning/onSkip handlers (continue/stop) ([#364](https://github.com/doc-detective/doc-detective/issues/364)) ([102e293](https://github.com/doc-detective/doc-detective/commit/102e293a172dcb9f3c0e66d232be3d2d4067c243))
* **routing:** test-level goToTest action on the sequencer ([#374](https://github.com/doc-detective/doc-detective/issues/374)) ([1b37a27](https://github.com/doc-detective/doc-detective/commit/1b37a27243b2fbdf6e9427d0ee6699bdfe61f379))
* **routing:** test-level routing handlers (continue/stop) via non-breaking sequencer ([#372](https://github.com/doc-detective/doc-detective/issues/372)) ([32bb7a9](https://github.com/doc-detective/doc-detective/commit/32bb7a9d468b740037aa4555b9721baadcdc0c8e))
* **runner:** resource-aware scheduler for shared-display recordings ([#380](https://github.com/doc-detective/doc-detective/issues/380)) ([a5a5900](https://github.com/doc-detective/doc-detective/commit/a5a590062767c5e2a0c1893e4bfaa30ba9a0da40)), closes [#379](https://github.com/doc-detective/doc-detective/issues/379) [#379](https://github.com/doc-detective/doc-detective/issues/379)
* **runner:** run background processes under a PTY for full TUIs (`background.tty`) ([1d12cef](https://github.com/doc-detective/doc-detective/commit/1d12cef2782fac56e50d564d35eb56567beeeda7))
* **runner:** support long-running background processes for runShell/runCode ([#381](https://github.com/doc-detective/doc-detective/issues/381)) ([7f55a32](https://github.com/doc-detective/doc-detective/commit/7f55a32556f23e6004c7c89e6631b40e1aea0146))
* **runner:** type keystrokes to background processes via `surface` ([#386](https://github.com/doc-detective/doc-detective/issues/386)) ([cc885c2](https://github.com/doc-detective/doc-detective/commit/cc885c2cbd97df54254a5ac70a5aed5adccad2db)), closes [384/#385](https://github.com/doc-detective/doc-detective/issues/385)

## [4.14.1](https://github.com/doc-detective/doc-detective/compare/v4.14.0...v4.14.1) (2026-06-22)


### Bug Fixes

* **runner:** gate advanced ordering under concurrentRunners ([#377](https://github.com/doc-detective/doc-detective/issues/377)) ([158c83e](https://github.com/doc-detective/doc-detective/commit/158c83e6d64a833aef4bea1bba39475d18c62259))

# [4.14.0](https://github.com/doc-detective/doc-detective/compare/v4.13.0...v4.14.0) (2026-06-18)


### Features

* **runner:** add runBrowserScript action to execute JavaScript in the browser context ([#352](https://github.com/doc-detective/doc-detective/issues/352)) ([f010c67](https://github.com/doc-detective/doc-detective/commit/f010c67dbd35e790df1bb8dcd3ae0db054c5e11b))

# [4.13.0](https://github.com/doc-detective/doc-detective/compare/v4.12.1...v4.13.0) (2026-06-17)


### Features

* **record:** autoRecord + multiple overlapping recordings ([#349](https://github.com/doc-detective/doc-detective/issues/349)) ([189d197](https://github.com/doc-detective/doc-detective/commit/189d1979319825bc43e10ad43e18bd293c19ece7)), closes [#348](https://github.com/doc-detective/doc-detective/issues/348) [#348](https://github.com/doc-detective/doc-detective/issues/348)

## [4.12.1](https://github.com/doc-detective/doc-detective/compare/v4.12.0...v4.12.1) (2026-06-17)


### Bug Fixes

* **runner:** skip run-folder creation when no artifacts are written ([#348](https://github.com/doc-detective/doc-detective/issues/348)) ([341b9c5](https://github.com/doc-detective/doc-detective/commit/341b9c5cd01569698901394785351b03f5aaf291))

# [4.12.0](https://github.com/doc-detective/doc-detective/compare/v4.11.1...v4.12.0) (2026-06-17)


### Features

* **debug:** cache, install, network, appium, provenance & findings sections for the diagnostic dump ([#347](https://github.com/doc-detective/doc-detective/issues/347)) ([5a9344c](https://github.com/doc-detective/doc-detective/commit/5a9344c5d4f180d595ada13bcfda3a9b02449ea1)), closes [#2](https://github.com/doc-detective/doc-detective/issues/2) [#6](https://github.com/doc-detective/doc-detective/issues/6) [#1](https://github.com/doc-detective/doc-detective/issues/1) [#5](https://github.com/doc-detective/doc-detective/issues/5) [#4](https://github.com/doc-detective/doc-detective/issues/4) [#3](https://github.com/doc-detective/doc-detective/issues/3)

## [4.11.1](https://github.com/doc-detective/doc-detective/compare/v4.11.0...v4.11.1) (2026-06-16)


### Bug Fixes

* **reporters:** keep per-run JSON path as the last "results at" token ([#346](https://github.com/doc-detective/doc-detective/issues/346)) ([79f35b8](https://github.com/doc-detective/doc-detective/commit/79f35b85ca6a62fd5c986afb6b9918ec6f222eae)), closes [#341](https://github.com/doc-detective/doc-detective/issues/341)

# [4.11.0](https://github.com/doc-detective/doc-detective/compare/v4.10.0...v4.11.0) (2026-06-16)


### Features

* **record:** ffmpeg engine for any-app recording + concurrency-safe Chrome ([#343](https://github.com/doc-detective/doc-detective/issues/343)) ([36a83ba](https://github.com/doc-detective/doc-detective/commit/36a83ba172ac4c259455b167954df0990bf658d8))

# [4.10.0](https://github.com/doc-detective/doc-detective/compare/v4.9.0...v4.10.0) (2026-06-15)


### Features

* **reporters:** emit per-run HTML report in runFolder archive ([#341](https://github.com/doc-detective/doc-detective/issues/341)) ([baa83de](https://github.com/doc-detective/doc-detective/commit/baa83dee2b12b10ca38c241a857ac2a5314af423))

# [4.10.0-per-run-html-report.1](https://github.com/doc-detective/doc-detective/compare/v4.9.0...v4.10.0-per-run-html-report.1) (2026-06-15)


### Features

* **reporters:** emit per-run HTML report in runFolder archive ([f8ad42a](https://github.com/doc-detective/doc-detective/commit/f8ad42a69c32b918e3315addfe913a2815ec0943))

# [4.9.0](https://github.com/doc-detective/doc-detective/compare/v4.8.0...v4.9.0) (2026-06-14)


### Features

* auto screenshots, per-run artifact folders, and stable IDs ([#334](https://github.com/doc-detective/doc-detective/issues/334)) ([0527292](https://github.com/doc-detective/doc-detective/commit/0527292bb5270224548e4e03b22772531c8b33a6))

# [4.8.0](https://github.com/doc-detective/doc-detective/compare/v4.7.0...v4.8.0) (2026-06-14)


### Features

* concurrent test runners (parallel context execution) ([#332](https://github.com/doc-detective/doc-detective/issues/332)) ([dd24819](https://github.com/doc-detective/doc-detective/commit/dd24819798f7712067cae64378ba5c59bbbdfc20)), closes [doc-detective/core#337](https://github.com/doc-detective/core/issues/337) [#338](https://github.com/doc-detective/doc-detective/issues/338)
* **core:** runtime dependency detection + Appium warm-up guard ([#338](https://github.com/doc-detective/doc-detective/issues/338)) ([45adfaf](https://github.com/doc-detective/doc-detective/commit/45adfaf12db31b469916906581344760ce82e785))

# [4.7.0](https://github.com/doc-detective/doc-detective/compare/v4.6.1...v4.7.0) (2026-06-13)


### Features

* **debug:** add diagnostic dump via debug subcommand and DOC_DETECTIVE_DEBUG ([#336](https://github.com/doc-detective/doc-detective/issues/336)) ([e417131](https://github.com/doc-detective/doc-detective/commit/e4171311d6abb5322a75746b94a2b30f9b463e8a))

## [4.6.1](https://github.com/doc-detective/doc-detective/compare/v4.6.0...v4.6.1) (2026-06-11)


### Bug Fixes

* **core:** keep browser detection read-only (no auto-install) ([#330](https://github.com/doc-detective/doc-detective/issues/330)) ([ff32472](https://github.com/doc-detective/doc-detective/commit/ff3247229d9a153d8035972e2181a42e7dd1ddce))

# [4.6.0](https://github.com/doc-detective/doc-detective/compare/v4.5.0...v4.6.0) (2026-06-11)


### Bug Fixes

* **core:** check stdout+stderr for Appium driver detection ([bfc37c6](https://github.com/doc-detective/doc-detective/commit/bfc37c6687ad2190e8e44fab1f834eee9dfab102))
* **core:** handle contexts with no resolvable browser ([#320](https://github.com/doc-detective/doc-detective/issues/320)) ([9fbf2b2](https://github.com/doc-detective/doc-detective/commit/9fbf2b2156f7832efc8a64a9098c04cf4cf2b277))
* **core:** lazy-load webdriverio Key in typeKeys so lean installs run ([#314](https://github.com/doc-detective/doc-detective/issues/314)) ([366202e](https://github.com/doc-detective/doc-detective/commit/366202e65277b223e07466cedfd70b081b3976ed)), closes [#312](https://github.com/doc-detective/doc-detective/issues/312)
* declare node >=22.12.0 engine requirement ([e968059](https://github.com/doc-detective/doc-detective/commit/e9680596df88a17865f7defaf313735e48730ef9))
* **install:** bound the postinstall runtime pre-warm with a timeout ([#329](https://github.com/doc-detective/doc-detective/issues/329)) ([fb99ca7](https://github.com/doc-detective/doc-detective/commit/fb99ca7a83f6b2213bab71da16f234ac304cbcc7))
* **install:** clear log hint when the install.log stream errors ([fcb1d9b](https://github.com/doc-detective/doc-detective/commit/fcb1d9bbedaceda13efac618aeb277bcb86ae7c7))
* **install:** include peer companions in the install report ([19e1912](https://github.com/doc-detective/doc-detective/commit/19e19121603c406f9b04ea6c64be3b178ba00c1b))
* **install:** report peer companions in dry-run output ([0257797](https://github.com/doc-detective/doc-detective/commit/0257797d2439c5c9c8e98b48a05084af2512208b))
* **install:** stop heavy deps installing (and warning) on npm i ([#308](https://github.com/doc-detective/doc-detective/issues/308)) ([f995df9](https://github.com/doc-detective/doc-detective/commit/f995df9f12c52152cf1a63982999a49ba21d30cb))
* **release:** apply publish manifest transform before npm reads it ([#312](https://github.com/doc-detective/doc-detective/issues/312)) ([09b985c](https://github.com/doc-detective/doc-detective/commit/09b985ca26d0b17f0465575899c55f45afb58082))
* **runtime:** anchor parseSemverCore to the full version string ([23b5463](https://github.com/doc-detective/doc-detective/commit/23b546361f4465962b338dc1a3f33e6e24035130))
* **runtime:** bump @puppeteer/browsers to v3 for node 24 support ([#309](https://github.com/doc-detective/doc-detective/issues/309)) ([396605c](https://github.com/doc-detective/doc-detective/commit/396605c318cb00a907cb63161f6b1d3bddd73476))
* **runtime:** map webkit alias to safari in inferRuntimeNeeds ([#323](https://github.com/doc-detective/doc-detective/issues/323)) ([339c8b9](https://github.com/doc-detective/doc-detective/commit/339c8b9867979425ab52852e1594aca746103bfa)), closes [#322](https://github.com/doc-detective/doc-detective/issues/322)
* **runtime:** skip app detection in dry-run runs ([#311](https://github.com/doc-detective/doc-detective/issues/311)) ([a3a36ca](https://github.com/doc-detective/doc-detective/commit/a3a36ca49261d390b1eda2f48c7197f5663d3425))


### Features

* **hints:** add post-run contextual hint system with 25 hints ([#303](https://github.com/doc-detective/doc-detective/issues/303)) ([1e2bf43](https://github.com/doc-detective/doc-detective/commit/1e2bf43245c993744ae1967a064005ffe33b21d5))
* **install:** lazy-install heavy deps and browsers via runtime cache ([#305](https://github.com/doc-detective/doc-detective/issues/305)) ([2df7b63](https://github.com/doc-detective/doc-detective/commit/2df7b63c12055ce034909e85df70856fd1c56bbc)), closes [#60](https://github.com/doc-detective/doc-detective/issues/60) [#60](https://github.com/doc-detective/doc-detective/issues/60)
* **install:** log full npm output to a file and surface it on failure ([#318](https://github.com/doc-detective/doc-detective/issues/318)) ([2b620b2](https://github.com/doc-detective/doc-detective/commit/2b620b24d6cb90766b63550fc91d912848801e3b))
* **install:** pre-install runtime and browsers at postinstall by default ([#316](https://github.com/doc-detective/doc-detective/issues/316)) ([6811c53](https://github.com/doc-detective/doc-detective/commit/6811c53419ff122872d848eb3d179f32c11d7fad))


### Reverts

* Revert "ci(docker): backfill sharp native libs in the linux image" ([33ded97](https://github.com/doc-detective/doc-detective/commit/33ded97ba9bd14ce43419e450e32d0c16b7d704b))

# [4.6.0-next.1](https://github.com/doc-detective/doc-detective/compare/v4.5.0...v4.6.0-next.1) (2026-06-11)


### Bug Fixes

* **core:** check stdout+stderr for Appium driver detection ([e2c62f0](https://github.com/doc-detective/doc-detective/commit/e2c62f0cc63e37fde9e79e7a86dff7493b9ce1c6))
* **core:** handle contexts with no resolvable browser ([#320](https://github.com/doc-detective/doc-detective/issues/320)) ([44bd627](https://github.com/doc-detective/doc-detective/commit/44bd627b46c092c2b3a872f658d8fab044c1fdf9))
* **core:** lazy-load webdriverio Key in typeKeys so lean installs run ([#314](https://github.com/doc-detective/doc-detective/issues/314)) ([128c429](https://github.com/doc-detective/doc-detective/commit/128c429bb56c890953a53699f1e2e841e835517c)), closes [#312](https://github.com/doc-detective/doc-detective/issues/312)
* **core:** self-provision Chrome runtime in getRunner on first use ([#319](https://github.com/doc-detective/doc-detective/issues/319)) ([9e09458](https://github.com/doc-detective/doc-detective/commit/9e09458a63cc1d32b5f08e122330b7666029fa89))
* declare node >=22.12.0 engine requirement ([6a04cb6](https://github.com/doc-detective/doc-detective/commit/6a04cb68c19a5410ca079e6a72c7e915eb75b9f1))
* **install:** bound the postinstall runtime pre-warm with a timeout ([#329](https://github.com/doc-detective/doc-detective/issues/329)) ([5831d6e](https://github.com/doc-detective/doc-detective/commit/5831d6e54b1a14ed682f1d931f50e5511d0f51f7))
* **install:** clear log hint when the install.log stream errors ([29b50b6](https://github.com/doc-detective/doc-detective/commit/29b50b61d3f0f7b63053eae1f9034f974f7938a8))
* **install:** include peer companions in the install report ([2507e4b](https://github.com/doc-detective/doc-detective/commit/2507e4be936c16a3303fe9ef455599b7ba3ddb6f))
* **install:** report peer companions in dry-run output ([d0410d5](https://github.com/doc-detective/doc-detective/commit/d0410d5e5bb7f0d3e12b4a98b5c54bc94a619f70))
* **install:** stop heavy deps installing (and warning) on npm i ([#308](https://github.com/doc-detective/doc-detective/issues/308)) ([067303f](https://github.com/doc-detective/doc-detective/commit/067303f5c0439b33a4a3e1634bec4c92df165124))
* re-cut next prerelease after npm publish token failure ([b99a417](https://github.com/doc-detective/doc-detective/commit/b99a4179ce47ffb3c88064055f4931d084a1a9b2))
* **release:** apply publish manifest transform before npm reads it ([#312](https://github.com/doc-detective/doc-detective/issues/312)) ([b8969d2](https://github.com/doc-detective/doc-detective/commit/b8969d24523b96e9567e4a60c6f31b28cd567663))
* **runtime:** anchor parseSemverCore to the full version string ([24330a5](https://github.com/doc-detective/doc-detective/commit/24330a5c5cf56edd76d73cfc7e16cf35425e9599))
* **runtime:** bump @puppeteer/browsers to v3 for node 24 support ([#309](https://github.com/doc-detective/doc-detective/issues/309)) ([13938ad](https://github.com/doc-detective/doc-detective/commit/13938adb7b2d0c22d9e239c88d5650d35ea1003d))
* **runtime:** map webkit alias to safari in inferRuntimeNeeds ([#323](https://github.com/doc-detective/doc-detective/issues/323)) ([152f792](https://github.com/doc-detective/doc-detective/commit/152f792f4961e5ebf285bbe61cdefcb4c4d1a79a)), closes [#322](https://github.com/doc-detective/doc-detective/issues/322)
* **runtime:** skip app detection in dry-run runs ([#311](https://github.com/doc-detective/doc-detective/issues/311)) ([80883a6](https://github.com/doc-detective/doc-detective/commit/80883a6cd5b2cf5f9c5f0141ecbf970cb1958ca7))


### Features

* **hints:** add post-run contextual hint system with 25 hints ([#303](https://github.com/doc-detective/doc-detective/issues/303)) ([1e2bf43](https://github.com/doc-detective/doc-detective/commit/1e2bf43245c993744ae1967a064005ffe33b21d5))
* **install:** lazy-install heavy deps and browsers via runtime cache ([#305](https://github.com/doc-detective/doc-detective/issues/305)) ([fbb13fe](https://github.com/doc-detective/doc-detective/commit/fbb13fe59f139a7c7a25135c8c6b3022b5ee1b44)), closes [#60](https://github.com/doc-detective/doc-detective/issues/60) [#60](https://github.com/doc-detective/doc-detective/issues/60)
* **install:** log full npm output to a file and surface it on failure ([#318](https://github.com/doc-detective/doc-detective/issues/318)) ([cf15df1](https://github.com/doc-detective/doc-detective/commit/cf15df1f0f193be67326e3679de04a6a5c4501d4))
* **install:** pre-install runtime and browsers at postinstall by default ([#316](https://github.com/doc-detective/doc-detective/issues/316)) ([1f70780](https://github.com/doc-detective/doc-detective/commit/1f70780384b343bf7de948a1d604478926bc496c))

# [4.6.0-next.1](https://github.com/doc-detective/doc-detective/compare/v4.5.0...v4.6.0-next.1) (2026-06-11)


### Bug Fixes

* **core:** check stdout+stderr for Appium driver detection ([e2c62f0](https://github.com/doc-detective/doc-detective/commit/e2c62f0cc63e37fde9e79e7a86dff7493b9ce1c6))
* **core:** handle contexts with no resolvable browser ([#320](https://github.com/doc-detective/doc-detective/issues/320)) ([44bd627](https://github.com/doc-detective/doc-detective/commit/44bd627b46c092c2b3a872f658d8fab044c1fdf9))
* **core:** lazy-load webdriverio Key in typeKeys so lean installs run ([#314](https://github.com/doc-detective/doc-detective/issues/314)) ([128c429](https://github.com/doc-detective/doc-detective/commit/128c429bb56c890953a53699f1e2e841e835517c)), closes [#312](https://github.com/doc-detective/doc-detective/issues/312)
* **core:** self-provision Chrome runtime in getRunner on first use ([#319](https://github.com/doc-detective/doc-detective/issues/319)) ([9e09458](https://github.com/doc-detective/doc-detective/commit/9e09458a63cc1d32b5f08e122330b7666029fa89))
* declare node >=22.12.0 engine requirement ([6a04cb6](https://github.com/doc-detective/doc-detective/commit/6a04cb68c19a5410ca079e6a72c7e915eb75b9f1))
* **install:** clear log hint when the install.log stream errors ([29b50b6](https://github.com/doc-detective/doc-detective/commit/29b50b61d3f0f7b63053eae1f9034f974f7938a8))
* **install:** include peer companions in the install report ([2507e4b](https://github.com/doc-detective/doc-detective/commit/2507e4be936c16a3303fe9ef455599b7ba3ddb6f))
* **install:** report peer companions in dry-run output ([d0410d5](https://github.com/doc-detective/doc-detective/commit/d0410d5e5bb7f0d3e12b4a98b5c54bc94a619f70))
* **install:** stop heavy deps installing (and warning) on npm i ([#308](https://github.com/doc-detective/doc-detective/issues/308)) ([067303f](https://github.com/doc-detective/doc-detective/commit/067303f5c0439b33a4a3e1634bec4c92df165124))
* re-cut next prerelease after npm publish token failure ([b99a417](https://github.com/doc-detective/doc-detective/commit/b99a4179ce47ffb3c88064055f4931d084a1a9b2))
* **release:** apply publish manifest transform before npm reads it ([#312](https://github.com/doc-detective/doc-detective/issues/312)) ([b8969d2](https://github.com/doc-detective/doc-detective/commit/b8969d24523b96e9567e4a60c6f31b28cd567663))
* **runtime:** anchor parseSemverCore to the full version string ([24330a5](https://github.com/doc-detective/doc-detective/commit/24330a5c5cf56edd76d73cfc7e16cf35425e9599))
* **runtime:** bump @puppeteer/browsers to v3 for node 24 support ([#309](https://github.com/doc-detective/doc-detective/issues/309)) ([13938ad](https://github.com/doc-detective/doc-detective/commit/13938adb7b2d0c22d9e239c88d5650d35ea1003d))
* **runtime:** map webkit alias to safari in inferRuntimeNeeds ([#323](https://github.com/doc-detective/doc-detective/issues/323)) ([152f792](https://github.com/doc-detective/doc-detective/commit/152f792f4961e5ebf285bbe61cdefcb4c4d1a79a)), closes [#322](https://github.com/doc-detective/doc-detective/issues/322)
* **runtime:** skip app detection in dry-run runs ([#311](https://github.com/doc-detective/doc-detective/issues/311)) ([80883a6](https://github.com/doc-detective/doc-detective/commit/80883a6cd5b2cf5f9c5f0141ecbf970cb1958ca7))


### Features

* **hints:** add post-run contextual hint system with 25 hints ([#303](https://github.com/doc-detective/doc-detective/issues/303)) ([1e2bf43](https://github.com/doc-detective/doc-detective/commit/1e2bf43245c993744ae1967a064005ffe33b21d5))
* **install:** lazy-install heavy deps and browsers via runtime cache ([#305](https://github.com/doc-detective/doc-detective/issues/305)) ([fbb13fe](https://github.com/doc-detective/doc-detective/commit/fbb13fe59f139a7c7a25135c8c6b3022b5ee1b44)), closes [#60](https://github.com/doc-detective/doc-detective/issues/60) [#60](https://github.com/doc-detective/doc-detective/issues/60)
* **install:** log full npm output to a file and surface it on failure ([#318](https://github.com/doc-detective/doc-detective/issues/318)) ([cf15df1](https://github.com/doc-detective/doc-detective/commit/cf15df1f0f193be67326e3679de04a6a5c4501d4))
* **install:** pre-install runtime and browsers at postinstall by default ([#316](https://github.com/doc-detective/doc-detective/issues/316)) ([1f70780](https://github.com/doc-detective/doc-detective/commit/1f70780384b343bf7de948a1d604478926bc496c))

# [4.6.0-next.1](https://github.com/doc-detective/doc-detective/compare/v4.5.0...v4.6.0-next.1) (2026-06-11)


### Bug Fixes

* **core:** handle contexts with no resolvable browser ([#320](https://github.com/doc-detective/doc-detective/issues/320)) ([44bd627](https://github.com/doc-detective/doc-detective/commit/44bd627b46c092c2b3a872f658d8fab044c1fdf9))
* **core:** lazy-load webdriverio Key in typeKeys so lean installs run ([#314](https://github.com/doc-detective/doc-detective/issues/314)) ([128c429](https://github.com/doc-detective/doc-detective/commit/128c429bb56c890953a53699f1e2e841e835517c)), closes [#312](https://github.com/doc-detective/doc-detective/issues/312)
* **core:** self-provision Chrome runtime in getRunner on first use ([#319](https://github.com/doc-detective/doc-detective/issues/319)) ([9e09458](https://github.com/doc-detective/doc-detective/commit/9e09458a63cc1d32b5f08e122330b7666029fa89))
* declare node >=22.12.0 engine requirement ([6a04cb6](https://github.com/doc-detective/doc-detective/commit/6a04cb68c19a5410ca079e6a72c7e915eb75b9f1))
* **install:** clear log hint when the install.log stream errors ([29b50b6](https://github.com/doc-detective/doc-detective/commit/29b50b61d3f0f7b63053eae1f9034f974f7938a8))
* **install:** include peer companions in the install report ([2507e4b](https://github.com/doc-detective/doc-detective/commit/2507e4be936c16a3303fe9ef455599b7ba3ddb6f))
* **install:** report peer companions in dry-run output ([d0410d5](https://github.com/doc-detective/doc-detective/commit/d0410d5e5bb7f0d3e12b4a98b5c54bc94a619f70))
* **install:** stop heavy deps installing (and warning) on npm i ([#308](https://github.com/doc-detective/doc-detective/issues/308)) ([067303f](https://github.com/doc-detective/doc-detective/commit/067303f5c0439b33a4a3e1634bec4c92df165124))
* re-cut next prerelease after npm publish token failure ([b99a417](https://github.com/doc-detective/doc-detective/commit/b99a4179ce47ffb3c88064055f4931d084a1a9b2))
* **release:** apply publish manifest transform before npm reads it ([#312](https://github.com/doc-detective/doc-detective/issues/312)) ([b8969d2](https://github.com/doc-detective/doc-detective/commit/b8969d24523b96e9567e4a60c6f31b28cd567663))
* **runtime:** anchor parseSemverCore to the full version string ([24330a5](https://github.com/doc-detective/doc-detective/commit/24330a5c5cf56edd76d73cfc7e16cf35425e9599))
* **runtime:** bump @puppeteer/browsers to v3 for node 24 support ([#309](https://github.com/doc-detective/doc-detective/issues/309)) ([13938ad](https://github.com/doc-detective/doc-detective/commit/13938adb7b2d0c22d9e239c88d5650d35ea1003d))
* **runtime:** map webkit alias to safari in inferRuntimeNeeds ([#323](https://github.com/doc-detective/doc-detective/issues/323)) ([152f792](https://github.com/doc-detective/doc-detective/commit/152f792f4961e5ebf285bbe61cdefcb4c4d1a79a)), closes [#322](https://github.com/doc-detective/doc-detective/issues/322)
* **runtime:** skip app detection in dry-run runs ([#311](https://github.com/doc-detective/doc-detective/issues/311)) ([80883a6](https://github.com/doc-detective/doc-detective/commit/80883a6cd5b2cf5f9c5f0141ecbf970cb1958ca7))


### Features

* **hints:** add post-run contextual hint system with 25 hints ([#303](https://github.com/doc-detective/doc-detective/issues/303)) ([1e2bf43](https://github.com/doc-detective/doc-detective/commit/1e2bf43245c993744ae1967a064005ffe33b21d5))
* **install:** lazy-install heavy deps and browsers via runtime cache ([#305](https://github.com/doc-detective/doc-detective/issues/305)) ([fbb13fe](https://github.com/doc-detective/doc-detective/commit/fbb13fe59f139a7c7a25135c8c6b3022b5ee1b44)), closes [#60](https://github.com/doc-detective/doc-detective/issues/60) [#60](https://github.com/doc-detective/doc-detective/issues/60)
* **install:** log full npm output to a file and surface it on failure ([#318](https://github.com/doc-detective/doc-detective/issues/318)) ([cf15df1](https://github.com/doc-detective/doc-detective/commit/cf15df1f0f193be67326e3679de04a6a5c4501d4))
* **install:** pre-install runtime and browsers at postinstall by default ([#316](https://github.com/doc-detective/doc-detective/issues/316)) ([1f70780](https://github.com/doc-detective/doc-detective/commit/1f70780384b343bf7de948a1d604478926bc496c))

# [4.6.0-next.1](https://github.com/doc-detective/doc-detective/compare/v4.5.0...v4.6.0-next.1) (2026-06-11)


### Bug Fixes

* **core:** handle contexts with no resolvable browser ([#320](https://github.com/doc-detective/doc-detective/issues/320)) ([44bd627](https://github.com/doc-detective/doc-detective/commit/44bd627b46c092c2b3a872f658d8fab044c1fdf9))
* **core:** lazy-load webdriverio Key in typeKeys so lean installs run ([#314](https://github.com/doc-detective/doc-detective/issues/314)) ([128c429](https://github.com/doc-detective/doc-detective/commit/128c429bb56c890953a53699f1e2e841e835517c)), closes [#312](https://github.com/doc-detective/doc-detective/issues/312)
* **core:** self-provision Chrome runtime in getRunner on first use ([#319](https://github.com/doc-detective/doc-detective/issues/319)) ([9e09458](https://github.com/doc-detective/doc-detective/commit/9e09458a63cc1d32b5f08e122330b7666029fa89))
* declare node >=22.12.0 engine requirement ([6a04cb6](https://github.com/doc-detective/doc-detective/commit/6a04cb68c19a5410ca079e6a72c7e915eb75b9f1))
* **install:** report peer companions in dry-run output ([d0410d5](https://github.com/doc-detective/doc-detective/commit/d0410d5e5bb7f0d3e12b4a98b5c54bc94a619f70))
* **install:** stop heavy deps installing (and warning) on npm i ([#308](https://github.com/doc-detective/doc-detective/issues/308)) ([067303f](https://github.com/doc-detective/doc-detective/commit/067303f5c0439b33a4a3e1634bec4c92df165124))
* re-cut next prerelease after npm publish token failure ([b99a417](https://github.com/doc-detective/doc-detective/commit/b99a4179ce47ffb3c88064055f4931d084a1a9b2))
* **release:** apply publish manifest transform before npm reads it ([#312](https://github.com/doc-detective/doc-detective/issues/312)) ([b8969d2](https://github.com/doc-detective/doc-detective/commit/b8969d24523b96e9567e4a60c6f31b28cd567663))
* **runtime:** anchor parseSemverCore to the full version string ([24330a5](https://github.com/doc-detective/doc-detective/commit/24330a5c5cf56edd76d73cfc7e16cf35425e9599))
* **runtime:** bump @puppeteer/browsers to v3 for node 24 support ([#309](https://github.com/doc-detective/doc-detective/issues/309)) ([13938ad](https://github.com/doc-detective/doc-detective/commit/13938adb7b2d0c22d9e239c88d5650d35ea1003d))
* **runtime:** map webkit alias to safari in inferRuntimeNeeds ([#323](https://github.com/doc-detective/doc-detective/issues/323)) ([152f792](https://github.com/doc-detective/doc-detective/commit/152f792f4961e5ebf285bbe61cdefcb4c4d1a79a)), closes [#322](https://github.com/doc-detective/doc-detective/issues/322)
* **runtime:** skip app detection in dry-run runs ([#311](https://github.com/doc-detective/doc-detective/issues/311)) ([80883a6](https://github.com/doc-detective/doc-detective/commit/80883a6cd5b2cf5f9c5f0141ecbf970cb1958ca7))


### Features

* **hints:** add post-run contextual hint system with 25 hints ([#303](https://github.com/doc-detective/doc-detective/issues/303)) ([1e2bf43](https://github.com/doc-detective/doc-detective/commit/1e2bf43245c993744ae1967a064005ffe33b21d5))
* **install:** lazy-install heavy deps and browsers via runtime cache ([#305](https://github.com/doc-detective/doc-detective/issues/305)) ([fbb13fe](https://github.com/doc-detective/doc-detective/commit/fbb13fe59f139a7c7a25135c8c6b3022b5ee1b44)), closes [#60](https://github.com/doc-detective/doc-detective/issues/60) [#60](https://github.com/doc-detective/doc-detective/issues/60)
* **install:** log full npm output to a file and surface it on failure ([#318](https://github.com/doc-detective/doc-detective/issues/318)) ([cf15df1](https://github.com/doc-detective/doc-detective/commit/cf15df1f0f193be67326e3679de04a6a5c4501d4))
* **install:** pre-install runtime and browsers at postinstall by default ([#316](https://github.com/doc-detective/doc-detective/issues/316)) ([1f70780](https://github.com/doc-detective/doc-detective/commit/1f70780384b343bf7de948a1d604478926bc496c))

# [4.6.0-next.1](https://github.com/doc-detective/doc-detective/compare/v4.5.0...v4.6.0-next.1) (2026-06-11)


### Bug Fixes

* **core:** handle contexts with no resolvable browser ([#320](https://github.com/doc-detective/doc-detective/issues/320)) ([44bd627](https://github.com/doc-detective/doc-detective/commit/44bd627b46c092c2b3a872f658d8fab044c1fdf9))
* **core:** lazy-load webdriverio Key in typeKeys so lean installs run ([#314](https://github.com/doc-detective/doc-detective/issues/314)) ([128c429](https://github.com/doc-detective/doc-detective/commit/128c429bb56c890953a53699f1e2e841e835517c)), closes [#312](https://github.com/doc-detective/doc-detective/issues/312)
* **core:** self-provision Chrome runtime in getRunner on first use ([#319](https://github.com/doc-detective/doc-detective/issues/319)) ([9e09458](https://github.com/doc-detective/doc-detective/commit/9e09458a63cc1d32b5f08e122330b7666029fa89))
* declare node >=22.12.0 engine requirement ([6a04cb6](https://github.com/doc-detective/doc-detective/commit/6a04cb68c19a5410ca079e6a72c7e915eb75b9f1))
* **install:** stop heavy deps installing (and warning) on npm i ([#308](https://github.com/doc-detective/doc-detective/issues/308)) ([067303f](https://github.com/doc-detective/doc-detective/commit/067303f5c0439b33a4a3e1634bec4c92df165124))
* re-cut next prerelease after npm publish token failure ([b99a417](https://github.com/doc-detective/doc-detective/commit/b99a4179ce47ffb3c88064055f4931d084a1a9b2))
* **release:** apply publish manifest transform before npm reads it ([#312](https://github.com/doc-detective/doc-detective/issues/312)) ([b8969d2](https://github.com/doc-detective/doc-detective/commit/b8969d24523b96e9567e4a60c6f31b28cd567663))
* **runtime:** bump @puppeteer/browsers to v3 for node 24 support ([#309](https://github.com/doc-detective/doc-detective/issues/309)) ([13938ad](https://github.com/doc-detective/doc-detective/commit/13938adb7b2d0c22d9e239c88d5650d35ea1003d))
* **runtime:** map webkit alias to safari in inferRuntimeNeeds ([#323](https://github.com/doc-detective/doc-detective/issues/323)) ([152f792](https://github.com/doc-detective/doc-detective/commit/152f792f4961e5ebf285bbe61cdefcb4c4d1a79a)), closes [#322](https://github.com/doc-detective/doc-detective/issues/322)
* **runtime:** skip app detection in dry-run runs ([#311](https://github.com/doc-detective/doc-detective/issues/311)) ([80883a6](https://github.com/doc-detective/doc-detective/commit/80883a6cd5b2cf5f9c5f0141ecbf970cb1958ca7))


### Features

* **hints:** add post-run contextual hint system with 25 hints ([#303](https://github.com/doc-detective/doc-detective/issues/303)) ([1e2bf43](https://github.com/doc-detective/doc-detective/commit/1e2bf43245c993744ae1967a064005ffe33b21d5))
* **install:** lazy-install heavy deps and browsers via runtime cache ([#305](https://github.com/doc-detective/doc-detective/issues/305)) ([fbb13fe](https://github.com/doc-detective/doc-detective/commit/fbb13fe59f139a7c7a25135c8c6b3022b5ee1b44)), closes [#60](https://github.com/doc-detective/doc-detective/issues/60) [#60](https://github.com/doc-detective/doc-detective/issues/60)
* **install:** log full npm output to a file and surface it on failure ([#318](https://github.com/doc-detective/doc-detective/issues/318)) ([cf15df1](https://github.com/doc-detective/doc-detective/commit/cf15df1f0f193be67326e3679de04a6a5c4501d4))
* **install:** pre-install runtime and browsers at postinstall by default ([#316](https://github.com/doc-detective/doc-detective/issues/316)) ([1f70780](https://github.com/doc-detective/doc-detective/commit/1f70780384b343bf7de948a1d604478926bc496c))

# [4.6.0-next.11](https://github.com/doc-detective/doc-detective/compare/v4.6.0-next.10...v4.6.0-next.11) (2026-06-09)


### Bug Fixes

* **runtime:** map webkit alias to safari in inferRuntimeNeeds ([#323](https://github.com/doc-detective/doc-detective/issues/323)) ([1261698](https://github.com/doc-detective/doc-detective/commit/126169873fa4fa0b738374682468658e9cb0740b)), closes [#322](https://github.com/doc-detective/doc-detective/issues/322)

# [4.6.0-next.10](https://github.com/doc-detective/doc-detective/compare/v4.6.0-next.9...v4.6.0-next.10) (2026-06-09)


### Bug Fixes

* **core:** handle contexts with no resolvable browser ([#320](https://github.com/doc-detective/doc-detective/issues/320)) ([d750045](https://github.com/doc-detective/doc-detective/commit/d7500458effc6d3ffa1b45bc34884254119f3800))

# [4.6.0-next.9](https://github.com/doc-detective/doc-detective/compare/v4.6.0-next.8...v4.6.0-next.9) (2026-06-06)


### Bug Fixes

* **core:** self-provision Chrome runtime in getRunner on first use ([#319](https://github.com/doc-detective/doc-detective/issues/319)) ([7f08e61](https://github.com/doc-detective/doc-detective/commit/7f08e610ba6a61481b37bc2b27311d9b86cba08d))

# [4.6.0-next.8](https://github.com/doc-detective/doc-detective/compare/v4.6.0-next.7...v4.6.0-next.8) (2026-06-06)


### Features

* **install:** log full npm output to a file and surface it on failure ([#318](https://github.com/doc-detective/doc-detective/issues/318)) ([f8fec13](https://github.com/doc-detective/doc-detective/commit/f8fec13414b1f6581b3e00e77b569e2335314bf4))

# [4.6.0-install-failure-log.1](https://github.com/doc-detective/doc-detective/compare/v4.5.0...v4.6.0-install-failure-log.1) (2026-06-05)


### Bug Fixes

* **core:** lazy-load webdriverio Key in typeKeys so lean installs run ([#314](https://github.com/doc-detective/doc-detective/issues/314)) ([65b65fc](https://github.com/doc-detective/doc-detective/commit/65b65fc7bce576639ecf1a63ca363fb27211dbab)), closes [#312](https://github.com/doc-detective/doc-detective/issues/312)
* declare node >=22.12.0 engine requirement ([999378e](https://github.com/doc-detective/doc-detective/commit/999378e6d3af1ffe9105e6be259ffb9b6884debe))
* **install:** never crash or hang on a log-stream error ([a01b707](https://github.com/doc-detective/doc-detective/commit/a01b7070550a5bfac45d2c4efe245ff5dfc42100))
* **install:** stop heavy deps installing (and warning) on npm i ([#308](https://github.com/doc-detective/doc-detective/issues/308)) ([17a8579](https://github.com/doc-detective/doc-detective/commit/17a85793981ecb8f3255d1db530670f7b98d1ee4))
* re-cut next prerelease after npm publish token failure ([197232b](https://github.com/doc-detective/doc-detective/commit/197232b6feb5795e1b134f1b5fbdb39c940c3a43))
* **release:** apply publish manifest transform before npm reads it ([#312](https://github.com/doc-detective/doc-detective/issues/312)) ([ef86d51](https://github.com/doc-detective/doc-detective/commit/ef86d510d5bea0e251eb68e7bb51c351c6febb90))
* **runtime:** bump @puppeteer/browsers to v3 for node 24 support ([#309](https://github.com/doc-detective/doc-detective/issues/309)) ([21603dd](https://github.com/doc-detective/doc-detective/commit/21603dd653749c71855c004154984fab200ec74c))
* **runtime:** skip app detection in dry-run runs ([#311](https://github.com/doc-detective/doc-detective/issues/311)) ([82aa6d5](https://github.com/doc-detective/doc-detective/commit/82aa6d58a2e2bd93ec3cf08aed7d1e81b55b42ac))


### Features

* **install:** lazy-install heavy deps and browsers via runtime cache ([#305](https://github.com/doc-detective/doc-detective/issues/305)) ([e7e1623](https://github.com/doc-detective/doc-detective/commit/e7e162364e3b1d6fbd637b5453ba1190f8772de2)), closes [#60](https://github.com/doc-detective/doc-detective/issues/60) [#60](https://github.com/doc-detective/doc-detective/issues/60)
* **install:** log full npm output to a file and surface it on failure ([7c67d99](https://github.com/doc-detective/doc-detective/commit/7c67d99d099bc197ff23d6152dc4b4c746bd0fcf))
* **install:** pre-install runtime and browsers at postinstall by default ([#316](https://github.com/doc-detective/doc-detective/issues/316)) ([13e2296](https://github.com/doc-detective/doc-detective/commit/13e22968320eafc16124e8913c10a3811f2f58a8))

# [4.6.0-next.7](https://github.com/doc-detective/doc-detective/compare/v4.6.0-next.6...v4.6.0-next.7) (2026-06-05)


### Bug Fixes

* **core:** lazy-load webdriverio Key in typeKeys so lean installs run ([#314](https://github.com/doc-detective/doc-detective/issues/314)) ([65b65fc](https://github.com/doc-detective/doc-detective/commit/65b65fc7bce576639ecf1a63ca363fb27211dbab)), closes [#312](https://github.com/doc-detective/doc-detective/issues/312)


### Features

* **install:** pre-install runtime and browsers at postinstall by default ([#316](https://github.com/doc-detective/doc-detective/issues/316)) ([13e2296](https://github.com/doc-detective/doc-detective/commit/13e22968320eafc16124e8913c10a3811f2f58a8))

# [4.6.0-postinstall-runtime-default.1](https://github.com/doc-detective/doc-detective/compare/v4.5.0...v4.6.0-postinstall-runtime-default.1) (2026-06-04)


### Bug Fixes

* **core:** lazy-load webdriverio Key in typeKeys so lean installs run ([#314](https://github.com/doc-detective/doc-detective/issues/314)) ([65b65fc](https://github.com/doc-detective/doc-detective/commit/65b65fc7bce576639ecf1a63ca363fb27211dbab)), closes [#312](https://github.com/doc-detective/doc-detective/issues/312)
* declare node >=22.12.0 engine requirement ([999378e](https://github.com/doc-detective/doc-detective/commit/999378e6d3af1ffe9105e6be259ffb9b6884debe))
* **install:** buffer npm stream remainders before filtering noise ([2ac5e0a](https://github.com/doc-detective/doc-detective/commit/2ac5e0a2daa3f3e1c218750970ba29d241a0e6b3))
* **install:** stop heavy deps installing (and warning) on npm i ([#308](https://github.com/doc-detective/doc-detective/issues/308)) ([17a8579](https://github.com/doc-detective/doc-detective/commit/17a85793981ecb8f3255d1db530670f7b98d1ee4))
* **postinstall:** guard main() rejection and address review nits ([7a63379](https://github.com/doc-detective/doc-detective/commit/7a6337939591171c305eacadefbc55d1067fb71f))
* re-cut next prerelease after npm publish token failure ([197232b](https://github.com/doc-detective/doc-detective/commit/197232b6feb5795e1b134f1b5fbdb39c940c3a43))
* **release:** apply publish manifest transform before npm reads it ([#312](https://github.com/doc-detective/doc-detective/issues/312)) ([ef86d51](https://github.com/doc-detective/doc-detective/commit/ef86d510d5bea0e251eb68e7bb51c351c6febb90))
* **runtime:** bump @puppeteer/browsers to v3 for node 24 support ([#309](https://github.com/doc-detective/doc-detective/issues/309)) ([21603dd](https://github.com/doc-detective/doc-detective/commit/21603dd653749c71855c004154984fab200ec74c))
* **runtime:** skip app detection in dry-run runs ([#311](https://github.com/doc-detective/doc-detective/issues/311)) ([82aa6d5](https://github.com/doc-detective/doc-detective/commit/82aa6d58a2e2bd93ec3cf08aed7d1e81b55b42ac))


### Features

* **install:** filter npm deprecation/funding noise from all install output ([06619e1](https://github.com/doc-detective/doc-detective/commit/06619e1afdb7e972cf7d830199f7c952c62333e6))
* **install:** lazy-install heavy deps and browsers via runtime cache ([#305](https://github.com/doc-detective/doc-detective/issues/305)) ([e7e1623](https://github.com/doc-detective/doc-detective/commit/e7e162364e3b1d6fbd637b5453ba1190f8772de2)), closes [#60](https://github.com/doc-detective/doc-detective/issues/60) [#60](https://github.com/doc-detective/doc-detective/issues/60)
* **install:** pre-install runtime and browsers at postinstall by default ([b2363f4](https://github.com/doc-detective/doc-detective/commit/b2363f41a804f01fd6f43da97c4b3837974203a3))

# [4.6.0-typekeys-lazy-webdriverio.2](https://github.com/doc-detective/doc-detective/compare/v4.6.0-typekeys-lazy-webdriverio.1...v4.6.0-typekeys-lazy-webdriverio.2) (2026-06-04)


### Bug Fixes

* **core:** only load webdriverio for typeKeys when a special token is present ([ae8faf8](https://github.com/doc-detective/doc-detective/commit/ae8faf84706efa06b1184261305b2d6912825f38))

# [4.6.0-typekeys-lazy-webdriverio.1](https://github.com/doc-detective/doc-detective/compare/v4.5.0...v4.6.0-typekeys-lazy-webdriverio.1) (2026-06-04)


### Bug Fixes

* **core:** fail-soft on key-map load error and add subtract alias ([5901f0b](https://github.com/doc-detective/doc-detective/commit/5901f0b4691739b49df68c4939983151c7ddc1f1))
* **core:** lazy-load webdriverio Key in typeKeys so lean installs run ([bdc93b0](https://github.com/doc-detective/doc-detective/commit/bdc93b0cbe4d607ae6deb40ae29b982c84f1fd94)), closes [#312](https://github.com/doc-detective/doc-detective/issues/312)
* declare node >=22.12.0 engine requirement ([999378e](https://github.com/doc-detective/doc-detective/commit/999378e6d3af1ffe9105e6be259ffb9b6884debe))
* **install:** stop heavy deps installing (and warning) on npm i ([#308](https://github.com/doc-detective/doc-detective/issues/308)) ([17a8579](https://github.com/doc-detective/doc-detective/commit/17a85793981ecb8f3255d1db530670f7b98d1ee4))
* re-cut next prerelease after npm publish token failure ([197232b](https://github.com/doc-detective/doc-detective/commit/197232b6feb5795e1b134f1b5fbdb39c940c3a43))
* **release:** apply publish manifest transform before npm reads it ([#312](https://github.com/doc-detective/doc-detective/issues/312)) ([ef86d51](https://github.com/doc-detective/doc-detective/commit/ef86d510d5bea0e251eb68e7bb51c351c6febb90))
* **runtime:** bump @puppeteer/browsers to v3 for node 24 support ([#309](https://github.com/doc-detective/doc-detective/issues/309)) ([21603dd](https://github.com/doc-detective/doc-detective/commit/21603dd653749c71855c004154984fab200ec74c))
* **runtime:** skip app detection in dry-run runs ([#311](https://github.com/doc-detective/doc-detective/issues/311)) ([82aa6d5](https://github.com/doc-detective/doc-detective/commit/82aa6d58a2e2bd93ec3cf08aed7d1e81b55b42ac))


### Features

* **install:** lazy-install heavy deps and browsers via runtime cache ([#305](https://github.com/doc-detective/doc-detective/issues/305)) ([e7e1623](https://github.com/doc-detective/doc-detective/commit/e7e162364e3b1d6fbd637b5453ba1190f8772de2)), closes [#60](https://github.com/doc-detective/doc-detective/issues/60) [#60](https://github.com/doc-detective/doc-detective/issues/60)

# [4.6.0-next.6](https://github.com/doc-detective/doc-detective/compare/v4.6.0-next.5...v4.6.0-next.6) (2026-06-04)


### Bug Fixes

* **release:** apply publish manifest transform before npm reads it ([#312](https://github.com/doc-detective/doc-detective/issues/312)) ([ef86d51](https://github.com/doc-detective/doc-detective/commit/ef86d510d5bea0e251eb68e7bb51c351c6febb90))

# [4.6.0-publish-manifest-before-read.2](https://github.com/doc-detective/doc-detective/compare/v4.6.0-publish-manifest-before-read.1...v4.6.0-publish-manifest-before-read.2) (2026-06-03)


### Bug Fixes

* **release:** always drop optionalDependencies; harden guardrail with --json ([f555100](https://github.com/doc-detective/doc-detective/commit/f555100b47ff8a85cedefe21ddf4f8372688b6f8))
* **release:** restore manifest on process.exit() failure paths ([5ff6ae2](https://github.com/doc-detective/doc-detective/commit/5ff6ae2897cfa71e00a05c822cb124466335af29))

# [4.6.0-publish-manifest-before-read.1](https://github.com/doc-detective/doc-detective/compare/v4.5.0...v4.6.0-publish-manifest-before-read.1) (2026-06-01)


### Bug Fixes

* declare node >=22.12.0 engine requirement ([999378e](https://github.com/doc-detective/doc-detective/commit/999378e6d3af1ffe9105e6be259ffb9b6884debe))
* **install:** stop heavy deps installing (and warning) on npm i ([#308](https://github.com/doc-detective/doc-detective/issues/308)) ([17a8579](https://github.com/doc-detective/doc-detective/commit/17a85793981ecb8f3255d1db530670f7b98d1ee4))
* re-cut next prerelease after npm publish token failure ([197232b](https://github.com/doc-detective/doc-detective/commit/197232b6feb5795e1b134f1b5fbdb39c940c3a43))
* **release:** apply publish manifest transform before npm reads it ([b53262f](https://github.com/doc-detective/doc-detective/commit/b53262f45e3f184d36d3e9e6cacb0a4bd450cb3a))
* **runtime:** bump @puppeteer/browsers to v3 for node 24 support ([#309](https://github.com/doc-detective/doc-detective/issues/309)) ([21603dd](https://github.com/doc-detective/doc-detective/commit/21603dd653749c71855c004154984fab200ec74c))
* **runtime:** skip app detection in dry-run runs ([#311](https://github.com/doc-detective/doc-detective/issues/311)) ([82aa6d5](https://github.com/doc-detective/doc-detective/commit/82aa6d58a2e2bd93ec3cf08aed7d1e81b55b42ac))


### Features

* **install:** lazy-install heavy deps and browsers via runtime cache ([#305](https://github.com/doc-detective/doc-detective/issues/305)) ([e7e1623](https://github.com/doc-detective/doc-detective/commit/e7e162364e3b1d6fbd637b5453ba1190f8772de2)), closes [#60](https://github.com/doc-detective/doc-detective/issues/60) [#60](https://github.com/doc-detective/doc-detective/issues/60)

# [4.6.0-next.5](https://github.com/doc-detective/doc-detective/compare/v4.6.0-next.4...v4.6.0-next.5) (2026-06-01)


### Bug Fixes

* **runtime:** skip app detection in dry-run runs ([#311](https://github.com/doc-detective/doc-detective/issues/311)) ([82aa6d5](https://github.com/doc-detective/doc-detective/commit/82aa6d58a2e2bd93ec3cf08aed7d1e81b55b42ac))

# [4.6.0-next.4](https://github.com/doc-detective/doc-detective/compare/v4.6.0-next.3...v4.6.0-next.4) (2026-06-01)


### Bug Fixes

* declare node >=22.12.0 engine requirement ([999378e](https://github.com/doc-detective/doc-detective/commit/999378e6d3af1ffe9105e6be259ffb9b6884debe))

# [4.6.0-next.3](https://github.com/doc-detective/doc-detective/compare/v4.6.0-next.2...v4.6.0-next.3) (2026-06-01)


### Bug Fixes

* re-cut next prerelease after npm publish token failure ([197232b](https://github.com/doc-detective/doc-detective/commit/197232b6feb5795e1b134f1b5fbdb39c940c3a43))

# [4.6.0-next.2](https://github.com/doc-detective/doc-detective/compare/v4.6.0-next.1...v4.6.0-next.2) (2026-06-01)


### Bug Fixes

* **install:** stop heavy deps installing (and warning) on npm i ([#308](https://github.com/doc-detective/doc-detective/issues/308)) ([17a8579](https://github.com/doc-detective/doc-detective/commit/17a85793981ecb8f3255d1db530670f7b98d1ee4))
* **runtime:** bump @puppeteer/browsers to v3 for node 24 support ([#309](https://github.com/doc-detective/doc-detective/issues/309)) ([21603dd](https://github.com/doc-detective/doc-detective/commit/21603dd653749c71855c004154984fab200ec74c))

# [4.6.0-next.1](https://github.com/doc-detective/doc-detective/compare/v4.5.0...v4.6.0-next.1) (2026-05-12)


### Features

* **install:** lazy-install heavy deps and browsers via runtime cache ([#305](https://github.com/doc-detective/doc-detective/issues/305)) ([e7e1623](https://github.com/doc-detective/doc-detective/commit/e7e162364e3b1d6fbd637b5453ba1190f8772de2)), closes [#60](https://github.com/doc-detective/doc-detective/issues/60) [#60](https://github.com/doc-detective/doc-detective/issues/60)

# [4.5.0](https://github.com/doc-detective/doc-detective/compare/v4.4.0...v4.5.0) (2026-05-06)


### Features

* **appium:** use dynamic port to avoid conflicts ([#301](https://github.com/doc-detective/doc-detective/issues/301)) ([ce3ab86](https://github.com/doc-detective/doc-detective/commit/ce3ab862aef46d58dc1d5323b32f6f1b3e73e323))
* **platform:** add doc-detective.com runner entrypoint ([#302](https://github.com/doc-detective/doc-detective/issues/302)) ([44ded94](https://github.com/doc-detective/doc-detective/commit/44ded9423ebd6432a585a8cfca28c96110b50d3d))

# [4.4.0](https://github.com/doc-detective/doc-detective/compare/v4.3.0...v4.4.0) (2026-05-03)


### Features

* **cli:** add --dry-run flag to resolve tests without executing ([#292](https://github.com/doc-detective/doc-detective/issues/292)) ([a0bdb19](https://github.com/doc-detective/doc-detective/commit/a0bdb193b9b39cdf3f0012625504c67aa21dcbd9))

# [4.3.0](https://github.com/doc-detective/doc-detective/compare/v4.2.3...v4.3.0) (2026-04-30)


### Features

* **cli:** add --test and --spec filters for narrowing test runs ([#286](https://github.com/doc-detective/doc-detective/issues/286)) ([b19ac22](https://github.com/doc-detective/doc-detective/commit/b19ac2287487be6ebddf9a3fd24e3aecb5a1f470))

## [4.2.3](https://github.com/doc-detective/doc-detective/compare/v4.2.2...v4.2.3) (2026-04-28)


### Bug Fixes

* **ci:** close Appium port-bind race on Windows + Node 24 ([#282](https://github.com/doc-detective/doc-detective/issues/282)) ([cc1cc7b](https://github.com/doc-detective/doc-detective/commit/cc1cc7b59fb4e628cd929834eaac5cfa5656790e)), closes [#281](https://github.com/doc-detective/doc-detective/issues/281)
* **ci:** prevent late webdriver rejection from killing mocha on win32+node24 ([#281](https://github.com/doc-detective/doc-detective/issues/281)) ([d6b05d7](https://github.com/doc-detective/doc-detective/commit/d6b05d7421d88c144821282586dc692393e643e6))

## [4.2.2](https://github.com/doc-detective/doc-detective/compare/v4.2.1...v4.2.2) (2026-04-21)


### Bug Fixes

* **postinstall:** case-insensitive PATH filtering on Windows + safe undefined restore ([#276](https://github.com/doc-detective/doc-detective/issues/276)) ([050af3c](https://github.com/doc-detective/doc-detective/commit/050af3cc013e994b16c1546152463e6d48eeeb52))

## [4.2.1](https://github.com/doc-detective/doc-detective/compare/v4.2.0...v4.2.1) (2026-04-21)


### Bug Fixes

* **container-tests:** update fixtures for docs site move ([#277](https://github.com/doc-detective/doc-detective/issues/277)) ([afc0be3](https://github.com/doc-detective/doc-detective/commit/afc0be39da9016d2467bd282e8c06ca3f0a5e74d)), closes [#242](https://github.com/doc-detective/doc-detective/issues/242)

# [4.2.0](https://github.com/doc-detective/doc-detective/compare/v4.1.2...v4.2.0) (2026-04-20)


### Features

* **ci:** reusable promote.yml for manual release recovery ([#275](https://github.com/doc-detective/doc-detective/issues/275)) ([a690f3f](https://github.com/doc-detective/doc-detective/commit/a690f3fa1889e46c889c609b67b1f72faa67afd1)), closes [#272](https://github.com/doc-detective/doc-detective/issues/272)
* **postinstall:** offer to install agent tools for detected coding agents ([#273](https://github.com/doc-detective/doc-detective/issues/273)) ([88772fb](https://github.com/doc-detective/doc-detective/commit/88772fbc060dc42c3072705f1785c7a7d666c7f4))

## [4.1.2](https://github.com/doc-detective/doc-detective/compare/v4.1.1...v4.1.2) (2026-04-20)


### Bug Fixes

* **ci:** scope Docker push on rebuilds; reword stale comment ([#271](https://github.com/doc-detective/doc-detective/issues/271)) ([08461f3](https://github.com/doc-detective/doc-detective/commit/08461f3a930ec3e590d727bec6a45ef7a78a0ad4))

## [4.1.1](https://github.com/doc-detective/doc-detective/compare/v4.1.0...v4.1.1) (2026-04-20)


### Bug Fixes

* **ci:** host local test fixtures during release smoke test ([#269](https://github.com/doc-detective/doc-detective/issues/269)) ([adb0eb1](https://github.com/doc-detective/doc-detective/commit/adb0eb1ccab30d41f0ff572f9d3d82b88f1c8fbf))

# [4.1.0](https://github.com/doc-detective/doc-detective/compare/v4.0.2...v4.1.0) (2026-04-20)


### Bug Fixes

* **checkLink:** reduce false 429/403 failures from bot-protected sites ([#253](https://github.com/doc-detective/doc-detective/issues/253)) ([6a11a93](https://github.com/doc-detective/doc-detective/commit/6a11a93f55c06f5a6dd35239923409c9560521af))
* **ci:** correct repository URL in root package.json ([#267](https://github.com/doc-detective/doc-detective/issues/267)) ([99fddf0](https://github.com/doc-detective/doc-detective/commit/99fddf0cb44390860544a0100cba6fe3a1ea7691))
* **ci:** don't let husky reject semantic-release's own commit ([#268](https://github.com/doc-detective/doc-detective/issues/268)) ([91a76c6](https://github.com/doc-detective/doc-detective/commit/91a76c6238e12e7f29e6b2769bad5a4448b67737))
* **screenshot:** shift-rather-than-shrink crop clamp and tolerate aspect-ratio jitter ([#257](https://github.com/doc-detective/doc-detective/issues/257)) ([1431c9b](https://github.com/doc-detective/doc-detective/commit/1431c9bb1507952e3c051cde316529f085d39535))


### Features

* add `install-agents` CLI subcommand with six adapters ([#254](https://github.com/doc-detective/doc-detective/issues/254)) ([ae3f76d](https://github.com/doc-detective/doc-detective/commit/ae3f76d4cb4f56c09d2f74146985f1ac4936dcfd))
* add self-contained HTML test report reporter ([#255](https://github.com/doc-detective/doc-detective/issues/255)) ([253bd5a](https://github.com/doc-detective/doc-detective/commit/253bd5a8e5fb282a5621a69848b6bf59a6af288f))
* **ci:** stage → smoke → promote release pipeline ([#266](https://github.com/doc-detective/doc-detective/issues/266)) ([6fa2c82](https://github.com/doc-detective/doc-detective/commit/6fa2c82c8c6ee10ef9102852379c185c9ffd9742))
* **config:** support default query params via originParams (closes [#184](https://github.com/doc-detective/doc-detective/issues/184)) ([#261](https://github.com/doc-detective/doc-detective/issues/261)) ([dac029a](https://github.com/doc-detective/doc-detective/commit/dac029a8ff5f158b11c5a34c5b760360e531a9e1))
* migrate releases to semantic-release with conventional commits ([#259](https://github.com/doc-detective/doc-detective/issues/259)) ([370bc4c](https://github.com/doc-detective/doc-detective/commit/370bc4c471e632f1297ec3f2d18f2e0b0d96d58e))
* **screenshot:** accept URL paths as read-only reference images ([#262](https://github.com/doc-detective/doc-detective/issues/262)) ([d03c130](https://github.com/doc-detective/doc-detective/commit/d03c130f4223225c5a632bb15a1ab660b29551dd)), closes [#198](https://github.com/doc-detective/doc-detective/issues/198)
