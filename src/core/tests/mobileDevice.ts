// Native app surfaces: the shared mobile-device descriptor, used by both the
// Android emulator layer (androidEmulator.ts) and the iOS simulator layer
// (iosSimulator.ts). A descriptor names a managed device by identity and
// refines how it is created; the per-platform acquisition modules turn it into
// a booted emulator/simulator. Kept pure so it's unit-testable without either
// toolchain.

export { normalizeDeviceDescriptor };
export type { DeviceDescriptor };

interface DeviceDescriptor {
  name?: string;
  deviceType?: string;
  osVersion?: string;
  headless?: boolean;
  platform?: string;
}

// Normalize a context default device merged with a step-level device override.
// A string is shorthand for `{ name }`. The step wins field-by-field; platform
// comes from whichever supplies it (the mobile context, normally).
function normalizeDeviceDescriptor({
  contextDevice,
  stepDevice,
  platform,
}: {
  contextDevice?: DeviceDescriptor | string;
  stepDevice?: DeviceDescriptor | string;
  platform?: string;
}): DeviceDescriptor {
  const asObj = (d?: DeviceDescriptor | string): DeviceDescriptor =>
    typeof d === "string" ? { name: d.trim() } : d ? { ...d } : {};
  const ctx = asObj(contextDevice);
  const step = asObj(stepDevice);
  const merged: DeviceDescriptor = { ...ctx, ...step };
  // Drop undefined step keys so they don't clobber context values.
  for (const k of Object.keys(step) as (keyof DeviceDescriptor)[]) {
    if (step[k] === undefined && ctx[k] !== undefined) (merged as any)[k] = ctx[k];
  }
  merged.platform = step.platform ?? ctx.platform ?? platform;
  return merged;
}
