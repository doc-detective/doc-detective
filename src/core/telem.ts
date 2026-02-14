import os from "node:os";
import { log } from "./utils.js";
import { PostHog } from "posthog-node";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const platformMap: Record<string, string> = {
  win32: "windows",
  darwin: "mac",
  linux: "linux",
};

/**
 * Log a user-facing notice about telemetry status and how to enable or disable it.
 *
 * @param config - Project configuration object; the function reads `config.telemetry.send` to determine which message to log. 
 */
function telemetryNotice(config: any) {
  if (config?.telemetry?.send === false) {
    log(
      config,
      "info",
      "Telemetry is disabled. Basic anonymous telemetry helps Doc Detective understand product issues and usage. To enable telemetry, set 'telemetry.send' to 'true' in your .doc-detective.json config file."
    );
  } else {
    log(
      config,
      "info",
      "Doc Detective collects basic anonymous telemetry to understand product issues and usage. To disable telemetry, set 'telemetry.send' to 'false' in your .doc-detective.json config file."
    );
  }
}

// meta = {
//   distribution: "doc-detective", // doc-detective, core
//   dist_platform: "windows", // windows, mac, linux
//   dist_platform_version: "10", // 10, 11, 12, 20.04, 21.04
//   dist_platform_arch: "x64", // x64, arm64, armv7l
//   dist_version: version,
//   dist_deployment: "node", // node, electron, docker, github-action, lambda, vscode-extension, browser-extension
//   dist_deployment_version: "18.19.0",
//   dist_interface: "cli", // cli, rest, gui, vscode
//   core_version: version,
//   core_platform: "windows", // windows, mac, linux
//   core_platform_version: "10", // 10, 11, 12, 20.04, 21.04
//   core_deployment: "node", // node, electron, docker, github-action, lambda, vscode-extension, browser-extension
// };

/**
 * Collects runtime metadata and sends a telemetry event to PostHog when telemetry is enabled.
 *
 * Builds a set of telemetry properties from environment metadata, package and OS information,
 * and optionally flattens `results.summary` into properties when `command` is `"runTests"`.
 *
 * @param config - Application configuration; if `config.telemetry.send` is strictly `false` no telemetry is sent. If present, `config.telemetry.userId` is used as the event distinctId.
 * @param command - The name of the telemetry event to send (e.g., `"runTests"`).
 * @param results - Result object used only when `command` is `"runTests"`. Its `summary` object may contain nested objects which will be flattened into telemetry properties.
 */
function sendTelemetry(config: any, command: string, results: any) {
  // Exit early if telemetry is disabled
  if (config?.telemetry?.send === false) return;

  // Assemble telemetry data
  const telemetryData: any =
    process.env["DOC_DETECTIVE_META"] !== undefined
      ? JSON.parse(process.env["DOC_DETECTIVE_META"])
      : {};
  const pkg = require("../../package.json");
  telemetryData.distribution = telemetryData.distribution || "doc-detective";
  telemetryData.dist_interface = telemetryData.dist_interface || "package";
  telemetryData.core_version = pkg.version;
  telemetryData.dist_version = telemetryData.dist_version || telemetryData.core_version;
  telemetryData.core_platform = platformMap[os.platform()] || os.platform();
  telemetryData.dist_platform = telemetryData.dist_platform || telemetryData.core_platform;
  telemetryData.core_platform_version = os.release();
  telemetryData.dist_platform_version = telemetryData.dist_platform_version || telemetryData.core_platform_version;
  telemetryData.core_platform_arch = os.arch();
  telemetryData.dist_platform_arch = telemetryData.dist_platform_arch || telemetryData.core_platform_arch;
  telemetryData.core_deployment = telemetryData.core_deployment || "node";
  telemetryData.dist_deployment = telemetryData.dist_deployment || telemetryData.core_deployment;
  telemetryData.core_deployment_version =
    telemetryData.core_deployment_version || process.version;
  telemetryData.dist_deployment_version = telemetryData.dist_deployment_version || telemetryData.core_deployment_version;
  const distinctId = config?.telemetry?.userId || "anonymous";

  // parse results to assemble flat list of properties for runTests actions
  if (command === "runTests") {
    // Get summary data
    Object.entries(results.summary).forEach(([parentKey, value]: [string, any]) => {
      if (typeof value === "object") {
        Object.entries(value).forEach(([key, value]: [string, any]) => {
          if (typeof value === "object") {
            Object.entries(value).forEach(([key2, value2]: [string, any]) => {
              telemetryData[`${parentKey.replace(" ","_")}_${key.replace(" ","_")}_${key2.replace(" ","_")}`] = value2;
            });
          } else {
            telemetryData[`${parentKey.replace(" ","_")}_${key.replace(" ","_")}`] = value;
          }
        });
      } else {
        telemetryData[parentKey.replace(" ","_")] = value;
      }
    });
  }

  const event = { distinctId, event: command, properties: telemetryData };

  // Send telemetry
  const client = new PostHog(
    "phc_rjV0MH3nsAd45zFISLgaKAdAXbgDeXt2mOBV2EBHomB",
    { host: "https://app.posthog.com" }
  );
  client.capture(event);
  client.shutdown();
}

export { telemetryNotice, sendTelemetry };