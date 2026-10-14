import { log } from "./utils.js";

// The telemetry pieces a run needs before posthog-node is loaded. telem.ts
// holds the PostHog client; the runner imports it on first send so the
// ~95-module client stays off the CLI startup path.

// TODO: Add link to docs
export function telemetryNotice(config: any) {
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
