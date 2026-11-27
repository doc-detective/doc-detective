import { applyDefaults } from "./helpers.js";

// A string is shorthand for { path } (ADR 01231).
export default function checkFile(value: any): any {
  return applyDefaults(typeof value === "string" ? { path: value } : structuredClone(value), "checkFile");
}
