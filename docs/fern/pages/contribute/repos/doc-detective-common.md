---
title: doc-detective-common
---

[`doc-detective-common`](https://github.com/doc-detective/doc-detective/tree/main/src/common) is an NPM package that contains shared schemas and logic used across Doc Detective repos, including the JSON schemas that define each test action. It's installable via NPM (`npm i doc-detective-common`) or with the dev tag for the latest changes (`npm i doc-detective-common@dev`).

The source code lives in the [`doc-detective`](https://github.com/doc-detective/doc-detective) monorepo under `src/common/`, but the package is still published independently to NPM.

## What's included

The package exports:

- **`schemas`**: JSON schemas that define Doc Detective test actions and configurations
- **`validate`**: Validate objects against Doc Detective schemas
- **`detectTests`**: Detect and extract test specifications from documentation files
- **`defaultFileTypes`**: Pre-configured file type definitions for Markdown, AsciiDoc, HTML, and DITA
- **`FileType`**: TypeScript interface for file type configuration

## TypeScript types

The package exports TypeScript types generated from the JSON schemas:

```typescript
import type { Specification, Test, Step, Context, Config, Report } from 'doc-detective-common';
```

- **`Specification`**: A specification file containing tests
- **`Test`**: An individual test with steps
- **`Step`**: A single action within a test
- **`Context`**: Runtime context for test execution
- **`Config`**: Configuration options
- **`Report`**: Test execution results

## Usage example

```typescript
import { schemas, validate, detectTests } from 'doc-detective-common';

// Access schema definitions
const clickSchema = schemas.click;

// Validate a test action
const result = validate(myAction, 'click');

// Detect tests from content (file type auto-detected)
const tests = await detectTests({ content: markdownContent });

// Or specify file path for extension-based detection
const tests = await detectTests({ content, filePath: './docs/tutorial.md' });
```

## File type detection

`detectTests` determines the file type automatically. Doc Detective checks the file extension first, then analyzes the content to detect DITA XML, HTML, or AsciiDoc markers before defaulting to Markdown.

```typescript
import { defaultFileTypes } from 'doc-detective-common';

// Access built-in file type configurations
const markdownConfig = defaultFileTypes.markdown;
const ditaConfig = defaultFileTypes.dita;
```

## Location tracking

Detected steps include location metadata identifying where each step was found:

- **`step.location.line`**: 1-indexed line number
- **`step.location.startIndex`**: Character offset where the match begins
- **`step.location.endIndex`**: Character offset where the match ends

Tests also include a `contentPath` property with the source file path when available.

For detailed usage and migration information, see the [package documentation](https://github.com/doc-detective/doc-detective/tree/main/src/common).

This package doesn't depend on any other Doc Detective packages.
