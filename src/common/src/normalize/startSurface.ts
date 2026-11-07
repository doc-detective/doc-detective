import { schemas } from "../schemas/index.js";

const descriptors = (schemas as any).startSurface_v3.components.schemas;

// Fill a descriptor's plain defaults from its kind's schema: app, browser, or
// process. An authored value, including 0 and false, stays.
function fill(descriptor: any): any {
  const kind = ["app", "browser", "process"].find((key) => key in descriptor)!;
  for (const [key, property] of Object.entries<any>(descriptors[`${kind}Descriptor`].properties)) {
    if ("default" in property && descriptor[key] === undefined) descriptor[key] = structuredClone(property.default);
  }
  return descriptor;
}

// A single descriptor stays single: the runner reports it differently from an
// array of descriptors.
export default function startSurface(value: any): any {
  return Array.isArray(value) ? value.map(fill) : fill(value);
}
