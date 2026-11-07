import { applyDefaults } from "./helpers.js";

// A script string is shorthand for { script }. Every default is plain.
export default function runBrowserScript(value: any): any {
  return applyDefaults(typeof value === "string" ? { script: value } : value, "runBrowserScript");
}
