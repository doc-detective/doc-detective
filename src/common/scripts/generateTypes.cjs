const { compile } = require("json-schema-to-typescript");
const fs = require("fs").promises;
const path = require("path");

async function generateTypes() {
  const schemasDir = path.join(__dirname, "..", "src", "schemas", "output_schemas");
  const outputDir = path.join(__dirname, "..", "src", "types", "generated");

  // Create output directory
  await fs.mkdir(outputDir, { recursive: true });

  // Get all v3 schema files (current version)
  const files = await fs.readdir(schemasDir);
  const v3Schemas = files.filter((f) => f.endsWith("_v3.schema.json"));

  console.log(`Generating TypeScript types for ${v3Schemas.length} schemas...`);

  let hadErrors = false;
  const failedFiles = [];

  for (const file of v3Schemas) {
    const schemaPath = path.join(schemasDir, file);

    try {
      const schema = JSON.parse(await fs.readFile(schemaPath, "utf-8"));
      const ts = await compile(schema, schema.title || file.replace(".schema.json", ""), {
        bannerComment: `/* eslint-disable */\n/**\n * Auto-generated from ${file}\n * Do not edit manually\n */`,
        style: {
          semi: true,
          trailingComma: "es5",
        },
      });

      const outputPath = path.join(outputDir, file.replace(".schema.json", ".ts"));
      await fs.writeFile(outputPath, ts);
      console.log(`  ✓ ${file} → ${path.basename(outputPath)}`);
    } catch (error) {
      hadErrors = true;
      failedFiles.push(file);
      console.error(`  ✗ Failed to generate ${file}:`, error.message);
    }
  }

  if (hadErrors) {
    throw new Error(`One or more schemas failed to generate TypeScript types: ${failedFiles.join(", ")}`);
  }

  console.log("Type generation complete!");
}

generateTypes().catch((error) => {
  console.error("Type generation failed:", error);
  process.exit(1);
});
