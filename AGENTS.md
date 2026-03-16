# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## What This Project Does

Doc Detective is a documentation testing framework. It ingests test specs from Markdown/JSON/YAML files, parses testable actions from documentation content, executes those actions in a browser environment, and returns pass/fail JSON results for CI/CD integration.

## Monorepo Structure

This is an npm workspace monorepo with two packages:

- **Root** (`doc-detective`): CLI + core test execution engine
- **`src/common`** (`doc-detective-common`): Shared validation/parsing library, published independently to npm

**For work in `src/common/`**, see `src/common/AGENTS.md` — it has complete guidelines including TDD requirements, schema architecture, and anti-patterns specific to that package.

## Commands

### Root Package

```bash
npm run build          # Full build: build:common + TypeScript compile + copy schemas
npm run compile        # TypeScript compile + CJS wrapper creation
npm test               # Run all tests (mocha + common tests)
npm run mocha          # Run mocha directly
npm start              # Run the CLI
npm run dev            # Dev mode
```

### Run a Single Test File

```bash
npx mocha test/exports.test.js
npx mocha test/core-core.test.js --grep "test name pattern"
```

### Common Package (from `src/common/`)

```bash
npm test                         # Run tests
npm run test:coverage            # Tests + coverage report
npm run test:coverage:ratchet    # Verify coverage baseline (CI-enforced)
npm run build                    # Full build: dereference schemas + generate types + compile
```

## Architecture

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

### Key Source Files

| File | Purpose |
|------|---------|
| `src/cli.ts` | CLI entry point — parses argv, loads config, calls `runTests()` |
| `src/core/index.ts` | Main exports and `runTests()` orchestration |
| `src/core/detectTests.ts` | File discovery (glob), reads files, calls common's `detectTests()` |
| `src/core/resolveTests.ts` | Expands contexts, resolves paths, returns `ResolvedTests` |
| `src/core/tests.ts` | Executes test specs against browser driver |
| `src/core/config.ts` | Configuration normalization (`setConfig()`) |
| `src/core/tests/` | Individual action implementations (click, goTo, httpRequest, etc.) |
| `src/utils.ts` | Shared utilities (~33KB) |
| `src/common/` | See `src/common/AGENTS.md` |

### Actions (20+ types)

Implemented in `src/core/tests/`: `checkLink`, `click`, `dragAndDrop`, `findElement`, `goTo`, `httpRequest`, `loadCookie`, `loadVariables`, `runCode`, `runShell`, `saveCookie`, `saveScreenshot`, `startRecording`, `stopRecording`, `typeKeys`.

### Drivers

- **WebdriverIO**: Chrome, Firefox
- **Appium**: Safari, mobile browsers
- Driver initialization happens per-context in `src/core/tests.ts`

## TypeScript & Build

- ESM module (`"type": "module"` in package.json)
- TypeScript target: ES2022, `NodeNext` modules, strict mode
- Output: `dist/` (both ESM and CJS wrappers via `scripts/createCjsWrapper.js`)
- `src/common/` is excluded from root `tsconfig.json` — it has its own

## Testing

- Framework: Mocha + (presumably Chai/assert)
- Root test files: `test/*.test.js`
- Mocha requires `test/hooks.js` for setup/teardown (see `.mocharc.yml`)
- Common package enforces **100% test coverage** via c8; thresholds in `src/common/coverage-thresholds.json` can only increase

## CI/CD

- **Every push to `main`**: Auto dev release published to npm (e.g., `4.0.0-dev.3`) — do not bump `package.json` versions manually in PRs, it conflicts
- **GitHub Release**: Triggers full test matrix (ubuntu/windows/macos × node 18/20/22/24), ReversingLabs security scan, npm stable publish, downstream repo dispatch
- **Skip CI**: Add `[skip ci]` to commit message to prevent auto dev release

## Configuration

Doc Detective reads `.doc-detective.json` (or `.yaml`/`.yml`) from the working directory. Key config fields: `input` (file patterns), `output` (results path), `contexts` (browser targets), `beforeAny`/`afterAll` (setup/teardown steps).
