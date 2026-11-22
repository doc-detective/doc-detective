---
status: accepted
date: 2026-11-15
decision-makers: doc-detective maintainers
---

# Move to Appium 4, and override the Windows driver's Appium peer

## Context and Problem Statement

Appium 4.0.0 is out, and every driver Doc Detective pins has an Appium 4 release except one.
`appium-novawindows-driver` 1.5.0, the newest stable release, declares `appium: ^3.0.0-rc.2` as its
peer. Its `2.0.0-preview.2` is older than 1.5.0, still peers on Appium 3, and fails the
window-selector fixtures.

All Appium packages install into one home, `<cacheDir>/runtime` ([ADR 01111](01111-one-appium-home-in-the-runtime-cache.md)).
npm refuses `appium@4` next to `appium-novawindows-driver@1.5.0` with `ERESOLVE`, so one driver holds
the whole family on Appium 3. Do we stay, or move and work around the peer?

## Decision Drivers

- The browser and app drivers should take upstream releases. New driver majors require Appium 4.
- One Appium home (ADR 01111). Two Appium versions means two homes.
- Windows app support is experimental, so it shouldn't hold the other platforms back.
- An install-time workaround must not change how unrelated packages install.

## Considered Options

- **A. Move to Appium 4, and override the Windows driver's `appium` peer in the runtime manifest.**
- **B. Move to Appium 4, and pass `--legacy-peer-deps` to every runtime install.**
- **C. Stay on Appium 3 until the Windows driver peers on Appium 4.**
- **D. Run Appium 3 and Appium 4 side by side in two homes.**
- **E. Move to Appium 4 with `appium-novawindows-driver` 2.0.0-preview.2.**

## Decision Outcome

Chosen option: **A**. The pins move to:

| Package | Pin |
|---|---|
| `appium` | 4.0.0 |
| `appium-chromium-driver` | 4.0.2 |
| `appium-geckodriver` | 4.0.2 |
| `appium-mac2-driver` | 5.0.1 |
| `appium-safari-driver` | 6.0.1 |
| `appium-uiautomator2-driver` | 9.2.0 |
| `appium-xcuitest-driver` | 13.1.1 |

`appium-novawindows-driver` stays at 1.5.0.

Before each npm spawn, the runtime installer writes this into `<cacheDir>/runtime/package.json`:

```json
"overrides": { "appium-novawindows-driver": { "appium": "<the pinned appium version>" } }
```

npm then resolves that one peer edge to the pinned Appium. Every other package keeps npm's normal
peer handling. There's no new flag, config key, or message.

### Consequences

- Good: the drivers take upstream releases again, in one Appium home.
- Good: the override is scoped to one edge. `geckodriver` still gets its required `@wdio/logger`
  peer installed.
- Good: an existing cache picks the override up on its next install, because the manifest is
  rewritten each time.
- Bad: the Windows driver runs on an Appium major its author hasn't declared support for. A
  regression there shows up as a Windows app fixture failure, not an install error.
- Bad: the override needs removing by hand once the driver peers on Appium 4.
- Neutral: a cache holding Appium 3 reinstalls the Appium packages on the next run that needs them.

### Confirmation

- `test/runtime-loader.test.js` asserts the override is in the manifest when npm spawns, including
  for a manifest written by an older release.
- The Windows app fixtures (`test/core-artifacts/apps`) pass on Windows with Appium 4.0.0 and the
  1.5.0 driver.
- The macOS, iOS, and Android fixture jobs confirm the other drivers in CI.

## Pros and Cons of the Options

### A. Override the one peer edge

- Good: smallest change to install behavior.
- Bad: a manual cleanup later.

### B. `--legacy-peer-deps` on every runtime install

- Good: one argument.
- Bad: npm stops installing required peers for every package. `geckodriver` 8 requires
  `@wdio/logger`, and a runtime install of it alone would then fail to load.

### C. Stay on Appium 3

- Good: nothing changes.
- Bad: every driver is held back by an experimental platform's driver.

### D. Two Appium homes

- Good: each driver runs on the Appium it declares.
- Bad: reverses ADR 01111, doubles the install size, and needs per-surface home routing.

### E. The 2.0 preview driver

- Bad: it still peers on Appium 3, so it needs the same override.
- Bad: it reports no window titles, so the window-selector fixtures fail.
