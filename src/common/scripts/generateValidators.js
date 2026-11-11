// Writes the precompiled Ajv validators validate.js imports into dist/schemas/.
// Runs after tsc (it needs dist/ajv.js) and before the CJS bundle. ADR 01138.
import { readFile, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";
import { standaloneValidatorFiles } from "../dist/ajv.js";

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "schemas");

for (const [file, code] of Object.entries(standaloneValidatorFiles())) {
  await writeFile(path.join(outDir, file), code);
  console.log(`Generated dist/schemas/${file}`);
}

// tsc re-emits schemas.json pretty-printed (~100 MB); ship it minified. Also
// publish each v3 schema where `$schema` URLs on unpkg point. ADR 01183.
const schemas = JSON.parse(await readFile(path.join(outDir, "schemas.json"), "utf8"));
await writeFile(path.join(outDir, "schemas.json"), JSON.stringify(schemas));
for (const [key, schema] of Object.entries(schemas)) {
  if (key.endsWith("_v3")) await writeFile(path.join(outDir, `${key}.schema.json`), JSON.stringify(schema));
}
console.log("Minified dist/schemas/schemas.json and wrote the v3 schemas beside it");
