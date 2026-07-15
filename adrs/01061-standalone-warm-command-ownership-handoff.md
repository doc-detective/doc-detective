---
status: accepted
date: 2026-07-14
decision-makers: [hawkeyexl]
---

# Standalone `doc-detective warm` with a manifest-based device ownership handoff

## Context and Problem Statement

ADR 01060's inline warm phase moves provisioning to the front of a run, but the cost still lives
*inside* the run: a CI job pays device boots after its build finished, serial with everything the
runner could have done earlier. The biggest remaining win is overlapping provisioning with work
Doc Detective doesn't own (the project's build, dependency install), which requires a warm that
runs as its own process and exits — leaving booted devices up for a later run to use. That raises
the actual design problem: **who owns a device that outlives the process that booted it**, when N
runs may start concurrently, adopters can crash, and stale devices must never be trusted?
[docs/design/warm-phase.md](../docs/design/warm-phase.md) phase B3 sketched the answer this ADR
locks in.

## Decision Drivers

- Overlap provisioning with CI build steps — the wall-clock win the inline phase can't reach.
- Exactly one of N concurrent runners may adopt a handoff; the rest must behave as if it never
  existed.
- Every crash window (warm dies, adopter dies post-claim pre-sweep) must leave a durable,
  discoverable record — or nothing — never silently orphaned devices.
- Staleness is a first-class state: an old handoff or a dead recorded process is swept, not
  adopted.
- No new lifecycle machinery in the runner: adoption must reuse the launch-ownership ledger
  (`bootedByUs`) and the existing run-end sweeps.

## Considered Options

1. **Ownership-handoff manifest in the cache root, claimed by atomic same-directory rename** —
   `warm-manifest.json` → `warm-manifest.claimed-<runId>.json`; the adopter seeds its registries
   (`bootedByUs: true`), sweeps at run end, then deletes the claim record.
2. **A device-pool daemon** — a long-lived broker owning devices across runs.
3. **No handoff** — `warm` tears its devices down at exit and only pre-pays installs/downloads.

## Decision Outcome

Chosen option: **option 1**, because it is exactly as durable as it needs to be with zero new
runtime surface (a file, two renames, and the sweeps that already exist). A daemon (option 2) is
the explicitly-rejected long-lived version of this — recorded as a non-goal in the design doc —
and option 3 forfeits the boots, which dominate the cost the command exists to move.

Specifics settled here:

- **`doc-detective warm` shares the run's whole front half.** Same config discovery, same
  resolve, same JIT preflight, same inline warm planner/executor — then it awaits its owned boots,
  writes the manifest, and exits leaving only the device registries alive (Appium servers, Xvfb,
  and background processes still tear down). A warm with no booted devices writes **no** manifest.
- **The claim is an atomic same-directory rename.** Exactly one concurrent runner wins the rename;
  the claimed file is then stamped with the adopter's `runId`/`pid`, so the claimed state is
  durable and discoverable across an adopter crash — a rename-to-nowhere would leave devices up
  with no record. The adopter deletes the claim **only after** its run-end sweep, so the record
  always outlives the resources it describes.
- **Adoption reuses launch-ownership.** Adopted devices seed the run registries as
  `bootedByUs: true` (android entries carry `{ pid }` for the tree-kill; simulators shut down by
  udid); the existing sweeps reclaim them whether or not any test used them, and warm boot tasks /
  consuming contexts registry-hit them instantly.
- **Staleness is swept, never adopted.** A manifest older than the TTL (60 minutes) or a device
  whose recorded pid is dead is torn down at claim time. Every run also scans for claimed files
  whose adopter pid is dead and sweeps what they recorded. `doc-detective warm --down` is the
  operator's indiscriminate teardown: every manifest, every claim, every recorded device.
- **API-dispatched configurations don't warm.** Their tests execute remotely; `warm` warns and
  exits instead of provisioning a host nothing will use.

### Consequences

- Good: CI can boot devices while the project builds; the test run adopts ready devices and its
  warm phase reports `device ready` in milliseconds.
- Good: every RECORDED crash window converges to "swept by the next run or `--down`";
  hosted-runner VM disposal remains the backstop.
- Bad: a `warm` that crashes before writing the manifest leaves devices up with **no record** —
  `--down` can only sweep recorded devices, so this window falls to platform process cleanup / VM
  disposal. Accepted; writing the manifest earlier would hand off unready devices.
- Bad: two warms racing on one cache merge their manifests at write time (deduped by udid, newer
  entry wins), so neither orphans the other's records — but the read-merge-write itself is not
  atomic, leaving a small residual overwrite window. Accepted: concurrent warms against one cache
  dir are an operator error the merge merely softens; a cross-process lock (src/runtime/lock.ts)
  can harden this later if real usage hits it.
- Bad: pid liveness can misread a recycled pid as the recorded emulator within the TTL (adopting
  a dead device, or worse, sweeping the recycling process). Bounded by the 60-minute TTL and the
  ESRCH-only death rule; verifying by udid against `adb devices` at claim time is the future
  hardening if this bites in practice.
- Bad: the TTL is a heuristic; a warm followed by a >60-minute build hands off nothing (the run
  boots its own devices, exactly as today).
- Neutral: the fixtures.yml iOS pre-boot step can now be replaced by `doc-detective warm` — a CI
  change tracked separately from this ADR.

### Confirmation

Hermetic unit suites: manifest write/claim/race/corrupt/TTL/dead-pid/release/orphan/leftover
partitioning (`test/warm-manifest.test.js`), registry seeding + sweep interplay and handoff
round-trip (`test/warm-handoff.test.js`). End-to-end (`test/warm-cli.test.js`): the CLI warms a
shell-only input (full resolve → warm → handoff path, exits 0, hands nothing off),
`warm --down` reports a clean cache and sweeps + deletes a synthetic manifest, and
`runTests({warmOnly: true})` returns the warm report with zero executed steps. Device-bearing
handoffs ride the mobile CI legs, where any orphaned emulator would fail the next run's boot on a
busy port.

## Pros and Cons of the Options

### Option 1 — manifest + atomic claim

- Good: durable across every crash window; zero new runtime surface; ownership model unchanged.
- Good: N-runner safe by construction (one rename wins).
- Bad: file-based, so it only coordinates runs sharing a cache dir — which is the actual scope
  (self-hosted runners and dev machines; the design doc records this).

### Option 2 — device-pool daemon

- Good: could share devices across many runs and hosts.
- Bad: a service to install, supervise, and secure; rejected as out of scope in the design doc's
  non-goals ("anything longer-lived is out of scope").

### Option 3 — warm without handoff

- Good: trivially safe.
- Bad: keeps the dominant cost (boots) inside the test run; the fixtures.yml pre-boot hack would
  live forever.
