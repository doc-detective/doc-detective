// One surface reference is shorthand for a list of one. A bare string stays a
// string: whether it names a browser, a process, or an app is decided at run time.
export default function closeSurface(value: any): any {
  return Array.isArray(value) ? value : [value];
}
