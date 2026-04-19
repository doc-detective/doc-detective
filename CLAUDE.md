# Claude Code Configuration

Repo-wide guidance for AI agents. Package-specific rules for `doc-detective-common` live in [src/common/AGENTS.md](src/common/AGENTS.md).

## Commit messages (required)

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/). This is enforced locally by a husky `commit-msg` hook and on PRs by [.github/workflows/commitlint.yml](.github/workflows/commitlint.yml). Non-conforming commits are rejected.

**Format:**
```
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
| `feat/<slug>` | `<slug>` | `npm i doc-detective@<slug>` |

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

## Related files

- [.releaserc.json](.releaserc.json) — semantic-release config (branches + plugins)
- [commitlint.config.cjs](commitlint.config.cjs) — commitlint rules
- [.husky/commit-msg](.husky/commit-msg) — local hook
- [.github/workflows/release.yml](.github/workflows/release.yml) — release pipeline
- [.github/workflows/commitlint.yml](.github/workflows/commitlint.yml) — PR enforcement
- [.github/workflows/cleanup-dist-tag.yml](.github/workflows/cleanup-dist-tag.yml) — auto-remove `feat/*` dist-tags on branch delete
- [.github/workflows/npm-test.yaml](.github/workflows/npm-test.yaml) — matrix tests + post-release Docker/downstream jobs
