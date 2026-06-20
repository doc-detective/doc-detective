// Minimal, local stand-in for the shape of the `webdriverio` module that this
// codebase actually consumes at runtime. webdriverio is an *optionalDependency*
// (a heavy browser-automation package most consumers never install) that is
// lazy-loaded via `loadHeavyDep` only when a browser step runs.
//
// We deliberately do NOT type these call sites as `typeof import("webdriverio")`.
// Doing so creates a HARD compile-time dependency on the package being present
// on disk: when npm skips the optional install on a CI runner (transient
// network/platform issue — optional installs fail silently and still exit 0),
// `tsc` then fails with "Cannot find module 'webdriverio'", turning a best-effort
// runtime dep into an intermittent build break (seen most on macOS runners).
//
// Declaring the minimal surface here decouples the COMPILE-TIME type from the
// OPTIONAL RUNTIME PACKAGE: the build is deterministic regardless of whether
// webdriverio is installed, while runtime behavior is unchanged (the real module
// is still dynamically loaded and used when present). This mirrors the existing
// `loadHeavyDep<any>(...)` treatment of the other optional heavy deps (sharp,
// pixelmatch) in saveScreenshot.ts, but keeps just enough typing to guard the
// `Key.*` sentinel lookups in typeKeys.ts.

// The webdriverio `Key` enum: a map of named special-key sentinels to the
// platform-interpreted strings that `driver.keys()` understands. We only read
// its members, so a string-valued record is the precise surface we depend on.
export interface WdioKey {
  readonly [name: string]: string;
}

// The slice of the webdriverio module surface this codebase calls. `remote()`
// returns a driver whose result is immediately treated as `any` at the call
// site, so `Promise<any>` is faithful without re-deriving the full Browser type.
export interface WdioModule {
  remote(options: any): Promise<any>;
  readonly Key: WdioKey;
}
