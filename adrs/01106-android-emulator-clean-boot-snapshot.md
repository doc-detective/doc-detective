---
status: accepted
date: 2026-10-10
decision-makers: hawkeyexl
---

# Boot managed Android emulators from a clean snapshot

## Context and Problem Statement

When Doc Detective boots an Android emulator itself (no emulator already
running), it cold-booted the AVD with `-no-snapshot` on every run. A cold boot
took about 23 seconds to `sys.boot_completed` on a Windows WHPX host. The device
then kept settling for several more seconds, which slowed the first driver
session. Measured on the `apps-android/android-app-flow` fixture:

* Startup (process start to the first app surface open) was 40.1 s (median of
  three).
* Completion (process start to exit) was 42.5 s.
* About 24.5 s of startup was the boot.

The cold boot existed for a deterministic, clean start. But `-no-snapshot`
only resets RAM. The data partition persists across cold boots, and the
emulator's hard stop at run end can leave recent writes corrupted on the next
boot.

How can a managed boot be fast and still start every run from the same
state?

## Decision Drivers

* Startup and completion time of Android tests, the two metrics this work
  optimizes.
* Every run starts from the same device state.
* No change for emulators Doc Detective doesn't boot (an already-running
  emulator is reused as before).
* Users need a way to update or discard the saved state.

## Considered Options

1. Keep cold booting with `-no-snapshot`.
2. Emulator Quick Boot: load the AVD's last-exit snapshot and save on exit.
3. A clean named snapshot: snapshot once after the first cold boot, then always
   load it without saving.

## Decision Outcome

Chosen option: 3, a clean named snapshot, with a reset command.

* A managed boot first checks the AVD for a complete `doc-detective-clean`
  snapshot, meaning its `snapshot.pb` exists. If it's there, the boot loads it
  with `-snapshot doc-detective-clean`. It also passes `-no-snapshot-save` and
  `-force-snapshot-load`. With
  `-force-snapshot-load`, the emulator exits instead of silently cold booting
  when the snapshot can't load (for example after an emulator or system-image
  update, or a GPU-mode change). Doc Detective then retries as a cold boot.
* A cold boot (no snapshot, or the retry) runs with `-no-snapshot`. Once
  `sys.boot_completed` is set, and before any test touches the device, Doc
  Detective lets the device settle and then saves `doc-detective-clean`
  through the emulator console. The save is best-effort, and a failed one
  means the next boot is cold again.
* Settling runs `adb shell am wait-for-broadcast-idle`, capped at 60 s. After
  `sys.boot_completed`, boot-completed receivers keep the guest CPU at 90-99%
  for about 10 s. The command returned at +11.6 s, right as the CPU dropped
  below 10%. A snapshot taken before that point makes every resume replay the
  work: startup was 24.7 s with an unsettled snapshot and 19.4 s with a
  settled one. Android versions without the command exit it immediately and
  get an unsettled snapshot, which is still faster than a cold boot.
* Which boot happened is decided from the disk check and the process exit,
  never from the emulator's log. Its stdout is block-buffered when piped, so a
  "Successfully loaded snapshot" line can arrive after `sys.boot_completed`
  reads `1`. An early prototype that relied on that line re-saved the snapshot
  over a just-resumed VM, and the next boot from it hung.
* `doc-detective install android --reset-snapshot` deletes `doc-detective-clean`
  from every AVD in the managed AVD home. It leaves other snapshots alone and
  installs nothing. Each AVD's next managed boot cold-boots and retakes the
  snapshot from its current state. That covers both "clear" and "retake".
* The boot wait now probes `sys.boot_completed` immediately and every 500 ms
  instead of sleeping 3 s first, so a resumed snapshot is noticed promptly.

### Consequences

* Good: managed-boot startup dropped from 40.1 s to about 24 s. Completion
  dropped from 42.5 s to about 26 s. Both are steady-state medians.
* Good: every managed run starts from the same RAM and disk state.
* Bad: loading the snapshot also restores the disk. Anything written to the
  AVD after the snapshot reverts on the next managed boot, including apps a
  test installed and apps installed manually with `adb`. To keep such a
  change, run `install android --reset-snapshot`, then let the next managed
  boot retake the snapshot. Reused (already-running) emulators are unaffected.
* Bad: each AVD stores a snapshot about the size of its RAM (about 2.3 GB for
  the default AVD).
* Bad: the run that creates the snapshot pays for the save. The first one or
  two loads also read the RAM image from a cold disk cache.

### Confirmation

* `test/android-emulator.test.js` asserts the boot arguments, the
  snapshot-loaded parser, and the boot-wait polling.
* `test/android-installer.test.js` asserts `resetCleanSnapshots` removes only
  the clean snapshot, honoring each AVD's `.ini` path.
* `test/cli-install.test.js` asserts `install android --reset-snapshot` resets
  without installing.
* The managed-boot CI leg runs `apps-android` (cold boot plus save) and then
  `mobile-web-android` (snapshot load). Both must PASS.

## Pros and Cons of the Options

### Option 1: keep cold booting

* Good: no new disk usage or saved state.
* Bad: about 23 s per managed boot, plus post-boot settling.
* Bad: "clean" only covers RAM. The disk persists, and hard stops can corrupt
  it.

### Option 2: Quick Boot

* Good: fastest boot (about 5 s), and disk state persists like today.
* Bad: RAM state resumes from wherever the previous run ended, so runs don't
  start from the same state.
* Bad: every run pays a save at exit.

### Option 3: clean named snapshot

* Good: fast (about 7 s to `boot_completed`) and the same start state every
  run.
* Bad: disk changes after the snapshot revert each run. The reset command is
  the way to keep them.
