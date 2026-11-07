import { expandCookie } from "./cookie.js";
import { applyDefaults } from "./helpers.js";

export default function saveCookie(value: any): any {
  return applyDefaults(expandCookie(value), "saveCookie");
}
