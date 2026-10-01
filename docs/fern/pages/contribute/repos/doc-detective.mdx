---
title: "doc-detective"
---

[`doc-detective`](https://github.com/doc-detective/doc-detective) is an NPM-based CLI tool that performs tests. It's installable via NPM (`npm i -g doc-detective`) and directly runnable without installation via NPX (`npx doc-detective`).

This monorepo contains:

- The main CLI tool
- [`doc-detective-common`](doc-detective-common): JSON schema definitions, schema validation logic, and path resolution logic (located in `src/common/`)

This repo depends on [`doc-detective-core`](doc-detective-core) for the primary testing logic.

## Commit conventions

All commits to this repository must follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<optional scope>): <subject>

<optional body>

<optional footers>
```

A husky commit-msg hook validates commit messages locally, and GitHub Actions validates them on pull requests. Non-conforming commits are rejected.

### Commit types and version bumps

| Commit type | Version bump |
|---|---|
| `fix:` | patch (X.Y.**Z+1**) |
| `feat:` | minor (X.**Y+1**.0) |
| `feat!:` or `BREAKING CHANGE:` footer | major (**X+1**.0.0) |
| `chore:`, `docs:`, `ci:`, `style:`, `test:`, `refactor:`, `build:`, `perf:` | no release |

### Examples

```
fix(parser): handle empty input gracefully
feat(actions): add screenshot cropping support
feat!: remove deprecated --legacy flag

BREAKING CHANGE: The --legacy flag is no longer supported.
```

## Release channels

Doc Detective uses semantic-release with multiple npm dist-tags:

| Branch | npm dist-tag | Install command |
|---|---|---|
| `main` | `@latest` | `npm i doc-detective` |
| `next` | `@next` | `npm i doc-detective@next` |
| `feat/<slug>` | `@<slug>` | `npm i doc-detective@<slug>` |

Stable releases come from `main`. Pre-release versions come from `next` when that branch exists. Feature branches (`feat/*`) publish ephemeral pre-releases that are automatically cleaned up when the branch is deleted.
