// Writes the precompiled Ajv validators validate.js imports into dist/schemas/.
// Runs after tsc (it needs dist/ajv.js) and before the CJS bundle. ADR 01138.
import { writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";
import { standaloneValidatorFiles } from "../dist/ajv.js";

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "schemas");

for (const [file, code] of Object.entries(standaloneValidatorFiles())) {
  await writeFile(path.join(outDir, file), code);
  console.log(`Generated dist/schemas/${file}`);
}
