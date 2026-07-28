// Hand-written declarations for dedupe.cjs (the single-source CJS
// implementation shared by the pre-compile build scripts and the compiled
// runtime). With this file present, tsc type-resolves the .cjs import
// without allowJs; the runtime file is copied into each dist layout by the
// build (see createCjsWrapper.js and the root copy:schemas script).

/** Reserved container key for hoisted subtrees (`x_dd_defs`). */
export declare const DEDUPE_CONTAINER: string;

/**
 * Compress a dereferenced schema: repeated object subtrees hoist into the
 * reserved container and are replaced by internal `$ref`s. Deterministic;
 * throws if the input already uses the reserved namespace.
 */
export declare function compressSchema(schema: unknown): any;

/**
 * Expand a compressed schema back into the exact original fully-inlined
 * tree. Every ref site receives a fresh copy; schemas without the container
 * pass through as plain deep copies. Throws on unresolvable or cyclic refs.
 */
export declare function expandSchema(schema: unknown): any;
