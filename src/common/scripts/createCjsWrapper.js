import { build } from "esbuild";
import { copyFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, "..", "dist");

await build({
  entryPoints: [path.join(distDir, "index.js")],
  outfile: path.join(distDir, "index.cjs"),
  bundle: true,
  format: "cjs",
  platform: "node",
  // Externalize only the CJS-consumable dependencies (ajv*, yaml, and
  // @rgrove/parse-xml, which is type: commonjs). Everything ESM-only — the
  // unified stack (mdast-util-*, micromark-*) and parse5 v8 (type: module,
  // no require condition) — gets bundled INTO the CJS artifact so
  // `require("doc-detective-common")` never emits a bare require() of an
  // ESM-only package — keeping the CJS entry usable even on runtimes without
  // unflagged require(esm).
  external: [
    "ajv",
    "ajv-errors",
    "ajv-formats",
    "ajv-keywords",
    "yaml",
    "@rgrove/parse-xml",
  ],
});

await copyFile(
  path.join(distDir, "index.d.ts"),
  path.join(distDir, "index.d.cts")
);

console.log("Created CJS bundle at dist/index.cjs");
console.log("Copied type definitions to dist/index.d.cts");
