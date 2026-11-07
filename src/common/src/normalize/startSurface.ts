import { schemas } from "../schemas/index.js";

// A missing schema structure leaves every descriptor as it is, rather than
// breaking module load.
/* c8 ignore next - defensive guard: the bundled startSurface_v3 always has components.schemas */
const descriptors = (schemas as any).startSurface_v3?.components?.schemas ?? {};

// Fill a descriptor's plain defaults from its kind's schema: app, browser, or
// process. applyDefaults reads an action's schema, and descriptors aren't
// actions, so this loop reads the descriptor's own. It only fills top-level
// properties, which is every default the descriptors have; a nested default
// added later would need this to recurse as applyDefaults does.
// An authored value, including 0 and false, stays. A descriptor of no
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
  const copy = structuredClone(value);
  return Array.isArray(copy) ? copy.map(fill) : fill(copy);
}
