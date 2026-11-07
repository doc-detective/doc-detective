// Writes the precompiled Ajv validators validate.js imports into dist/schemas/,
// plus one published <name>_v3.schema.json per v3 schema (the `$schema` URLs).
// Runs after tsc (it needs dist/ajv.js, and `clean` wipes dist/) and before the
// CJS bundle. ADR 01138.
import { mkdir, readFile, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";
import { standaloneValidatorFiles } from "../dist/ajv.js";

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "schemas");
await mkdir(outDir, { recursive: true });

for (const [file, code] of Object.entries(standaloneValidatorFiles())) {
  await writeFile(path.join(outDir, file), code);
  console.log(`Generated dist/schemas/${file}`);
}

const schemas = JSON.parse(await readFile(path.join(outDir, "schemas.json"), "utf8"));
for (const [key, schema] of Object.entries(schemas)) {
  if (!key.endsWith("_v3")) continue;
  await writeFile(path.join(outDir, `${key}.schema.json`), JSON.stringify(schema, null, 2));
}
console.log("Published dist/schemas/*_v3.schema.json");
