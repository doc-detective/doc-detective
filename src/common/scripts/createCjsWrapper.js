import { build } from "esbuild";
import { copyFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, "..", "dist");
const srcDir = path.join(__dirname, "..", "src");

// dedupe.cjs is plain CJS typed by a hand-written .d.cts, so tsc doesn't
// emit it — copy the runtime file into dist BEFORE bundling so both the ESM
// dist (dist/schemas/index.js requires it relatively) and the esbuild CJS
// bundle (which inlines it) resolve.
await copyFile(
  path.join(srcDir, "schemas", "dedupe.cjs"),
  path.join(distDir, "schemas", "dedupe.cjs")
);

await build({
  entryPoints: [path.join(distDir, "index.js")],
  outfile: path.join(distDir, "index.cjs"),
  bundle: true,
  format: "cjs",
  platform: "node",
  packages: "external",
});

await copyFile(
  path.join(distDir, "index.d.ts"),
  path.join(distDir, "index.d.cts")
);

console.log("Created CJS bundle at dist/index.cjs");
console.log("Copied type definitions to dist/index.d.cts");
