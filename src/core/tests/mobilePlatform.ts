// Native app surfaces phase A3: the `android`/`ios` target platforms. Unlike
// desktop platforms (where host == target), a mobile platform names the
// TARGET a context runs against and is gated by host *capability*, not host
// identity. As of A4, native app contexts can pass on both mobile targets
// when the host is capable. The remaining mobile-target skip reason this
// module composes is mobile browser testing (A5), which is still gated on both
// android and ios. The reason composer is pure so it's unit-testable without
// probing an SDK.

export { isMobileTargetPlatform, mobileContextSkipReason };

type MobileTarget = "android" | "ios";

// Classify a context platform as a mobile target, or null for desktop / junk.
function isMobileTargetPlatform(platform: unknown): MobileTarget | null {
  if (platform === "android" || platform === "ios") return platform;
  return null;
}

// Compose the SKIP reason (and log level) for the one mobile-context case still
// gated by a later phase: a mobile-web (browser) step on either target — mobile
// browsers land in A5. Native app contexts (no browser step) are NOT routed
// here; they pass through their platform's context preflight (androidContext-
// Preflight / iosContextPreflight), which capability-gates and runs them. This
// composer is only ever called for a mobile-browser context, so it branches on
// the target platform alone.
function mobileContextSkipReason({
  platform,
}: {
  platform: MobileTarget;
}): { level: "warning" | "info"; reason: string } {
  const roadmap = "docs/design/native-app-surfaces.md";
  if (platform === "ios") {
    return {
      level: "warning",
      reason: `Skipping context on 'ios': mobile browser testing on iOS lands in phase A5 of the native app roadmap (${roadmap}). Native iOS app tests run on capable macOS hosts.`,
    };
  }
  // android + a browser step: mobile-web testing on Android is phase A5.
  return {
    level: "warning",
    reason: `Skipping context on 'android': mobile browser testing on Android lands in phase A5 of the native app roadmap (${roadmap}). Native Android app tests (no browser steps) run today.`,
  };
}
