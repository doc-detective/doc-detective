import { applyDefaults } from "./helpers.js";

// A URL string is shorthand for { url }, and a lone status code is a list of one.
export default function checkLink(value: any): any {
  const link = typeof value === "string" ? { url: value } : value;
  if (typeof link.statusCodes === "number") link.statusCodes = [link.statusCodes];
  return applyDefaults(link, "checkLink");
}
