# Doc Detective Common - AI Coding Agent Guide

## Project Overview

**doc-detective-common** is a shared utilities library for the Doc Detective test automation ecosystem. It provides:
- JSON Schema validation with AJV (50+ schemas for test specifications, configs, steps)
- Automatic schema transformation between versions (v2 → v3)
- Path resolution utilities (relative to absolute conversion)
- File reading with JSON/YAML parsing (local and remote URLs)

This is a dependency package, not a standalone application. Changes here affect downstream packages.

> Schema changes are user-facing: they alter the test/config contract. A change here that adds, renames, or constrains a field owes a **docs-impact assessment** — see ["Documentation impact"](../../CLAUDE.md#documentation-impact-required) and the [content strategy](../../docs/content-strategy/) in the root guide.

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

### Dual-build requirement (schema edits aren't live until BOTH builds run)

Schemas compile to **two separate dist artifacts**, and a schema edit isn't fully live until both
are regenerated:

1. `src/common/dist` — produced by `npm run build` inside `src/common`. The `src/common` test
   suite reads this.
2. **Root `dist/common`** — a separate copy the **runner** imports `validate` from. Regenerate
   from the repo root with `npm run build`, which sequences `build:common` (rebuilds
   `src/common`), then `compile` and `copy:schemas`. Running `compile` + `copy:schemas` alone can
   copy a **stale** `src/common/src/schemas/schemas.json` if `src/common` wasn't rebuilt first.

Symptom of forgetting #2: `src/common` tests pass, but the runner (runTests / core fixtures)
still validates against the stale schema — a fixture using a newly-added field fails with
`/<field> must NOT be valid` even though the source schema allows it.

Related notes:
- `output_schemas/*` regeneration on Windows produces large CRLF-only diffs — harmless build
  churn, not content changes.
- `spec_v3` has no `additionalProperties: false`, so unknown root keys on a spec are silently
  accepted (a misplaced spec-level key validates but is ignored) — spec-level fields can't be
  enforced by rejection without making `spec_v3` strict (a separate, potentially-breaking change).

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

Releases are driven end-to-end by **semantic-release** from conventional-commit history. `doc-detective-common` and the root `doc-detective` package are always published together at the **same version** — this package is never versioned or released independently. Config lives at the repo root: [.releaserc.json](../../.releaserc.json).

#### Release channels

Each branch maps to an npm dist-tag:

| Branch | Version shape | npm dist-tag | Install |
|---|---|---|---|
| `main` | `X.Y.Z` | `latest` | `npm i doc-detective-common` |
| `next` | `X.Y.Z-next.N` | `next` | `npm i doc-detective-common@next` |
| `feat/**` (any depth) | `X.Y.Z-<slug>.N` | `<slug>` | `npm i doc-detective-common@<slug>` |

Dist-tags for `feat/**` branches are **automatically removed** when the branch is deleted, via [.github/workflows/cleanup-dist-tag.yml](../../.github/workflows/cleanup-dist-tag.yml). The pattern matches any depth (e.g., `feat/foo`, `feat/team/foo-bar`); slug normalization lowercases the name and replaces any non-`[a-z0-9-]` character with `-` so the resulting dist-tag is npm-safe.

#### Release pipeline (`.github/workflows/release.yml`)

Triggered by push to `main`, `next`, or any `feat/**` branch. Steps:
1. `npm ci` → `npm run build` → `npm test`
2. `npx semantic-release` analyzes commits since the last tag, then:
   - Computes the next semver from commit types (`fix` → patch, `feat` → minor, `!` or `BREAKING CHANGE` → major)
   - Updates `CHANGELOG.md` (root)
   - Runs [scripts/sync-common-version.js](../../scripts/sync-common-version.js) to mirror the new version into this package's `package.json`
   - Publishes both `doc-detective` (root) and `doc-detective-common` (this package) to the channel's dist-tag
   - Commits the version bump + changelog back to the branch with `chore(release): X.Y.Z [skip ci]`
   - Creates the git tag `vX.Y.Z` and a GitHub Release

**No human ever edits `version` in either `package.json`.** The sync script overwrites `src/common/package.json` during release.

#### Downstream (`.github/workflows/npm-test.yaml`)

Runs the reusable test matrix (Ubuntu/Windows/macOS × Node 20/22/24) on pull requests as the PR gate. All release-side jobs (pre-publish matrix, publish, smoke test, promote to `@latest`, Docker build) live in `release.yml`.

#### Commit message enforcement

Required format (conventional commits):
```text
<type>(<optional scope>): <subject>
```
Enforced in three places:
- **Locally** via husky `commit-msg` hook → `commitlint` (auto-installed on `npm install`)
- **On PRs** via [.github/workflows/commitlint.yml](../../.github/workflows/commitlint.yml)
- **At release time** — non-conforming commits are silently ignored by semantic-release and won't trigger a bump

Allowed types default to `@commitlint/config-conventional`: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

#### Secrets used by release workflows

- `NPM_TOKEN` — npm publish for both packages
- `DD_DEP_UPDATE_TOKEN` — fed to semantic-release as `GITHUB_TOKEN`; has push rights for the release commit and tag
- `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` — Docker image push (stable releases only)

## Important Patterns

### Ajv coercion vs. `anyOf` branch ordering

`validate()` builds Ajv with `coerceTypes: true`, so in any `anyOf` union that includes a string
branch, **branch order decides what authored values become**: Ajv tries branches in order and
coerces values to make a branch pass. With a string branch first, an authored integer (`tab: 0`,
`tab: -1`) is silently coerced to the string `"0"`/`"-1"` and reaches the runtime as a name, not
an index — string branches accept coercion from nearly everything, so whichever branch is first
wins.

**Rule:** in schema `anyOf` unions, order narrow scalar types (integer, boolean) BEFORE string
branches, and note the reasoning in the schema description.

Also, `useDefaults: true` means shared/`$ref`'d schemas inject their `default:` values into every
consumer's validated objects. Keep shared schemas default-free unless every consumer wants the
default (this is why `waitUntil_v3` carries no defaults while goTo's inline waitUntil keeps its
own).

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

**Cut a stable release:**
- Merge a PR into `main` whose commits include at least one `fix:`, `feat:`, or breaking change (`!`/`BREAKING CHANGE`).
- `release.yml` runs semantic-release, which bumps both packages, publishes to `@latest`, tags, and cuts a GitHub Release.
- Triggers the Docker build downstream once `@latest` has been promoted.

**Cut a prerelease from `next`:**
- Merge to `next` (or push to `next` directly). Same flow, but publishes to the `next` dist-tag as `X.Y.Z-next.N`.

**Cut a per-feature prerelease:**
- Push to a branch matching `feat/**` (any depth, e.g., `feat/new-api` or `feat/team/new-api`). The dist-tag is the slugified + lowercased branch suffix (e.g., `feat/new-api` → `@new-api`, `feat/team/New-API` → `@team-new-api`).
- When the branch is deleted, the dist-tag is cleaned up automatically.

**Preview the next release locally (no publish):**
```bash
GITHUB_TOKEN=... npx semantic-release --dry-run --no-ci
```
Prints the computed version and release notes diff.

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
- ❌ Don't publish manually to npm (semantic-release owns publishing for both packages)
- ❌ Don't edit `version` in `package.json` (root or common) — semantic-release overwrites it during release
- ❌ Don't bump `doc-detective-common` independently — it is always released in lockstep with the root package
- ❌ Don't use non-conventional commit messages — they're blocked locally by husky and on PRs by commitlint
- ❌ Don't create git tags manually — semantic-release cuts `vX.Y.Z` tags
