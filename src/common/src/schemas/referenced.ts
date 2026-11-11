import schemasReferencedJson from "./schemasReferenced.json" with { type: "json" };

/**
 * The schemas with `$ref`s intact, for the validator: `schemas` keyed like the
 * dereferenced `schemas` export, plus the defaults-free copies their
 * composite-context `$ref`s point at. See buildReferencedSchemas in
 * dereferenceSchemas.cjs. Its own module so the validator never loads the
 * ~60MB dereferenced schemas.json.
 */
export const schemasReferenced: {
  schemas: Record<string, object>;
  noDefaults: object[];
} = schemasReferencedJson;
