# AGENTS.md

This file provides guidance to AI agents when working with this repository.

## Project overview

Doc Detective is a documentation testing framework. It ingests test specs from Markdown/JSON/YAML files, parses testable actions from documentation content, executes them in a browser environment, and returns pass/fail JSON results for CI/CD integration.

### Monorepo structure

This is an npm workspace monorepo with multiple packages:

- **Root** (`doc-detective`): CLI + core test execution engine
- **`src/common`** (`doc-detective-common`): shared validation/parsing library, published independently to npm. For work in `src/common/`, see `src/common/AGENTS.md`
- **`docs/`**: project documentation site, built with Fern. For work in `docs/`, see `docs/AGENTS.md`

### Other directories

- **`.claude/skills/`**: Reusable AI agent skills, for projects across the entire monorepo

## Architecture

Information specific to Doc Detective as a software project.

### Data Flow

```
Config file (.doc-detective.json/yaml) → setConfig()
  → detectTests()   [find & parse test files via common package]
  → resolveTests()  [expand contexts/browsers, resolve paths]
  → runSpecs()      [execute via WebdriverIO/Appium]
  → JSON results output
```

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Specification** | Group of tests from one document file |
| **Test** | Sequence of steps |
| **Step** | Single action (click, type, navigate, etc.) |
| **Context** | Platform + browser combination |

## Testing

- Framework: Mocha; setup/teardown lives in `test/hooks.js` (required — see `.mocharc.yml`)
- Common package enforces **100% test coverage** via c8; thresholds in `src/common/coverage-thresholds.json` can only increase, never decrease

## CI/CD

- **Every push to `main`**: Auto dev release published to npm — do not bump `package.json` versions manually in PRs, it will conflict
- **GitHub Release**: Triggers full test matrix (ubuntu/windows/macos × node 18/20/22/24), security scan, npm stable publish, downstream repo dispatch
- **Skip CI**: Add `[skip ci]` to commit message to prevent auto dev release
