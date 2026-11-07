import { applyDefaults, listClasses } from "./helpers.js";

// Every default is plain. A source or target in the object form is a locator,
// so its elementClass becomes a list, as find's does. A string stays a string.
// Validation makes each one a string or an object, never null.
export default function dragAndDrop(authored: any, _path: string, literal: boolean): any {
  const value = structuredClone(authored);
  for (const end of [value.source, value.target]) {
    if (typeof end === "object") listClasses(end, literal);
  }
  return applyDefaults(value, "dragAndDrop");
}
