import { schemas } from "../schemas/index.js";

/** An error that makes `validate()` report the object as invalid. `path` is dotted, like `tests[0].steps[1].goTo`. */
export class NormalizeError extends Error {
  constructor(
    readonly path: string,
    readonly detail: string,
  ) {
    super(`${path}: ${detail}`);
  }
}

/** The normalizer for an action whose normalization still lives in its handler. */
export function passthrough(value: any): any {
  return value;
}

const warned = new Set<string>();

/**
 * Rename deprecated keys on `value` in place, old → new, and warn once per run
 * for each. Setting both is an error. `path` names `value` in that error.
 */
export function renameAliases(value: any, aliases: Record<string, string>, path: string): any {
  for (const [old, key] of Object.entries(aliases)) {
    if (!(old in value)) continue;
    if (key in value) throw new NormalizeError(path, `set \`${key}\` or \`${old}\`, not both.`);
    value[key] = value[old];
    delete value[old];
    const warning = `Warning: \`${old}\` is deprecated. Rename it to \`${key}\`.`;
    if (!warned.has(warning)) {
      warned.add(warning);
      console.warn(warning);
    }
  }
  return value;
}

/** A locator's `elementClass` as a list: one class is shorthand for a list of one. */
export function listClasses(locator: any): any {
  if (typeof locator.elementClass === "string") locator.elementClass = [locator.elementClass];
  return locator;
}

// Every plain default in a schema node's properties, as [dotted path, value].
// Defaults under anyOf/oneOf, or in nested objects with required keys, depend on
// the rest of the step, so the action's normalizer codes them by hand.
function plainDefaults(node: any, prefix = ""): [string, any][] {
  const properties = Object.assign({}, node.properties, ...(node.allOf ?? []).map((part: any) => part.properties));
  return Object.entries<any>(properties).flatMap(([key, property]): [string, any][] => {
    const path = prefix + key;
    if ("default" in property) return [[path, property.default]];
    if (property.type === "object" && !property.required && !property.anyOf) return plainDefaults(property, `${path}.`);
    return [];
  });
}

const cache = new Map<string, [string, any][]>();

/**
 * Fill each plain default from `<action>_v3`'s object branch that `value` leaves
 * unset, except the dotted paths in `skip`. Creates the parent objects a nested
 * default needs. An authored value, including `0`, `false` and `null`, stays.
 */
export function applyDefaults(value: any, action: string, skip: string[] = []): any {
  if (!cache.has(action)) {
    // The object branch of a union, or the schema itself for an action that's always an object.
    const schema = (schemas as any)[`${action}_v3`];
    const branch = schema.anyOf?.find((part: any) => part.properties || part.allOf) ?? schema;
    cache.set(action, plainDefaults(branch));
  }
  for (const [path, fallback] of cache.get(action)!) {
    if (skip.includes(path)) continue;
    const keys = path.split(".");
    const last = keys.pop()!;
    let target = value;
    for (const key of keys) target = target[key] ??= {};
    if (target[last] === undefined) target[last] = structuredClone(fallback);
  }
  return value;
}
