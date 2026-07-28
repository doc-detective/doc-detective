// Structural dedupe for the dereferenced schema artifacts.
//
// The dereference pipeline fully inlines every $ref, which duplicates shared
// components combinatorially — single components repeat thousands of times
// across output_schemas/ and schemas.json, and the aggregate brushed
// GitHub's 100 MB file limit (see the ADR for this change). This module
// compresses a DEREFERENCED schema by hoisting repeated subtrees into a
// reserved container and referencing them with internal JSON-pointer $refs,
// and expands the compressed form back into the exact original tree.
//
// Contract:
//   expandSchema(JSON.parse(JSON.stringify(compressSchema(schema))))
//     deep-equals `schema`, byte-for-byte under JSON.stringify —
// dereferenceSchemas.cjs asserts this for every schema it writes, so a
// compression bug fails the build rather than shipping a wrong artifact.
//
// The container key is deliberately NOT `definitions`/`$defs`: authored
// schemas own those (config_v2 uses `definitions`), and a distinctive name
// makes "this ref is dedupe plumbing" unambiguous for both expansion and
// human readers. Consumers never see the container: everything that walks
// schema structure (validate()'s AJV registration via schemas/index.ts, the
// docs reference generator, the type generator) receives the EXPANDED form,
// so this stays an on-disk encoding, not a schema-shape contract.
//
// Plain CJS on purpose: the build scripts that need it (dereferenceSchemas,
// generateTypes) run BEFORE tsc, and schemas/index.ts imports it afterward
// via allowJs — one implementation for both worlds.
"use strict";

const crypto = require("node:crypto");

// Reserved container for hoisted subtrees.
const DEDUPE_CONTAINER = "x_dd_defs";

// Subtrees whose serialized form is smaller than this stay inline: a $ref
// node costs ~40 bytes, and hoisting tiny leaves would trade size for churn.
const MIN_HOIST_SIZE = 120;

const REF_PREFIX = `#/${DEDUPE_CONTAINER}/`;

// True for the ONLY shape expansion treats as dedupe plumbing: a single-key
// object whose $ref points into the reserved container. $refs with siblings
// or other targets are user content and pass through untouched.
function isContainerRef(node) {
  return (
    node !== null &&
    typeof node === "object" &&
    !Array.isArray(node) &&
    Object.keys(node).length === 1 &&
    typeof node.$ref === "string" &&
    node.$ref.startsWith(REF_PREFIX)
  );
}

// Guard: the input must not already use the reserved namespace, or
// compression and expansion would be ambiguous.
function assertNamespaceFree(schema) {
  (function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      if (Object.prototype.hasOwnProperty.call(node, DEDUPE_CONTAINER)) {
        throw new Error(
          `Schema already uses the reserved "${DEDUPE_CONTAINER}" key; refusing to compress.`
        );
      }
      if (typeof node.$ref === "string" && node.$ref.startsWith(REF_PREFIX)) {
        throw new Error(
          `Schema already uses the reserved "${REF_PREFIX}" ref namespace; refusing to compress.`
        );
      }
      Object.values(node).forEach(walk);
    }
  })(schema);
}

/**
 * Compress a dereferenced schema: repeated object subtrees (serialized size
 * >= MIN_HOIST_SIZE, seen >= 2 times) hoist into the reserved container and
 * are replaced by internal $refs. Definitions are themselves compressed
 * bottom-up, so nesting dedupes maximally. Deterministic: names are content
 * hashes, so identical inputs produce identical outputs.
 */
function compressSchema(schema) {
  assertNamespaceFree(schema);

  // Pass 1: occurrence counts by canonical serialization.
  const counts = new Map();
  (function scan(node) {
    if (node && typeof node === "object") {
      for (const value of Object.values(node)) scan(value);
      if (!Array.isArray(node)) {
        const serial = JSON.stringify(node);
        if (serial.length >= MIN_HOIST_SIZE) {
          counts.set(serial, (counts.get(serial) ?? 0) + 1);
        }
      }
    }
  })(schema);

  const definitions = {};
  const nameBySerial = new Map();
  const nameFor = (serial) => {
    let name = nameBySerial.get(serial);
    if (!name) {
      name =
        "d" + crypto.createHash("sha256").update(serial).digest("hex").slice(0, 12);
      nameBySerial.set(serial, name);
    }
    return name;
  };

  // Pass 2: rebuild bottom-up — children first, so a hoisted parent's
  // definition body itself references child definitions.
  function rebuild(node, isRoot) {
    if (Array.isArray(node)) return node.map((value) => rebuild(value, false));
    if (node && typeof node === "object") {
      const rebuilt = {};
      for (const [key, value] of Object.entries(node)) {
        rebuilt[key] = rebuild(value, false);
      }
      if (!isRoot) {
        const serial = JSON.stringify(node);
        if (serial.length >= MIN_HOIST_SIZE && (counts.get(serial) ?? 0) >= 2) {
          const name = nameFor(serial);
          if (!(name in definitions)) definitions[name] = rebuilt;
          return { $ref: `${REF_PREFIX}${name}` };
        }
      }
      return rebuilt;
    }
    return node;
  }

  const out = rebuild(schema, true);
  if (Object.keys(definitions).length) out[DEDUPE_CONTAINER] = definitions;
  return out;
}

/**
 * Expand a compressed schema back into the exact original tree. Every ref
 * site receives a FRESH copy (no shared object identity), so consumers see
 * precisely what the pre-compression dereferenced artifact contained and
 * mutations at one site can't leak into another. Schemas without the
 * container pass through as plain deep copies.
 */
function expandSchema(root) {
  const container =
    root && typeof root === "object" && !Array.isArray(root)
      ? root[DEDUPE_CONTAINER]
      : undefined;
  // Guards recursive definitions (impossible from compressSchema, which only
  // ever compresses trees, but a hand-corrupted artifact must fail loudly
  // instead of overflowing the stack).
  const expanding = new Set();

  const resolve = (ref) => {
    const name = ref.slice(REF_PREFIX.length);
    const target = container?.[name];
    if (target === undefined) {
      throw new Error(`Unresolvable dedupe ref: ${ref}`);
    }
    if (expanding.has(name)) {
      throw new Error(`Cyclic dedupe ref: ${ref}`);
    }
    expanding.add(name);
    const value = expand(target, false);
    expanding.delete(name);
    return value;
  };

  function expand(node, isRoot) {
    if (Array.isArray(node)) return node.map((value) => expand(value, false));
    if (node && typeof node === "object") {
      if (isContainerRef(node)) return resolve(node.$ref);
      const out = {};
      for (const [key, value] of Object.entries(node)) {
        if (isRoot && key === DEDUPE_CONTAINER) continue;
        out[key] = expand(value, false);
      }
      return out;
    }
    return node;
  }

  return expand(root, true);
}

module.exports = { compressSchema, expandSchema, DEDUPE_CONTAINER };
