import schemasJson from "./schemas.json" with { type: "json" };
import { expandSchema } from "./dedupe.cjs";

export type SchemaKey = keyof typeof schemasJson;
export type Schema = (typeof schemasJson)[SchemaKey];

// The committed schemas.json is the DEDUPED on-disk encoding (repeated
// subtrees hoisted into internal refs — see dedupe.cjs); consumers always
// receive the expanded, fully-inlined form, exactly as the pre-dedupe
// pipeline shipped it. Expansion happens once at module load.
export const schemas: Record<SchemaKey, Schema> = Object.fromEntries(
  Object.entries(schemasJson).map(([key, value]) => [key, expandSchema(value)])
) as Record<SchemaKey, Schema>;
