import { applyDefaults } from "./helpers.js";

// `true` is shorthand for {}, and a path string for { path }. A capture with no
// path is named for its step, `<stepId>.png`, and the runner resolves a relative
// path against `directory`, else `outputDir` (ADR 01173). The runner assigns
// step IDs before it normalizes, so a step without one gets its name then.
// `false` disables the step, so it stays as authored.
export default function screenshot(value: any, _path: string, step: any): any {
  if (value === false) return value;
  const shot = value === true ? {} : typeof value === "string" ? { path: value } : { ...value };
  if (shot.path === undefined && step.stepId) shot.path = `${step.stepId}.png`;
  return applyDefaults(shot, "screenshot");
}
