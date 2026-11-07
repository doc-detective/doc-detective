import { applyDefaults } from "./helpers.js";

// Like screenshot: `true` is shorthand for {}, a path string for { path }, and
// a recording with no path is `<stepId>.mp4` (ADR 01173). `false` stays.
export default function record(value: any, _path: string, _literal: boolean, step: any): any {
  if (value === false) return value;
  const rec = value === true ? {} : typeof value === "string" ? { path: value } : structuredClone(value);
  if (rec.path === undefined && step.stepId) rec.path = `${step.stepId}.mp4`;
  return applyDefaults(rec, "record");
}
