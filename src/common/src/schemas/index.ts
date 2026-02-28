import schemasJson from "./schemas.json" with { type: "json" };

export type SchemaKey = keyof typeof schemasJson;
export type Schema = (typeof schemasJson)[SchemaKey];

export const schemas: typeof schemasJson = schemasJson;
