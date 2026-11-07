import Ajv, { type Ajv as AjvInstance, type KeywordCxt } from "ajv";
import standaloneCode from "ajv/dist/standalone/index.js";
import { _, getProperty } from "ajv/dist/compile/codegen/index.js";
import { _Code } from "ajv/dist/compile/codegen/code.js";
import { schemasReferenced } from "./schemas/referenced.js";
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
 *
 * `standalone: true` builds the instance that generates validate.ts's
 * precompiled validators (see standaloneValidatorFiles): it keeps generated
 * source, and swaps in a code-generating `dynamicDefaults` that standalone
 * output can carry.
 */
export function createAjv({
  mutating,
  standalone = false,
}: {
  mutating: boolean;
  standalone?: boolean;
}): AjvInstance {
  // @ts-expect-error - CJS/ESM interop: Ajv constructor is callable at runtime
  const ajv: AjvInstance = new Ajv({
    strictSchema: false,
    logger: false,
    useDefaults: mutating,
    allErrors: true,
    allowUnionTypes: true,
    coerceTypes: mutating,
    // Runtime compile skips codegen optimization: on the large v3 schemas the
    // optimizer passes dominate first-compile time. Build-time (standalone)
    // generation keeps Ajv's default optimizer, for smaller code to load.
    code: standalone ? { source: true } : { optimize: false },
  });
  // Both instances need the same formats/keywords/error handling so a
  // validity result only differs by the default/coercion effects.
  // @ts-expect-error - CJS/ESM interop: ajv plugin functions are callable at runtime
  addFormats(ajv);
  // @ts-expect-error - CJS/ESM interop: ajv plugin functions are callable at runtime
  addKeywords(ajv);
  // @ts-expect-error - CJS/ESM interop: ajv plugin functions are callable at runtime
  addErrors(ajv);
  if (standalone) {
    // ajv-keywords' dynamicDefaults compiles to a closure, which standalone
    // code can't serialize. Re-registering moves it to the end of the object
    // rules, where it already sits: only the unused, type-less `select` follows.
    ajv.removeKeyword("dynamicDefaults");
    ajv.addKeyword(standaloneDynamicDefaults);
  }
  return ajv;
}

/**
 * Code-generating equivalent of ajv-keywords' dynamicDefaults, limited to the
 * `uuid` default the schemas use: same skip rule (no `useDefaults`, or inside
 * a composite keyword), same `=== undefined` fill, same property order, and
 * the same getRandomUUID, inlined by its source.
 */
const standaloneDynamicDefaults = {
  keyword: "dynamicDefaults",
  type: "object" as const,
  schemaType: ["string", "object"] as ("string" | "object")[],
  modifying: true,
  valid: true,
  code(cxt: KeywordCxt) {
    const { gen, data, schema, it } = cxt;
    if (!it.opts.useDefaults || it.compositeRule) return;
    for (const prop in schema) {
      if (schema[prop] !== "uuid") {
        throw new Error(
          `Precompiled dynamicDefaults support only "uuid", got ${JSON.stringify(schema[prop])} for "${prop}".`,
        );
      }
      const uuid = gen.scopeValue("func", {
        ref: getRandomUUID,
        code: new _Code(getRandomUUID.toString()),
      });
      const target = _`${data}${getProperty(prop)}`;
      gen.if(_`${target} === undefined`, () => gen.assign(target, _`${uuid}()`));
    }
  },
};

/**
 * The precompiled validators validate.ts loads, as file name → CommonJS source,
 * for scripts/generateValidators.js to write into dist/schemas/:
 *
 * - `validators.cjs`: `mutating` holds one validator per schema key, from the
 *   mutating configuration; `loadCheck()` returns the same set from the
 *   non-mutating configuration, loaded on first use since only the
 *   compatible-schema probe needs it.
 * - `validatorsCheck.cjs`: that non-mutating set.
 */
export function standaloneValidatorFiles(): Record<string, string> {
  const generate = (mutating: boolean) => {
    const ajv = createAjv({ mutating, standalone: true });
    const keys: Record<string, string> = {};
    for (const [key, schema] of Object.entries(schemasReferenced.schemas)) {
      ajv.addSchema(schema, key);
      keys[key] = key;
    }
    ajv.addSchema(schemasReferenced.noDefaults);
    // @ts-expect-error - CJS/ESM interop: standaloneCode is callable at runtime
    return standaloneCode(ajv, keys) as string;
  };
  const header = "// Generated by doc-detective-common's build (scripts/generateValidators.js). Do not edit.\n";
  return {
    "validators.cjs":
      `${header}"use strict";\n` +
      `exports.mutating = (function (exports) {\n${generate(true)}\nreturn exports;\n})({});\n` +
      `exports.loadCheck = () => require("./validatorsCheck.cjs");\n`,
    "validatorsCheck.cjs": `${header}${generate(false)}\n`,
  };
}
