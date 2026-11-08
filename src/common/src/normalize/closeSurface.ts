// One surface reference is shorthand for a list of one. A bare string stays a
// string: whether it names a browser, a process, or an app is decided at run time.
// A deep copy, so an object reference is never shared with the authored step.
export default function closeSurface(value: any): any {
  return structuredClone(Array.isArray(value) ? value : [value]);
}
