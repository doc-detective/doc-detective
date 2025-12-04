/**
 * Test editor component - manages tests and their steps (ESM version)
 */

import React from 'react';
const { useState, useMemo } = React;
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import {
  getTestFields,
  validateTest,
  createDefaultStep,
} from './schemaUtils.mjs';
import FieldEditor from './FieldEditor.mjs';
import StepEditor from './StepEditor.mjs';
import { StatusBar, JsonPreview, DescriptiveItem, NoIndicator, ScrollableSelect } from './components.mjs';

/**
 * Test editor - edit test properties and manage steps
 */
const TestEditor = ({
  test,
  testIndex,
  onChange,
  onSave,
  onCancel,
  onDelete,
}) => {
  const [view, setView] = useState('menu'); // 'menu', 'editMeta', 'editStep', 'addStep', 'preview'
  const [editingField, setEditingField] = useState(null);
  const [editingStepIndex, setEditingStepIndex] = useState(null);
  const [localTest, setLocalTest] = useState(test);

  // Get test fields
  const { fields: testFields } = useMemo(() => getTestFields(), []);

  // Validation
  const validation = useMemo(() => validateTest(localTest), [localTest]);

  // Handle escape - go back from any sub-view, or cancel from main menu
  useInput((input, key) => {
    if (key.escape) {
      if (view === 'menu') {
        onCancel();
      } else {
        setView('menu');
        setEditingField(null);
        setEditingStepIndex(null);
      }
    }
  });

  // Edit metadata field view
  if (view === 'editMeta' && editingField) {
    const fieldDef = testFields.find((f) => f.name === editingField);
    const currentValue = localTest[editingField];

    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(StatusBar, {
        location: ['Test ' + (testIndex + 1), editingField],
        validationStatus: validation.valid,
      }),
      React.createElement(FieldEditor, {
        field: fieldDef,
        value: currentValue,
        onChange: (newValue) => {
          setLocalTest({ ...localTest, [editingField]: newValue });
        },
        onSubmit: () => setView('menu'),
        onCancel: () => setView('menu'),
      })
    );
  }

  // Edit step view
  if (view === 'editStep' && editingStepIndex !== null) {
    const currentStep = localTest.steps?.[editingStepIndex] || {};

    return React.createElement(StepEditor, {
      step: currentStep,
      stepIndex: editingStepIndex,
      onChange: (updatedStep) => {
        const newSteps = [...(localTest.steps || [])];
        newSteps[editingStepIndex] = updatedStep;
        setLocalTest({ ...localTest, steps: newSteps });
      },
      onSave: (updatedStep) => {
        const newSteps = [...(localTest.steps || [])];
        newSteps[editingStepIndex] = updatedStep;
        setLocalTest({ ...localTest, steps: newSteps });
        setView('menu');
        setEditingStepIndex(null);
      },
      onCancel: () => {
        setView('menu');
        setEditingStepIndex(null);
      },
      onDelete: () => {
        const newSteps = [...(localTest.steps || [])];
        newSteps.splice(editingStepIndex, 1);
        setLocalTest({ ...localTest, steps: newSteps });
        setView('menu');
        setEditingStepIndex(null);
      },
    });
  }

  // Add step view
  if (view === 'addStep') {
    // Create new step with step editor (it will prompt for type)
    const newStep = createDefaultStep();

    return React.createElement(StepEditor, {
      step: newStep,
      stepIndex: (localTest.steps || []).length,
      onChange: () => {},
      onSave: (newStep) => {
        const newSteps = [...(localTest.steps || []), newStep];
        setLocalTest({ ...localTest, steps: newSteps });
        setView('menu');
      },
      onCancel: () => setView('menu'),
      onDelete: () => setView('menu'),
    });
  }

  // Add metadata field view
  if (view === 'addMeta') {
    // Get fields that aren't already set
    const availableFields = testFields.filter((f) => {
      if (f.name === 'steps') return false; // Steps handled separately
      if (f.name === '$schema') return false;
      return localTest[f.name] === undefined;
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
        location: ['Test ' + (testIndex + 1), 'Add Property'],
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
          setView('editMeta');
        },
      })
    );
  }

  // Delete metadata field view
  if (view === 'deleteMeta') {
    const deletableFields = testFields.filter((f) => {
      if (f.name === 'steps') return false;
      if (f.name === '$schema') return false;
      if (f.required) return false;
      return localTest[f.name] !== undefined;
    });

    const items = deletableFields.map((f) => ({
      label: `🗑️  ${f.name}: ${String(localTest[f.name]).substring(0, 30)}`,
      value: f.name,
    }));

    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(StatusBar, {
        location: ['Test ' + (testIndex + 1), 'Delete Property'],
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
          const newTest = { ...localTest };
          delete newTest[item.value];
          setLocalTest(newTest);
          setView('menu');
        },
      })
    );
  }

  // Preview view
  if (view === 'preview') {
    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(StatusBar, {
        location: ['Test ' + (testIndex + 1), 'Preview'],
        validationStatus: validation.valid,
      }),
      React.createElement(JsonPreview, {
        data: localTest,
        title: 'Test Preview',
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
          onSelect: () => setView('menu'),
        })
      )
    );
  }

  // Main menu view
  const menuItems = [];
  let menuIndex = 0;

  // Test metadata
  menuItems.push({
    label: '📝 Test Properties',
    value: `none_${menuIndex++}`,
  });

  testFields
    .filter((f) => f.name !== 'steps' && f.name !== '$schema' && localTest[f.name] !== undefined)
    .forEach((f) => {
      const val = localTest[f.name];
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

  menuItems.push({ label: '─────── Steps ──────────', value: `none_${menuIndex++}` });

  // Steps section
  const steps = localTest.steps || [];
  menuItems.push({
    label: `📋 Steps (${steps.length})`,
    value: `none_${menuIndex++}`,
  });

  steps.forEach((step, index) => {
    // Determine step type
    const stepType = Object.keys(step).find((k) => !['id', 'description', 'screenshot', 'softAssert', 'wait'].includes(k));
    const stepValue = step[stepType];
    const displayValue = typeof stepValue === 'string' ? stepValue.substring(0, 20) : '';

    menuItems.push({
      label: `   ${index + 1}. ${stepType}${displayValue ? ': ' + displayValue : ''}${displayValue.length >= 20 ? '...' : ''}`,
      value: `editStep:${index}`,
    });
  });

  menuItems.push({
    label: '   ➕ Add step',
    value: 'addStep',
  });

  menuItems.push({ label: '─────── Save/Exit ──────', value: `none_${menuIndex++}` });

  // Actions
  menuItems.push({ label: '🔍 Preview JSON', value: 'preview' });

  if (validation.valid) {
    menuItems.push({ label: '💾 Save test', value: 'save' });
  } else {
    menuItems.push({
      label: '⚠️  Fix errors before saving',
      value: `none_${menuIndex++}`,
    });
  }

  menuItems.push({ label: '🗑️  Delete test', value: 'delete' });
  menuItems.push({ label: '← Back (discard changes)', value: 'cancel' });

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(StatusBar, {
      location: ['Test ' + (testIndex + 1)],
      validationStatus: validation.valid,
      hint: 'Use ↑↓ to navigate, Enter to select',
    }),
    React.createElement(
      Box,
      { marginBottom: 1 },
      React.createElement(Text, { bold: true, color: 'cyan' }, 'Edit Test'),
      localTest.description &&
        React.createElement(Text, { color: 'gray' }, ': ' + localTest.description)
    ),
    !validation.valid &&
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(
          Text,
          { color: 'yellow' },
          '⚠️  Test has validation errors'
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
          setView('editMeta');
          return;
        }

        // Handle editStep action (format: "editStep:index")
        if (value.startsWith('editStep:')) {
          const stepIndex = parseInt(value.substring(9), 10);
          setEditingStepIndex(stepIndex);
          setView('editStep');
          return;
        }

        switch (value) {
          case 'addMeta':
            setView('addMeta');
            break;
          case 'deleteMeta':
            setView('deleteMeta');
            break;
          case 'addStep':
            setView('addStep');
            break;
          case 'preview':
            setView('preview');
            break;
          case 'save':
            onSave(localTest);
            break;
          case 'delete':
            onDelete();
            break;
          case 'cancel':
            onCancel();
            break;
          // Ignore 'none_*' values
        }
      },
    })
  );
};

export default TestEditor;
