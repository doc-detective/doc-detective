# Claude Code Configuration

Repo-wide guidance for AI agents. Package-specific rules for `doc-detective-common` live in [src/common/AGENTS.md](src/common/AGENTS.md).

## Commit messages (required)

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/). This is enforced locally by a husky `commit-msg` hook and on PRs by [.github/workflows/commitlint.yml](.github/workflows/commitlint.yml). Non-conforming commits are rejected.

**Format:**
```text
<type>(<optional scope>): <subject>

<optional body>

<optional footers>
```

**Types** (from `@commitlint/config-conventional`): `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

**Breaking changes:** append `!` after the type/scope (e.g., `refactor(agents)!: ...`) or include a `BREAKING CHANGE:` footer.

**Examples from this repo's history:**
- `fix(screenshot): shift-rather-than-shrink crop clamp`
- `feat: add install-agents CLI subcommand`
- `refactor(agents)!: rename agent ids to bare names`
- `ci: start local test server for Test GitHub Action job`

## How version selection works

Versions and releases are fully automated by **semantic-release** based on commit types:

| Commit type | Version bump |
|---|---|
| `fix:` | patch (X.Y.**Z+1**) |
| `feat:` | minor (X.**Y+1**.0) |
| `feat!:` / `BREAKING CHANGE:` | major (**X+1**.0.0) |
| `chore:`, `docs:`, `ci:`, `style:`, `test:`, `refactor:`, `build:`, `perf:` | no release |

Pick the commit type deliberately — it is the **only** signal that decides whether (and how) a release is cut.

## Release channels

| Branch | npm dist-tag | Install |
|---|---|---|
| `main` | `latest` | `npm i doc-detective` |
| `next` | `next` | `npm i doc-detective@next` |
| `feat/**` (any depth) | `<slug>` (lowercased branch suffix, non-alphanumeric → `-`) | `npm i doc-detective@<slug>` |

Both `doc-detective` and `doc-detective-common` are **always published in lockstep** at the same version. Never edit a `version` field in either `package.json` — [scripts/sync-common-version.js](scripts/sync-common-version.js) and semantic-release manage it.

## Don't

- Don't hand-edit `version` in any `package.json`.
- Don't create git tags manually (`v*` is owned by semantic-release).
- Don't run `npm publish` locally.
- Don't use `--no-verify` on commits to skip the commit-msg hook.
- Don't add commitizen, standard-version, release-please, or changesets — they conflict with semantic-release.

## Useful commands

```bash
# Preview what the next release would be (no publish, no push)
GITHUB_TOKEN=... npx semantic-release --dry-run --no-ci

# Run the commit-msg check manually against the last commit
npx commitlint --from HEAD~1 --to HEAD --verbose
```

## CLI flags ↔ config (required pattern)

Every user-facing knob flows through the merged `config` object. CLI flags do **not** bypass it — they override it. Runtime code (runner, reporters, integrations) reads from `config` only, never from `args`. This is what lets config files and `DOC_DETECTIVE_CONFIG` reach the same code paths the CLI does.

The wiring lives in [src/utils.ts](src/utils.ts):

- `buildYargs()` declares the flag.
- `setConfig()` runs file config + env config through AJV (`config_v3`) **first**, then overlays CLI overrides on top of the validated object.

### Adding a new flag

1. **Schema first.** Add the field to [src/common/src/schemas/src_schemas/config_v3.schema.json](src/common/src/schemas/src_schemas/config_v3.schema.json) using the same camelCase name as the config key. Run `npm run build:common` to regenerate types and output schemas. Add a positive + negative case to [src/common/test/validate.test.js](src/common/test/validate.test.js).
2. **Yargs flag.** Add `.option("flagName", { alias: "x", type: "string", description: "…" })` in `buildYargs()`.
3. **Override block.** Add a single `if (typeof args.flagName === "string" && args.flagName.length > 0) { config.flagName = …; }` block in `setConfig()`, after the existing overrides. Don't `process.exit` from here and don't validate — schema validation runs upstream.
4. **Runtime helper.** Put any parsing / regex compilation / list-splitting in a small pure helper in [src/core/utils.ts](src/core/utils.ts) (e.g. `compileFilter`, `appendQueryParams`). Keeps `setConfig` boring and the logic unit-testable without the runner.
5. **Read from `config.flagName`** at the consumption site. Never reach back into `args`.

### Multi-value flags (`--input`, `--test`, `--spec`)

- **Schema**: `type: "array", items: { type: "string", minLength: 1, pattern: "\\S" }`. The `\\S` blocks whitespace-only entries that would otherwise compile into accidentally-matching regexes.
- **Yargs**: `type: "string"` (a single comma-separated value). Not `type: "array"` — the comma split lives in `setConfig` so file/env users land on the same array shape.
- **`setConfig` override**: split on `,`, trim each, drop empties, store as `string[]`. Mirror the `--input` block.
- **Runtime helper**: defense-in-depth — also trim/drop empty entries inside the helper, since env/CLI paths could in theory bypass AJV.

### Order of precedence (memorize)

```
file config + DOC_DETECTIVE_CONFIG  →  AJV validate (config_v3)  →  CLI override  →  runtime
```

### TDD cycle per flag

Each step is its own red→green:

1. Yargs parse test (`setArgs(["node","x","--flag","v"]).flag === "v"`).
2. `setConfig` override test (`config.flagName` deep-equals the expected shape).
3. Schema test (positive + a negative for malformed values).
4. Runtime-helper unit test (pure, no driver / HTTP).
5. Integration: wire the helper into the runner, with an empty-result short-circuit test.

See [PR #286](https://github.com/doc-detective/doc-detective/pull/286) (`--test` / `--spec` filters) for a worked example covering all five.

### Don't

- ❌ Don't read `args.foo` from runner / reporter code — read `config.foo`.
- ❌ Don't validate or compile regexes inside `setConfig` — defer to a runtime helper.
- ❌ Don't use yargs `array: true` for comma-list flags — keep the split in `setConfig`.
- ❌ Don't skip schema-side defenses (`pattern`, `minLength`) and rely on the runtime helper alone — the schema is the only contract config-file users see.

## Related files

- [.releaserc.json](.releaserc.json) — semantic-release config (branches + plugins)
- [commitlint.config.cjs](commitlint.config.cjs) — commitlint rules
- [.husky/commit-msg](.husky/commit-msg) — local hook
- [.github/workflows/release.yml](.github/workflows/release.yml) — release pipeline
- [.github/workflows/commitlint.yml](.github/workflows/commitlint.yml) — PR enforcement
- [.github/workflows/cleanup-dist-tag.yml](.github/workflows/cleanup-dist-tag.yml) — auto-remove `feat/**` dist-tags on branch delete
- [.github/workflows/npm-test.yaml](.github/workflows/npm-test.yaml) — matrix tests + post-release Docker/downstream jobs
