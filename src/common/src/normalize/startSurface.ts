import { schemas } from "../schemas/index.js";

const descriptors = (schemas as any).startSurface_v3.components.schemas;

// Fill a descriptor's plain defaults from its kind's schema: app, browser, or
// process. An authored value, including 0 and false, stays. A descriptor of no
// known kind, from a caller that skipped validation, or of a kind the schema
// no longer describes, stays as it is.
function fill(descriptor: any): any {
  const kind = ["app", "browser", "process"].find((key) => key in descriptor);
  const schema = kind && descriptors[`${kind}Descriptor`];
  if (!schema?.properties) return descriptor;
  for (const [key, property] of Object.entries<any>(schema.properties)) {
    if ("default" in property && descriptor[key] === undefined) descriptor[key] = structuredClone(property.default);
  }
  return descriptor;
}

// A single descriptor stays single: the runner reports it differently from an
// array of descriptors.
export default function startSurface(value: any): any {
  return Array.isArray(value) ? value.map(fill) : fill(value);
}
