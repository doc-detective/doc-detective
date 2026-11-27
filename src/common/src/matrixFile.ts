// Load a `matrix` key's values from a file (ADR 01233): a `.json` array, or a
// sitemap's `<loc>` entries.
import fs from "node:fs";
import path from "node:path";
import { validate } from "./validate.js";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      // Out of range, or a surrogate XML doesn't allow: leave it as written.
      const valid = code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
      return valid ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/**
 * The values for `matrix.<key>` from `{ file }`. A relative path resolves
 * against `baseDir`. Throws a message naming the key and the absolute path.
 */
export function loadMatrixValues(key: string, definition: { file: string }, baseDir: string): unknown[] {
  const file = path.resolve(baseDir, definition.file);
  const extension = path.extname(file).toLowerCase();
  const cantLoad = (why: string) => new Error(`Couldn't load \`matrix\` key \`${key}\`: \`${file}\` ${why}.`);
  if (extension !== ".json" && extension !== ".xml") throw cantLoad("must be `.json` or `.xml`");
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    throw new Error(`Couldn't read \`matrix\` file \`${file}\`.`);
  }
  // A regular expression, not an XML parser: enough for the `<loc>` entries of
  // a standard sitemap, with no new dependency (ADR 01233).
  if (extension === ".xml") {
    const values = [...text.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/g)].map((match) => decodeXml(match[1]));
    if (values.length === 0) throw cantLoad("has no `<loc>` entries");
    return [...new Set(values)];
  }
  let values: unknown;
  try {
    values = JSON.parse(text);
  } catch {
    throw cantLoad("isn't a JSON array");
  }
  if (!Array.isArray(values)) throw cantLoad("isn't a JSON array");
  if (values.length === 0) throw cantLoad("has no values");
  if (!validate({ schemaKey: "matrix_v3", object: { [key]: values } }).valid) {
    throw cantLoad("has values `matrix` doesn't accept");
  }
  return values;
}
