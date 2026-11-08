# Doc Detective Common

Shared components for Doc Detective projects.

## 📦 Installation

```bash
# Install stable version
npm install doc-detective-common

# Install the prerelease from the `next` branch
npm install doc-detective-common@next
```

## 🚀 Releases

This package publishes in lockstep with `doc-detective`, at the same version and dist-tags. `main` publishes `latest`, `next` publishes `next`, and each `feat/**` branch publishes its own tag.

## 📚 API

This package exports the following components:

- `schemas` - JSON schemas for validation
- `validate` - Validation functions
- `transformToSchemaKey` - Schema key transformation
- `detectTests` - Test detection utilities

### TypeScript Support

Full TypeScript support with exported types:

```typescript
import {
  validate,
  ValidateOptions,
  ValidateResult,
  schemas,
  SchemaKey
} from 'doc-detective-common';
```

**Documentation:**
- [TypeScript Migration Guide](./docs/typescript-migration.md) - Complete guide for TypeScript users
- [TypeScript Examples](./docs/typescript-examples.md) - Runnable code examples

### JavaScript Usage

Works seamlessly with JavaScript (CommonJS or ESM):

```javascript
// CommonJS
const { validate, schemas } = require('doc-detective-common');

// ESM
import { validate, schemas } from 'doc-detective-common';
```

## 🧪 Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build schemas
npm run build
```

## 📄 License

AGPL-3.0-only
