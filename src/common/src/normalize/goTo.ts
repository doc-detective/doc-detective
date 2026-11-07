import { applyDefaults } from "./helpers.js";

// A URL string is shorthand for { url }. Every default is plain.
export default function goTo(value: any): any {
  return applyDefaults(typeof value === "string" ? { url: value } : value, "goTo");
}
