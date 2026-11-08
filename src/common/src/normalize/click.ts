import { applyDefaults, listClasses } from "./helpers.js";

// A string searches by any identifier, like find's, and has no object form, so
// it stays a string. ADR 01175.
export default function click(value: any, _path: string, literal: boolean): any {
  return typeof value === "string" ? value : applyDefaults(listClasses(structuredClone(value), literal), "click");
}
