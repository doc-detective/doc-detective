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
  jreDownloadUrl,
  jreArchiveFilename,
  resolveJavaHome,
  javaBinPath,
  ensureJava,
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
        // A COMPLETE SDK has the command-line tools too — that's what makes an
        // augment (no bootstrap) the right plan. A detected SDK missing these is
        // a partial install and re-bootstraps (covered by its own case below).
        sdkmanager: "/opt/android/cmdline-tools/latest/bin/sdkmanager",
        avdmanager: "/opt/android/cmdline-tools/latest/bin/avdmanager",
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

  it("re-bootstraps command-line tools when a detected SDK is missing them (partial install)", function () {
    // A half-installed SDK: adb landed (so detection considers the root usable),
    // but cmdline-tools/sdkmanager never did. The plan must re-fetch the
    // command-line tools INTO THE SAME sdkRoot — healing in place — rather than
    // skip the bootstrap and later die running the absent sdkmanager.
    const plan = buildAndroidInstallPlan({
      ...base,
      detected: {
        sdkRoot: "/cache/android-sdk",
        source: "cache",
        adb: "/cache/android-sdk/platform-tools/adb",
        // no sdkmanager / avdmanager -> cmdline-tools absent
      },
      hasPlatformTools: true,
      installedImages: ["system-images;android-34;google_apis;x86_64"],
    });
    const types = plan.actions.map((a) => a.type);
    expect(plan.bootstrapped).to.equal(true);
    expect(types[0]).to.equal("bootstrap-cmdline-tools");
    const boot = plan.actions.find((a) => a.type === "bootstrap-cmdline-tools");
    expect(boot.dest).to.equal("/cache/android-sdk");
    expect(plan.sdkRoot).to.equal("/cache/android-sdk");
  });

  it("re-bootstraps when only one of the command-line tools is present", function () {
    // The tools ship together, so a root with sdkmanager but no avdmanager is a
    // broken cmdline-tools install — the plan re-bootstraps rather than proceed to
    // an avdmanager (AVD creation) that isn't there.
    const plan = buildAndroidInstallPlan({
      ...base,
      detected: {
        sdkRoot: "/opt/android",
        source: "ANDROID_HOME",
        adb: "/opt/android/platform-tools/adb",
        sdkmanager: "/opt/android/cmdline-tools/latest/bin/sdkmanager",
        // avdmanager missing
      },
      hasPlatformTools: true,
      installedImages: ["system-images;android-34;google_apis;x86_64"],
    });
    expect(plan.bootstrapped).to.equal(true);
    expect(plan.actions[0].type).to.equal("bootstrap-cmdline-tools");
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
    // A complete SDK: the command-line tools are present, so these orchestration
    // cases take the augment (no-bootstrap) path. The partial-SDK heal has its
    // own case below.
    sdkmanager: "/opt/android/cmdline-tools/latest/bin/sdkmanager",
    avdmanager: "/opt/android/cmdline-tools/latest/bin/avdmanager",
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

  it("reports a missing Java runtime when it can't provision one", async function () {
    await withTmpCache(async () => {
      const reports = await installAndroid({
        yes: true,
        deps: {
          detect: () => detectedSdk,
          arch: "x64",
          javaPresent: () => false,
          // No cached JRE and the download fails -> actionable "missing".
          detectCachedJavaHome: () => null,
          bootstrapJava: () => Promise.reject(new Error("network down")),
        },
      });
      expect(reports[0].assetId).to.equal("java");
      expect(reports[0].action).to.equal("missing");
    });
  });

  it("bootstraps a portable JRE when Java is absent, then proceeds", async function () {
    await withTmpCache(async () => {
      const runCalls = [];
      let bootstrappedJava = false;
      const setHomes = [];
      const reports = await installAndroid({
        yes: true,
        osVersion: "14",
        deps: {
          detect: () => detectedSdk,
          arch: "x64",
          javaPresent: () => false,
          detectCachedJavaHome: () => null,
          bootstrapJava: async () => {
            bootstrappedJava = true;
            return "/cache/jre";
          },
          // Capture (don't mutate the real process env) the JAVA_HOME we'd set.
          setJavaEnv: (home) => setHomes.push(home),
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
            runCalls.push(args.join(" "));
            return Promise.resolve("");
          },
        },
      });
      expect(bootstrappedJava).to.equal(true);
      expect(setHomes).to.deep.equal(["/cache/jre"]);
      // The install proceeded past Java to create the AVD.
      expect(runCalls.join(" | ")).to.match(/create avd -n doc-detective/);
      expect(reports.some((r) => r.assetId === "avd:doc-detective")).to.equal(true);
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

  it("heals a partial SDK (adb but no cmdline-tools) by re-bootstrapping, then proceeds", async function () {
    await withTmpCache(async () => {
      const runCalls = [];
      const bootstrapCalls = [];
      // Detected but partial: adb only, no cmdline-tools. This is the exact state
      // an interrupted earlier install leaves behind, which used to wedge every
      // re-install ("sdkmanager.bat ... The system cannot find the path specified").
      const partialSdk = {
        sdkRoot: "/cache/android-sdk",
        source: "cache",
        adb: "/cache/android-sdk/platform-tools/adb",
      };
      const reports = await installAndroid({
        yes: true,
        deps: {
          detect: () => partialSdk,
          arch: "x64", // pin the ABI so the assertions hold on arm64 CI (macOS)
          javaPresent: () => true,
          // The system image is already present -> reused, not re-downloaded.
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
          bootstrap: (url, dest) => {
            bootstrapCalls.push({ url, dest });
            return Promise.resolve();
          },
          run: (command, args) => {
            runCalls.push(args.join(" "));
            return Promise.resolve("");
          },
        },
      });
      // cmdline-tools were re-fetched into the existing (partial) SDK root...
      expect(bootstrapCalls).to.have.length(1);
      expect(bootstrapCalls[0].dest).to.match(/android-sdk$/);
      // ...then the install proceeded (licenses + AVD), reusing the installed
      // image — so no `--list` availability query (that only runs when the image
      // isn't already present).
      const joined = runCalls.join(" | ");
      expect(joined).to.match(/--licenses/);
      expect(joined).to.match(/create avd -n doc-detective/);
      expect(joined).to.not.match(/--list/);
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

describe("android installer: portable JRE", function () {
  it("builds the Temurin download URL per OS/arch", function () {
    expect(jreDownloadUrl("linux", "x64")).to.match(
      /api\.adoptium\.net\/v3\/binary\/latest\/17\/ga\/linux\/x64\/jre\/hotspot\/normal\/eclipse$/
    );
    expect(jreDownloadUrl("darwin", "arm64")).to.match(/\/mac\/aarch64\/jre\//);
    expect(jreDownloadUrl("win32", "x64")).to.match(/\/windows\/x64\/jre\//);
    // Unusual arch falls back to x64.
    expect(jreDownloadUrl("linux", "ppc64")).to.match(/\/linux\/x64\/jre\//);
  });

  it("picks the archive extension by platform", function () {
    expect(jreArchiveFilename("win32")).to.equal("jre.zip");
    expect(jreArchiveFilename("linux")).to.equal("jre.tar.gz");
    expect(jreArchiveFilename("darwin")).to.equal("jre.tar.gz");
  });

  it("resolves JAVA_HOME from the extracted layout (mac nests Contents/Home)", function () {
    const entries = ["jdk-17.0.11+9-jre", "._meta"];
    expect(resolveJavaHome("/x", entries, "linux")).to.equal(
      path.join("/x", "jdk-17.0.11+9-jre")
    );
    expect(resolveJavaHome("/x", entries, "darwin")).to.equal(
      path.join("/x", "jdk-17.0.11+9-jre", "Contents", "Home")
    );
    expect(resolveJavaHome("/x", ["nothing"], "linux")).to.equal(null);
  });

  it("locates the java binary per platform", function () {
    expect(javaBinPath("/jh", "linux")).to.equal(path.join("/jh", "bin", "java"));
    expect(javaBinPath("/jh", "win32")).to.equal(path.join("/jh", "bin", "java.exe"));
  });

  it("ensureJava short-circuits to system Java when present", async function () {
    let bootstrapped = false;
    const res = await ensureJava({
      javaPresent: () => true,
      cacheJreRoot: "/cache/jre",
      detectCachedJavaHome: () => null,
      bootstrapJava: async () => {
        bootstrapped = true;
        return "/x";
      },
      setJavaEnv: () => {},
    });
    expect(res).to.deep.equal({ ok: true, source: "system" });
    expect(bootstrapped).to.equal(false);
  });

  it("ensureJava reuses a cached JRE and sets the env", async function () {
    const set = [];
    const res = await ensureJava({
      javaPresent: () => false,
      cacheJreRoot: "/cache/jre",
      detectCachedJavaHome: () => "/cache/jre",
      bootstrapJava: async () => "/should-not-run",
      setJavaEnv: (home, platform) => set.push([home, platform]),
      platform: "linux",
    });
    expect(res.source).to.equal("cache");
    expect(res.javaHome).to.equal("/cache/jre");
    expect(set).to.deep.equal([["/cache/jre", "linux"]]);
  });

  it("ensureJava downloads a JRE when none is present", async function () {
    const res = await ensureJava({
      javaPresent: () => false,
      cacheJreRoot: "/cache/jre",
      detectCachedJavaHome: () => null,
      bootstrapJava: async () => "/cache/jre/jdk-17-jre",
      setJavaEnv: () => {},
    });
    expect(res.source).to.equal("bootstrap");
    expect(res.javaHome).to.equal("/cache/jre/jdk-17-jre");
  });

  it("ensureJava reports a reason when the download fails", async function () {
    const res = await ensureJava({
      javaPresent: () => false,
      cacheJreRoot: "/cache/jre",
      detectCachedJavaHome: () => null,
      bootstrapJava: async () => {
        throw new Error("network down");
      },
      setJavaEnv: () => {},
    });
    expect(res.ok).to.equal(false);
    expect(res.reason).to.match(/network down/);
  });
});
