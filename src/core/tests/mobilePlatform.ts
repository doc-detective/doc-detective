// Native app surfaces phase A3: the `android`/`ios` target platforms. Unlike
// desktop platforms (where host == target), a mobile platform names the
// TARGET a context runs against and is gated by host *capability*, not host
// identity. Native app contexts (A3/A4) and mobile-web browser contexts (A5)
// both run on capable hosts; the browser-side decisions (support matrix,
// device-fixed config rejection, mixed-context deferral) live in
// mobileBrowser.ts.

export { isMobileTargetPlatform };

type MobileTarget = "android" | "ios";

// Classify a context platform as a mobile target, or null for desktop / junk.
function isMobileTargetPlatform(platform: unknown): MobileTarget | null {
  if (platform === "android" || platform === "ios") return platform;
  return null;
}
