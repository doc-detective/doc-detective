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

/**
 * Whether `value` is a whole variable reference, such as `"$URL"`: exactly what
 * the runner's `$VAR` substitution can replace with any value, even an object.
 */
export function isWholeVariable(value: unknown): boolean {
  return typeof value === "string" && /^\$[A-Za-z0-9_]+$/.test(value);
}

const warned = new Set<string>();

/** Forget which deprecations have warned, so each test run starts fresh. */
export function _resetWarnedForTest(): void {
  warned.clear();
}

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

/**
 * `value` as a list: one string is shorthand for a list of one. Before `$VAR`
 * substitution (`literal` false), a whole variable stays: it can hold the list.
 */
export function asList(value: any, literal: boolean): any {
  return typeof value === "string" && (literal || !isWholeVariable(value)) ? [value] : value;
}

/** A locator's `elementClass` as a list (asList). */
export function listClasses(locator: any, literal: boolean): any {
  if (locator.elementClass !== undefined) locator.elementClass = asList(locator.elementClass, literal);
  return locator;
}

// Every plain default in a schema node's properties, as [dotted path, value].
// Defaults under anyOf/oneOf, or in nested objects with required keys, depend on
// the rest of the step, so the action's normalizer codes them by hand. allOf
// merges one level only: its parts' own properties count, but an allOf inside
// one of those parts doesn't, so code such a default by hand too.
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
    // Where the action's object form lives, in the order the schemas use:
    // - the object branch of a root `anyOf` (goTo, find, type, swipe, …);
    // - the schema itself, when the action is always an object (dragAndDrop);
    // - its `object` component, when the root wraps the union in an `allOf`
    //   guard (click, ADR 01175).
    const schema = (schemas as any)[`${action}_v3`];
    const branch =
      schema.anyOf?.find((part: any) => part.properties || part.allOf) ??
      (schema.properties ? schema : schema.components.schemas.object);
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
