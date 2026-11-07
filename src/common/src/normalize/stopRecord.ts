// A name is shorthand for { name }, and `null` stops the latest recording, as
// `true` does. `false` disables the step, so it stays. An object is copied, like
// screenshot's and record's, so the authored one never changes.
export default function stopRecord(value: any): any {
  if (value === null) return true;
  if (typeof value === "string") return { name: value };
  return typeof value === "object" && value !== null ? structuredClone(value) : value;
}
