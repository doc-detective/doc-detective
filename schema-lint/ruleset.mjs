// Spectral ruleset for the authored JSON Schemas in src/common/src/schemas/src_schemas.
//
// Scope: STRUCTURAL rules only — things decidable by looking at one document's
// shape. The two other rule classes live in scripts/lint-schemas.cjs because
// Spectral can't express them:
//
//   - Cross-file identity (unique-title) needs an index over all sources.
//   - AJV semantics (no-inert-default, examples-validate) need the repo's own
//     Ajv instance to render a verdict; a structural approximation would drift
//     from what actually validates.
//
// EVERY rule here sets `resolved: false`, and that is load-bearing rather than
// stylistic. These schemas $ref each other across 166 edges and the
// dereferencer INLINES rather than links: "Element-finding fields" appears 90
// times in a resolved config_v3. Linting resolved documents would report one
// authoring mistake in annotation_v3 roughly 200 times, at paths that don't
// exist in any file an author can edit. Unresolved, each finding lands once, on
// the line someone wrote.
//
// Rules use `given: '$'` plus a walker rather than JSONPath `given` expressions.
// The conditions here are relational ("a node with `properties` AND a sibling
// `anyOf`"), which JSONPath expresses awkwardly and slowly over schemas this
// deeply nested; a walker also lets each finding carry an exact path.

import { createRulesetFunction } from "@stoplight/spectral-core";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

// Findings recorded when the lint was introduced. Baselined rather than fixed
// here because each type-collapse fix restructures a schema and changes its
// generated type — reviewable work in its own right, not a rider on the tooling
// that found it. The list only ever shrinks: deleting an entry that is still
// violated fails the build.
//
// Consulted here rather than through Spectral's `overrides`, whose `files` globs
// resolve relative to THIS file — schema-lint/ — and so cannot reach the schemas
// under src/common/.
//
// The path arrives by env var from scripts/lint-schemas.cjs rather than being
// derived from `import.meta.url`: Spectral transpiles rulesets before loading
// them, and the module-relative forms (`import.meta.url`, `createRequire`) blow
// up with "__filename is not defined" inside its loader.
function loadBaseline() {
  const file = process.env.SCHEMA_LINT_BASELINE || join(process.cwd(), "schema-lint", "baseline.json");
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch (error) {
    // A missing baseline is a legitimate state (nothing recorded yet). Anything
    // else — unreadable, permission-denied — is not.
    if (error && error.code === "ENOENT") return {};
    throw error;
  }
  // A malformed baseline must NOT degrade to an empty set — that would re-fire
  // every baselined finding at once with nothing pointing at the real culprit.
  // Rethrown rather than left bare: Node's JSON.parse SyntaxError reports only a
  // character offset ("...at position 2") and never the filename.
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`The schema-lint baseline (${file}) is not valid JSON: ${error.message}`);
  }
}

const baselinedCollapse = new Set(loadBaseline()["no-type-collapse"] ?? []);

/**
 * `["components","schemas","object"]` -> `"components.schemas.object"`.
 *
 * A plain dot join on purpose. Array indices arrive as NUMBERS from the walker
 * here but as STRINGS in Spectral's JSON report, so any index-aware formatting
 * (`anyOf[0]` vs `anyOf.0`) makes a baseline key generated from the report fail
 * to match the same finding at runtime — silently, and only for paths that
 * happen to contain an array index.
 */
function toDotPath(path) {
  return path.join(".");
}

// Keywords whose values are DATA, not subschemas. Descending into them would
// make a user's example object containing a `properties` key look like a schema
// node and produce phantom findings.
const DATA_KEYWORDS = new Set(["examples", "example", "default", "const", "enum"]);

/**
 * Walk every schema node in a document, calling `visit(node, path)`.
 *
 * @param {unknown} root Parsed schema document.
 * @param {(node: object, path: (string|number)[]) => void} visit
 */
function walkSchema(root, visit) {
  const stack = [{ node: root, path: [] }];
  while (stack.length > 0) {
    const { node, path } = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) {
      node.forEach((child, i) => stack.push({ node: child, path: [...path, i] }));
      continue;
    }
    visit(node, path);
    for (const [key, value] of Object.entries(node)) {
      if (DATA_KEYWORDS.has(key)) continue;
      stack.push({ node: value, path: [...path, key] });
    }
  }
}

// Composition keywords that collapse a generated TypeScript type when they sit
// beside `properties`. Deliberately NOT including `allOf`: a survey of these
// schemas found 16 `anyOf` and 1 `oneOf` sibling cases and ZERO `allOf` ones,
// and `allOf` beside `properties` is the shape the fix itself produces — listing
// it would flag the correction as a violation.
const COLLAPSING_KEYWORDS = ["anyOf", "oneOf"];

const noTypeCollapse = createRulesetFunction(
  { input: null, options: null },
  function noTypeCollapse(input, _options, context) {
    const file = basename(context?.document?.source ?? "");
    const results = [];
    walkSchema(input, (node, path) => {
      if (!node.properties || typeof node.properties !== "object") return;
      const siblings = COLLAPSING_KEYWORDS.filter((k) => node[k] !== undefined);
      if (siblings.length === 0) return;
      if (baselinedCollapse.has(`${file}#${toDotPath(path)}`)) return;
      const label = typeof node.title === "string" ? `"${node.title}"` : "this object";
      results.push({
        message:
          `${label} declares \`properties\` beside a sibling \`${siblings.join("`/`")}\`. ` +
          `The TypeScript generator collapses that to \`{ [k: string]: unknown }\`, erasing every ` +
          `field from the published type. Wrap it as \`allOf: [shape, guard]\` instead — see the ` +
          `$comment in annotation_v3.schema.json.`,
        path,
      });
    });
    return results;
  }
);

const requireDescription = createRulesetFunction(
  { input: null, options: null },
  function requireDescription(input) {
    const results = [];
    walkSchema(input, (node, path) => {
      if (!node.properties || typeof node.properties !== "object") return;
      for (const [name, prop] of Object.entries(node.properties)) {
        if (!prop || typeof prop !== "object") continue;
        // A $ref'd property documents itself at its target.
        if (typeof prop.$ref === "string") continue;
        if (typeof prop.description === "string" && prop.description.trim()) continue;
        results.push({
          message: `Property \`${name}\` has no \`description\`; its row on the generated reference page will be blank.`,
          path: [...path, "properties", name],
        });
      }
    });
    return results;
  }
);

const noAdditionalPropertiesInAllOfBranch = createRulesetFunction(
  { input: null, options: null },
  function noAdditionalPropertiesInAllOfBranch(input) {
    const results = [];
    walkSchema(input, (node, path) => {
      if (!Array.isArray(node.allOf)) return;
      // Draft-07's additionalProperties:false does not compose across allOf:
      // each branch judges the SIBLING branch's fields as additional. This is
      // only a defect when two or more branches actually contribute properties
      // — the deliberate [shape, guard] pattern has exactly one property-bearing
      // branch and is correct, so it must not fire there.
      const bearing = node.allOf.filter(
        (b) => b && typeof b === "object" && b.properties && Object.keys(b.properties).length > 0
      );
      if (bearing.length < 2) return;
      const closed = node.allOf.some((b) => b && typeof b === "object" && b.additionalProperties === false);
      if (!closed) return;
      results.push({
        message:
          `This \`allOf\` has ${bearing.length} branches declaring \`properties\` while one sets ` +
          `\`additionalProperties: false\`. Draft-07 evaluates each branch independently, so the ` +
          `closed branch rejects the other's fields and nothing can validate. Merge the properties ` +
          `into one branch.`,
        path: [...path, "allOf"],
      });
    });
    return results;
  }
);

/** v1/v2 are frozen legacy surface — conventions apply to what's still authored. */
const LEGACY_SCHEMA = /_v[12]\.schema\.json$/;

const camelCasePropertyNames = createRulesetFunction(
  { input: null, options: null },
  function camelCasePropertyNames(input, _options, context) {
    // Scoped here rather than via a ruleset `overrides` entry: Spectral resolves
    // `files` globs relative to the ruleset file, and this ruleset sits in
    // schema-lint/ while the schemas live under src/common/ — so no upward glob
    // matches. Reading the document source is unambiguous.
    const source = context?.document?.source ?? "";
    if (LEGACY_SCHEMA.test(source)) return [];

    const results = [];
    walkSchema(input, (node, path) => {
      if (!node.properties || typeof node.properties !== "object") return;
      for (const name of Object.keys(node.properties)) {
        // `$schema` and friends are JSON Schema's own vocabulary appearing as a
        // declared property, not an authored field name.
        if (name.startsWith("$")) continue;
        if (/^[a-z][a-zA-Z0-9]*$/.test(name)) continue;
        results.push({
          message:
            `Property \`${name}\` is not camelCase. Config keys and CLI flags share these names ` +
            `(see "CLI flags <-> config" in CLAUDE.md), so the casing is part of the contract.`,
          path: [...path, "properties", name],
        });
      }
    });
    return results;
  }
);

export default {
  rules: {
    "no-type-collapse": {
      description:
        "An object schema must not declare `properties` beside a sibling `anyOf`/`oneOf` — the TypeScript generator collapses it to an index signature.",
      message: "{{error}}",
      severity: "error",
      resolved: false,
      given: "$",
      then: { function: noTypeCollapse },
    },

    "no-additionalproperties-in-allof-branch": {
      description:
        "`additionalProperties: false` does not compose across `allOf` when more than one branch declares properties.",
      message: "{{error}}",
      severity: "error",
      resolved: false,
      given: "$",
      then: { function: noAdditionalPropertiesInAllOfBranch },
    },

    "require-description": {
      description: "Every declared property needs a `description`; the reference pages are generated from it.",
      message: "{{error}}",
      severity: "warn",
      resolved: false,
      given: "$",
      then: { function: requireDescription },
    },

    "camelcase-property-names": {
      description: "Property names are camelCase, matching the config keys and CLI flags derived from them.",
      message: "{{error}}",
      severity: "warn",
      resolved: false,
      given: "$",
      then: { function: camelCasePropertyNames },
    },
  },
};
