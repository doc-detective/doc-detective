import { applyDefaults } from "./helpers.js";

// A direction is shorthand for { direction }. A point-to-point swipe has no
// distance, so it only takes the duration.
export default function swipe(value: any): any {
  const step = typeof value === "string" ? { direction: value } : structuredClone(value);
  return applyDefaults(step, "swipe", step.from ? ["distance"] : []);
}
