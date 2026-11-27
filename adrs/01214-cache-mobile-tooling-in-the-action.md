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
  the cache directory (ADR 01105), in the runner's own SDK (`ANDROID_HOME`) and `~/.android/avd`.
- **iOS.** Only `doc-detective install ios` built the managed WebDriverAgent (ADR 01059). A test
  run only looked for a build under `<cacheDir>/ios/wda/<key>`. On a miss, Appium compiled its own
  copy during the session, outside the cache. Users added an `install ios` step and an
  `actions/cache` step by hand, as this repo's fixture legs did (ADR 01116).

`installed.json` records both sets, as `android.systemImages`, `android.avds`, and `ios.wdaKeys`.
Neither slot has an `installedVersion`, so the Action's key doesn't change when they do.

How should Action users get warm Android and iOS runs without writing cache steps themselves?

A benchmark on GitHub-hosted runners answered differently for each platform. The Action caches
the iOS WebDriverAgent build. It doesn't cache Android tooling.

## Decision Drivers

* A cache entry has to make a warm run clearly faster than a cold one.
* Every entry counts against the repository's Actions cache quota, which is 10 GB by default.
* The Action keeps one `cache` input. Caching needs no new inputs and no extra workflow steps.
* A run that tests no iOS app restores nothing extra.
* A browser update doesn't upload the mobile data again.
* A cache failure never fails a run.
* The iOS fix reaches every CLI user, not only Action users.

## Considered Options

* **A. The CLI builds WebDriverAgent on first use, and the Action caches that build in its own
  entry** (chosen).
* **B. Option A, plus an Android cache entry.** Measured and rejected.
* **C. One cache entry for everything.**
* **D. Move the Android SDK and AVDs under the cache directory.**
* **E. An Action `ios` input that runs `doc-detective install ios`.**
* **F. Status quo.** Users write their own `actions/cache` steps.

## Decision Outcome

Chosen option: **A**. The build moves to where the Xcode and driver versions are known, and the
Action caches only what the CLI recorded. The iOS entry is 68 MiB compressed, and it turns a
100-second build into a 9-second check. The Android entry of option B is 4.11 GiB. It saved
45–80 s of a 214–224 s run, so the Action leaves Android tooling uncached.

1. **The CLI builds the managed WebDriverAgent on first use.** On macOS, an iOS context can find no
   managed build for the current Xcode and driver. The run then calls the existing prebuild before
   the session starts, as Android's lazy install does for its toolchain. That makes the first-use
   build a second trigger for the managed prebuild, which ADR 01059 limited to `install ios`. The
   run warns in the terminal and in the report:

   ```text
   No WebDriverAgent build is cached for this Xcode version, so Doc Detective is building one. The first build can take several minutes. Run `doc-detective install ios --yes` ahead of time to skip the wait.
   ```

   A failed build warns, and the run falls back to Appium's own build:

   ```text
   Couldn't build WebDriverAgent before the test, so Appium builds it during the session. <cause in words>.
   ```

   A build can succeed while the update to `installed.json` after it fails. The session still
   uses the build, and the run warns about the record instead:

   ```text
   Couldn't update the cache record after building WebDriverAgent, so `installed.json` may not list this build. <cause in words>.
   ```

   `DOC_DETECTIVE_NO_IOS_AUTOINSTALL` turns the build off. It's named after
   `DOC_DETECTIVE_NO_ANDROID_AUTOINSTALL`. With it set, Appium builds WebDriverAgent itself, as
   before. The change adds no config key or flag, and exit codes stay the same. The prebuild
   already records `ios.wdaKeys`.

   The first-use build also doesn't run when `DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH` is set.
   The user is then supplying their own WebDriverAgent build. That variable already suppresses
   the managed locator (ADR 01059), so a managed build would go unused.

2. **The Action caches the iOS WebDriverAgent build under its `cache` input, and no Android
   tooling.** The build gets its own cache entry, separate from the runtime entry and with the
   same rules. The key comes from what the CLI recorded, the entry saves only when it would differ
   from the one restored, and any failure only warns.

   * **Entry.** Restored on macOS when the spec scan finds an iOS context. Path:
     `<cacheDir>/ios/wda`.
   * **Key.** The entry is saved as `<platform prefix><slot hash>-<fingerprint hash>`. The
     platform prefix is `doc-detective-ios-<os>-<arch>-`. The slot hash covers `ios.wdaKeys`.
     Both hashes are always there, including on the first save.
   * **Fingerprint.** It covers each WebDriverAgent key's `products.json`, which the build writes
     last: the file's path, size, and modification time. With no such file, the fingerprint hash
     is the hash of an empty list, so the key stays stable.
   * **Restore.** The entry restores after the runtime entry, which holds the `installed.json`
     the slot hash comes from. The primary key is `<platform prefix><slot hash>-`. No entry has
     exactly that key, so the cache restores the newest entry with the slot-hash prefix. Failing
     that, it takes the newest entry under the platform prefix. The runtime entry already
     restores this way.
   * **Save.** After the run, the Action computes the key again. The entry saves when
     `installed.json` has `ios.wdaKeys` and that key differs from the restored key. The one
     comparison covers a changed set of builds and changed contents, such as a build the run
     made again under the same key.
   * **Runtime entry.** Its key also hashes `ios.wdaKeys`. The runtime entry holds
     `installed.json`, so it saves again when the set of builds changes. This extends the runtime
     key that ADR 01209 describes, which hashes every `installedVersion`. The key doesn't hash
     `android.systemImages` or `android.avds`. The entry's paths gain
     `<cacheDir>/chromedriver-mobile`, 17 MB that every run otherwise downloads again.
   * **Android.** The Action restores and saves no system image, emulator package, AVD, or
     snapshot. Option B has the measurements.
   * **Inputs.** None are added. `cache: false` caches nothing.

3. **The recorded field and its marker file are a contract.** The Action hashes `ios.wdaKeys`
   from `installed.json`, and reads `<cacheDir>/ios/wda/<key>/products.json` for each key. The
   CLI keeps the field's name and meaning, and the file's path, and it writes the file last.
   `ios.wdaKeys` changes only when the set of WebDriverAgent builds changes. ADR 01209 makes the
   same commitment for `installedVersion`.

4. **An interrupt stops the build.** `xcodebuild` runs in its own process group, so a terminal's
   Ctrl-C doesn't reach it (#1005). On SIGINT or SIGTERM, a run and `install ios` both kill that
   whole group, wait for it to close, and release the build lock before they exit. `install ios`
   handles the two signals as a run does (ADR 01146). It prints this line, and exits `130` for
   SIGINT or `143` for SIGTERM:

   ```text
   Stopping… Press Ctrl-C again to stop immediately.
   ```

   A second signal exits at once, without waiting:

   ```text
   Stopping now. `xcodebuild` may still be running.
   ```

   An interrupted build is never retried, and it writes no `products.json`. No session and no
   cache entry takes the half-built directory. It stays in the cache, and the next build for the
   same key continues from it. A build that finished just as the interrupt landed is complete, so
   it keeps its `products.json`.

   After the interrupt, the process starts no other build. That includes a build that was
   waiting for the lock when the lock comes free.

   In a run, an iOS context that reaches its preflight after the interrupt is skipped, and opens
   no session. That holds whether it needed the build or found one in the cache. The interrupt
   has already closed the run's Appium servers, so a session would start one that outlives the
   run. The skip reason is:

   ```text
   Skipped: the run was interrupted.
   ```

### Consequences

* Good: a warm iOS run restores the WebDriverAgent build in seconds and builds nothing.
* Good: the first-use build puts WebDriverAgent in the cache directory for every CLI user, in any
  CI system.
* Good: a browser update saves the runtime entry only. A rebuilt WebDriverAgent saves the iOS
  entry, though no recorded field changed.
* Good: Android tooling costs no cache quota.
* Bad: Android runs stay uncached in the Action, and each pays the cold 214–224 s. A user who
  wants an Android cache writes `actions/cache` steps. The numbers under option B say what to
  expect.
* Bad: a change to the set of builds alone also saves a new runtime entry, because
  `installed.json` rides it.
* Neutral: `installed.json` can list a build whose files a missed or evicted iOS entry didn't
  restore. The CLI trusts the files over the record, and builds again.
* Neutral: the Action caches `ios/wda` whenever the folder exists. With a CLI that has no
  first-use build, it helps runs that call `install ios`.
* Neutral: the two opt-outs differ. Android's skips the context. The iOS one still runs it,
  because Appium can build WebDriverAgent itself.
* Good: an interrupted build leaves no `xcodebuild` running and no build lock behind.
* Neutral: an interrupted build's files stay in the cache. A build for that key finishes them,
  or a finished build for another key prunes them.

### Confirmation

The iOS numbers come from two fresh GitHub-hosted `macos-latest` VMs with Xcode 26.6.

* `install ios --yes` took 100 s cold, and 8–9 s warm with the entry restored.
* The entry is 207 MiB raw and 68 MiB compressed. A save or a restore takes 4–6 s.
* The `products.json` fingerprint was identical after a restore and after a warm run. The cache
  preserves modification times, and a warm run leaves the file unchanged. A warm run therefore
  computes the key it restored, and saves nothing.
* A Safari session used the restored build. Appium created no DerivedData of its own.
* The first-use build during a run took 100–185 s on hosted runners.
* The CLI change shipped in PR #1003 with red → green unit tests in `test/ios-installer.test.js`.
  A focused `it(...)` in `test/core-core.test.js` covers the opt-out.
* The macOS `mobile-web-ios` fixture leg restores and prebuilds no WebDriverAgent, so every run
  of it proves the first-use build. Its `ios-wda-first-use` spec has to pass there. The
  `apps-ios` leg keeps the restore and prebuild of ADR 01116, and proves a run that finds a
  cached build.
* The Action change ships with unit tests beside its cache code.
* The interrupt handling has unit tests in `test/ios-installer.test.js`. They inject the spawn and
  kill functions, and one kills a real process group on Linux and macOS. On the macOS
  `mobile-web-ios` leg, `scripts/check-wda-build-interrupt.cjs` signals `install ios` and a test
  run while `xcodebuild` is running. It requires the signal's exit code, an empty process group,
  a released lock, and no `products.json`. The leg's fixture run then finishes the half-built
  directory.

## Pros and Cons of the Options

### A. First-use build in the CLI, one cache entry for the WebDriverAgent build

* Good: no new inputs, and the entry saves only when its own contents change.
* Good: the WebDriverAgent build helps outside the Action too.
* Bad: two repositories change, and the Action tracks two entries.
* Bad: Android runs get nothing from the Action's cache.

### B. Option A, plus an Android cache entry

The entry held the system image, the emulator package, the AVD, and its clean snapshot. A
benchmark ran it on GitHub-hosted `ubuntu-latest` with CLI 5.5.0 and the
`android-36;google_apis;x86_64` image. The samples are small: one cold job and three warm VMs.

* Good: a warm run saves about 45–80 s. A cold run took 214–224 s. A warm run took 143–168 s:
  52–101 s to restore, then 67–91 s to run.
* Good: the clean snapshot resumed on other runner VMs in 3 of 3 tries, including AMD to Intel.
  The cache preserved modification times to the nanosecond in 5 of 5 restores.
* Bad: the entry is 4.11 GiB compressed and 9.0 GiB raw. One entry takes about 44% of the default
  10 GB quota. Compressed, the system images are 1720 MiB, the emulator package 320 MiB, the AVD
  without snapshots 1365 MiB, and the snapshots 805 MiB.
* Bad: only the clean snapshot pays. Without snapshots, a warm run took 189 s in total. With the
  image and the emulator package alone it took 226 s, which is no faster than cold.
* Bad: the first path list left out `$ANDROID_HOME/emulator`. Restoring the image without it makes
  the Android context skip, because `avdmanager` needs the `emulator` package installed.
* Bad: the emulator rewrites `snapshot.pb` on every load. A fingerprint over the snapshot files
  would save the entry again on every run. Only `doc-detective.json` in the snapshot folder is
  stable.
* Bad: one restore failed with "Egress is over the account limit" while several jobs each pulled
  about 4 GB.

### C. One cache entry for everything

* Good: one key and the least code.
* Bad: every browser update uploads the mobile data again, and a run that tests no mobile app
  restores all of it.

### D. Move the Android SDK and AVDs under the cache directory

* Good: the Action caches one directory and knows nothing about SDK paths.
* Bad: it changes CLI behavior, and orphans the AVDs users already have in `~/.android/avd`.
* Bad: a cold bootstrap downloads SDK tools the runner already has, into the entry that option B
  measured.

### E. An Action `ios` input that runs `doc-detective install ios`

* Good: works with every CLI 5 release, with no CLI change.
* Bad: it adds back an input that the Action's v2.0.0 removed.
* Bad: it only helps Action users.

### F. Status quo

* Good: no change.
* Bad: users write and maintain `actions/cache` steps for iOS.

## More Information

The record shapes are in `src/runtime/cacheDir.ts`. The first-use build is `ensureManagedWda` in
`src/runtime/iosInstaller.ts`, beside the prebuild, `prebuildWda`. The locator is
`locateManagedWda` in `src/runtime/wdaProducts.ts`, which also names the `products.json` marker.
The Action's cache code is `src/runtimeCache.ts` in `doc-detective/github-action`.
