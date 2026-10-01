/**
 * Shared diagnostic strings and the AJV-error→message formatter. Kept in its own
 * module so both the spec pipeline (diagnostics.ts) and the inline pipeline
 * (inline.ts) can use them without a circular import.
 */

/** Diagnostic `source` label shown in the editor gutter/problems panel. */
export const DIAGNOSTIC_SOURCE = "doc-detective";

/**
 * The flagship message: the single most common Doc Detective authoring mistake
 * gets one clear diagnostic instead of the wall of `anyOf` failures the raw
 * schema produces. Mirrors the plugin's write-blocking hook. Fires only on an
 * INVALID document/step — a valid legacy v2 form gets the softer deprecation
 * warning instead.
 */
export const ACTION_KEYED_MESSAGE =
  'The action name is the key: write `{"goTo": …}`, not an object with an "action" property. ' +
  'Each step is `{"<action>": <value>}`.';

/**
 * The version-mixing nudge: a document/step that is *valid* but uses the legacy
 * v2 `action`-keyed form gets a non-blocking warning steering it to compact v3.
 */
export const V2_DEPRECATION_MESSAGE =
  'Legacy v2 step form. Prefer the compact v3 form — the action name is the key, e.g. `{"goTo": …}`.';

/** Format a single AJV error into a concise human message. */
export function schemaMessage(error: {
  message?: string;
  keyword?: string;
  params?: Record<string, any>;
}): string {
  const base = error.message || "does not match the schema";
  const params = error.params || {};
  if (error.keyword === "additionalProperties" && params.additionalProperty) {
    return `${base}: "${params.additionalProperty}"`;
  }
  // AJV's `required` message already names the missing property, so `base`
  // needs no augmentation — it falls through to the return below.
  return base;
}
