import { expandState } from "./state.js";
import { applyDefaults } from "./helpers.js";

export default function saveState(value: any): any {
  return applyDefaults(structuredClone(expandState(value)), "saveState");
}
