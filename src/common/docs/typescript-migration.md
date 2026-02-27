# TypeScript Migration Guide

This guide helps downstream consumers migrate to the TypeScript version of `doc-detective-common` and leverage the new type definitions.

## Table of Contents

- [Breaking Changes](#breaking-changes)
- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Available Types](#available-types)
- [Common Patterns](#common-patterns)
- [Generated Schema Types](#generated-schema-types)
- [Migration Examples](#migration-examples)

## Breaking Changes

**None!** The TypeScript migration is 100% backward compatible. Existing JavaScript code continues to work without modifications.

## Installation

No changes needed. The package works the same way:

```bash
npm install doc-detective-common
```

## Basic Usage

### JavaScript (Unchanged)

```javascript
const { validate, schemas, resolvePaths, readFile } = require('doc-detective-common');

// Use as before
const result = validate({
  schemaKey: 'step_v3',
  object: { goTo: { url: 'https://example.com' } }
});
```

### TypeScript (New)

```typescript
import { 
  validate, 
  schemas, 
  resolvePaths, 
  readFile,
  ValidateOptions,
  ValidateResult,
  ResolvePathsOptions,
  ReadFileOptions
} from 'doc-detective-common';

// Now with full type safety
const options: ValidateOptions = {
  schemaKey: 'step_v3',
  object: { goTo: { url: 'https://example.com' } }
};

const result: ValidateResult = validate(options);
if (result.valid) {
  console.log('Valid!', result.object);
} else {
  console.error('Invalid:', result.errors);
}
```

### ESM Support (New)

```javascript
import { validate, schemas } from 'doc-detective-common';

// Works in ESM modules now
```

## Available Types

### Core Function Types

#### `validate()`

```typescript
import { ValidateOptions, ValidateResult } from 'doc-detective-common';

interface ValidateOptions {
  schemaKey: string;
  object: any;
  addDefaults?: boolean;
}

interface ValidateResult {
  valid: boolean;
  errors: string;
  object: any;
}
```

**Example:**
```typescript
import { validate, ValidateOptions, ValidateResult } from 'doc-detective-common';

const options: ValidateOptions = {
  schemaKey: 'config_v3',
  object: {
    input: './specs',
    output: './output'
  },
  addDefaults: true
};

const result: ValidateResult = validate(options);
```

#### `transformToSchemaKey()`

```typescript
import { TransformOptions } from 'doc-detective-common';

interface TransformOptions {
  currentSchema: string;
  targetSchema: string;
  object: any;
}
```

**Example:**
```typescript
import { transformToSchemaKey, TransformOptions } from 'doc-detective-common';

const options: TransformOptions = {
  currentSchema: 'config_v2',
  targetSchema: 'config_v3',
  object: { /* v2 config */ }
};

const upgraded = transformToSchemaKey(options);
```

#### `resolvePaths()`

```typescript
import { ResolvePathsOptions } from 'doc-detective-common';

interface ResolvePathsOptions {
  config: { relativePathBase: 'file' | 'cwd' };
  object: Record<string, any>;
  filePath: string;
  nested?: boolean;
  objectType?: 'config' | 'spec';
}
```

**Example:**
```typescript
import { resolvePaths, ResolvePathsOptions } from 'doc-detective-common';

const options: ResolvePathsOptions = {
  config: { relativePathBase: 'file' },
  object: {
    tests: [{
      steps: [{
        screenshot: { path: './screenshot.png' }
      }]
    }]
  },
  filePath: '/path/to/spec.json'
};

const resolved = await resolvePaths(options);
```

#### `readFile()`

```typescript
import { ReadFileOptions } from 'doc-detective-common';

interface ReadFileOptions {
  fileURLOrPath: string;
}
```

**Example:**
```typescript
import { readFile, ReadFileOptions } from 'doc-detective-common';

const options: ReadFileOptions = {
  fileURLOrPath: './config.yaml'
};

const content: unknown | string | null = await readFile(options);

// Type narrowing
if (content !== null) {
  if (typeof content === 'string') {
    console.log('Raw content:', content);
  } else {
    console.log('Parsed object:', content);
  }
}
```

### Schema Types

```typescript
import { SchemaKey, Schema } from 'doc-detective-common';

type SchemaKey = 
  | 'step_v3'
  | 'config_v3'
  | 'spec_v3'
  | 'test_v3'
  | 'context_v3'
  | 'checkLink_v3'
  | 'click_v3'
  // ... and 40+ more schema keys

type Schema = any; // JSON Schema definition
```

**Example:**
```typescript
import { schemas, SchemaKey } from 'doc-detective-common';

function validateAgainstSchema(key: SchemaKey, data: any) {
  const schema = schemas[key];
  // schema is properly typed
}
```

## Common Patterns

### Pattern 1: Validating User Input

```typescript
import { validate, ValidateResult } from 'doc-detective-common';

function validateStep(stepData: unknown): ValidateResult {
  return validate({
    schemaKey: 'step_v3',
    object: stepData,
    addDefaults: true
  });
}

// Usage
const result = validateStep({ goTo: { url: 'https://example.com' } });
if (!result.valid) {
  throw new Error(`Invalid step: ${result.errors}`);
}
```

### Pattern 2: Type-Safe Config Loading

```typescript
import { readFile, validate } from 'doc-detective-common';

async function loadConfig(path: string) {
  const content = await readFile({ fileURLOrPath: path });
  
  if (content === null) {
    throw new Error(`Failed to read config from ${path}`);
  }

  const result = validate({
    schemaKey: 'config_v3',
    object: content,
    addDefaults: true
  });

  if (!result.valid) {
    throw new Error(`Invalid config: ${result.errors}`);
  }

  return result.object;
}
```

### Pattern 3: Path Resolution with Type Safety

```typescript
import { resolvePaths, ResolvePathsOptions } from 'doc-detective-common';

async function processSpec(spec: any, specPath: string) {
  const options: ResolvePathsOptions = {
    config: { relativePathBase: 'file' },
    object: spec,
    filePath: specPath
  };

  return await resolvePaths(options);
}
```

### Pattern 4: Schema Version Upgrade

```typescript
import { transformToSchemaKey, validate } from 'doc-detective-common';

function upgradeConfig(oldConfig: any) {
  // First check if it's already v3
  const v3Check = validate({
    schemaKey: 'config_v3',
    object: oldConfig
  });

  if (v3Check.valid) {
    return oldConfig;
  }

  // Try to upgrade from v2
  try {
    return transformToSchemaKey({
      currentSchema: 'config_v2',
      targetSchema: 'config_v3',
      object: oldConfig
    });
  } catch (error) {
    throw new Error('Config is neither v2 nor v3 format');
  }
}
```

## Generated Schema Types

The package auto-generates TypeScript interfaces for all v3 schemas. These are available in the compiled output:

```typescript
// Note: These types are in dist/types/generated/ but not exported from main package
// They're primarily for internal use. Use validation at runtime instead.
```

### Why Not Export Schema Types?

The generated types from JSON schemas are extensive (26 files with many nested types) and have naming collisions. Instead, we recommend:

1. **Runtime validation** with `validate()` - More flexible and handles schema evolution
2. **Type assertions** when you know the shape:

```typescript
import { validate } from 'doc-detective-common';

interface MyStep {
  stepId?: string;
  description?: string;
  goTo?: {
    url: string;
    origin?: string;
  };
}

function processStep(step: MyStep) {
  // Validate at runtime
  const result = validate({
    schemaKey: 'step_v3',
    object: step
  });

  if (!result.valid) {
    throw new Error(result.errors);
  }

  // Now you can work with validated data
  return result.object as MyStep;
}
```

## Migration Examples

### Example 1: Simple JavaScript to TypeScript

**Before (JavaScript):**
```javascript
const { validate } = require('doc-detective-common');

function checkStep(step) {
  const result = validate({
    schemaKey: 'step_v3',
    object: step
  });
  return result.valid;
}
```

**After (TypeScript):**
```typescript
import { validate, ValidateOptions, ValidateResult } from 'doc-detective-common';

function checkStep(step: unknown): boolean {
  const options: ValidateOptions = {
    schemaKey: 'step_v3',
    object: step
  };
  
  const result: ValidateResult = validate(options);
  return result.valid;
}
```

### Example 2: File Reading with Type Guards

**Before (JavaScript):**
```javascript
const { readFile } = require('doc-detective-common');

async function loadSpec(path) {
  const content = await readFile({ fileURLOrPath: path });
  if (content) {
    return content;
  }
  throw new Error('Failed to load');
}
```

**After (TypeScript):**
```typescript
import { readFile, ReadFileOptions } from 'doc-detective-common';

async function loadSpec(path: string): Promise<unknown> {
  const options: ReadFileOptions = { fileURLOrPath: path };
  const content = await readFile(options);
  
  if (content === null) {
    throw new Error('Failed to load');
  }
  
  return content;
}
```

### Example 3: Schema Transformation with Error Handling

**Before (JavaScript):**
```javascript
const { transformToSchemaKey } = require('doc-detective-common');

function upgrade(config) {
  try {
    return transformToSchemaKey({
      currentSchema: 'config_v2',
      targetSchema: 'config_v3',
      object: config
    });
  } catch (err) {
    console.error(err.message);
    return null;
  }
}
```

**After (TypeScript):**
```typescript
import { transformToSchemaKey, TransformOptions } from 'doc-detective-common';

function upgrade(config: unknown): unknown | null {
  const options: TransformOptions = {
    currentSchema: 'config_v2',
    targetSchema: 'config_v3',
    object: config
  };

  try {
    return transformToSchemaKey(options);
  } catch (err) {
    if (err instanceof Error) {
      console.error(err.message);
    }
    return null;
  }
}
```

## Best Practices

### 1. Always Validate User Input

```typescript
import { validate } from 'doc-detective-common';

function processUserConfig(userInput: unknown) {
  const result = validate({
    schemaKey: 'config_v3',
    object: userInput,
    addDefaults: true
  });

  if (!result.valid) {
    throw new Error(`Invalid config: ${result.errors}`);
  }

  // Now safe to use
  return result.object;
}
```

### 2. Use Type Narrowing for File Content

```typescript
import { readFile } from 'doc-detective-common';

async function loadYaml(path: string) {
  const content = await readFile({ fileURLOrPath: path });

  // Type narrowing
  if (content === null) {
    throw new Error('File not found');
  }

  if (typeof content === 'string') {
    throw new Error('Failed to parse YAML');
  }

  // Now content is 'unknown' (parsed object)
  return content;
}
```

### 3. Combine Validation with Type Assertions

```typescript
import { validate } from 'doc-detective-common';

interface ExpectedConfig {
  input: string;
  output: string;
}

function loadConfig(data: unknown): ExpectedConfig {
  const result = validate({
    schemaKey: 'config_v3',
    object: data
  });

  if (!result.valid) {
    throw new Error(result.errors);
  }

  // Safe to assert after validation
  return result.object as ExpectedConfig;
}
```

### 4. Handle Async Operations Properly

```typescript
import { resolvePaths, readFile } from 'doc-detective-common';

async function processSpecFile(path: string) {
  // Load file
  const content = await readFile({ fileURLOrPath: path });
  
  if (content === null || typeof content === 'string') {
    throw new Error('Invalid spec file');
  }

  // Resolve paths
  const resolved = await resolvePaths({
    config: { relativePathBase: 'file' },
    object: content,
    filePath: path
  });

  return resolved;
}
```

## Need Help?

- **Issues**: Report bugs or request features at [GitHub Issues](https://github.com/doc-detective/doc-detective-common/issues)
- **Discussions**: Ask questions at [GitHub Discussions](https://github.com/doc-detective/doc-detective-common/discussions)
- **Documentation**: See main [README.md](../README.md) for general usage

## Version Compatibility

| Version | TypeScript Support | Module Systems |
|---------|-------------------|----------------|
| < 4.0   | No (JavaScript only) | CommonJS |
| >= 4.0  | Yes (Full types) | CommonJS + ESM |

Your existing code continues to work without changes!
