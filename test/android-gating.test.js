// Native app surfaces phase A3a: capability gating for the `android`/`ios`
// target platforms, and the lazy Android SDK detection that decides which
// SKIP reason a mobile context lands with. Everything here is hermetic —
// detection takes injected env/existsSync deps — so no SDK, adb, or emulator
// is ever touched. (The mobile-web browser gate is covered in
// test/mobile-browser.test.js.)

import { isMobileTargetPlatform } from "../dist/core/tests/mobilePlatform.js";
import { detectAndroidSdk } from "../dist/runtime/androidSdk.js";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("native app surfaces (A3a): isMobileTargetPlatform", function () {
  it("classifies android and ios as mobile targets", function () {
    expect(isMobileTargetPlatform("android")).to.equal("android");
    expect(isMobileTargetPlatform("ios")).to.equal("ios");
  });

  it("returns null for desktop platforms and junk", function () {
    for (const p of ["linux", "mac", "windows", undefined, null, "", 42]) {
      expect(isMobileTargetPlatform(p), JSON.stringify(p)).to.equal(null);
    }
  });
});

describe("native app surfaces (A3a): detectAndroidSdk", function () {
  // Build a fake SDK layout: a set of existing paths + an env. Tool suffixes
  // (.exe/.bat) are added per platform, so tests seed the bare tool path and
  // let detection find it with or without a suffix.
  const sep = "/";
  function root(r) {
    return {
      adb: `${r}${sep}platform-tools${sep}adb`,
      emulator: `${r}${sep}emulator${sep}emulator`,
      avdmanager: `${r}${sep}cmdline-tools${sep}latest${sep}bin${sep}avdmanager`,
      sdkmanager: `${r}${sep}cmdline-tools${sep}latest${sep}bin${sep}sdkmanager`,
    };
  }
  function existsFrom(paths) {
    const set = new Set(paths);
    return (p) => set.has(p);
  }

  it("resolves from ANDROID_HOME first, with tool paths", function () {
    const r = "/opt/android";
    const t = root(r);
    const sdk = detectAndroidSdk(
      {},
      {
        platform: "linux",
        env: { ANDROID_HOME: r, ANDROID_SDK_ROOT: "/other" },
        existsSync: existsFrom([
          r,
          t.adb,
          t.emulator,
          t.avdmanager,
          t.sdkmanager,
        ]),
      }
    );
    expect(sdk).to.not.equal(null);
    expect(sdk.sdkRoot).to.equal(r);
    expect(sdk.source).to.equal("ANDROID_HOME");
    expect(sdk.adb).to.equal(t.adb);
    expect(sdk.emulator).to.equal(t.emulator);
    expect(sdk.avdmanager).to.equal(t.avdmanager);
  });

  it("falls back to ANDROID_SDK_ROOT when ANDROID_HOME is unset", function () {
    const r = "/opt/sdk";
    const t = root(r);
    const sdk = detectAndroidSdk(
      {},
      {
        platform: "linux",
        env: { ANDROID_SDK_ROOT: r },
        existsSync: existsFrom([r, t.adb]),
      }
    );
    expect(sdk.sdkRoot).to.equal(r);
    expect(sdk.source).to.equal("ANDROID_SDK_ROOT");
  });

  it("falls back to the Doc Detective cache SDK", function () {
    const cacheRoot = "/cache/android-sdk";
    const t = root(cacheRoot);
    const sdk = detectAndroidSdk(
      { cacheDir: "/cache" },
      {
        platform: "linux",
        env: {},
        cacheAndroidSdk: cacheRoot,
        existsSync: existsFrom([cacheRoot, t.emulator]),
      }
    );
    expect(sdk.sdkRoot).to.equal(cacheRoot);
    expect(sdk.source).to.equal("cache");
  });

  it("derives the root from adb on PATH as a last resort", function () {
    const r = "/usr/local/android";
    const t = root(r);
    const sdk = detectAndroidSdk(
      {},
      {
        platform: "linux",
        env: { PATH: `/usr/bin:${r}/platform-tools` },
        existsSync: existsFrom([t.adb]),
      }
    );
    expect(sdk).to.not.equal(null);
    expect(sdk.sdkRoot).to.equal(r);
    expect(sdk.source).to.equal("path");
    expect(sdk.adb).to.equal(t.adb);
  });

  it("returns null when no SDK is found anywhere", function () {
    const sdk = detectAndroidSdk(
      {},
      { platform: "linux", env: {}, existsSync: () => false }
    );
    expect(sdk).to.equal(null);
  });

  it("degrades to no cache-SDK when the cacheDir is invalid (never throws)", function () {
    // A cacheDir with a shell metacharacter makes getCacheDir throw; detection
    // must swallow that and fall through to the other candidates, not crash the
    // gate. Env empty + nothing on disk -> null.
    const sdk = detectAndroidSdk(
      { cacheDir: "/bad;path" },
      { platform: "linux", env: {}, existsSync: () => false }
    );
    expect(sdk).to.equal(null);
  });

  it("never false-matches a relative 'android-sdk' when the cache dir can't be computed", function () {
    // If getCacheDir throws, the cache candidate must be OMITTED — not joined to
    // a relative "android-sdk" that could match a cwd-local folder. existsSync
    // here would happily confirm a relative "android-sdk/..." tree; detection
    // must still return null because that candidate is skipped.
    const sdk = detectAndroidSdk(
      { cacheDir: "/bad;path" },
      {
        platform: "linux",
        env: {},
        existsSync: (p) => p.startsWith("android-sdk"),
      }
    );
    expect(sdk).to.equal(null);
  });

  it("resolves .exe/.bat tool suffixes on Windows", function () {
    const r = "C:\\Android";
    const winRoot = {
      adb: `${r}\\platform-tools\\adb.exe`,
      emulator: `${r}\\emulator\\emulator.exe`,
      avdmanager: `${r}\\cmdline-tools\\latest\\bin\\avdmanager.bat`,
    };
    const sdk = detectAndroidSdk(
      {},
      {
        platform: "win32",
        env: { ANDROID_HOME: r },
        existsSync: existsFrom([r, winRoot.adb, winRoot.emulator, winRoot.avdmanager]),
      }
    );
    expect(sdk.adb).to.equal(winRoot.adb);
    expect(sdk.avdmanager).to.equal(winRoot.avdmanager);
  });
});
