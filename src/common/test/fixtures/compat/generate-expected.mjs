// Regenerates expected.json from a LEGACY doc-detective-common dist (the
// compatibility baseline). Usage: node generate-expected.mjs <legacy-dist-dir>
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { cases } from "./cases.mjs";
import { normalize } from "./normalize.mjs";

const dist = path.resolve(process.argv[2]);
const { detectTests } = await import(pathToFileURL(path.join(dist, "detectTests.js")).href);
const expected = {};
for (const [name, ext, content] of cases) {
  expected[name] = normalize(await detectTests({ content, filePath: `${name}.${ext}` }));
}
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "expected.json");
fs.writeFileSync(out, JSON.stringify(expected, null, 2) + "\n");
console.log(`Wrote ${Object.keys(expected).length} cases to ${out}`);
