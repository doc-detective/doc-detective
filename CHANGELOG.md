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
