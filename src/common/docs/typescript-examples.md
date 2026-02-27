# TypeScript Examples

Complete, runnable examples showing how to use `doc-detective-common` with TypeScript.

## Setup

```bash
npm install doc-detective-common
npm install --save-dev typescript @types/node
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

## Example 1: Config Validator

Create a type-safe config validator with helpful error messages.

```typescript
import { validate, readFile, ValidateResult } from 'doc-detective-common';
import * as path from 'path';

interface ConfigValidatorOptions {
  configPath: string;
  allowDefaults?: boolean;
}

interface ConfigValidatorResult {
  success: boolean;
  config?: any;
  errors?: string[];
}

async function validateConfig(
  options: ConfigValidatorOptions
): Promise<ConfigValidatorResult> {
  const { configPath, allowDefaults = true } = options;

  // Read config file
  const content = await readFile({ fileURLOrPath: configPath });

  if (content === null) {
    return {
      success: false,
      errors: [`Config file not found: ${configPath}`]
    };
  }

  if (typeof content === 'string') {
    return {
      success: false,
      errors: ['Config file could not be parsed']
    };
  }

  // Validate against schema
  const result: ValidateResult = validate({
    schemaKey: 'config_v3',
    object: content,
    addDefaults: allowDefaults
  });

  if (!result.valid) {
    return {
      success: false,
      errors: result.errors.split(', ')
    };
  }

  return {
    success: true,
    config: result.object
  };
}

// Usage
async function main() {
  const result = await validateConfig({
    configPath: './doc-detective.config.json',
    allowDefaults: true
  });

  if (result.success) {
    console.log('✓ Config is valid:', result.config);
  } else {
    console.error('✗ Config errors:');
    result.errors?.forEach(err => console.error(`  - ${err}`));
    process.exit(1);
  }
}

main().catch(console.error);
```

## Example 2: Spec File Processor

Load, validate, and resolve paths in spec files.

```typescript
import { 
  validate, 
  readFile, 
  resolvePaths,
  ValidateResult,
  ResolvePathsOptions
} from 'doc-detective-common';
import * as path from 'path';
import * as fs from 'fs/promises';

interface SpecProcessor {
  load(specPath: string): Promise<any>;
  validate(spec: any): ValidateResult;
  resolvePaths(spec: any, basePath: string): Promise<any>;
  process(specPath: string): Promise<any>;
}

class SpecFileProcessor implements SpecProcessor {
  async load(specPath: string): Promise<any> {
    const content = await readFile({ fileURLOrPath: specPath });

    if (content === null) {
      throw new Error(`Spec file not found: ${specPath}`);
    }

    if (typeof content === 'string') {
      throw new Error('Spec file is not valid JSON/YAML');
    }

    return content;
  }

  validate(spec: any): ValidateResult {
    return validate({
      schemaKey: 'spec_v3',
      object: spec,
      addDefaults: true
    });
  }

  async resolvePaths(spec: any, basePath: string): Promise<any> {
    const options: ResolvePathsOptions = {
      config: { relativePathBase: 'file' },
      object: spec,
      filePath: basePath
    };

    return await resolvePaths(options);
  }

  async process(specPath: string): Promise<any> {
    // Load
    const spec = await this.load(specPath);

    // Validate
    const validation = this.validate(spec);
    if (!validation.valid) {
      throw new Error(`Invalid spec: ${validation.errors}`);
    }

    // Resolve paths
    const resolved = await this.resolvePaths(
      validation.object,
      path.dirname(specPath)
    );

    return resolved;
  }
}

// Usage
async function main() {
  const processor = new SpecFileProcessor();

  try {
    const spec = await processor.process('./specs/getting-started.json');
    console.log('✓ Spec processed successfully');
    console.log('Tests:', spec.tests?.length ?? 0);
  } catch (error) {
    if (error instanceof Error) {
      console.error('✗ Error:', error.message);
    }
    process.exit(1);
  }
}

main().catch(console.error);
```

## Example 3: Schema Version Migrator

Automatically upgrade old schema versions to the latest.

```typescript
import { 
  validate, 
  transformToSchemaKey,
  ValidateResult,
  TransformOptions 
} from 'doc-detective-common';

type SchemaVersion = 'v2' | 'v3';

interface MigrationResult {
  migrated: boolean;
  fromVersion?: SchemaVersion;
  toVersion: SchemaVersion;
  object: any;
  errors?: string;
}

class SchemaMigrator {
  private readonly targetVersion: SchemaVersion = 'v3';

  migrateConfig(config: any): MigrationResult {
    return this.migrate('config', config);
  }

  migrateSpec(spec: any): MigrationResult {
    return this.migrate('spec', spec);
  }

  migrateTest(test: any): MigrationResult {
    return this.migrate('test', test);
  }

  private migrate(type: string, object: any): MigrationResult {
    const targetSchema = `${type}_v3`;

    // Check if already v3
    const v3Check: ValidateResult = validate({
      schemaKey: targetSchema,
      object
    });

    if (v3Check.valid) {
      return {
        migrated: false,
        toVersion: 'v3',
        object: v3Check.object
      };
    }

    // Try migrating from v2
    try {
      const options: TransformOptions = {
        currentSchema: `${type}_v2`,
        targetSchema,
        object
      };

      const migrated = transformToSchemaKey(options);

      return {
        migrated: true,
        fromVersion: 'v2',
        toVersion: 'v3',
        object: migrated
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        migrated: false,
        toVersion: 'v3',
        object,
        errors: `Migration failed: ${errorMsg}`
      };
    }
  }
}

// Usage
async function main() {
  const migrator = new SchemaMigrator();

  const oldConfig = {
    envVariables: './vars.json',
    runTests: {
      input: './specs',
      output: './output'
    }
  };

  const result = migrator.migrateConfig(oldConfig);

  if (result.errors) {
    console.error('✗ Migration failed:', result.errors);
    process.exit(1);
  }

  if (result.migrated) {
    console.log(`✓ Migrated from ${result.fromVersion} to ${result.toVersion}`);
  } else {
    console.log('✓ Already latest version');
  }

  console.log('Config:', result.object);
}

main().catch(console.error);
```

## Example 4: Step Validator with Custom Types

Define your own types for specific step types and validate them.

```typescript
import { validate, ValidateResult } from 'doc-detective-common';

// Define your expected step structures
interface GoToStep {
  stepId?: string;
  description?: string;
  goTo: {
    url: string;
    origin?: string;
  };
}

interface FindStep {
  stepId?: string;
  description?: string;
  find: {
    selector: string;
    elementText?: string;
    timeout?: number;
  };
}

type Step = GoToStep | FindStep;

class StepValidator {
  validate(step: unknown): ValidateResult {
    return validate({
      schemaKey: 'step_v3',
      object: step,
      addDefaults: true
    });
  }

  isGoToStep(step: any): step is GoToStep {
    return step.goTo !== undefined;
  }

  isFindStep(step: any): step is FindStep {
    return step.find !== undefined;
  }

  validateAndType(step: unknown): Step {
    const result = this.validate(step);

    if (!result.valid) {
      throw new Error(`Invalid step: ${result.errors}`);
    }

    const validated = result.object;

    if (this.isGoToStep(validated)) {
      return validated as GoToStep;
    }

    if (this.isFindStep(validated)) {
      return validated as FindStep;
    }

    throw new Error('Unknown step type');
  }
}

// Usage
function main() {
  const validator = new StepValidator();

  const steps = [
    { goTo: { url: 'https://example.com' } },
    { find: { selector: '#login-button' } }
  ];

  for (const step of steps) {
    try {
      const validated = validator.validateAndType(step);

      if (validator.isGoToStep(validated)) {
        console.log('Navigate to:', validated.goTo.url);
      } else if (validator.isFindStep(validated)) {
        console.log('Find element:', validated.find.selector);
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error:', error.message);
      }
    }
  }
}

main();
```

## Example 5: Batch File Processor

Process multiple spec files with progress reporting.

```typescript
import {
  validate,
  readFile,
  resolvePaths,
  ValidateResult
} from 'doc-detective-common';
import * as fs from 'fs/promises';
import * as path from 'path';

interface ProcessingResult {
  file: string;
  success: boolean;
  error?: string;
}

interface BatchProcessorOptions {
  inputDir: string;
  outputDir: string;
  recursive?: boolean;
}

class BatchSpecProcessor {
  private results: ProcessingResult[] = [];

  async process(options: BatchProcessorOptions): Promise<ProcessingResult[]> {
    const { inputDir, outputDir, recursive = false } = options;

    // Find all spec files
    const files = await this.findSpecFiles(inputDir, recursive);
    console.log(`Found ${files.length} spec files`);

    // Process each file
    for (const file of files) {
      await this.processFile(file, inputDir, outputDir);
    }

    return this.results;
  }

  private async findSpecFiles(
    dir: string,
    recursive: boolean
  ): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && recursive) {
        const subFiles = await this.findSpecFiles(fullPath, recursive);
        files.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private async processFile(
    filePath: string,
    inputDir: string,
    outputDir: string
  ): Promise<void> {
    try {
      // Load file
      const content = await readFile({ fileURLOrPath: filePath });

      if (content === null || typeof content === 'string') {
        throw new Error('Could not parse spec file');
      }

      // Validate
      const result: ValidateResult = validate({
        schemaKey: 'spec_v3',
        object: content,
        addDefaults: true
      });

      if (!result.valid) {
        throw new Error(result.errors);
      }

      // Resolve paths
      const resolved = await resolvePaths({
        config: { relativePathBase: 'file' },
        object: result.object,
        filePath
      });

      // Save to output directory
      const relativePath = path.relative(inputDir, filePath);
      const outputPath = path.join(outputDir, relativePath);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, JSON.stringify(resolved, null, 2));

      this.results.push({
        file: relativePath,
        success: true
      });

      console.log(`✓ ${relativePath}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.results.push({
        file: path.relative(inputDir, filePath),
        success: false,
        error: errorMsg
      });

      console.error(`✗ ${path.relative(inputDir, filePath)}: ${errorMsg}`);
    }
  }

  printSummary(): void {
    const successful = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;

    console.log('\n--- Summary ---');
    console.log(`Total: ${this.results.length}`);
    console.log(`Success: ${successful}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) {
      console.log('\nFailed files:');
      this.results
        .filter(r => !r.success)
        .forEach(r => console.log(`  - ${r.file}: ${r.error}`));
    }
  }
}

// Usage
async function main() {
  const processor = new BatchSpecProcessor();

  const results = await processor.process({
    inputDir: './specs',
    outputDir: './processed',
    recursive: true
  });

  processor.printSummary();

  const failed = results.filter(r => !r.success).length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
```

## Running the Examples

1. Save any example to a `.ts` file (e.g., `config-validator.ts`)
2. Compile: `npx tsc config-validator.ts`
3. Run: `node config-validator.js`

Or use `ts-node` for direct execution:
```bash
npm install --save-dev ts-node
npx ts-node config-validator.ts
```

## More Examples

See the [test files](../test/) for more usage patterns and edge cases.
