## Plan: Incremental TypeScript Migration for doc-detective-common

A phased approach to convert this CommonJS JavaScript library to TypeScript, leveraging JSON schemas to auto-generate types while maintaining backward compatibility for downstream consumers.

### Steps

1. **Set up TypeScript infrastructure** in [package.json](package.json) — add `typescript`, `@types/node`, configure `tsconfig.json` with `declaration: true`, `resolveJsonModule: true`, and dual CJS/ESM output to `dist/`

2. **Generate TypeScript interfaces from JSON schemas** — use `json-schema-to-typescript` on [output_schemas/](src/schemas/output_schemas) to auto-create types like `StepV3`, `ConfigV3`, `SpecV3` in a new `src/types/generated/` directory

3. **Convert low-complexity files first** — migrate [src/index.ts](src/index.js) → barrel exports, [src/schemas/index.ts](src/schemas/index.js) → typed schema map, [src/files.ts](src/files.js) → straightforward async function

4. **Convert medium-complexity** [src/resolvePaths.ts](src/resolvePaths.js) — type the recursive path resolution with discriminated unions for `config` vs `spec` object types and `RelativePathBase` literal types

5. **Convert high-complexity** [src/validate.ts](src/validate.js) — split 350+ line `transformToSchemaKey()` into modular transformation functions, type the `compatibleSchemas` map, and use generic `validate<K>()` signature

6. **Update build pipeline** — ensure schema dereference runs before generate:types and compile (pipeline order: `dereferenceSchemas → generate:types → compile`), and update CI workflows to run the TypeScript build

### Further Considerations

1. **Module system strategy?** Keep CommonJS output for backward compat + add ESM build (recommended) / Switch to pure ESM (breaking change) / Dual-publish with conditional exports

2. **Schema type generation timing?** Generate types at build time via script (dynamic, adds build step) / Generate once and commit to repo (simpler, requires manual sync) / Use `zod` or `typebox` to replace JSON schemas entirely (major refactor)

3. **Test migration approach?** Convert tests to TypeScript with `ts-mocha` (full type coverage) / Keep tests as JavaScript importing from `dist/` (faster migration, tests compiled output) / Gradual conversion file-by-file alongside source
