---
status: accepted
date: 2026-11-18
decision-makers: hawkeyexl
---

# Cache mobile tooling in the GitHub Action

## Context and Problem Statement

The Doc Detective GitHub Action (`doc-detective/github-action`) caches what the CLI installs on
first use. Its one cache entry holds `<cacheDir>/runtime`, `<cacheDir>/browsers`, `installed.json`,
and the `npx` folder. The key hashes every `installedVersion` in `installed.json`, so the entry
saves again only when the CLI installed or updated something (ADR 01209). The entry leaves out the
Android and iOS tooling on purpose. A run that tests a mobile app therefore pays for that tooling
every time.

- **Android.** A run that targets `android` installs the toolchain on first use (ADRs 01024 and
  01025). On a fresh runner, every run downloads a system image and creates an AVD. It then
  cold-boots the AVD to take the clean snapshot (ADRs 01106 and 01108). Most of that lands outside
  the cache directory (ADR 01105). The installer uses the SDK it detects, and `ANDROID_HOME` comes
  first. On GitHub's runners the system image therefore goes into the runner's own SDK. AVDs live
  in `~/.android/avd`. Only a bootstrapped SDK (`<cacheDir>/android-sdk`) and the portable JRE
  (`<cacheDir>/jre`) sit under the cache directory.
- **iOS.** Only `doc-detective install ios` builds the managed WebDriverAgent (ADR 01059). A test
  run only looks for a build under `<cacheDir>/ios/wda/<key>`. On a miss, Appium compiles its own
  copy during the session, outside the cache, which takes about 10 minutes. Users add an
  `install ios` step and an `actions/cache` step by hand. This repo's fixture legs do the same
  (ADR 01116).

`installed.json` records both sets, as `android.systemImages`, `android.avds`, and `ios.wdaKeys`.
Neither slot has an `installedVersion`, so the Action's key doesn't change when they do.

How should Action users get warm Android and iOS runs without writing cache steps themselves?

## Decision Drivers

* A warm run that tests a mobile app restores its tooling. It doesn't download a system image or
  build WebDriverAgent.
* The Action keeps one `cache` input. Caching needs no new inputs and no extra workflow steps.
* A run that tests no mobile app restores nothing extra.
* A browser update doesn't upload the Android data again. Every entry counts against the
  repository's Actions cache quota.
* A cache failure never fails a run.
* Existing Android installs keep working where they are.
* The iOS fix reaches every CLI user, not only Action users.

## Considered Options

* **A. The CLI builds WebDriverAgent on first use, and the Action caches each platform in its own
  entry** (chosen).
* **B. One cache entry for everything.**
* **C. Move the Android SDK and AVDs under the cache directory.**
* **D. An Action `ios` input that runs `doc-detective install ios`.**
* **E. Status quo.** Users write their own `actions/cache` steps.

## Decision Outcome

Chosen option: **A**. It's the only option that meets every driver. The build moves to where the
Xcode and driver versions are known, and the Action caches only what the CLI recorded.

1. **The CLI builds the managed WebDriverAgent on first use.** On macOS, an iOS context can find no
   managed build for the current Xcode and driver. The run then calls the existing prebuild before
   the session starts, as Android's lazy install does for its toolchain. That makes the first-use
   build a second trigger for the managed prebuild, which ADR 01059 limited to `install ios`. The
   run warns in the terminal and in the report:

   ```text
   No WebDriverAgent build is cached for this Xcode version, so Doc Detective is building one. The first build takes about 10 minutes. Run `doc-detective install ios` ahead of time to skip the wait.
   ```

   A failed build warns, and the run falls back to Appium's own build:

   ```text
   Couldn't build WebDriverAgent before the test, so Appium builds it during the session. <cause in words>.
   ```

   `DOC_DETECTIVE_NO_IOS_AUTOINSTALL` turns the build off. It's named after
   `DOC_DETECTIVE_NO_ANDROID_AUTOINSTALL`. With it set, Appium builds WebDriverAgent itself, as
   today. The change adds no config key or flag, and exit codes stay the same. The prebuild
   already records `ios.wdaKeys`.

   The first-use build also doesn't run when `DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH` is set.
   The user is then supplying their own WebDriverAgent build. That variable already suppresses
   the managed locator (ADR 01059), so a managed build would go unused.

2. **The Action caches Android and iOS tooling under its `cache` input.** Each platform gets one
   cache entry, separate from the runtime entry and with the same rules. The key comes from what
   the CLI recorded, the entry saves only when it would differ from the one restored, and any
   failure only warns.

   * **Android entry.** Restored when `android` is `true`, or when it's `auto` and the spec scan
     finds an Android context. Paths: `<cacheDir>/android-sdk`, `<cacheDir>/jre`,
     `$ANDROID_HOME/system-images` (or `$ANDROID_SDK_ROOT`), and `~/.android/avd`. Platform
     prefix: `doc-detective-android-<os>-<arch>-`. The slot hash covers `android.systemImages`,
     `android.avds`, and the UiAutomator2 driver version. That version is
     `npmPackages["appium-uiautomator2-driver"].installedVersion` in `installed.json`. It's in the
     key because the clean snapshot is retaken when it changes (ADR 01108).
   * **iOS entry.** Restored on macOS when the spec scan finds an iOS context. Path:
     `<cacheDir>/ios/wda`. Platform prefix: `doc-detective-ios-<os>-<arch>-`. The slot hash
     covers `ios.wdaKeys`.
   * **Key.** Every entry is saved as `<platform prefix><slot hash>-<fingerprint hash>`. Both
     hashes are always there, including on the first save.
   * **Fingerprint.** It covers the entry's marker files: each file's path, size, and
     modification time. For iOS, the markers are each WebDriverAgent key's `products.json`, which
     the build writes last. For Android, they're the files of each AVD's clean snapshot, in the
     AVD's `snapshots/doc-detective-clean` folder. With no marker files, the fingerprint hash is
     the hash of an empty list, so the key stays stable.
   * **Restore.** Each entry restores after the runtime entry, which holds the `installed.json`
     the slot hash comes from. The Action passes `<platform prefix><slot hash>-` as the primary
     key. No entry has exactly that key, so the cache restores the newest entry that starts with
     the slot-hash prefix. Failing that, the Action takes the newest entry under the platform
     prefix. The runtime entry already restores this way.
   * **Save.** After the run, the Action computes the key again. An entry saves when its slot
     exists in `installed.json` and that key differs from the restored key. The one comparison
     covers a changed slot and changed contents.
   * **What that covers.** A restored entry can lack the WebDriverAgent products its
     `ios.wdaKeys` lists. The run rebuilds them under the same keys, and the entry still saves.
     The same goes for a clean snapshot that's retaken, after `install android --reset-snapshot`
     or after a snapshot that wouldn't load. Later runs restore the new one.
   * **Runtime key.** It also hashes the three fields. The runtime entry holds `installed.json`,
     so it saves again when the mobile set changes. This extends the runtime key that ADR 01209
     describes, which hashes every `installedVersion`.
   * **Inputs.** None are added. `android: false` also turns off the Android cache, and
     `cache: false` caches nothing.

3. **The recorded fields are a contract.** The Action hashes `android.systemImages`,
   `android.avds`, and `ios.wdaKeys` from `installed.json`. The CLI keeps their names and meaning
   stable. Each changes only when the set of installed images, AVDs, or WebDriverAgent builds
   changes. ADR 01209 makes the same commitment for `installedVersion`.

   The Android key's driver version adds no field to the contract. It's the
   `installedVersion` the runtime installer already records for the
   `appium-uiautomator2-driver` package, which ADR 01209's commitment covers.

   The fingerprint adds no field either, and needs no CLI change. It reads files the CLI already
   writes. If the CLI moves them, the fingerprint is always that of an empty list. The key then
   changes with the slot hash alone.

### Consequences

* Good: a warm run restores the system image, the AVD, and the WebDriverAgent build.
* Good: the first-use build puts WebDriverAgent in the cache directory for every CLI user, in any
  CI system.
* Good: a browser update saves the runtime entry only.
* Good: a rebuilt WebDriverAgent or a retaken clean snapshot reaches later runs, though no
  recorded field changed.
* Bad: up to three entries per OS and architecture count against the cache quota, and the Android
  entry is several gigabytes. Each changed-contents save adds another until GitHub evicts the
  old one.
* Bad: a change to the mobile set alone also saves a new runtime entry, because `installed.json`
  rides it. That entry counts against the quota too.
* Bad: the Action mirrors two CLI locations outside the cache directory. If the CLI moves them,
  the Action caches an empty folder, which is a miss and not a failure.
* Neutral: `installed.json` rides the runtime entry. It can list an image or a build whose files a
  missed or evicted platform entry didn't restore. The CLI has to trust the files over the record.
* Neutral: the Action change doesn't wait for the CLI change. It caches `ios/wda` whenever the
  folder exists, so with an older CLI it helps runs that call `install ios`.
* Neutral: a run that sets `DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH` behaves as it did before. It
  gets no first-use build, and the Action has no `ios.wdaKeys` change to cache.
* Neutral: the two opt-outs differ. Android's skips the context. The iOS one still runs it,
  because Appium can build WebDriverAgent itself.

### Confirmation

* Before the Action change ships, a throwaway workflow measures cold and warm run times and entry
  sizes. It covers the Android system image alone, the image with its AVD and the
  `doc-detective-clean` snapshot, and the WebDriverAgent products. The numbers are added to this
  ADR with the implementation. A piece that doesn't make a warm run faster is dropped.
* Snapshot portability decides whether AVD snapshots are cached. If a snapshot restored on a
  different runner VM doesn't load, the Android entry leaves `snapshots/` out. The Android
  fingerprint then covers an empty list, and that entry's key changes with the slot hash alone.
* The same workflow confirms a warm run that rebuilds nothing computes the key it restored. That
  needs the cache to restore each marker file's modification time. Otherwise every run would
  save.
* The same workflow confirms the CLI recovers when `installed.json` lists a system image whose
  files are missing.
* The CLI change ships with red → green unit tests and an iOS fixture permutation. A focused
  `it(...)` in `test/core-core.test.js` covers the opt-out.
* The macOS `mobile-web-ios` fixture leg restores and prebuilds no WebDriverAgent, so every run
  of it proves the first-use build. The `apps-ios` leg keeps the restore and prebuild of ADR
  01116, and proves a run that finds a cached build.
* The Action change ships with unit tests beside its cache code. The measurement workflow runs
  twice against its branch, to compare cold and warm.

## Pros and Cons of the Options

### A. First-use build in the CLI, one cache entry per platform

* Good: no new inputs, and each entry saves only when its own contents change.
* Good: the WebDriverAgent build helps outside the Action too.
* Bad: two repositories change, and the Action tracks three entries.

### B. One cache entry for everything

* Good: one key and the least code.
* Bad: every browser update uploads the multi-gigabyte Android data again, which eats the cache
  quota.
* Bad: a run that tests no mobile app restores all of it.

### C. Move the Android SDK and AVDs under the cache directory

* Good: the Action caches one directory and knows nothing about SDK paths.
* Bad: it changes CLI behavior, and orphans the AVDs users already have in `~/.android/avd`.
* Bad: a cold bootstrap downloads SDK tools the runner already has.

### D. An Action `ios` input that runs `doc-detective install ios`

* Good: works with every CLI 5 release, with no CLI change.
* Bad: it adds back an input that the Action's v2.0.0 removed.
* Bad: it only helps Action users.

### E. Status quo

* Good: no change.
* Bad: users write and maintain `actions/cache` steps. The docs have a recipe for iOS, and none
  at all for Android.

## More Information

The Android lazy install and `DOC_DETECTIVE_NO_ANDROID_AUTOINSTALL` are in `src/core/tests.ts`.
The record shapes are in `src/runtime/cacheDir.ts`. The prebuild is `prebuildWda` in
`src/runtime/iosInstaller.ts`, and the locator is `locateManagedWda` in
`src/runtime/wdaProducts.ts`. The Action's cache code is `src/runtimeCache.ts` in
`doc-detective/github-action`.
