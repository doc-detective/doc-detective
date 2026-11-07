import { applyDefaults, isWholeVariable, listClasses } from "./helpers.js";
import typeAction from "./type.js";

// A string searches by any identifier and has no object form, so it stays a
// string. In the object form, a `click` that clicks becomes the click it
// performs, { button, duration }, and `type` is a type step's value, unless
// it's a whole variable that can hold all of it. ADR 01175.
export default function find(authored: any, path: string, literal: boolean): any {
  if (typeof authored === "string") return authored;
  const value = structuredClone(authored);
  const { click } = value;
  if (click === true) value.click = { button: "left" };
  else if (typeof click === "string") value.click = { button: click };
  // The default button first, so an authored one in the object overrides it.
  // `null` is typeof "object" but isn't a click, so it stays as authored.
  else if (click !== null && typeof click === "object") value.click = { button: "left", ...click };
  if (value.type !== undefined && (literal || !isWholeVariable(value.type))) {
    value.type = typeAction(value.type, `${path}.type`, literal);
  }
  return applyDefaults(listClasses(value, literal), "find");
}
