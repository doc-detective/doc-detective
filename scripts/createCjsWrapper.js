import { build } from "esbuild";
import { copyFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, "..", "dist");

// Leave doc-detective-common's generated validators
// (dist/common/src/schemas/validators.cjs, megabytes of code) as a require
// next to the bundle instead of inlining a second copy.
const precompiledValidatorsExternal = {
  name: "precompiled-validators-external",
  setup(build) {
    build.onResolve({ filter: /validators\.cjs$/ }, (args) => ({
      path: "./" + path.relative(distDir, path.join(args.resolveDir, args.path)).split(path.sep).join("/"),
      external: true,
    }));
  },
};

await build({
  entryPoints: [path.join(distDir, "index.js")],
  outfile: path.join(distDir, "index.cjs"),
  bundle: true,
  format: "cjs",
  platform: "node",
  packages: "external",
  plugins: [precompiledValidatorsExternal],
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
