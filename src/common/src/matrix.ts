// Pure helpers for `runOn[].matrix` (ADR 01234): find `$$matrix.<key>`
// references, cross the referenced keys into combinations, substitute one
// combination into a value, and name it in a context ID. No I/O, no
// process.env, so the LSP and Online can reuse them.

type Scalar = string | number | boolean;
type MatrixValue = Scalar | { [key: string]: any };
export type MatrixCombination = Record<string, MatrixValue>;

const REFERENCE = /\$\$matrix\.([A-Za-z0-9_]+)((?:\.[A-Za-z0-9_]+)*)/g;
const WHOLE_REFERENCE = new RegExp(`^${REFERENCE.source}$`);
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const isObject = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function walkStrings(value: any, visit: (text: string) => void): void {
  if (typeof value === "string") visit(value);
  else if (Array.isArray(value)) value.forEach((item) => walkStrings(item, visit));
  else if (isObject(value)) {
    for (const key of Object.keys(value)) if (!UNSAFE_KEYS.has(key)) walkStrings(value[key], visit);
  }
}

/** The matrix keys that any string in `value` references. */
export function matrixReferences(value: any): Set<string> {
  const keys = new Set<string>();
  walkStrings(value, (text) => {
    for (const match of text.matchAll(REFERENCE)) keys.add(match[1]);
  });
  return keys;
}

/** One combination per cross of the referenced keys, in authored key order. */
export function matrixCombinations(matrix: Record<string, MatrixValue[]>, referencedKeys: Set<string>): MatrixCombination[] {
  let combinations: MatrixCombination[] = [{}];
  for (const key of Object.keys(matrix)) {
    if (!referencedKeys.has(key)) continue;
    combinations = combinations.flatMap((combination) =>
      matrix[key].map((value) => ({ ...combination, [key]: value }))
    );
  }
  return combinations;
}

// An object value's scalar leaves, depth first, in authored order.
function leaves(value: MatrixValue): Scalar[] {
  return isObject(value) ? Object.values(value).flatMap((item) => leaves(item)) : [value as Scalar];
}

const asText = (value: MatrixValue) => leaves(value).join("-");

// Resolve one reference against a combination. Fields are consumed while the
// value is an object; the rest of the dotted text stays literal, so
// `$$matrix.locale.png` is the locale followed by `.png`.
function resolveReference(key: string, fields: string, combination: MatrixCombination) {
  let value: any = combination[key];
  const parts = fields.split(".").slice(1);
  let used = 0;
  while (isObject(value) && used < parts.length) {
    const field = parts[used];
    if (!Object.hasOwn(value, field)) {
      throw new Error(`\`$$matrix.${key}.${parts.slice(0, used + 1).join(".")}\` names no field of \`matrix\` key \`${key}\`.`);
    }
    value = value[field];
    used++;
  }
  const rest = parts.slice(used).map((part) => `.${part}`).join("");
  return { value, rest };
}

/**
 * A copy of `value` with every `$$matrix.…` reference replaced from
 * `combination`. A whole-string reference keeps the value's type; one inside a
 * longer string is spliced in as text. Throws on a field an object value lacks.
 */
export function substituteMatrix(value: any, combination: MatrixCombination): any {
  if (Array.isArray(value)) return value.map((item) => substituteMatrix(item, combination));
  if (isObject(value)) {
    const copy: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      if (UNSAFE_KEYS.has(key)) continue;
      copy[key] = substituteMatrix(value[key], combination);
    }
    return copy;
  }
  if (typeof value !== "string") return value;
  const whole = WHOLE_REFERENCE.exec(value);
  if (whole && Object.hasOwn(combination, whole[1])) {
    const { value: resolved, rest } = resolveReference(whole[1], whole[2], combination);
    if (!rest) return resolved;
  }
  return value.replace(REFERENCE, (match, key: string, fields: string) => {
    if (!Object.hasOwn(combination, key)) return match;
    const { value: resolved, rest } = resolveReference(key, fields, combination);
    return asText(resolved) + rest;
  });
}

/** The context ID suffix for a combination: `~<key>=<value>` per key. */
export function matrixIdSuffix(combination: MatrixCombination): string {
  return Object.entries(combination)
    .map(([key, value]) => `~${key}=${asText(value).replace(/[^A-Za-z0-9._-]/g, "-")}`)
    .join("");
}

// The explicit output path a step writes, if any, with whatever else names
// its location (a `directory`).
function outputPath(step: any): { path: string; location: any } | undefined {
  for (const action of ["screenshot", "record", "saveState", "saveCookie"]) {
    const value = step?.[action];
    if (typeof value === "string") {
      // A saveCookie string is a cookie name unless it ends in `.txt`.
      if (action === "saveCookie" && !/\.txt$/.test(value)) return undefined;
      return { path: value, location: value };
    }
    if (isObject(value) && typeof value.path === "string") {
      return { path: value.path, location: [value.path, value.directory] };
    }
  }
  return undefined;
}

/**
 * One message per step whose explicit output path would be the same for every
 * combination: it must reference each expanding key that has more than one value.
 */
export function checkMatrixPaths(steps: any[], matrix: Record<string, MatrixValue[]>, expandingKeys: string[]): string[] {
  const varying = expandingKeys.filter((key) => (matrix[key]?.length ?? 0) > 1);
  const messages: string[] = [];
  steps.forEach((step, index) => {
    const output = outputPath(step);
    if (!output) return;
    const references = matrixReferences(output.location);
    const missing = varying.find((key) => !references.has(key));
    if (missing) {
      messages.push(
        `step ${index + 1}'s \`path\` \`${output.path}\` is the same for every \`matrix\` combination. Add \`$$matrix.${missing}\` to it.`
      );
    }
  });
  return messages;
}
