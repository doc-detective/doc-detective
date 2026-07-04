// Native app surfaces phase A3a: `doc-detective install android`. Everything
// here is hermetic — the pure helpers (abi, image parsing/picking, plan
// building) take plain inputs, and installAndroid takes injected detect / run /
// bootstrap / javaPresent effects, so no SDK, java, network, or spawn is
// touched. Real downloads are a manual dev-box / CI-emulator concern.

import {
  hostAbi,
  androidVersionToApi,
  cmdlineToolsUrl,
  parseSdkmanagerList,
  pickSystemImage,
  listInstalledSystemImages,
  buildAndroidInstallPlan,
  installAndroid,
  winShellCommand,
  DEFAULT_AVD_NAME,
  DEVICE_TYPE_PROFILES,
} from "../dist/runtime/androidInstaller.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("android installer: pure helpers", function () {
  it("maps host arch to a native ABI", function () {
    expect(hostAbi("x64")).to.equal("x86_64");
    expect(hostAbi("arm64")).to.equal("arm64-v8a");
  });

  it("maps Android release versions and raw API levels to API numbers", function () {
    expect(androidVersionToApi("14")).to.equal(34);
    expect(androidVersionToApi("34")).to.equal(34); // raw API passthrough
    expect(androidVersionToApi("10")).to.equal(29);
    expect(androidVersionToApi("12L")).to.equal(32); // 12L is its own API level
    expect(androidVersionToApi("nonsense")).to.equal(null);
    expect(androidVersionToApi("5")).to.equal(null); // too old to be an API
  });

  it("quotes only the tokens that need it for the Windows .bat shell form", function () {
    // No spaces -> passed through verbatim (incl. the ';'-laden image id,
    // which cmd.exe doesn't treat specially).
    expect(
      winShellCommand("C:\\sdk\\cmdline-tools\\latest\\bin\\sdkmanager.bat", [
        "--sdk_root=C:\\sdk",
        "system-images;android-34;google_apis;x86_64",
      ])
    ).to.equal(
      "C:\\sdk\\cmdline-tools\\latest\\bin\\sdkmanager.bat --sdk_root=C:\\sdk system-images;android-34;google_apis;x86_64"
    );
    // A path with a space gets quoted so cmd.exe keeps it as one token.
    expect(
      winShellCommand("C:\\Program Files\\sdk\\sdkmanager.bat", ["--licenses"])
    ).to.equal('"C:\\Program Files\\sdk\\sdkmanager.bat" --licenses');
  });

  it("refuses tokens carrying a shell metacharacter (injection barrier)", function () {
    for (const bad of [
      "C:\\sdk & calc.exe",
      "--sdk_root=C:\\sdk|whoami",
      "img>out",
      'a"b',
      "x`y`",
      "$(rm -rf)",
    ]) {
      expect(() => winShellCommand("sdkmanager.bat", [bad]), bad).to.throw(
        /unsafe token/
      );
    }
  });

  it("builds a platform-specific commandline-tools URL", function () {
    expect(cmdlineToolsUrl("linux")).to.match(/commandlinetools-linux-\d+_latest\.zip$/);
    expect(cmdlineToolsUrl("darwin")).to.match(/commandlinetools-mac-/);
    expect(cmdlineToolsUrl("win32")).to.match(/commandlinetools-win-/);
  });

  it("parses package ids out of sdkmanager --list output", function () {
    const text = [
      "Installed packages:",
      "  Path | Version | Description",
      "  -------",
      "  platform-tools | 35.0.0 | Android SDK Platform-Tools",
      "",
      "Available Packages:",
      "  system-images;android-34;google_apis;x86_64 | 3 | Google APIs",
      "  system-images;android-33;google_apis_playstore;x86_64 | 5 | Play",
      "  build-tools;34.0.0 | 34.0.0 | Android SDK Build-Tools 34",
    ].join("\n");
    const pkgs = parseSdkmanagerList(text);
    expect(pkgs).to.include("system-images;android-34;google_apis;x86_64");
    expect(pkgs).to.include("platform-tools");
    expect(pkgs).to.include("build-tools;34.0.0");
  });

  it("picks the newest stable google_apis image for the ABI", function () {
    const images = [
      "system-images;android-33;google_apis;x86_64",
      "system-images;android-34;google_apis;x86_64",
      "system-images;android-34;google_apis_playstore;x86_64",
      "system-images;android-34;google_apis;arm64-v8a",
      "system-images;android-Baklava;google_apis;x86_64", // preview codename
    ];
    expect(pickSystemImage(images, { abi: "x86_64" })).to.equal(
      "system-images;android-34;google_apis;x86_64"
    );
    // arm host gets the arm image
    expect(pickSystemImage(images, { abi: "arm64-v8a" })).to.equal(
      "system-images;android-34;google_apis;arm64-v8a"
    );
  });

  it("ignores non-image package ids when picking (parse guard)", function () {
    const images = [
      "platform-tools", // not a system image
      "build-tools;34.0.0", // wrong package family
      "system-images;android-34;google_apis;x86_64",
    ];
    expect(pickSystemImage(images, { abi: "x86_64" })).to.equal(
      "system-images;android-34;google_apis;x86_64"
    );
  });

  it("pins to the requested osVersion, or returns null when unavailable", function () {
    const images = [
      "system-images;android-33;google_apis;x86_64",
      "system-images;android-34;google_apis;x86_64",
    ];
    expect(pickSystemImage(images, { abi: "x86_64", osVersion: "13" })).to.equal(
      "system-images;android-33;google_apis;x86_64"
    );
    expect(pickSystemImage(images, { abi: "x86_64", osVersion: "15" })).to.equal(
      null
    );
    // Unmappable version -> null (no accidental newest-match).
    expect(pickSystemImage(images, { abi: "x86_64", osVersion: "junk" })).to.equal(
      null
    );
  });

  it("lists installed system images from an injected fs layout", function () {
    const layout = {
      "/sdk/system-images": ["android-34", "android-33"],
      "/sdk/system-images/android-34": ["google_apis"],
      "/sdk/system-images/android-34/google_apis": ["x86_64"],
      "/sdk/system-images/android-33": ["google_apis"],
      "/sdk/system-images/android-33/google_apis": ["x86_64"],
    };
    const norm = (p) => p.split(path.sep).join("/");
    const images = listInstalledSystemImages("/sdk", {
      existsSync: (p) => norm(p) in layout,
      readdirSync: (p) => layout[norm(p)] ?? [],
    });
    expect(images).to.include("system-images;android-34;google_apis;x86_64");
    expect(images).to.include("system-images;android-33;google_apis;x86_64");
  });
});

describe("android installer: buildAndroidInstallPlan", function () {
  const base = {
    cacheSdkRoot: "/cache/android-sdk",
    platform: "linux",
    abi: "x86_64",
    installedImages: [],
    availableImages: ["system-images;android-34;google_apis;x86_64"],
  };

  it("bootstraps when no SDK is detected", function () {
    const plan = buildAndroidInstallPlan({ ...base, detected: null });
    const types = plan.actions.map((a) => a.type);
    expect(types[0]).to.equal("bootstrap-cmdline-tools");
    expect(types).to.include("accept-licenses");
    expect(types).to.include("install-package"); // platform-tools/emulator/image
    expect(types[types.length - 1]).to.equal("create-avd");
    expect(plan.bootstrapped).to.equal(true);
    expect(plan.sdkRoot).to.equal("/cache/android-sdk");
  });

  it("augments an existing SDK — no bootstrap, only missing pieces", function () {
    const plan = buildAndroidInstallPlan({
      ...base,
      detected: {
        sdkRoot: "/opt/android",
        source: "ANDROID_HOME",
        adb: "/opt/android/platform-tools/adb",
        emulator: "/opt/android/emulator/emulator",
      },
      hasPlatformTools: true,
      hasEmulator: true,
      installedImages: ["system-images;android-34;google_apis;x86_64"],
    });
    const types = plan.actions.map((a) => a.type);
    expect(types).to.not.include("bootstrap-cmdline-tools");
    // platform-tools + emulator already present and an image is installed, so
    // no install-package actions — just license acceptance + AVD creation.
    expect(types.filter((t) => t === "install-package")).to.deep.equal([]);
    expect(types).to.include("create-avd");
    expect(plan.bootstrapped).to.equal(false);
    expect(plan.sdkRoot).to.equal("/opt/android");
  });

  it("uses the deviceType profile and default AVD name", function () {
    const plan = buildAndroidInstallPlan({
      ...base,
      detected: null,
      deviceType: "tablet",
    });
    const createAvd = plan.actions.find((a) => a.type === "create-avd");
    expect(createAvd.name).to.equal(DEFAULT_AVD_NAME);
    expect(createAvd.device).to.equal(DEVICE_TYPE_PROFILES.tablet);
  });

  it("blocks with guidance when no image is installed or available", function () {
    const plan = buildAndroidInstallPlan({
      ...base,
      detected: null,
      installedImages: [],
      availableImages: [],
      osVersion: "14",
    });
    expect(plan.systemImage).to.equal(null);
    expect(plan.blocked).to.match(/system image/i);
    expect(plan.actions.some((a) => a.type === "create-avd")).to.equal(false);
  });
});

describe("android installer: installAndroid orchestration", function () {
  function withTmpCache(fn) {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-android-inst-"));
    const prev = process.env.DOC_DETECTIVE_CACHE_DIR;
    process.env.DOC_DETECTIVE_CACHE_DIR = tmpRoot;
    return Promise.resolve(fn(tmpRoot)).finally(() => {
      if (prev === undefined) delete process.env.DOC_DETECTIVE_CACHE_DIR;
      else process.env.DOC_DETECTIVE_CACHE_DIR = prev;
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    });
  }

  const detectedSdk = {
    sdkRoot: "/opt/android",
    source: "ANDROID_HOME",
    adb: "/opt/android/platform-tools/adb",
    emulator: "/opt/android/emulator/emulator",
  };

  it("dry-run reports the plan without running anything", async function () {
    await withTmpCache(async () => {
      const calls = [];
      const reports = await installAndroid({
        dryRun: true,
        deps: {
          detect: () => detectedSdk,
          arch: "x64", // pin the ABI so the assertions hold on arm64 CI (macOS)
          javaPresent: () => true,
          fs: { existsSync: () => false, readdirSync: () => [] },
          run: (...a) => {
            calls.push(a);
            return Promise.resolve("");
          },
        },
      });
      expect(calls).to.deep.equal([]); // nothing executed
      expect(reports.every((r) => r.action === "planned")).to.equal(true);
    });
  });

  it("refuses without --yes (multi-GB opt-in guard)", async function () {
    await withTmpCache(async () => {
      const calls = [];
      const reports = await installAndroid({
        yes: false,
        deps: {
          detect: () => detectedSdk,
          arch: "x64", // pin the ABI so the assertions hold on arm64 CI (macOS)
          javaPresent: () => true,
          run: (...a) => {
            calls.push(a);
            return Promise.resolve("");
          },
        },
      });
      expect(calls).to.deep.equal([]);
      expect(reports[0].action).to.equal("declined");
    });
  });

  it("reports a missing Java runtime actionably", async function () {
    await withTmpCache(async () => {
      const reports = await installAndroid({
        yes: true,
        deps: { detect: () => detectedSdk, arch: "x64", javaPresent: () => false },
      });
      expect(reports[0].assetId).to.equal("java");
      expect(reports[0].action).to.equal("missing");
    });
  });

  it("with --yes runs sdkmanager/avdmanager and records the install", async function () {
    await withTmpCache(async (tmpRoot) => {
      const runCalls = [];
      const reports = await installAndroid({
        yes: true,
        osVersion: "14",
        deps: {
          detect: () => detectedSdk,
          arch: "x64", // pin the ABI so the assertions hold on arm64 CI (macOS)
          javaPresent: () => true,
          // Already-installed image so no image download is needed.
          fs: {
            existsSync: (p) => p.replace(/\\/g, "/").endsWith("system-images"),
            readdirSync: (p) => {
              const norm = p.replace(/\\/g, "/");
              if (norm.endsWith("system-images")) return ["android-34"];
              if (norm.endsWith("android-34")) return ["google_apis"];
              if (norm.endsWith("google_apis")) return ["x86_64"];
              return [];
            },
          },
          run: (command, args) => {
            runCalls.push({ command, args });
            return Promise.resolve("");
          },
        },
      });
      // Licenses accepted, then AVD created (image already installed).
      const joined = runCalls.map((c) => c.args.join(" ")).join(" | ");
      expect(joined).to.match(/--licenses/);
      expect(joined).to.match(/create avd -n doc-detective/);
      expect(reports.some((r) => r.assetId === "avd:doc-detective")).to.equal(
        true
      );
      // installed.json records the android slot.
      const record = JSON.parse(
        fs.readFileSync(path.join(tmpRoot, "installed.json"), "utf8")
      );
      expect(record.android).to.be.an("object");
      expect(record.android.avds).to.include("doc-detective");
      expect(record.android.systemImages).to.include(
        "system-images;android-34;google_apis;x86_64"
      );
    });
  });

  it("queries `sdkmanager --list` and installs a missing image before the AVD", async function () {
    await withTmpCache(async () => {
      const runCalls = [];
      const listOutput = [
        "Available Packages:",
        "  system-images;android-34;google_apis;x86_64 | 3 | Google APIs",
      ].join("\n");
      const reports = await installAndroid({
        yes: true,
        deps: {
          detect: () => detectedSdk,
          arch: "x64", // pin the ABI so the assertions hold on arm64 CI (macOS)
          javaPresent: () => true,
          // No installed images -> must query available and install one.
          fs: { existsSync: () => false, readdirSync: () => [] },
          run: (command, args) => {
            runCalls.push(args.join(" "));
            if (args.includes("--list")) return Promise.resolve(listOutput);
            return Promise.resolve("");
          },
        },
      });
      const joined = runCalls.join(" | ");
      expect(joined).to.match(/--list/);
      expect(joined).to.match(/system-images;android-34;google_apis;x86_64/);
      expect(joined).to.match(/create avd -n doc-detective/);
      expect(reports.some((r) => r.action === "installed")).to.equal(true);
    });
  });

  it("blocks with guidance when no image is installed or available", async function () {
    await withTmpCache(async () => {
      const reports = await installAndroid({
        yes: true,
        osVersion: "14",
        deps: {
          detect: () => detectedSdk,
          arch: "x64", // pin the ABI so the assertions hold on arm64 CI (macOS)
          javaPresent: () => true,
          fs: { existsSync: () => false, readdirSync: () => [] },
          run: (command, args) =>
            Promise.resolve(args.includes("--list") ? "Available Packages:\n" : ""),
        },
      });
      // The blocked report is the terminal one (after licenses); no AVD created.
      expect(reports.some((r) => r.action === "blocked")).to.equal(true);
      expect(reports.some((r) => r.assetId === "avd:doc-detective")).to.equal(false);
    });
  });

  it("bootstraps the SDK from nothing: download → licenses → tools → image → AVD", async function () {
    await withTmpCache(async () => {
      const runCalls = [];
      const bootstrapCalls = [];
      const listOutput = [
        "Available Packages:",
        "  system-images;android-34;google_apis;x86_64 | 3 | Google APIs",
      ].join("\n");
      const reports = await installAndroid({
        yes: true,
        deps: {
          // No SDK anywhere -> bootstrap path.
          detect: () => null,
          arch: "x64", // pin the ABI so the assertions hold on arm64 CI (macOS)
          javaPresent: () => true,
          fs: { existsSync: () => false, readdirSync: () => [] },
          bootstrap: (url, dest) => {
            bootstrapCalls.push({ url, dest });
            return Promise.resolve();
          },
          run: (command, args) => {
            runCalls.push(args.join(" "));
            if (args.includes("--list")) return Promise.resolve(listOutput);
            return Promise.resolve("");
          },
        },
      });
      // Command-line tools were downloaded into the cache SDK root.
      expect(bootstrapCalls).to.have.length(1);
      expect(bootstrapCalls[0].url).to.match(/commandlinetools-/);
      expect(bootstrapCalls[0].dest).to.match(/android-sdk$/);
      // Then: licenses, platform-tools + emulator (nothing pre-detected),
      // the system image, and the AVD — in order.
      const joined = runCalls.join(" | ");
      expect(joined).to.match(/--licenses/);
      expect(joined).to.match(/platform-tools/);
      expect(joined).to.match(/emulator/);
      expect(joined).to.match(/system-images;android-34;google_apis;x86_64/);
      expect(joined).to.match(/create avd -n doc-detective/);
      expect(reports[0].assetId).to.equal("cmdline-tools");
      expect(reports.some((r) => r.assetId === "avd:doc-detective")).to.equal(true);
    });
  });

  it("reports a bootstrap download failure without proceeding", async function () {
    await withTmpCache(async () => {
      const runCalls = [];
      const reports = await installAndroid({
        yes: true,
        deps: {
          detect: () => null,
          arch: "x64", // pin the ABI so the assertions hold on arm64 CI (macOS)
          javaPresent: () => true,
          fs: { existsSync: () => false, readdirSync: () => [] },
          bootstrap: () => Promise.reject(new Error("network down")),
          run: (command, args) => {
            runCalls.push(args.join(" "));
            return Promise.resolve("");
          },
        },
      });
      expect(reports[0]).to.deep.equal({
        kind: "android",
        assetId: "cmdline-tools",
        action: "failed",
      });
      // Nothing ran after the failed bootstrap.
      expect(runCalls).to.deep.equal([]);
    });
  });

  it("--force deletes any existing AVD before re-creating (delete failure tolerated)", async function () {
    await withTmpCache(async () => {
      const runArgs = [];
      await installAndroid({
        yes: true,
        force: true,
        deps: {
          detect: () => detectedSdk,
          arch: "x64", // pin the ABI so the assertions hold on arm64 CI (macOS)
          javaPresent: () => true,
          fs: {
            existsSync: (p) => p.replace(/\\/g, "/").endsWith("system-images"),
            readdirSync: (p) => {
              const norm = p.replace(/\\/g, "/");
              if (norm.endsWith("system-images")) return ["android-34"];
              if (norm.endsWith("android-34")) return ["google_apis"];
              if (norm.endsWith("google_apis")) return ["x86_64"];
              return [];
            },
          },
          run: (command, args) => {
            runArgs.push(args.join(" "));
            // A pre-existing-AVD delete has nothing to delete — the tolerated
            // failure path.
            if (args[0] === "delete") return Promise.reject(new Error("no avd"));
            return Promise.resolve("");
          },
        },
      });
      const joined = runArgs.join(" | ");
      expect(joined).to.match(/delete avd -n doc-detective/);
      expect(joined).to.match(/create avd -n doc-detective/);
    });
  });

  it("dry-run of a no-SDK host previews the bootstrap plan", async function () {
    await withTmpCache(async () => {
      const logs = [];
      const reports = await installAndroid({
        dryRun: true,
        deps: {
          detect: () => null, // no SDK anywhere -> bootstrap plan
          logger: (msg) => logs.push(String(msg)),
          fs: { existsSync: () => false, readdirSync: () => [] },
        },
      });
      const text = logs.join("\n");
      expect(text).to.match(/bootstrap Android commandline-tools/);
      expect(text).to.match(/install platform-tools/);
      // No installed/available image in a dry-run -> blocked note is surfaced.
      expect(text).to.match(/system image/i);
      expect(reports.every((r) => r.action === "planned")).to.equal(true);
    });
  });
});
