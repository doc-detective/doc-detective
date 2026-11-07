import { applyDefaults, asList, listClasses } from "./helpers.js";

// Keys alone are shorthand for { keys }, and one key is a list of one.
export default function typeAction(value: any, _path: string, literal: boolean): any {
  const type = typeof value === "string" || Array.isArray(value) ? { keys: value } : value;
  type.keys = asList(type.keys, literal);
  return applyDefaults(listClasses(type, literal), "type");
}
