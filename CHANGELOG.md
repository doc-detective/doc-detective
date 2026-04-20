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
