import { applyDefaults, listClasses } from "./helpers.js";

// Keys alone are shorthand for { keys }, and one key is a list of one.
export default function typeAction(value: any): any {
  const type = typeof value === "string" || Array.isArray(value) ? { keys: value } : value;
  if (typeof type.keys === "string") type.keys = [type.keys];
  return applyDefaults(listClasses(type), "type");
}
