// The saveCookie and loadCookie string shorthand. A `.txt` path names a cookie
// file, and the cookie is named for the file: "dir/session.txt" is
// { name: "session", path: "dir/session.txt" }. Any other string names a cookie
// kept in the environment variable of the same name.
export function expandCookie(value: any): any {
  if (typeof value !== "string") return value;
  if (!value.endsWith(".txt")) return { name: value, variable: value };
  return { name: value.split("/").pop()!.slice(0, -".txt".length), path: value };
}
