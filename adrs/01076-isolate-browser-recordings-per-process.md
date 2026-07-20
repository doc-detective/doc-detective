---
status: accepted
date: 2026-07-16
decision-makers: [hawkeyexl]
---

# Isolate browser-engine recordings per process, not just per context

## Context and Problem Statement

Browser-engine recordings are isolated by two keys derived from the context id: the Chrome window title the launch flag `--auto-select-desktop-capture-source` matches (`RECORD_ME_<contextId>`), and the directory Chrome downloads the captured `.webm` into (`<tmp>/doc-detective/recordings/<contextId>/`). That isolation was designed for concurrency *within* one run, where context ids are unique.

Context ids are **not** unique across processes — `default` and `windows-chrome` are the common cases. So two doc-detective processes on one machine share both keys. This is a real scenario, not a hypothetical: a developer running the CLI while the test suite runs, and parallel worktree sessions running mocha at the same time (already documented as a hazard in [test/AGENTS.md](../test/AGENTS.md)).

Measured on Windows with two concurrent runs, each recording `out.mp4` in context `default`:

- Both produced **byte-identical videos** (same size, same SHA-256) and both reported PASS. One run silently transcoded the other's download — the recording claimed to document flow B while showing flow A.
- The same collision explains an observed `stopRecord` failure, "Recording download timed out": `startRecording` deletes a stale download at the shared path before capture, so a peer's start can delete an in-flight download, and Chrome renames a second download to `out (1).webm` where nothing waits for it. A partially-written peer download also transcodes as garbage (`Read error at pos. 37 … End of file`).

Silent wrong output is the worst failure class here: a recording is documentation, and a passing step that shows the wrong content is worse than a failed one. How should the isolation keys be scoped so concurrent processes can't collide?

## Decision Drivers

- Two concurrent processes must never capture each other's window or read each other's download.
- The key must be stable for a run's lifetime (the title is set at launch and matched later at `getDisplayMedia` time; the download path is computed at start and awaited at stop).
- Failure should be impossible by construction, not merely unlikely — a timing-dependent guard would leave the silent-corruption path open.
- Both keys must move together: they're derived in two places (session launch in `tests.ts`, capture in `startRecording.ts`) and must agree exactly.

## Considered Options

1. **Add the process id to both keys** (`RECORD_ME_<pid>_<contextId>`, `recordings/<contextId>-<pid>/`).
2. A random per-run token generated at module load.
3. A lock file over the shared recordings directory.
4. Leave it; document that concurrent doc-detective processes can't record.

## Decision Outcome

Chosen option: **1 — include the process id in both keys**, via one `recordingProcessToken()` helper used by `browserCaptureTitle` and `browserDownloadDir`. Both keys already flow through those two functions from all four production call sites, so a single change keeps the launch flag, the `document.title` assignment, and the download path in agreement.

The pid is unique among live processes by construction — exactly the scope the collision spans — and stable for the run. Pid reuse across time is irrelevant: only *concurrent* processes can collide, and concurrent processes have distinct pids.

Nothing user-facing changes: both keys are internal (a temp directory name and an internal window title that `record` sets and restores).

### Consequences

- Good, because cross-process collision becomes impossible by construction rather than unlikely — no timing window remains for silent corruption.
- Good, because leftover download directories are now attributable to the process that made them.
- Good, because it composes with the existing per-context isolation: `<contextId>-<pid>` is unique both within a run and across runs.
- Neutral, because a crashed run's leftover `recordings/<ctx>-<pid>/` is no longer overwritten by the next run's identical path. These live under the OS temp dir and each holds one short-lived `.webm` that the transcode deletes on success; the previous same-path reuse was itself part of the bug (that's what let one run delete another's download).
- Bad, because a stale-download delete no longer cleans a *previous* run's file at the same path — but that path is now per-process, so there is no such file to clean.

Known adjacent limitation (unchanged, pre-existing): a session launched without record options still gets the shared default flag value `RECORD_ME`, which is a prefix of every real capture title. Such sessions never call `getDisplayMedia`, so the flag is inert for them.

### Confirmation

- Unit tests in [test/ffmpeg-recorder.test.js](../test/ffmpeg-recorder.test.js) assert both keys contain the process id, alongside the existing per-context uniqueness and traversal-sanitization tests.
- Empirical before/after with two concurrent runs on one machine, same context id and same basename (`out.mp4`):
  - before: 1 distinct video content across the two runs (byte-identical — the collision);
  - after: 2 distinct video contents (each run captured its own window).
- No feature fixture: fixtures run one doc-detective process, so they cannot express a cross-process collision. The invariant is unit-tested and the end-to-end proof is the two-process experiment above.

## Pros and Cons of the Options

### 1. Process id in both keys

- Good, because it's unique among live processes by construction, stable for the run, and debuggable (a leftover dir names its owner).
- Bad, because pids repeat over time — harmless here, since only concurrent runs can collide.

### 2. Random per-run token

- Good, because it's unique across processes and time.
- Bad, because it's opaque when debugging leftovers, and it buys nothing over the pid for concurrent-only collisions.

### 3. Lock file over the shared directory

- Bad, because it serializes concurrent recordings instead of isolating them, and lock files leak on crashes.
- Bad, because it wouldn't fix the capture-title collision at all — Chrome would still auto-select the peer's window.

### 4. Document the limitation

- Bad, because the dominant symptom is silent wrong output; a passing test showing the wrong recording is exactly what documentation tests exist to prevent.
