// The saveState and loadState string shorthand: a `.json` path names the state
// file, so "auth.json" is { path: "auth.json" }.
export function expandState(value: any): any {
  return typeof value === "string" ? { path: value } : value;
}
