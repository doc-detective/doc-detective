/**
 * Main test builder orchestrator (ESM version)
 */

import React from 'react';
const { useState, useMemo } = React;
import { Box, Text, useInput, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import * as fs from 'fs';
import * as path from 'path';
import {
  createDefaultSpec,
  createDefaultTest,
  validateSpec,
  getSpecFields,
} from './schemaUtils.mjs';
import TestEditor from './TestEditor.mjs';
import FieldEditor from './FieldEditor.mjs';
import { StatusBar, JsonPreview, SimpleTextInput, LabeledTextInput, ConfirmPrompt } from './components.mjs';

/**
 * Main TestBuilder component
 */
const TestBuilder = () => {
  const { exit } = useApp();

  // State
  const [phase, setPhase] = useState('name'); // 'name', 'menu', 'editTest', 'addTest', 'editMeta', 'addMeta', 'deleteMeta', 'preview', 'save', 'saved'
  const [specName, setSpecName] = useState('');
  const [spec, setSpec] = useState(createDefaultSpec());
  const [editingTestIndex, setEditingTestIndex] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [saveDir, setSaveDir] = useState(process.cwd());

  // Get spec fields
  const { fields: specFields } = useMemo(() => getSpecFields(), []);

  // Validation
  const validation = useMemo(() => validateSpec(spec), [spec]);

  // Get file path
  const filePath = useMemo(() => {
    const safeName = specName.replace(/[^a-zA-Z0-9-_]/g, '-') || 'untitled';
    return path.join(saveDir, `${safeName}.spec.json`);
  }, [specName, saveDir]);

  // Handle escape for exit in name phase
  useInput((input, key) => {
    if (key.escape && phase === 'name') {
      exit();
    }
  });

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
      label: `${f.name}${f.required ? ' (required)' : ''} - ${f.description?.substring(0, 40) || ''}`,
      value: f.name,
    }));

    items.push({ label: '← Back', value: '_back' });

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
      React.createElement(SelectInput, {
        items,
        onSelect: (item) => {
          if (item.value === '_back') {
            setPhase('menu');
          } else {
            setEditingField(item.value);
            setPhase('editMeta');
          }
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

    items.push({ label: '← Back', value: '_back' });

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
      React.createElement(SelectInput, {
        items,
        onSelect: (item) => {
          if (item.value === '_back') {
            setPhase('menu');
          } else {
            const newSpec = { ...spec };
            delete newSpec[item.value];
            setSpec(newSpec);
            setPhase('menu');
          }
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
        title: 'Specification Preview',
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
    return React.createElement(ConfirmPrompt, {
      message: 'Save spec to ' + filePath + '?',
      onConfirm: () => {
        try {
          fs.writeFileSync(filePath, JSON.stringify(spec, null, 2));
          setPhase('saved');
        } catch (err) {
          // TODO: Handle error
          console.error('Failed to save:', err);
          setPhase('menu');
        }
      },
      onCancel: () => setPhase('menu'),
    });
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
  menuItems.push({ label: '🔍 Preview JSON', value: 'preview' });

  if (validation.valid && tests.length > 0) {
    menuItems.push({ label: '💾 Save specification', value: 'save' });
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

  menuItems.push({ label: '🚪 Exit (discard changes)', value: 'exit' });

  return React.createElement(
    Box,
    { flexDirection: 'column', padding: 1 },
    React.createElement(StatusBar, {
      location: [specName],
      validationStatus: validation.valid,
      hint: 'Use ↑↓ to navigate, Enter to select',
    }),
    React.createElement(
      Box,
      { marginBottom: 1 },
      React.createElement(Text, { bold: true, color: 'cyan' }, '🔧 Test Builder: '),
      React.createElement(Text, { color: 'white' }, specName || 'Untitled')
    ),
    React.createElement(
      Box,
      { marginBottom: 1 },
      React.createElement(
        Text,
        { color: 'gray', dimColor: true },
        'Output: ' + filePath
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
