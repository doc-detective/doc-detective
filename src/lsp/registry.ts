import { schemas } from "../common/src/schemas/index.js";

/** The kind of scalar an action's compact form accepts, if any. */
export type PrimitiveKind = "string" | "number" | "boolean" | null;

/**
 * A field inside an action's object form — used for field-name completion and
 * (Phase 3) enum-value completion.
 */
export interface ActionField {
  name: string;
  description?: string;
  /**
   * The scalar kind this field accepts, or null for object/array fields. Drives
   * whether a completion snippet quotes the value placeholder.
   */
  primitiveKind: PrimitiveKind;
  /** Enumerated values, when the field's schema (or a branch) pins them. */
  enumValues?: Array<string | number | boolean>;
}

/** Everything the language features need to know about one action. */
export interface ActionInfo {
  /** The action key, which IS the step key (`goTo`, `find`, …). */
  key: string;
  title?: string;
  description?: string;
  /** True when the compact scalar form (e.g. `"goTo": "https://…"`) is valid. */
  acceptsPrimitive: boolean;
  /**
   * The scalar kind the compact form accepts (`"goTo"` → string, `"wait"` →
   * number, `"stopRecord"` → boolean), or null for object-only actions. Drives
   * whether a completion snippet quotes the placeholder.
   */
  primitiveKind: PrimitiveKind;
  /** Fields available inside the object form. */
  fields: ActionField[];
}

export interface Registry {
  actions: ActionInfo[];
  byKey: Map<string, ActionInfo>;
}

/** Collect the candidate sub-schemas of a schema: itself plus anyOf/oneOf/allOf. */
export function branchesOf(schema: any): any[] {
  if (!schema || typeof schema !== "object") return [];
  const out = [schema];
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    if (Array.isArray(schema[key])) out.push(...schema[key]);
  }
  return out;
}

/** Dig for a human description across a schema and its immediate branches. */
export function findDescription(schema: any): string | undefined {
  for (const branch of branchesOf(schema)) {
    if (typeof branch.description === "string" && branch.description.length > 0) {
      return branch.description;
    }
  }
  return undefined;
}

/** Map a JSON-Schema scalar type onto the snippet-relevant primitive kind. */
function normalizePrimitive(type: string): PrimitiveKind {
  if (type === "string") return "string";
  if (type === "number" || type === "integer") return "number";
  if (type === "boolean") return "boolean";
  return null;
}

/**
 * The scalar kind a schema (or a branch) accepts in its compact form, or null.
 * The first primitive type encountered across branches wins.
 */
export function primitiveKindOf(schema: any): PrimitiveKind {
  for (const branch of branchesOf(schema)) {
    const type = branch.type;
    const types = typeof type === "string" ? [type] : Array.isArray(type) ? type : [];
    for (const t of types) {
      const kind = normalizePrimitive(t);
      if (kind) return kind;
    }
  }
  return null;
}

/** Does the schema (or a branch) accept a primitive scalar value? */
export function acceptsPrimitive(schema: any): boolean {
  return primitiveKindOf(schema) !== null;
}

/** Merge the `properties` maps found across a schema's object branches. */
export function collectFields(schema: any): ActionField[] {
  const seen = new Map<string, ActionField>();
  for (const branch of branchesOf(schema)) {
    const props = branch.properties;
    if (!props || typeof props !== "object") continue;
    for (const [name, propSchema] of Object.entries(props) as any) {
      if (name === "$schema" || seen.has(name)) continue;
      seen.set(name, {
        name,
        description: findDescription(propSchema),
        primitiveKind: primitiveKindOf(propSchema),
        enumValues: extractEnum(propSchema),
      });
    }
  }
  return [...seen.values()];
}

/** Pull an enum list from a schema or its branches, if any. */
export function extractEnum(schema: any): Array<string | number | boolean> | undefined {
  for (const branch of branchesOf(schema)) {
    if (Array.isArray(branch.enum)) return branch.enum.slice();
  }
  return undefined;
}

/**
 * The `allOf` element of a `step_v3` anyOf branch that carries the action: the
 * one whose `required` names exactly the action key (never `$schema`).
 */
function actionPartOf(branch: any): any {
  const parts = Array.isArray(branch.allOf) ? branch.allOf : [branch];
  return parts.find(
    (p: any) =>
      Array.isArray(p.required) &&
      p.required.length === 1 &&
      p.required[0] !== "$schema",
  );
}

/**
 * Build the action registry from the live `step_v3` schema. Derived at runtime
 * (not a build step) so a new action added to the schemas automatically appears
 * in completion/hover — the anti-drift test pins that guarantee.
 */
export function buildRegistry(step: any = (schemas as any)["step_v3"]): Registry {
  const actions: ActionInfo[] = [];
  for (const branch of step.anyOf || []) {
    const part = actionPartOf(branch);
    /* c8 ignore next - every step_v3 anyOf branch has an action part; defensive */
    if (!part) continue;
    const key = part.required[0];
    const propSchema = part.properties?.[key];
    const primitiveKind = primitiveKindOf(propSchema);
    actions.push({
      key,
      title: part.title || key,
      description: findDescription(propSchema),
      acceptsPrimitive: primitiveKind !== null,
      primitiveKind,
      fields: collectFields(propSchema),
    });
  }
  const byKey = new Map(actions.map((a) => [a.key, a]));
  return { actions, byKey };
}

/** Lazily-built shared registry (the schemas are static within a process). */
let cached: Registry | undefined;
export function getRegistry(): Registry {
  if (!cached) cached = buildRegistry();
  return cached;
}
