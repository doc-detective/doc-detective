---
status: accepted
date: 2026-11-16
decision-makers: doc-detective maintainers
---

# Install the iOS driver best-effort

## Context and Problem Statement

`install runtime` and `install all` install the core heavy deps in one npm batch. Since the move to
Appium 4 ([ADR 01208](01208-move-to-appium-4-and-override-the-windows-drivers-peer.md)), that batch
includes `appium-xcuitest-driver` 13. It depends on `appium-ios-remotexpc`, which depends on
`appium-ios-tuntap`, a native addon. The addon's Linux prebuilds need glibc 2.38. Debian 12 has
glibc 2.36, and it's the `node:24-slim` base of the official image. Ubuntu 22.04 has 2.35. There,
npm falls back to compiling the addon. That needs a C++ toolchain, `pkg-config`, and OpenSSL
headers. Without them the build fails, npm exits 1, and the whole batch fails: Appium and every
browser driver with it. The official Docker image build broke this way.

The iOS driver only works on a macOS host. Should a failure to install it fail the rest?

## Decision Drivers

- An iOS-only driver must not stop Chrome and Firefox tests on Linux or Windows.
- `install all` should succeed on slim Linux images without build tools.
- The npm prune hazard (ADR 01025) must stay defended.

## Considered Options

- **A. Add `appium-xcuitest-driver` to `BEST_EFFORT_NPM_DEPS`.**
- **B. Install build tools and OpenSSL headers in the Docker image.**
- **C. Move the image to a Debian 13 base.**

## Decision Outcome

Chosen option: **A**. The driver installs in its own npm run after the core batch, as the PTY
backend does. If it fails, `install` reports it
`skipped` and the core deps stay installed. On macOS, where its prebuilds load, nothing changes.
A later iOS install (`install ios`, or an iOS context's JIT install) retries it.

### Consequences

- Good: `install all` succeeds on slim Linux images and older glibc hosts.
- Good: the fix covers every host, not only the Docker image.
- Bad: on such a host the iOS driver is absent. iOS contexts can't run there anyway.
- Neutral: one more npm run during `install all`.

### Confirmation

`test/runtime-installer.test.js` checks that a failing iOS driver install leaves the core batch
installed and is reported `skipped`. The docker-build workflow builds the image on `node:24-slim`.

## Pros and Cons of the Options

### A. Best-effort install

- Good: one-line change on an existing, tested path.
- Bad: one more npm run.

### B. Build tools in the image

- Good: the driver installs.
- Bad: adds a compiler and headers to the image, and leaves every other slim host broken.

### C. Debian 13 base

- Good: the prebuild loads.
- Bad: a base-image move renames packages, and other hosts stay broken.
