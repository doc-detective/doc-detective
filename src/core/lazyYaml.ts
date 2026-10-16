import { createRequire } from "node:module";

// yaml (~72 modules) loads on first use rather than at CLI startup (see
// test/startup-modules.test.js). A lazy require, not a dynamic import, because
// its callers parse synchronously. Node-only: src/common stays browser-safe and
// keeps its own static import. The return type is yaml's ESM namespace; that's
// sound because yaml resolves to the same CommonJS build for both `import` and
// `require` in Node (its exports map's "node" condition), so an ESM import
// elsewhere gets this very object.
const requireFromHere = createRequire(import.meta.url);

export function requireYaml(): typeof import("yaml") {
  return requireFromHere("yaml");
}
