import { parse as parseJsonc } from "jsonc-parser";
import YAML from "yaml";

/**
 * What kind of Doc Detective document a buffer is, or `null` when the buffer is
 * not a Doc Detective document at all. The server stays completely silent
 * (no diagnostics, no completion) for `null` — the detection gate is biased
 * toward silence, because false noise on an unrelated `package.json` is far
 * worse than a real spec that a user has to opt into with `$schema`.
 */
export type DocClass = "spec" | "config" | null;

export interface ClassifyInput {
  /** Document URI (e.g. `file:///abs/path/foo.spec.json`). */
  uri: string;
  /** Full document text. */
  text: string;
}

/** Extract a lowercase basename from a URI or path, sans query/fragment. */
export function basenameFromUri(uri: string): string {
  // Strip scheme/query/fragment, then take the last path segment.
  const withoutQuery = uri.split(/[?#]/)[0];
  const segments = withoutQuery.split(/[\\/]/);
  return (segments[segments.length - 1] || "").toLowerCase();
}

const SPEC_NAME = /\.spec\.(json|ya?ml)$/;
const CONFIG_NAME = /^\.doc-detective\.(json|ya?ml)$/;

/**
 * Classify a document by filename first, then by an explicit `$schema` opt-in,
 * then by a shape sniff — in that order of confidence. Pure: no filesystem, no
 * network, tolerant of syntactically broken buffers (an editor sends those
 * constantly), so it never throws.
 */
export function classifyDocument({ uri, text }: ClassifyInput): DocClass {
  const name = basenameFromUri(uri);

  // 1. Filename convention — highest confidence.
  if (SPEC_NAME.test(name)) return "spec";
  if (CONFIG_NAME.test(name)) return "config";

  // For anything else we only engage on an explicit signal in the content.
  // Parse leniently by extension: YAML files through the YAML parser, everything
  // else through jsonc (tolerant of trailing commas / comments). Both are
  // wrapped so a malformed buffer classifies as `null` rather than throwing.
  const isYaml = name.endsWith(".yaml") || name.endsWith(".yml");
  let parsed: any;
  try {
    parsed = isYaml ? YAML.parse(text) : parseJsonc(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  // 2. Explicit `$schema` opt-in — the documented escape hatch for
  //    non-conventionally-named files.
  if (typeof parsed.$schema === "string") {
    if (parsed.$schema.includes("spec_v3")) return "spec";
    if (parsed.$schema.includes("config_v3")) return "config";
  }

  // 3. Shape sniff — only the spec shape is distinctive enough to trust
  //    without a name or `$schema`. A top-level `tests` array is the
  //    spec_v3 signature. Config is deliberately NOT sniffed: too many
  //    unrelated JSON files would match a permissive config shape.
  if (Array.isArray(parsed.tests)) return "spec";

  return null;
}

/** Convenience predicate: is this a document the server should touch at all? */
export function shouldHandleDocument(input: ClassifyInput): boolean {
  return classifyDocument(input) !== null;
}

/** Is this URI a JSON document (by extension)? */
export function isJsonUri(uri: string): boolean {
  return basenameFromUri(uri).endsWith(".json");
}

/** Is this URI a YAML document (by extension)? */
export function isYamlUri(uri: string): boolean {
  const name = basenameFromUri(uri);
  return name.endsWith(".yaml") || name.endsWith(".yml");
}
