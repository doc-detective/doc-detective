import { applyDefaults, listClasses } from "./helpers.js";
import typeAction from "./type.js";

// A string searches by any identifier and has no object form, so it stays a
// string. In the object form, a `click` that clicks becomes the click it
// performs, { button, duration }, and `type` is a type step's value. ADR 01175.
export default function find(value: any): any {
  if (typeof value === "string") return value;
  const { click } = value;
  if (click === true) value.click = { button: "left" };
  else if (typeof click === "string") value.click = { button: click };
  else if (typeof click === "object") value.click = { button: "left", ...click };
  if (value.type !== undefined) value.type = typeAction(value.type);
  return applyDefaults(listClasses(value), "find");
}
