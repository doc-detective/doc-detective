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
