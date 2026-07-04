// Native app surfaces phase A3: the `android`/`ios` target platforms. Unlike
// desktop platforms (where host == target), a mobile platform names the
// TARGET a context runs against and is gated by host *capability*, not host
// identity. Phase A3a wires the gate but ships no PASS path: every mobile
// context resolves SKIPPED with an actionable, roadmap-shaped reason. The
// reason composer is pure so it's unit-testable without probing an SDK.

export { isMobileTargetPlatform, mobileContextSkipReason };

type MobileTarget = "android" | "ios";

// Classify a context platform as a mobile target, or null for desktop / junk.
function isMobileTargetPlatform(platform: unknown): MobileTarget | null {
  if (platform === "android" || platform === "ios") return platform;
  return null;
}

// Compose the SKIP reason (and log level) for a mobile context in phase A3a.
// android:
//   - no SDK        -> point at `doc-detective install android` (most actionable)
//   - browser step  -> mobile browsers land in A5
//   - otherwise     -> managed devices land in A3b (the common capable-host case)
// ios: lands in A4.
function mobileContextSkipReason({
  platform,
  sdkPresent,
  hasBrowserStep,
}: {
  platform: MobileTarget;
  sdkPresent?: boolean;
  hasBrowserStep?: boolean;
}): { level: "warning" | "info"; reason: string } {
  const roadmap = "docs/design/native-app-surfaces.md";
  if (platform === "ios") {
    return {
      level: "info",
      reason: `Skipping context on 'ios': iOS app surfaces land in phase A4 of the native app roadmap (${roadmap}). Gate iOS tests with runOn platforms so this skip is intentional.`,
    };
  }
  if (!sdkPresent) {
    return {
      level: "warning",
      reason: `Skipping context on 'android': no Android SDK was found (checked ANDROID_HOME, ANDROID_SDK_ROOT, the Doc Detective cache, and PATH). Install one with \`doc-detective install android\`.`,
    };
  }
  if (hasBrowserStep) {
    return {
      level: "warning",
      reason: `Skipping context on 'android': mobile browser testing on Android lands in phase A5 of the native app roadmap (${roadmap}).`,
    };
  }
  return {
    level: "warning",
    reason: `Skipping context on 'android': managed Android devices land in phase A3b of the native app roadmap (${roadmap}). This Doc Detective version validates and gates android contexts but does not run them yet.`,
  };
}
