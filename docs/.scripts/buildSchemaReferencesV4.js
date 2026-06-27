// Generates the schema reference pages under fern/pages/reference/schemas/ from
// the doc-detective-common JSON schemas. These pages are GENERATED — do not edit
// them by hand. To change a page, edit the schema's description/default/enum/etc.
// in src/common/src/schemas/src_schemas/ and re-run `npm run docs:build-schema-refs`.
//
// Ported from doc-detective.github.io/.scripts/buildSchemaReferencesV4.js and
// adapted for Fern: output path, /reference/schemas/ cross-links, and frontmatter
// (title + description) in place of a level-1 heading (Fern forbids H1 in content).

const fs = require("fs");
const path = require("path");
const parser = require("@apidevtools/json-schema-ref-parser");
const crypto = require("crypto");

// Load the schema set from THIS repo's doc-detective-common, not a published
// copy. The committed, dereferenced bundle is the source of truth and avoids a
// build step; fall back to the package export if it ever moves.
function loadSchemas() {
  const localBundle = path.resolve(
    __dirname,
    "../../src/common/src/schemas/schemas.json"
  );
  if (fs.existsSync(localBundle)) return require(localBundle);
  return require("doc-detective-common").schemas;
}
const schemas = loadSchemas();

// Map to store schemas by their ID to prevent duplicate generation
const schemaRegistry = new Map();

// Map to store schema titles to their file paths
const schemaPaths = new Map();

// Set to track schema files that have been generated
const generatedSchemaFiles = new Set();

// Output directory (Fern content path)
const outputDir = path.resolve(__dirname, "../fern/pages/reference/schemas");

// Base URL path that generated cross-links point at (Fern route, not Docusaurus)
const linkBase = "/reference/schemas";

// Map for tracking parent-child relationships
const parentChildRelationships = new Map();

// Function to create a valid file name from a path
function createValidFileName(str) {
  return str
    .replace(/[\(\)]/g, "")
    .replace(/[^\w.-]/g, "-")
    .toLowerCase();
}

// Function to generate a unique ID for a schema
function generateSchemaId(schema, path = "") {
  // If schema has a title, use it directly
  if (schema.title) {
    return schema.title;
  }

  // For schemas without title, use the path and a hash of content
  const content = JSON.stringify(schema);
  const contentHash = crypto
    .createHash("md5")
    .update(content)
    .digest("hex")
    .substring(0, 8);

  // Clean up the path to make it usable as a filename
  const cleanPath = path.replace(/\[\]/g, "-array").replace(/\./g, "-");

  return cleanPath + (cleanPath ? "-" : "") + contentHash;
}

// Resolve an object schema's effective properties, merging any `allOf` branches
// (e.g. a titled object composed as `allOf: [{ properties }, ...constraints]`).
// Returns null when the schema has no object properties.
function getEffectiveProperties(schema) {
  if (!schema || typeof schema !== "object") return null;
  let properties = schema.properties ? { ...schema.properties } : null;
  let required = Array.isArray(schema.required) ? [...schema.required] : [];
  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) {
      const subEff = getEffectiveProperties(sub);
      if (subEff) {
        properties = { ...(properties || {}), ...subEff.properties };
        required = required.concat(subEff.required);
      }
    }
  }
  return properties ? { properties, required } : null;
}

// Function to extract all object schemas from a schema
function extractObjectSchemas(schema, parentSchemaId = "", currentPath = "") {
  // Skip if null or not an object
  if (!schema || typeof schema !== "object") return {};

  const extractedSchemas = {};

  // If this is an object schema with properties (directly or composed via allOf)
  const effective = getEffectiveProperties(schema);
  if ((schema.type === "object" || !schema.type) && effective) {
    // Generate an ID for this schema
    const schemaId = generateSchemaId(schema, currentPath || parentSchemaId);

    // Store parent-child relationship
    if (parentSchemaId && schemaId !== parentSchemaId) {
      if (!parentChildRelationships.has(parentSchemaId)) {
        parentChildRelationships.set(parentSchemaId, new Set());
      }
      parentChildRelationships.get(parentSchemaId).add(schemaId);
    }

    // Add to extracted schemas if not already processed
    if (!schemaRegistry.has(schemaId)) {
      schemaRegistry.set(schemaId, schema);
      extractedSchemas[schemaId] = schema;

      // Process properties (merged across allOf branches)
      for (const [propName, propSchema] of Object.entries(effective.properties)) {
        const propPath = currentPath ? `${currentPath}.${propName}` : propName;
        const nestedSchemas = extractObjectSchemas(
          propSchema,
          schemaId,
          propPath
        );
        Object.assign(extractedSchemas, nestedSchemas);
      }
    }
  }

  // Handle array items
  if (schema.type === "array" && schema.items) {
    const itemSchemas = Array.isArray(schema.items)
      ? schema.items
      : [schema.items];
    for (let i = 0; i < itemSchemas.length; i++) {
      const itemPath = `${currentPath}[]`;
      const nestedSchemas = extractObjectSchemas(
        itemSchemas[i],
        parentSchemaId,
        itemPath
      );
      Object.assign(extractedSchemas, nestedSchemas);
    }
  }

  // Handle anyOf/oneOf/allOf. allOf object properties are also merged into the
  // page above via getEffectiveProperties; recursing here additionally surfaces
  // any titled object schemas nested inside allOf branches as their own pages.
  ["anyOf", "oneOf", "allOf"].forEach((key) => {
    if (Array.isArray(schema[key])) {
      schema[key].forEach((subSchema, index) => {
        const subPath = `${currentPath}${
          currentPath ? "." : ""
        }${key}[${index}]`;
        const nestedSchemas = extractObjectSchemas(
          subSchema,
          parentSchemaId,
          subPath
        );
        Object.assign(extractedSchemas, nestedSchemas);
      });
    }
  });

  return extractedSchemas;
}

// Function to generate markdown for a schema
function generateSchemaMarkdown(schemaId, schema) {
  const title = schema.title || schemaId;
  const description =
    schema.description || `Reference for the \`${title}\` schema.`;

  // Fern frontmatter (title + description) replaces the Docusaurus-era H1.
  const heading = [
    "---",
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
    "---",
    "",
    "<!-- Generated by docs/.scripts/buildSchemaReferencesV4.js. Do not edit by hand;",
    "     update the schema in src/common and run `npm run docs:build-schema-refs`. -->",
    "",
  ];

  // Keep the human-readable description as the page intro when the schema has one.
  if (schema.description) {
    heading.push(schema.description, "");
  }

  // Add parent schemas section if this schema is referenced by others. Only link
  // to parents that are actually emitted as pages (titled schemas) — anonymous
  // hash-named parents are skipped at write time and would 404.
  const parentSchemas = [];
  for (const [parentId, children] of parentChildRelationships.entries()) {
    if (children.has(schemaId) && parentId !== schemaId) {
      const parentPath = schemaPaths.get(parentId);
      const parentSchema = schemaRegistry.get(parentId);
      if (parentPath && parentSchema && parentSchema.title) {
        parentSchemas.push(`- [${parentId}](${parentPath})`);
      }
    }
  }

  if (parentSchemas.length > 0) {
    heading.push("## Referenced In");
    heading.push("");
    heading.push(...parentSchemas);
    heading.push("");
  }

  // Fields
  const fields = [
    "## Fields",
    "",
    "Field | Type | Description | Default",
    ":-- | :-- | :-- | :--",
  ];

  // Process fields (merged across allOf branches)
  const effectiveFields = getEffectiveProperties(schema);
  if (effectiveFields) {
    const parentForRequired = { required: effectiveFields.required };
    for (const [propName, propSchema] of Object.entries(
      effectiveFields.properties
    )) {
      const row = generatePropertyRow(propName, propSchema, parentForRequired);
      fields.push(row);
    }
  }

  fields.push("");

  // Examples
  const examples = ["## Examples", ""];

  if (schema.examples && schema.examples.length > 0) {
    for (const example of schema.examples) {
      const snippet = ["```json", JSON.stringify(example, null, 2), "```", ""];
      examples.push(...snippet);
    }
  } else {
    // Generate example based on schema
    const exampleObj = generateExampleFromSchema(schema);
    if (Object.keys(exampleObj).length > 0) {
      const snippet = [
        "```json",
        JSON.stringify(exampleObj, null, 2),
        "```",
        "",
      ];
      examples.push(...snippet);
    }
  }

  // Putting it all together
  return heading.concat(fields).concat(examples).join("\n");
}

// Function to generate an example from a schema
function generateExampleFromSchema(schema) {
  const eff = getEffectiveProperties(schema);
  if (!eff) return {};

  const example = {};

  for (const [propName, propSchema] of Object.entries(eff.properties)) {
    // Skip system-populated/deprecated fields — they shouldn't be set manually.
    if (propSchema.readOnly || propSchema.deprecated) continue;

    // Use default value if available
    if (propSchema.default !== undefined) {
      example[propName] = propSchema.default;
      continue;
    }

    // Generate based on type
    if (propSchema.type === "string") {
      example[propName] = propSchema.enum ? propSchema.enum[0] : "example";
    } else if (propSchema.type === "number" || propSchema.type === "integer") {
      example[propName] = 42;
    } else if (propSchema.type === "boolean") {
      example[propName] = true;
    } else if (propSchema.type === "array") {
      example[propName] = [];
    } else if (propSchema.type === "object" && propSchema.properties) {
      // Only include nested example if it's a simple object
      if (Object.keys(propSchema.properties).length <= 2) {
        example[propName] = generateExampleFromSchema(propSchema);
      } else {
        example[propName] = {};
      }
    }

    // Handle anyOf/oneOf by using the first option
    if (!propSchema.type && (propSchema.anyOf || propSchema.oneOf)) {
      const options = propSchema.anyOf || propSchema.oneOf;
      if (options.length > 0) {
        const firstOption = options[0];
        if (firstOption.type === "string") {
          example[propName] = firstOption.enum
            ? firstOption.enum[0]
            : "example";
        } else if (
          firstOption.type === "number" ||
          firstOption.type === "integer"
        ) {
          example[propName] = 42;
        } else if (firstOption.type === "boolean") {
          example[propName] = true;
        }
      }
    }
  }

  return example;
}

// Function to generate a property row for the fields table
function generatePropertyRow(propName, propSchema, parentSchema) {
  // Get type information
  let type = getTypeString(propSchema);

  // Get description with status prefix. Collapse literal newlines to <br/> so
  // multi-line schema descriptions don't break the markdown table row.
  let description = (propSchema.description || "No description provided.")
    .replace(/\r?\n/g, "<br/>")
    .trim();

  // Add required/optional status (don't double-prefix when the description
  // already leads with the status word, e.g. a deprecated field's text).
  const startsWith = (word) =>
    new RegExp(`^${word}\\b`, "i").test(description);
  if (parentSchema.required && parentSchema.required.includes(propName)) {
    if (!startsWith("required")) description = "Required. " + description;
  } else if (propSchema.readOnly) {
    if (!startsWith("readonly")) description = "ReadOnly. " + description;
  } else if (propSchema.deprecated) {
    if (!startsWith("deprecated")) description = "Deprecated. " + description;
  } else {
    if (!startsWith("optional")) description = "Optional. " + description;
  }

  // Add enum values if present
  if (propSchema.enum) {
    let enums = `<br/><br/>Accepted values: \`${propSchema.enum.join(
      "`, `"
    )}\``;
    description = description + enums;
  }

  // Add constraint information
  const constraints = [];

  if (propSchema.minimum !== undefined) {
    constraints.push(`Minimum: ${propSchema.minimum}`);
  }
  if (propSchema.maximum !== undefined) {
    constraints.push(`Maximum: ${propSchema.maximum}`);
  }
  if (propSchema.minLength !== undefined) {
    constraints.push(`Minimum length: ${propSchema.minLength}`);
  }
  if (propSchema.maxLength !== undefined) {
    constraints.push(`Maximum length: ${propSchema.maxLength}`);
  }
  if (propSchema.pattern) {
    constraints.push(`Pattern: \`${propSchema.pattern}\``);
  }

  if (constraints.length > 0) {
    description += `<br/><br/>${constraints.join(". ")}`;
  }

  // Format default value
  let defaultValue = "";
  if (propSchema.default !== undefined) {
    if (typeof propSchema.default === "object") {
      defaultValue = `\`\`${JSON.stringify(propSchema.default)}\`\``;
    } else {
      defaultValue = `\`${propSchema.default}\``;
    }
  }

  return `${propName} | ${type} | ${description} | ${defaultValue}`;
}

// Function to get a string representation of a type
function getTypeString(schema) {
  if (!schema) return "unknown";

  // Constant value (e.g. `continue: { const: true }`)
  if (schema.const !== undefined) {
    return `\`${JSON.stringify(schema.const)}\``;
  }

  // Direct type
  if (schema.type) {
    let type = schema.type;

    // Handle objects with titles (reference to other schemas)
    if (schema.type === "object" && schema.title) {
      const schemaId = schema.title;
      const schemaPath = schemaPaths.get(schemaId);
      if (schemaPath) {
        type = `object([${schemaId}](${schemaPath}))`;
      } else {
        type = `object(${schemaId})`;
      }
    }

    // Handle arrays
    if (schema.type === "array" && schema.items) {
      const itemType = getArrayItemTypeString(schema.items);
      type = `array of ${itemType}`;
    }

    return type;
  }

  // Handle anyOf/oneOf
  if (schema.anyOf || schema.oneOf) {
    const options = schema.anyOf || schema.oneOf;

    if (options.length === 1) {
      return getTypeString(options[0]);
    }

    // Multiple options
    return (
      "one of:<br/>" +
      options
        .map((option) => {
          return `- ${getTypeString(option)}`;
        })
        .join("<br/>")
    );
  }

  // allOf composition (e.g. a titled object plus constraints). Prefer a titled
  // branch so the type links to its page; otherwise combine the parts.
  if (Array.isArray(schema.allOf)) {
    const titled = schema.allOf.find((s) => s && s.title);
    if (titled) return getTypeString({ type: "object", title: titled.title });
    const parts = schema.allOf
      .map((s) => getTypeString(s))
      .filter((t) => t && t !== "unknown");
    if (parts.length) return parts.join(" &amp; ");
  }

  // A bare object schema (properties only, no explicit type)
  if (schema.properties || getEffectiveProperties(schema)) return "object";

  return "unknown";
}

// Function to get a string representation of array item types
function getArrayItemTypeString(items) {
  if (!items) return "any";

  // Single item schema
  if (!Array.isArray(items)) {
    // If the item is an object with a title
    if (items.type === "object" && items.title) {
      const schemaId = items.title;
      const schemaPath = schemaPaths.get(schemaId);
      if (schemaPath) {
        return `object([${schemaId}](${schemaPath}))`;
      } else {
        return `object(${schemaId})`;
      }
    }

    // Handle anyOf/oneOf
    if (items.anyOf || items.oneOf) {
      const options = items.anyOf || items.oneOf;
      if (options.length === 1) {
        return getTypeString(options[0]);
      }

      return (
        "one of: " + options.map((option) => getTypeString(option)).join(", ")
      );
    }

    return items.type || "unknown";
  }

  // Multiple item schemas (tuple validation)
  return "tuple of various types";
}

// Main function
async function main() {
  const schemasToGenerate = [
    "checkLink_v3",
    "click_v3",
    "config_v3",
    "context_v3",
    "dragAndDrop_v3",
    "find_v3",
    "goTo_v3",
    "httpRequest_v3",
    "loadCookie_v3",
    "loadVariables_v3",
    "openApi_v3",
    "record_v3",
    "runBrowserScript_v3",
    "runCode_v3",
    "runShell_v3",
    "saveCookie_v3",
    "screenshot_v3",
    "spec_v3",
    "step_v3",
    "stopRecord_v3",
    "test_v3",
    "type_v3",
    "wait_v3",
  ];

  // Process all schemas to extract object schemas
  for await (const key of schemasToGenerate) {
    let schema = schemas[key];
    if (!schema) {
      console.warn(`Schema not found, skipping: ${key}`);
      continue;
    }
    // Dereference schema
    schema = await parser.dereference(schema);

    // Extract all object schemas
    const extractedSchemas = extractObjectSchemas(schema);

    // Generate schema paths
    for (const [schemaId, _] of Object.entries(extractedSchemas)) {
      const fileName = `${createValidFileName(schemaId)}.md`;
      const pathWithoutExt = fileName.replace(".md", "");
      schemaPaths.set(schemaId, `${linkBase}/${pathWithoutExt}`);
    }
  }

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  // Generate markdown files for each schema
  for (const [schemaId, schema] of schemaRegistry.entries()) {
    // Only emit pages for named schemas. Title-less, deeply-nested anonymous
    // sub-schemas (e.g. an inline `waitUntil` object) would otherwise produce
    // hash-named pages that pollute the auto-generated Schemas nav.
    if (!schema.title) continue;

    // Generate markdown content, normalize blank lines, ensure trailing newline
    let content = generateSchemaMarkdown(schemaId, schema);
    content = content.replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "") + "\n";

    // Determine file name
    const fileName = `${createValidFileName(schemaId)}.md`;
    // Write file
    const filePath = path.join(outputDir, fileName);
    fs.writeFileSync(filePath, content);
    generatedSchemaFiles.add(fileName);

    console.log(`Generated schema file: ${fileName}`);
  }

  console.log(`Total schemas generated: ${generatedSchemaFiles.size}`);
}

// Run the main function
main().catch((err) => {
  console.error("Error generating schema references:", err);
  process.exit(1);
});
