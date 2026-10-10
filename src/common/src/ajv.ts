import Ajv, { type Ajv as AjvInstance } from "ajv";
// Ajv extra formats: https://ajv.js.org/packages/ajv-formats.html
import addFormats from "ajv-formats";
// Ajv extra keywords: https://ajv.js.org/packages/ajv-keywords.html
import addKeywords from "ajv-keywords";
// Ajv custom errors: https://ajv.js.org/packages/ajv-errors.html
import addErrors from "ajv-errors";
import dynamicDefaultsDef from "ajv-keywords/dist/definitions/dynamicDefaults.js";

// Browser-compatible UUID function
/* c8 ignore next 10 - crypto.randomUUID always available in Node.js; fallback is for browsers */
function getRandomUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Enable `uuid` dynamic default
// @ts-expect-error - CJS/ESM interop: dynamicDefaultsDef.DEFAULTS exists at runtime
dynamicDefaultsDef.DEFAULTS.uuid = (_args: any) => getRandomUUID;

/**
 * Builds an Ajv instance configured for validate.ts. Shared with
 * test/schemasReferenced.test.js so the equivalence test always checks the
 * options the validator actually runs with.
 *
 * `mutating: true` turns on `useDefaults` (fill in schema defaults) and
 * `coerceTypes` (rewrite values in place); both mutate the validated data.
 */
export function createAjv({ mutating }: { mutating: boolean }): AjvInstance {
  // @ts-expect-error - CJS/ESM interop: Ajv constructor is callable at runtime
  const ajv: AjvInstance = new Ajv({
    strictSchema: false,
    logger: false,
    useDefaults: mutating,
    allErrors: true,
    allowUnionTypes: true,
    coerceTypes: mutating,
    // Skip codegen optimization: on the large v3 schemas the optimizer passes
    // dominate first-compile time, while the validated objects are tiny, so the
    // faster generated code buys nothing.
    code: { optimize: false },
  });
  // Both instances need the same formats/keywords/error handling so a
  // validity result only differs by the default/coercion effects.
  // @ts-expect-error - CJS/ESM interop: ajv plugin functions are callable at runtime
  addFormats(ajv);
  // @ts-expect-error - CJS/ESM interop: ajv plugin functions are callable at runtime
  addKeywords(ajv);
  // @ts-expect-error - CJS/ESM interop: ajv plugin functions are callable at runtime
  addErrors(ajv);
  return ajv;
}
