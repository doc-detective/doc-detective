const { compile } = require("json-schema-to-typescript");
const fs = require("fs").promises;
const path = require("path");

// A stale install (e.g. v15 left over from before the v16 bump) silently emits
// degraded types, such as `{ [k: string]: unknown }` for objects next to
// oneOf/anyOf/allOf. Fail instead of writing them. Only plain/^/~ ranges pin a
// single major; anything else is skipped rather than misread.
function checkGeneratorVersion(installed, declared) {
  const declaredMajor = declared.match(/^[\^~]?(\d+)\./)?.[1];
  if (declaredMajor && installed.split(".")[0] !== declaredMajor) {
    throw new Error(
      `json-schema-to-typescript ${installed} is installed but ${declared} is declared. Run \`npm ci\` at the repo root, then rebuild.`
    );
  }
}

async function generateTypes() {
  checkGeneratorVersion(
    require("json-schema-to-typescript/package.json").version,
    require("../package.json").devDependencies["json-schema-to-typescript"]
  );
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

  const step = JSON.parse(await fs.readFile(path.join(schemasDir, "step_v3.schema.json"), "utf-8"));
  await fs.writeFile(path.join(__dirname, "..", "src", "stepActions.ts"), renderStepActions(step));
  console.log("  ✓ step_v3.schema.json → stepActions.ts");

  console.log("Type generation complete!");
}

// Each step_v3 oneOf branch requires one action key, on the branch or in an allOf part.
// Anything else means the schema's shape changed, so fail rather than guess.
function renderStepActions(step) {
  const keys = step.oneOf.map((branch, i) => {
    const required = [branch, ...(branch.allOf ?? [])].flatMap((part) => part.required ?? []);
    if (required.length !== 1) {
      throw new Error(`step_v3 oneOf[${i}] must require exactly one action key, got [${required.join(", ")}]`);
    }
    return required[0];
  });
  const lines = [...new Set(keys)].sort().map((key) => `  ${JSON.stringify(key)},`);
  return `/* eslint-disable */
/**
 * Auto-generated from step_v3.schema.json by scripts/generateTypes.cjs
 * Do not edit manually
 */

/** Every step action key, sorted. A step carries exactly one. */
export const stepActions = [
${lines.join("\n")}
] as const;

export type StepAction = (typeof stepActions)[number];
`;
}

module.exports = { checkGeneratorVersion, renderStepActions };

if (require.main === module) {
  generateTypes().catch((error) => {
    console.error("Type generation failed:", error);
    process.exit(1);
  });
}
