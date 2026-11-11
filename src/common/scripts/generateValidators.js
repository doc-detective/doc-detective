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

// tsc copies src/schemas/schemas.json here pretty-printed (~100 MB); ship it
// minified, and publish each v3 schema where `$schema` URLs on unpkg point.
// ADR 01183.
const schemasPath = path.join(outDir, "schemas.json");
const schemas = JSON.parse(
  await readFile(schemasPath, "utf8").catch((err) => {
    if (err.code !== "ENOENT") throw err;
    throw new Error(`generateValidators: ${schemasPath} not found. Did tsc run first and copy schemas.json?`);
  })
);
await writeFile(schemasPath, JSON.stringify(schemas));
for (const [key, schema] of Object.entries(schemas)) {
  if (key.endsWith("_v3")) await writeFile(path.join(outDir, `${key}.schema.json`), JSON.stringify(schema));
}
console.log("Minified dist/schemas/schemas.json and wrote the v3 schemas beside it");
