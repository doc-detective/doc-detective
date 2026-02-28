# Doc Detective Common - AI Coding Agent Guide

## Project Overview

**doc-detective-common** is a shared utilities library for the Doc Detective test automation ecosystem. It provides:
- JSON Schema validation with AJV (50+ schemas for test specifications, configs, steps)
- Automatic schema transformation between versions (v2 → v3)
- Path resolution utilities (relative to absolute conversion)
- File reading with JSON/YAML parsing (local and remote URLs)

This is a dependency package, not a standalone application. Changes here affect downstream packages.

## Architecture

### Schema System (Core Component)

**Three-stage schema pipeline:**

1. **Source schemas** (`src/schemas/src_schemas/*.json`) - Hand-maintained with `$ref` pointers
2. **Build schemas** (`src/schemas/build/`) - References resolved to absolute paths
3. **Output schemas** (`src/schemas/output_schemas/`) - Fully dereferenced, ready for distribution

**Build process:** Run `npm run build` which executes `dereferenceSchemas.js`:
- Updates `$ref` paths to absolute file paths
- Dereferences all references using `@apidevtools/json-schema-ref-parser`
- Removes `$id` properties
- Generates `schemas.json` (all schemas as single object)
- Publishes v3 schemas to `dist/schemas/` for external consumption

**Schema versioning:**
- v2 schemas: Legacy, supported via `compatibleSchemas` transformation map
- v3 schemas: Current version with new naming (e.g., `screenshot_v3`, `step_v3`)
- All schemas **must** include `examples` array (validated in tests)

### Validation System

**Key feature:** Automatic backward compatibility transformation

When `validate()` is called:
1. Validates against target schema (e.g., `step_v3`)
2. If validation fails, checks `compatibleSchemas` map for older versions
3. Validates against each compatible schema (e.g., `checkLink_v2`, `find_v2`)
4. On match, calls `transformToSchemaKey()` to upgrade object structure
5. Revalidates transformed object against target schema

**Important transformations in `validate.js`:**
- `step_v3` accepts 12 different v2 action schemas (`checkLink_v2`, `find_v2`, etc.)
- `config_v3` ← `config_v2`: Restructures nested `runTests` object
- `context_v3` ← `context_v2`: Changes `app` → `browsers` structure
- Property renames: `typeKeys.delay` → `type.inputDelay`, `maxVariation` (0-100) → (0-1), etc.

**AJV configuration** (in `validate.js`):
- `coerceTypes: true` - Auto-converts strings to numbers, etc.
- `useDefaults: true` - Applies default values from schema
- Dynamic defaults: `uuid` generates unique IDs for `stepId`, `configId`
- Custom errors via `ajv-errors`
- Formats via `ajv-formats`, keywords via `ajv-keywords`

### Path Resolution (`resolvePaths.js`)

**Resolves relative paths to absolute based on:**
- `config.relativePathBase`: `"file"` (relative to file location) or `"cwd"` (relative to working directory)
- Object type: `config` or `spec` (different path properties)

**Properties resolved:**
- Config: `input`, `output`, `loadVariables`, `beforeAny`, `afterAll`, `mediaDirectory`, etc.
- Spec: `file`, `path`, `directory`, `before`, `after`, `workingDirectory`, etc.
- Skips: HTTP(S) URLs, already-absolute paths, user data properties (e.g., `requestData`)

**Recursive handling:**
- Processes nested objects and arrays
- Special case: `path` resolved relative to `directory` if `directory` is absolute

### File Reading (`files.js`)

**Detects remote vs. local:**
- Remote: Uses `axios` for `http://` or `https://` URLs
- Local: Uses `fs.promises.readFile`

**Format detection by extension:**
- `.json` → JSON.parse()
- `.yaml`/`.yml` → YAML.parse()
- Other → raw string
- Parse errors → returns raw content (graceful degradation)

## Development Workflow

### Adding or Modifying Schemas

1. Edit source schema in `src/schemas/src_schemas/`
2. Add/update `examples` array (required for tests)
3. If adding new file, add to `files` array in `dereferenceSchemas.js`
4. Run `npm run build` (runs `dereferenceSchemas` + tests)
5. If creating v3 schema, add to published list in `dereferenceSchemas.js` (line ~130)

### Schema Compatibility

When creating new schema version (e.g., v4):
1. Update `compatibleSchemas` map in `validate.js`
2. Add transformation logic in `transformToSchemaKey()` function
3. Handle all property renames, restructuring, and value conversions
4. Test with examples from old schema versions

### Testing

**Test structure (Mocha + Chai):**
- `test/schema.test.js`: Validates all schema examples (auto-generated from schemas)
- `test/files.test.js`: Unit tests for `readFile()` with Sinon stubs
- `test/validate.test.js`: Tests for `validate()` and `transformToSchemaKey()`
- `test/resolvePaths.test.js`: Tests for path resolution

**Run tests:** `npm test` (or `mocha`)

**Example pattern:**
```javascript
const result = validate({ schemaKey: "step_v3", object: example });
assert.ok(result.valid, `Validation failed: ${result.errors}`);
```

### Testing Requirements (CRITICAL)

**TDD is mandatory for this project.** All code changes must follow test-driven development:

1. **Write tests first** - before any implementation
2. **Run tests** - verify they fail (red)
3. **Write implementation** - make tests pass
4. **Run tests** - verify they pass (green)
5. **Check coverage** - must not decrease

**Coverage enforcement:**

```bash
# Run tests with coverage
npm run test:coverage

# Verify coverage baseline (CI enforces this)
npm run test:coverage:ratchet

# Generate HTML report for detailed analysis
npm run test:coverage:html
```

**Current coverage thresholds (enforced by CI):**

| Metric | Threshold |
|--------|-----------|
| Lines | 100% |
| Statements | 100% |
| Functions | 100% |
| Branches | 100% |

**Coverage ratchet:** Thresholds in `coverage-thresholds.json` can only increase. CI fails if coverage decreases.

**Test file mapping:**

| Source | Test File |
|--------|-----------|
| `src/validate.js` | `test/validate.test.js` |
| `src/resolvePaths.js` | `test/resolvePaths.test.js` |
| `src/files.js` | `test/files.test.js` |
| Schema examples | `test/schema.test.js` |

**AI Tooling:** See `.claude/skills/tdd-coverage/SKILL.md` for detailed TDD workflow.

### Version Management & CI/CD Workflows

#### Auto Dev Release (`.github/workflows/auto-dev-release.yml`)

**Triggers:** Every push to `main` branch (+ manual via `workflow_dispatch`)

**Smart skip logic:**
- Skip if commit message contains `[skip ci]` or `Release`
- Skip if only documentation files changed (`.md`, `.txt`, `.yml`, `.yaml`, `.github/`)
- Always runs on manual trigger

**Version generation:**
1. Extract base version from `package.json` (e.g., `3.1.0`)
2. Query npm for latest dev version: `npm view doc-detective-common@dev version`
3. If exists and matches base: increment dev number (`.dev.2` → `.dev.3`)
4. If none exists: start with `.dev.1`
5. Update `package.json` with new version

**Pipeline steps:**
1. Validate `package.json` (existence, valid JSON, required fields)
2. Install dependencies with `npm ci`
3. Run `npm test` (must pass)
4. Run `npm run build` (builds schemas + post-build tests)
5. Update version in `package.json`
6. Commit with `[skip ci]` to prevent infinite loop
7. Create and push git tag (e.g., `v3.1.0-dev.2`)
8. Publish to npm with `dev` tag

**Key details:**
- Uses `DD_DEP_UPDATE_TOKEN` secret for git push permissions
- Uses `NPM_TOKEN` secret for npm publish
- Timeout: 5 minutes
- Runs on: `ubuntu-latest`, Node 18

**Install dev releases:** `npm install doc-detective-common@dev`

#### Test & Publish (`.github/workflows/npm-test.yml`)

**Triggers:** Push to main, PRs, GitHub releases, manual dispatch

**Multi-platform matrix testing:**
- OS: `ubuntu-latest`, `windows-latest`, `macos-latest`
- Node: `18`, `20`, `22`, `24`
- Total: 12 test combinations
- Runs `npm run build` which triggers `postbuild` → `npm test`

**Release pipeline (on GitHub release published):**

1. **Test job:** Run full matrix tests
2. **Threat assessment:** ReversingLabs security scan
   - Creates npm pack tarball
   - Uploads to RL Portal (`Trial/OSS-MannySilva`)
   - Generates security report artifact
   - Must pass before publish
3. **Publish to npm:** 
   - Publishes to npm (stable, no tag)
   - Uses `npm_token` secret
4. **Update downstream:**
   - Triggers `doc-detective/resolver` repository dispatch
   - Triggers `doc-detective.github.io` repository dispatch
   - Passes new version in payload

**Repository dispatch pattern:**
```bash
curl -X POST https://api.github.com/repos/doc-detective/resolver/dispatches \
  -d '{"event_type": "update-common-package-event", "client_payload": {"version": "3.1.0"}}'
```

**Required secrets:**
- `RLPORTAL_ACCESS_TOKEN`: ReversingLabs security scanning
- `npm_token`: NPM publishing
- `DD_DEP_UPDATE_TOKEN`: Cross-repo dispatches

#### Release Strategy Summary

- **Dev releases** (`3.1.0-dev.X`): Automatic on every code commit to main
- **Stable releases** (`3.1.0`): Manual via GitHub releases UI
- **Cross-repo updates**: Automatic dispatch to dependent packages on stable release
- **Security scanning**: Required for all stable releases (threat assessment)

## Important Patterns

### Error Handling

- `validate()` returns `{ valid, errors, object }` - never throws
- `transformToSchemaKey()` throws on incompatible schemas or invalid results
- `readFile()` returns `null` on errors, logs warnings to console
- `resolvePaths()` throws on invalid object types or missing nested object types

### Object Cloning

Always clone before validation to avoid mutations:
```javascript
validationObject = JSON.parse(JSON.stringify(object));
```

### Regular Expression Escaping

Use `escapeRegExp()` helper when converting user strings to regex patterns (see `transformToSchemaKey()` for fileTypes transformation).

### Schema References

- In source schemas: Use relative paths like `"$ref": "context_v3.schema.json#/properties/example"`
- Build process converts these to absolute file system paths
- Output schemas have all references fully inlined (dereferenced)

## Common Tasks

**Add new schema property:**
1. Edit `src/schemas/src_schemas/<schema>.json`
2. Add to relevant `examples` array
3. If path property, add to `configPaths` or `specPaths` in `resolvePaths.js`
4. Run `npm run build`

**Add new step type:**
1. Create schema in `src_schemas/` (e.g., `newAction_v3.schema.json`)
2. Add to `files` array in `dereferenceSchemas.js`
3. Reference in `step_v3.schema.json` oneOf
4. Add transformation logic if upgrading from v2
5. Update `compatibleSchemas` if needed

**Debug validation errors:**
- Check `result.errors` for detailed AJV error messages
- Error format: `${instancePath} ${message} (${JSON.stringify(params)})`
- Common issues: Missing required properties, incorrect types, additional properties when not allowed

**Trigger dev release:**
- Just push to main branch (automatic)
- Or add `[skip ci]` to commit message to prevent release
- Manual trigger: GitHub Actions → Auto Dev Release → Run workflow

**Create stable release:**
1. Go to GitHub repository → Releases
2. Click "Draft a new release"
3. Create new tag (e.g., `v3.2.0`)
4. Publish release
5. Workflow automatically:
   - Runs full test matrix
   - Performs security scan
   - Publishes to npm
   - Updates downstream packages

## External Dependencies

**Runtime:**
- `ajv` (v8): JSON Schema validator with strict mode disabled, coercion enabled
- `axios`: HTTP client for remote file reading
- `yaml`: YAML parser for config files
- `uuid`: UUID generation for default IDs
- `@apidevtools/json-schema-ref-parser`: Dereferences schemas

**Testing:**
- `mocha`: Test runner
- `chai`: Assertions (uses dynamic import for ESM compatibility)
- `sinon`: Mocking/stubbing

## Anti-Patterns to Avoid

- ❌ Don't edit schemas in `build/` or `output_schemas/` (regenerated on build)
- ❌ Don't skip `examples` in schemas (breaks tests)
- ❌ Don't modify `schemas.json` directly (generated file)
- ❌ Don't add schemas without updating `files` array in `dereferenceSchemas.js`
- ❌ Don't assume validation mutates objects (it returns new validated object)
- ❌ Don't forget to clone objects before validation if original needs preservation
- ❌ Don't publish manually to npm (use GitHub releases for stable, auto-dev-release for dev)
- ❌ Don't commit version bumps manually (workflows handle this automatically)
- ❌ Don't modify `package.json` version in PRs (causes conflicts with auto-dev-release)
- ❌ Don't skip security scanning for releases (threat-assessment job required)
