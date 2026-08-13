import { build } from "esbuild";
import { copyFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, "..", "dist");

// dedupe.cjs is plain CJS typed by a hand-written .d.cts, so tsc doesn't
// emit it into dist/common. The bundle below inlines it via
// dist/common/src/schemas/index.js, so it must exist BEFORE esbuild runs
// (copy:schemas also copies it, but that script runs after compile).
await copyFile(
  path.join(__dirname, "..", "src", "common", "src", "schemas", "dedupe.cjs"),
  path.join(distDir, "common", "src", "schemas", "dedupe.cjs")
);

await build({
  entryPoints: [path.join(distDir, "index.js")],
  outfile: path.join(distDir, "index.cjs"),
  bundle: true,
  format: "cjs",
  platform: "node",
  packages: "external",
  define: {
    "import.meta.url": "importMetaUrl",
  },
  banner: {
    js: "const importMetaUrl = require('url').pathToFileURL(__filename).href;",
  },
});

await copyFile(
  path.join(distDir, "index.d.ts"),
  path.join(distDir, "index.d.cts")
);

console.log("Created CJS bundle at dist/index.cjs");
console.log("Copied type definitions to dist/index.d.cts");
