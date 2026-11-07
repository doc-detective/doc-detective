// A name is shorthand for { name }, and `null` stops the latest recording, as
// `true` does. `false` disables the step, so it stays.
export default function stopRecord(value: any): any {
  if (value === null) return true;
  return typeof value === "string" ? { name: value } : value;
}
