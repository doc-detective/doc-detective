---
status: accepted
date: 2026-10-14
decision-makers: doc-detective maintainers
---

# Warm the telemetry connection during the run

## Context and Problem Statement

With telemetry on (the default, CI included), every `runTests` ends by posting one event to
PostHog. The flush starts when results are final and overlaps the reporters. On a short run it still
trails the process. A cold POST costs DNS, TCP, TLS, and the request itself, about four round
trips. Measured on Windows with Node 24, that tail was 330–350 ms of a ~1.25 s shell-only run. How do
we shrink it without losing events or sending anything when telemetry is off?

## Decision Drivers

* The same events reach PostHog, with the same properties and the same 2 s flush bound.
* `telemetry.send: false` means no network traffic at all.
* Telemetry must never fail or noticeably slow a run.
* No new dependencies.

## Considered Options

* **A. Warm the connection at run start, and make the flush reuse it** (chosen).
* **B. Lower the 2 s flush cap.**
* **C. Hand the event to a detached child process and exit without waiting.**
* **D. Do nothing.**

## Decision Outcome

Chosen option: **A**. Once `runTests` knows the effective config and telemetry isn't disabled, it
starts loading the PostHog client in the background and sends one `OPTIONS https://app.posthog.com/` request. That
request carries no event and opens the TLS connection while the run works. The PostHog client gets
a `fetch` that waits for that warm-up to settle before sending. The batch POST therefore reuses the
warm socket and costs one round trip. HTTP/1.1 carries one request per socket. Without the wait, a send
issued during the warm-up would open a second connection.

Details that matter:

* The opt-out is a guarantee. Nothing contacts PostHog until `setConfig` has produced the
  effective config, which includes the `DOC_DETECTIVE` environment override. Nothing does at all
  if that config or the caller's sets `telemetry.send: false`. The end-of-run send follows the
  same rule. Before this change, the send checked only the caller's config, so a `DOC_DETECTIVE`
  opt-out still sent the event. On the CLI, the effective config is ready almost as soon
  as the caller's. The warm-up still starts about 390 ms into the process.

* `OPTIONS`, not `HEAD`. PostHog answers `HEAD` with `Connection: close`, which discards the socket.
* The warm-up settles one event-loop turn after its body ends. undici returns the socket to its
  pool on that later turn, and a request sent sooner opens a new connection.
* A failed warm-up settles immediately, so the send goes out cold, as before.
* Only one warm-up runs at a time. A new `runTests` call aborts the previous warm-up, so a send never
  waits behind an orphaned request.
* A dry run starts no warm-up. It returns early, and a programmatic caller may never call
  `awaitTelemetryFlush` to cancel one.
* `runTests` aborts the warm-up on any exit that sends nothing, such as a run that finds no tests
  or one that throws.
* `awaitTelemetryFlush` aborts a warm-up that's still in flight. A run that ends without sending
  anything, such as one with no tests, doesn't wait for it.

### Consequences

* Good: the measured tail drops by about 210 ms on a shell-only run (interleaved A/B, 15 rounds:
  1336 → 1124 ms).
* Good: identical events, flush bound, and opt-out behavior. With `send: false` nothing is
  requested.
* Neutral: one extra request per run with telemetry on. It carries no event or identifier.
* Bad: Node's `fetch` drops an idle socket after 4 s. A run longer than that gets no reuse and pays
  the cold handshake, exactly as before. A custom dispatcher with a longer keep-alive is the
  upgrade path if long runs ever matter here.
* Bad: if the warm-up stalls instead of failing, the send waits behind it. The flush's existing 2 s
  bound still caps the total, as it did for a stalled cold POST.

### Confirmation

`test/telemetry-warmup.test.js` stubs `fetch` and asserts the following. `send: false` makes no
request. That holds when it comes from the caller, from a config file through the CLI, or from the
`DOC_DETECTIVE` environment override. The warm-up is an `OPTIONS` to the PostHog host. A send waits for an in-flight warm-up but
not for a failed one. A real `runTests` issues the warm-up first and still delivers the `runTests`
event in the batch POST. The existing `test/telem-coverage.test.js` still pins the 2 s flush bound.

## Pros and Cons of the Options

### A. Warm and reuse

* Good: removes most of the tail on short runs; no event or timing contract changes.
* Bad: one extra request; no gain past the 4 s idle limit.

### B. Lower the flush cap

* Good: one-line change.
* Bad: the cap bounds a slow network, not the normal case. A healthy flush already finishes well
  under 2 s, so lowering it saves nothing until it starts dropping events.

### C. Detached sender process

* Good: zero tail.
* Bad: on Windows, spawning a process costs about as much as the round trips it hides.
* Bad: the event's delivery would outlive the run's error handling.

### D. Do nothing

* Good: no change.
* Bad: every short run keeps paying ~4 round trips at exit.
