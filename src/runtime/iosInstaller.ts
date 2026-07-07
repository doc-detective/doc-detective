import { spawnSync } from "node:child_process";
import type { CacheDirContext } from "./cacheDir.js";
import type { Logger } from "./loader.js";

export interface InstallReport {
  kind: "ios";
  assetId: string;
  action: string;
  notes?: string[];
}

export interface IOSInstallerDeps {
  logger?: Logger;
  platform?: NodeJS.Platform;
  run?: (command: string, args: string[]) => { status: number | null; stderr?: string };
}

function defaultRun(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    // `xcrun simctl` gets the same generous ceiling probeIosToolchain uses: the
    // first cold simctl call on a hosted macOS image launches CoreSimulator and
    // can take far longer than a warm call. `xcode-select` is a cheap lookup.
    timeout: command === "xcrun" ? 120000 : 15000,
  });
  return {
    status: result.status,
    stderr: typeof result.stderr === "string" ? result.stderr : "",
  };
}

export async function installIos({
  yes = false,
  dryRun = false,
  ctx = {},
  deps = {},
}: {
  yes?: boolean;
  dryRun?: boolean;
  ctx?: CacheDirContext;
  deps?: IOSInstallerDeps;
} = {}): Promise<InstallReport[]> {
  const _ctx = ctx;
  void _ctx;
  const logger = deps.logger ?? (() => {});
  const platform = deps.platform ?? process.platform;
  const run = deps.run ?? defaultRun;

  if (dryRun) {
    return [
      {
        kind: "ios",
        assetId: "ios-toolchain",
        action: "dry-run",
        notes: [
          "would verify xcode-select and xcrun simctl availability on macOS",
          "would report guidance for XCUITest/WebDriverAgent prerequisites",
        ],
      },
    ];
  }

  if (platform !== "darwin") {
    return [
      {
        kind: "ios",
        assetId: "ios-toolchain",
        action: "skipped",
        notes: [
          "iOS simulator tooling is only available on macOS hosts",
          "run on macOS and rerun: doc-detective install ios --yes",
        ],
      },
    ];
  }

  if (!yes) {
    return [
      {
        kind: "ios",
        assetId: "ios-toolchain",
        action: "skipped",
        notes: [
          "requires --yes to run host checks and emit install guidance",
          "rerun with: doc-detective install ios --yes",
        ],
      },
    ];
  }

  const xcodeSelect = run("xcode-select", ["-p"]);
  if (xcodeSelect.status !== 0) {
    return [
      {
        kind: "ios",
        assetId: "ios-toolchain",
        action: "skipped",
        notes: [
          "Xcode command-line tools are not configured",
          "install Xcode and run xcode-select --install (or xcode-select -s <Xcode.app>)",
          (xcodeSelect.stderr || "").trim(),
        ].filter(Boolean),
      },
    ];
  }

  const simctl = run("xcrun", ["simctl", "list", "devices"]);
  if (simctl.status !== 0) {
    return [
      {
        kind: "ios",
        assetId: "ios-toolchain",
        action: "skipped",
        notes: [
          "xcrun simctl is unavailable or failed",
          "open Xcode once to finish component installation, then rerun",
          (simctl.stderr || "").trim(),
        ].filter(Boolean),
      },
    ];
  }

  logger("iOS toolchain checks passed (xcode-select + simctl).", "info");
  return [
    {
      kind: "ios",
      assetId: "ios-toolchain",
      action: "already-up-to-date",
      notes: [
        "xcode-select and simctl are available",
        "use a macOS fixture leg to validate iOS app-surface execution",
      ],
    },
  ];
}
