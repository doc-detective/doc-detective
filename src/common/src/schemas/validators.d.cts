// Types for validators.cjs, which the build generates into dist/schemas/
// (scripts/generateValidators.js) from createAjv's standalone output.
import type { ValidateFunction } from "ajv";

declare const validators: {
  /** One validator per schema key, from the mutating (useDefaults/coerceTypes) configuration. */
  mutating: Record<string, ValidateFunction>;
  /** The same set from the non-mutating configuration, loaded on first call. */
  loadCheck(): Record<string, ValidateFunction>;
};
export = validators;
