/**
 * Schema utilities for the interactive test builder (ESM version)
 * Extracts field definitions, enums, patterns, and validation requirements
 * from doc-detective-common JSON schemas
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { schemas, validate } = require('doc-detective-common');

/**
 * Get all available step types from the step schema
 * @returns {string[]} Array of step type names
 */
export function getStepTypes() {
  const stepSchema = schemas.step_v3;
  return stepSchema.anyOf
    .map((option) => {
      const required = option.allOf?.[1]?.required;
      return required ? required[0] : null;
    })
    .filter(Boolean)
    .sort();
}

/**
 * Get the schema for a specific step type
 * @param {string} stepType - The step type (e.g., 'goTo', 'click')
 * @returns {Object|null} The schema for the step type
 */
export function getStepTypeSchema(stepType) {
  const schemaKey = `${stepType}_v3`;
  return schemas[schemaKey] || null;
}

/**
 * Get the common properties shared by all steps
 * @returns {Object} Common step properties schema
 */
export function getCommonStepProperties() {
  const stepSchema = schemas.step_v3;
  return stepSchema.components?.schemas?.common?.properties || {};
}

/**
 * Get the anyOf variants for a step type (e.g., "simple" vs "detailed")
 * @param {string} stepType - The step type
 * @returns {Array<{index: number, title: string, type: string, description: string, schema: Object}>}
 */
export function getStepTypeVariants(stepType) {
  const schema = getStepTypeSchema(stepType);
  if (!schema || !schema.anyOf) {
    return [];
  }

  return schema.anyOf.map((opt, index) => ({
    index,
    title: opt.title || opt.description || `Variant ${index + 1}`,
    type: opt.type || 'object',
    description: opt.description || '',
    schema: opt,
  }));
}

/**
 * Get the anyOf variants for a field property
 * @param {Object} prop - The property schema
 * @returns {Array<{index: number, title: string, type: string, description: string, schema: Object}>}
 */
export function getFieldVariants(prop) {
  if (!prop || !prop.anyOf) {
    return [];
  }

  return prop.anyOf.map((opt, index) => ({
    index,
    title: opt.title || opt.type || `Variant ${index + 1}`,
    type: opt.type || 'object',
    description: opt.description || '',
    schema: opt,
  }));
}

/**
 * Determine which anyOf variant a value matches
 * @param {any} value - The current value
 * @param {Array} variants - The anyOf variants
 * @returns {number} The index of the matching variant, or 0 if no match
 */
export function detectVariantIndex(value, variants) {
  if (variants.length === 0) {
    return 0;
  }

  // Handle null first (before checking undefined)
  if (value === null) {
    for (let i = 0; i < variants.length; i++) {
      if (variants[i].type === 'null') {
        return i;
      }
    }
    return 0;
  }

  if (value === undefined) {
    return 0;
  }

  const valueType = typeof value;

  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    if (variant.type === valueType) {
      return i;
    }
    // Handle integer (typeof returns 'number')
    if (variant.type === 'integer' && valueType === 'number' && Number.isInteger(value)) {
      return i;
    }
  }

  return 0;
}

/**
 * Extract field information from a schema property
 * @param {Object} prop - The property schema
 * @param {string} name - The property name
 * @returns {Object} Field information
 */
export function extractFieldInfo(prop, name) {
  const info = {
    name,
    type: prop.type,
    description: prop.description || '',
    required: false,
    default: prop.default,
    enum: null,
    pattern: null,
    minimum: prop.minimum,
    maximum: prop.maximum,
    items: null,
    properties: null,
    anyOf: null,
  };

  // Handle enum
  if (prop.enum) {
    info.enum = prop.enum;
    info.type = 'enum';
  }

  // Handle pattern
  if (prop.pattern) {
    info.pattern = prop.pattern;
  }

  // Handle anyOf (multiple types or enum options)
  if (prop.anyOf) {
    info.anyOf = prop.anyOf;
    // Check if any option has an enum
    const enumOption = prop.anyOf.find((opt) => opt.enum);
    if (enumOption) {
      info.enum = enumOption.enum;
    }
    // Check if any option has a pattern
    const patternOption = prop.anyOf.find((opt) => opt.pattern);
    if (patternOption) {
      info.pattern = patternOption.pattern;
    }
    // Determine combined types
    info.type = prop.anyOf
      .map((opt) => opt.type)
      .filter(Boolean)
      .join('|');
  }

  // Handle array items
  if (prop.type === 'array' && prop.items) {
    info.items = prop.items;
  }

  // Handle object properties
  if (prop.type === 'object' && prop.properties) {
    info.properties = prop.properties;
  }

  // Handle patternProperties (for outputs/variables)
  if (prop.patternProperties) {
    info.patternProperties = prop.patternProperties;
  }

  return info;
}

/**
 * Get fields for a step type, including which are required
 * @param {string} stepType - The step type
 * @returns {Object} { fields: FieldInfo[], requiredFields: string[] }
 */
export function getStepTypeFields(stepType) {
  const schema = getStepTypeSchema(stepType);
  if (!schema) {
    return { fields: [], requiredFields: [] };
  }

  const fields = [];
  const requiredFields = [];

  // Handle simple string type (e.g., goTo: "https://...")
  const hasSimpleForm = schema.anyOf?.some((opt) => opt.type === 'string');
  const hasObjectForm = schema.anyOf?.some((opt) => opt.type === 'object');

  if (hasSimpleForm && hasObjectForm) {
    // This step type supports both simple string and object forms
    const simpleOption = schema.anyOf.find((opt) => opt.type === 'string');
    const objectOption = schema.anyOf.find((opt) => opt.type === 'object');

    // Add a meta field to indicate the form type
    fields.push({
      name: '_formType',
      type: 'enum',
      description: 'Choose simple (single value) or detailed (multiple options) form',
      enum: ['simple', 'detailed'],
      default: 'simple',
      required: true,
    });

    // Add simple form field
    if (simpleOption) {
      fields.push({
        ...extractFieldInfo(simpleOption, '_simpleValue'),
        formType: 'simple',
        required: true,
      });
    }

    // Add object form fields
    if (objectOption && objectOption.properties) {
      const objRequired = objectOption.required || [];
      Object.entries(objectOption.properties).forEach(([key, prop]) => {
        const fieldInfo = extractFieldInfo(prop, key);
        fieldInfo.formType = 'detailed';
        fieldInfo.required = objRequired.includes(key);
        if (fieldInfo.required) {
          requiredFields.push(key);
        }
        fields.push(fieldInfo);
      });
    }
  } else if (schema.type === 'object' && schema.properties) {
    // Simple object type
    const objRequired = schema.required || [];
    Object.entries(schema.properties).forEach(([key, prop]) => {
      const fieldInfo = extractFieldInfo(prop, key);
      fieldInfo.required = objRequired.includes(key);
      if (fieldInfo.required) {
        requiredFields.push(key);
      }
      fields.push(fieldInfo);
    });
  } else if (schema.anyOf) {
    // Handle other anyOf structures (like wait which can be number or boolean)
    const objectOption = schema.anyOf.find((opt) => opt.type === 'object');
    if (objectOption && objectOption.properties) {
      const objRequired = objectOption.required || [];
      Object.entries(objectOption.properties).forEach(([key, prop]) => {
        const fieldInfo = extractFieldInfo(prop, key);
        fieldInfo.required = objRequired.includes(key);
        if (fieldInfo.required) {
          requiredFields.push(key);
        }
        fields.push(fieldInfo);
      });
    } else {
      // Handle primitive anyOf (number|boolean for wait)
      fields.push({
        name: '_value',
        type: schema.anyOf.map((opt) => opt.type).filter(Boolean).join('|'),
        description: schema.description || '',
        required: true,
        anyOf: schema.anyOf,
      });
    }
  }

  return { fields, requiredFields };
}

/**
 * Get spec-level fields from the spec schema
 * @returns {Object} { fields: FieldInfo[], requiredFields: string[] }
 */
export function getSpecFields() {
  const schema = schemas.spec_v3;
  const fields = [];
  const requiredFields = schema.required || [];

  if (schema.properties) {
    Object.entries(schema.properties).forEach(([key, prop]) => {
      // Skip $schema as it's auto-generated
      if (key === '$schema') return;
      // Skip tests as they're managed separately
      if (key === 'tests') return;

      const fieldInfo = extractFieldInfo(prop, key);
      fieldInfo.required = requiredFields.includes(key);
      fields.push(fieldInfo);
    });
  }

  return { fields, requiredFields };
}

/**
 * Get test-level fields from the test schema
 * @returns {Object} { fields: FieldInfo[], requiredFields: string[] }
 */
export function getTestFields() {
  const schema = schemas.test_v3;
  const fields = [];
  const requiredFields = schema.required || [];

  if (schema.properties) {
    Object.entries(schema.properties).forEach(([key, prop]) => {
      // Skip steps as they're managed separately
      if (key === 'steps') return;

      const fieldInfo = extractFieldInfo(prop, key);
      fieldInfo.required = requiredFields.includes(key);
      fields.push(fieldInfo);
    });
  }

  return { fields, requiredFields };
}

/**
 * Validate a step object against its schema
 * @param {Object} step - The step object to validate
 * @returns {{ valid: boolean, errors: string, object: Object }}
 */
export function validateStep(step) {
  return validate({
    schemaKey: 'step_v3',
    object: step,
    addDefaults: true,
  });
}

/**
 * Validate a test object against its schema
 * @param {Object} test - The test object to validate
 * @returns {{ valid: boolean, errors: string, object: Object }}
 */
export function validateTest(test) {
  return validate({
    schemaKey: 'test_v3',
    object: test,
    addDefaults: true,
  });
}

/**
 * Validate a spec object against its schema
 * @param {Object} spec - The spec object to validate
 * @returns {{ valid: boolean, errors: string, object: Object }}
 */
export function validateSpec(spec) {
  return validate({
    schemaKey: 'spec_v3',
    object: spec,
    addDefaults: true,
  });
}

/**
 * Validate a value against a regex pattern
 * @param {string} value - The value to validate
 * @param {string} pattern - The regex pattern
 * @returns {boolean} Whether the value matches the pattern
 */
export function validatePattern(value, pattern) {
  if (!pattern || !value) return true;
  try {
    const regex = new RegExp(pattern);
    return regex.test(value);
  } catch {
    return true; // Invalid regex pattern, skip validation
  }
}

/**
 * Get a human-readable description for a pattern
 * @param {string} pattern - The regex pattern
 * @returns {string} Human-readable description
 */
export function describePattern(pattern) {
  if (!pattern) return '';

  // Common patterns
  const patterns = {
    '(^(http://|https://|/).*|\\$[A-Za-z0-9_]+)': 'Must start with http://, https://, or / (or be a $VARIABLE)',
    '(^(http://|https://).*|\\$[A-Za-z0-9_]+)': 'Must start with http:// or https:// (or be a $VARIABLE)',
    '([A-Za-z0-9_-]*\\.(png|PNG)$|\\$[A-Za-z0-9_]+)': 'Must end with .png or .PNG (or be a $VARIABLE)',
    '([A-Za-z0-9_-]*\\.(mp4|webm|gif)$|\\$[A-Za-z0-9_]+)': 'Must end with .mp4, .webm, or .gif (or be a $VARIABLE)',
    '^[A-Za-z0-9_]+$': 'Only letters, numbers, and underscores allowed',
  };

  return patterns[pattern] || `Must match pattern: ${pattern}`;
}

/**
 * Get step type description and examples
 * @param {string} stepType - The step type
 * @returns {{ description: string, examples: any[] }}
 */
export function getStepTypeInfo(stepType) {
  const schema = getStepTypeSchema(stepType);
  if (!schema) {
    return { description: '', examples: [] };
  }

  return {
    description: schema.description || schema.title || stepType,
    examples: schema.examples || [],
  };
}

/**
 * Create a default step object for a step type
 * @param {string} stepType - The step type
 * @returns {Object} Default step object
 */
export function createDefaultStep(stepType) {
  const { fields, requiredFields } = getStepTypeFields(stepType);
  const step = {};

  // Check if this step type supports simple form
  const formTypeField = fields.find((f) => f.name === '_formType');
  if (formTypeField) {
    // Default to simple form
    const simpleField = fields.find((f) => f.formType === 'simple');
    if (simpleField && simpleField.default !== undefined) {
      step[stepType] = simpleField.default;
    } else {
      step[stepType] = '';
    }
  } else {
    // Object form
    const stepValue = {};
    fields.forEach((field) => {
      if (field.required && field.default !== undefined) {
        stepValue[field.name] = field.default;
      } else if (field.required) {
        // Set empty defaults for required fields
        if (field.type === 'string' || field.type?.includes('string')) {
          stepValue[field.name] = '';
        } else if (field.type === 'number' || field.type === 'integer') {
          stepValue[field.name] = 0;
        } else if (field.type === 'boolean') {
          stepValue[field.name] = false;
        } else if (field.type === 'array') {
          stepValue[field.name] = [];
        } else if (field.type === 'object') {
          stepValue[field.name] = {};
        }
      }
    });

    if (Object.keys(stepValue).length > 0) {
      step[stepType] = stepValue;
    } else {
      step[stepType] = {};
    }
  }

  return step;
}

/**
 * Create a default test object
 * @returns {Object} Default test object
 */
export function createDefaultTest() {
  return {
    testId: '',
    description: '',
    steps: [],
  };
}

/**
 * Create a default spec object
 * @param {string} specId - The spec ID/name
 * @returns {Object} Default spec object
 */
export function createDefaultSpec(specId = '') {
  return {
    specId: specId,
    description: '',
    tests: [],
  };
}

export default {
  getStepTypes,
  getStepTypeSchema,
  getCommonStepProperties,
  getStepTypeVariants,
  getFieldVariants,
  detectVariantIndex,
  extractFieldInfo,
  getStepTypeFields,
  getSpecFields,
  getTestFields,
  validateStep,
  validateTest,
  validateSpec,
  validatePattern,
  describePattern,
  getStepTypeInfo,
  createDefaultStep,
  createDefaultTest,
  createDefaultSpec,
};
