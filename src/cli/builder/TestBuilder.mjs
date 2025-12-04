/**
 * Main test builder orchestrator (ESM version)
 */

import React from 'react';
const { useState, useMemo, useEffect } = React;
import { Box, Text, useInput, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
import {
  createDefaultSpec,
  createDefaultTest,
  validateSpec,
  getSpecFields,
} from './schemaUtils.mjs';
import TestEditor from './TestEditor.mjs';
import FieldEditor from './FieldEditor.mjs';
import { StatusBar, JsonPreview, SimpleTextInput, LabeledTextInput, ConfirmPrompt, DescriptiveItem, NoIndicator, ScrollableSelect } from './components.mjs';

/**
 * Determine the output file path based on input file and extension
 * @param {string|null} inputFilePath - Original input file path
 * @param {string|null} inputFileExtension - Original file extension
 * @param {string} specName - Spec name for new files
 * @param {string} outputDir - Default output directory
 * @returns {string} The computed output file path
 */
function computeOutputPath(inputFilePath, inputFileExtension, specName, outputDir) {
  if (inputFilePath) {
    const ext = inputFileExtension?.toLowerCase() || path.extname(inputFilePath).toLowerCase();
    
    // For JSON or YAML files, overwrite the original
    if (ext === '.json' || ext === '.yaml' || ext === '.yml') {
      return inputFilePath;
    }
    
    // For other formats (e.g., .md), save as .spec.json in the same directory
    const dir = path.dirname(inputFilePath);
    const baseName = path.basename(inputFilePath, ext);
    return path.join(dir, `${baseName}.spec.json`);
  }
  
  // New file - use specName in outputDir
  const safeName = specName.replace(/[^a-zA-Z0-9-_]/g, '-') || 'untitled';
  return path.join(outputDir, `${safeName}.spec.json`);
}

/**
 * Determine the output format based on file extension
 * @param {string} filePath - The output file path
 * @returns {'json'|'yaml'} The format to use
 */
function getOutputFormat(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.yaml' || ext === '.yml') {
    return 'yaml';
  }
  return 'json';
}

/**
 * Serialize spec to the appropriate format
 * @param {Object} spec - The spec object
 * @param {'json'|'yaml'} format - The output format
 * @returns {string} Serialized content
 */
function serializeSpec(spec, format) {
  if (format === 'yaml') {
    return yaml.dump(spec, { 
      indent: 2, 
      lineWidth: -1, 
      noRefs: true,
      quotingType: '"',
    });
  }
  return JSON.stringify(spec, null, 2);
}

/**
 * Main TestBuilder component
 * @param {Object} props
 * @param {Object|null} props.initialSpec - Initial spec to edit (optional)
 * @param {string|null} props.inputFilePath - Path to the input file (for saving)
 * @param {string|null} props.inputFileExtension - Original file extension
 * @param {boolean} props.isValid - Whether the initial spec passed validation
 * @param {string|null} props.validationErrors - Validation error message if invalid
 * @param {string} props.outputDir - Output directory for new specs
 * @param {Function|null} props.onBack - Callback to navigate back to spec selector (optional)
 */
const TestBuilder = ({ 
  initialSpec = null, 
  inputFilePath = null, 
  inputFileExtension = null,
  isValid = true,
  validationErrors = null,
  outputDir = process.cwd(),
  onBack = null,
}) => {
  const { exit } = useApp();

  // Determine if we're editing an existing file
  const isEditing = initialSpec !== null && inputFilePath !== null;

  // Derive initial spec name from initialSpec.specId or filename
  const deriveSpecName = () => {
    if (initialSpec?.specId) {
      return initialSpec.specId;
    }
    if (inputFilePath) {
      const ext = path.extname(inputFilePath);
      return path.basename(inputFilePath, ext);
    }
    return '';
  };

  // State
  const [phase, setPhase] = useState(isEditing ? 'menu' : 'name'); // Skip 'name' phase when editing
  const [specName, setSpecName] = useState(deriveSpecName());
  const [spec, setSpec] = useState(initialSpec || createDefaultSpec());
  const [editingTestIndex, setEditingTestIndex] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [saveDir, setSaveDir] = useState(outputDir);
  const [showValidationWarning, setShowValidationWarning] = useState(!isValid && isEditing);

  // Get spec fields
  const { fields: specFields } = useMemo(() => getSpecFields(), []);

  // Validation - wrap in try-catch since validateSpec can throw for invalid specs
  const validation = useMemo(() => {
    try {
      return validateSpec(spec);
    } catch (err) {
      return { valid: false, errors: err.message, object: spec };
    }
  }, [spec]);

  // Get file path - use computed path for existing files, or generate new path
  const filePath = useMemo(() => {
    return computeOutputPath(inputFilePath, inputFileExtension, specName, saveDir);
  }, [inputFilePath, inputFileExtension, specName, saveDir]);

  // Get output format
  const outputFormat = useMemo(() => getOutputFormat(filePath), [filePath]);

  // Handle escape - exit from name phase, go back from sub-views
  useInput((input, key) => {
    if (key.escape) {
      if (phase === 'name') {
        exit();
      } else if (phase === 'menu') {
        // Do nothing on menu, use Exit option
      } else {
        setPhase('menu');
        setEditingTestIndex(null);
        setEditingField(null);
      }
    }
  });

  // Show validation warning for invalid loaded specs
  if (showValidationWarning) {
    return React.createElement(
      Box,
      { flexDirection: 'column', padding: 1 },
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, { bold: true, color: 'yellow' }, '⚠️  Validation Warning')
      ),
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, null, 'The loaded specification has validation issues:')
      ),
      React.createElement(
        Box,
        { marginBottom: 1, marginLeft: 2 },
        React.createElement(Text, { color: 'yellow' }, validationErrors || 'Unknown validation errors')
      ),
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, { color: 'gray' }, 'You can still edit the specification, but you may need to fix these issues before saving.')
      ),
      React.createElement(SelectInput, {
        items: [
          { label: 'Continue editing', value: 'continue' },
          { label: 'Exit', value: 'exit' },
        ],
        onSelect: (item) => {
          if (item.value === 'exit') {
            exit();
          } else {
            setShowValidationWarning(false);
          }
        },
      })
    );
  }

  // Name input phase
  if (phase === 'name') {
    return React.createElement(
      Box,
      { flexDirection: 'column', padding: 1 },
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, { bold: true, color: 'cyan' }, '🔧 Doc Detective Test Builder')
      ),
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, null, 'Create a new test specification step by step.')
      ),
      React.createElement(LabeledTextInput, {
        label: 'Spec name',
        value: specName,
        placeholder: 'my-tests',
        onChange: setSpecName,
        onSubmit: () => {
          if (specName.trim()) {
            // Initialize spec with specId
            setSpec({
              ...spec,
              specId: specName,
            });
            setPhase('menu');
          }
        },
      }),
      React.createElement(
        Box,
        { marginTop: 1 },
        React.createElement(
          Text,
          { color: 'gray', dimColor: true },
          'Will be saved as: ' + filePath
        )
      ),
      React.createElement(
        Box,
        { marginTop: 1 },
        React.createElement(
          Text,
          { color: 'gray', dimColor: true },
          'Press Enter to continue, Esc to exit'
        )
      )
    );
  }

  // Edit test view
  if (phase === 'editTest' && editingTestIndex !== null) {
    const currentTest = spec.tests?.[editingTestIndex] || createDefaultTest();

    return React.createElement(TestEditor, {
      test: currentTest,
      testIndex: editingTestIndex,
      onChange: (updatedTest) => {
        const newTests = [...(spec.tests || [])];
        newTests[editingTestIndex] = updatedTest;
        setSpec({ ...spec, tests: newTests });
      },
      onSave: (updatedTest) => {
        const newTests = [...(spec.tests || [])];
        newTests[editingTestIndex] = updatedTest;
        setSpec({ ...spec, tests: newTests });
        setPhase('menu');
        setEditingTestIndex(null);
      },
      onCancel: () => {
        setPhase('menu');
        setEditingTestIndex(null);
      },
      onDelete: () => {
        const newTests = [...(spec.tests || [])];
        newTests.splice(editingTestIndex, 1);
        setSpec({ ...spec, tests: newTests });
        setPhase('menu');
        setEditingTestIndex(null);
      },
    });
  }

  // Add test view
  if (phase === 'addTest') {
    const newTest = createDefaultTest();

    return React.createElement(TestEditor, {
      test: newTest,
      testIndex: (spec.tests || []).length,
      onChange: () => {},
      onSave: (newTest) => {
        const newTests = [...(spec.tests || []), newTest];
        setSpec({ ...spec, tests: newTests });
        setPhase('menu');
      },
      onCancel: () => setPhase('menu'),
      onDelete: () => setPhase('menu'),
    });
  }

  // Edit spec metadata field
  if (phase === 'editMeta' && editingField) {
    const fieldDef = specFields.find((f) => f.name === editingField);
    const currentValue = spec[editingField];

    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(StatusBar, {
        location: [specName, editingField],
        validationStatus: validation.valid,
      }),
      React.createElement(FieldEditor, {
        field: fieldDef,
        value: currentValue,
        onChange: (newValue) => {
          setSpec({ ...spec, [editingField]: newValue });
        },
        onSubmit: () => setPhase('menu'),
        onCancel: () => setPhase('menu'),
      })
    );
  }

  // Add spec metadata field
  if (phase === 'addMeta') {
    const availableFields = specFields.filter((f) => {
      if (f.name === 'tests') return false;
      if (f.name === '$schema') return false;
      return spec[f.name] === undefined;
    });

    const items = availableFields.map((f) => ({
      label: `${f.name}${f.required ? ' (required)' : ''}`,
      description: f.description || '',
      value: f.name,
    }));

    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(StatusBar, {
        location: [specName, 'Add Property'],
      }),
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, { bold: true, color: 'cyan' }, 'Select property to add:')
      ),
      React.createElement(
        Text,
        { color: 'gray', dimColor: true, marginBottom: 1 },
        '(Esc to go back)'
      ),
      React.createElement(ScrollableSelect, {
        items,
        itemComponent: DescriptiveItem,
        indicatorComponent: NoIndicator,
        onSelect: (item) => {
          setEditingField(item.value);
          setPhase('editMeta');
        },
      })
    );
  }

  // Delete spec metadata field
  if (phase === 'deleteMeta') {
    const deletableFields = specFields.filter((f) => {
      if (f.name === 'tests') return false;
      if (f.name === '$schema') return false;
      if (f.required) return false;
      return spec[f.name] !== undefined;
    });

    const items = deletableFields.map((f) => ({
      label: `🗑️  ${f.name}: ${String(spec[f.name]).substring(0, 30)}`,
      value: f.name,
    }));

    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(StatusBar, {
        location: [specName, 'Delete Property'],
      }),
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, { bold: true, color: 'red' }, 'Select property to delete:')
      ),
      React.createElement(
        Text,
        { color: 'gray', dimColor: true, marginBottom: 1 },
        '(Esc to go back)'
      ),
      React.createElement(SelectInput, {
        items,
        onSelect: (item) => {
          const newSpec = { ...spec };
          delete newSpec[item.value];
          setSpec(newSpec);
          setPhase('menu');
        },
      })
    );
  }

  // Preview view
  if (phase === 'preview') {
    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(StatusBar, {
        location: [specName, 'Preview'],
        validationStatus: validation.valid,
      }),
      React.createElement(JsonPreview, {
        data: spec,
        title: `Specification Preview (${outputFormat.toUpperCase()})`,
      }),
      !validation.valid &&
        React.createElement(
          Box,
          { marginTop: 1 },
          React.createElement(Text, { color: 'red' }, 'Validation errors: ' + validation.errors)
        ),
      React.createElement(
        Box,
        { marginTop: 1 },
        React.createElement(SelectInput, {
          items: [{ label: '← Back', value: 'back' }],
          onSelect: () => setPhase('menu'),
        })
      )
    );
  }

  // Save confirmation
  if (phase === 'save') {
    const isOverwrite = inputFilePath && (inputFileExtension === '.json' || inputFileExtension === '.yaml' || inputFileExtension === '.yml');
    const saveMessage = isOverwrite 
      ? `Overwrite ${filePath}?` 
      : `Save spec to ${filePath}?`;

    return React.createElement(
      Box,
      { flexDirection: 'column', padding: 1 },
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, { color: 'cyan' }, saveMessage)
      ),
      outputFormat === 'yaml' && React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, { color: 'gray', dimColor: true }, 'Format: YAML')
      ),
      React.createElement(ConfirmPrompt, {
        message: '',
        onConfirm: () => {
          try {
            // Ensure directory exists
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            
            // Serialize and write
            const content = serializeSpec(spec, outputFormat);
            fs.writeFileSync(filePath, content);
            setPhase('saved');
          } catch (err) {
            // TODO: Handle error better
            console.error('Failed to save:', err);
            setPhase('menu');
          }
        },
        onCancel: () => setPhase('menu'),
      })
    );
  }

  // Saved confirmation
  if (phase === 'saved') {
    return React.createElement(
      Box,
      { flexDirection: 'column', padding: 1 },
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, { color: 'green', bold: true }, '✅ Specification saved successfully!')
      ),
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, null, 'File: ' + filePath)
      ),
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, { color: 'gray', dimColor: true }, 'Format: ' + outputFormat.toUpperCase())
      ),
      React.createElement(SelectInput, {
        items: [
          { label: 'Continue editing', value: 'continue' },
          { label: 'Exit', value: 'exit' },
        ],
        onSelect: (item) => {
          if (item.value === 'exit') {
            exit();
          } else {
            setPhase('menu');
          }
        },
      })
    );
  }

  // Main menu view
  const menuItems = [];
  let menuIndex = 0;

  // Spec metadata section
  menuItems.push({
    label: '📋 Spec Properties',
    value: `none_${menuIndex++}`,
  });

  specFields
    .filter((f) => f.name !== 'tests' && f.name !== '$schema' && spec[f.name] !== undefined)
    .forEach((f) => {
      const val = spec[f.name];
      const displayVal = typeof val === 'object' ? JSON.stringify(val).substring(0, 25) : String(val).substring(0, 25);
      menuItems.push({
        label: `   ✏️  ${f.name}: ${displayVal}${String(val).length > 25 ? '...' : ''}`,
        value: `editMeta:${f.name}`,
      });
    });

  menuItems.push({
    label: '   ➕ Add property',
    value: 'addMeta',
  });
  menuItems.push({
    label: '   🗑️  Delete property',
    value: 'deleteMeta',
  });

  menuItems.push({ label: '─────── Tests ──────────', value: `none_${menuIndex++}` });

  // Tests section
  const tests = spec.tests || [];
  menuItems.push({
    label: `📝 Tests (${tests.length})`,
    value: `none_${menuIndex++}`,
  });

  tests.forEach((test, index) => {
    const description = test.description || `Test ${index + 1}`;
    const stepCount = (test.steps || []).length;
    menuItems.push({
      label: `   ${index + 1}. ${description.substring(0, 30)}${description.length > 30 ? '...' : ''} (${stepCount} steps)`,
      value: `editTest:${index}`,
    });
  });

  menuItems.push({
    label: '   ➕ Add test',
    value: 'addTest',
  });

  menuItems.push({ label: '─────── Save/Exit ──────', value: `none_${menuIndex++}` });

  // Actions
  menuItems.push({ label: '🔍 Preview', value: 'preview' });

  if (validation.valid && tests.length > 0) {
    const saveLabel = isEditing ? '💾 Save (overwrite)' : '💾 Save specification';
    menuItems.push({ label: saveLabel, value: 'save' });
  } else if (tests.length === 0) {
    menuItems.push({
      label: '⚠️  Add at least one test to save',
      value: `none_${menuIndex++}`,
    });
  } else {
    menuItems.push({
      label: '⚠️  Fix validation errors to save',
      value: `none_${menuIndex++}`,
    });
  }

  // Add back option if we came from spec selector
  if (onBack) {
    menuItems.push({ label: '◀️  Back to spec list', value: 'back' });
  }

  menuItems.push({ label: '🚪 Exit (discard changes)', value: 'exit' });

  // Build header info
  const headerInfo = isEditing 
    ? `Editing: ${path.basename(inputFilePath)}` 
    : (specName || 'Untitled');

  return React.createElement(
    Box,
    { flexDirection: 'column', padding: 1 },
    React.createElement(StatusBar, {
      location: [specName || path.basename(inputFilePath || 'New Spec')],
      validationStatus: validation.valid,
      hint: 'Use ↑↓ to navigate, Enter to select',
    }),
    React.createElement(
      Box,
      { marginBottom: 1 },
      React.createElement(Text, { bold: true, color: 'cyan' }, '🔧 Test Builder: '),
      React.createElement(Text, { color: 'white' }, headerInfo)
    ),
    React.createElement(
      Box,
      { marginBottom: 1 },
      React.createElement(
        Text,
        { color: 'gray', dimColor: true },
        `Output: ${filePath} (${outputFormat.toUpperCase()})`
      )
    ),
    React.createElement(SelectInput, {
      items: menuItems,
      onSelect: (item) => {
        const value = item.value;

        // Handle editMeta action (format: "editMeta:fieldName")
        if (value.startsWith('editMeta:')) {
          const field = value.substring(9);
          setEditingField(field);
          setPhase('editMeta');
          return;
        }

        // Handle editTest action (format: "editTest:index")
        if (value.startsWith('editTest:')) {
          const testIndex = parseInt(value.substring(9), 10);
          setEditingTestIndex(testIndex);
          setPhase('editTest');
          return;
        }

        switch (value) {
          case 'addMeta':
            setPhase('addMeta');
            break;
          case 'deleteMeta':
            setPhase('deleteMeta');
            break;
          case 'addTest':
            setPhase('addTest');
            break;
          case 'preview':
            setPhase('preview');
            break;
          case 'save':
            setPhase('save');
            break;
          case 'back':
            if (onBack) onBack();
            break;
          case 'exit':
            exit();
            break;
          // Ignore 'none_*' values
        }
      },
    })
  );
};

export default TestBuilder;
