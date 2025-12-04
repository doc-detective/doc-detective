/**
 * Step editor component - handles editing individual steps (ESM version)
 */

import React from 'react';
const { useState, useMemo, useEffect } = React;
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import {
  getStepTypes,
  getStepTypeFields,
  getStepTypeInfo,
  getStepTypeVariants,
  getCommonStepProperties,
  detectVariantIndex,
  validateStep,
} from './schemaUtils.mjs';
import FieldEditor from './FieldEditor.mjs';
import { StatusBar, JsonPreview, DescriptiveItem, NoIndicator, ScrollableSelect } from './components.mjs';

/**
 * Step type selector
 */
const StepTypeSelector = ({ onSelect, onCancel }) => {
  const stepTypes = getStepTypes();

  const items = stepTypes.map((type) => {
    const info = getStepTypeInfo(type);
    return {
      label: type,
      description: info.description,
      value: type,
    };
  });

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(
      Box,
      { marginBottom: 1 },
      React.createElement(Text, { bold: true, color: 'cyan' }, 'Select Step Type:')
    ),
    React.createElement(ScrollableSelect, {
      items,
      itemComponent: DescriptiveItem,
      indicatorComponent: NoIndicator,
      onSelect: (item) => onSelect(item.value),
    }),
    React.createElement(
      Text,
      { color: 'gray', dimColor: true },
      '(Esc to cancel)'
    )
  );
};

/**
 * Schema variant selector for step types with anyOf
 */
const VariantSelector = ({ stepType, currentValue, onSelect, onCancel }) => {
  const variants = getStepTypeVariants(stepType);
  const currentIndex = detectVariantIndex(currentValue, variants);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  // Must have at least one variant to show selector
  if (!variants || variants.length === 0) {
    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(Text, { color: 'yellow' }, `No variants found for ${stepType}. Press Esc to go back.`)
    );
  }

  const items = variants.map((variant, index) => ({
    label: `${variant.title}${variant.type ? ` (${variant.type})` : ''}`,
    value: `variant_${index}`,
    key: `variant_${index}`,
  }));

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(
      Box,
      { marginBottom: 1 },
      React.createElement(Text, { bold: true, color: 'cyan' }, `Select ${stepType} format:`)
    ),
    React.createElement(
      Box,
      { marginBottom: 1 },
      React.createElement(
        Text,
        { color: 'gray', dimColor: true },
        'This step type supports multiple formats. Choose one:'
      )
    ),
    React.createElement(SelectInput, {
      items,
      initialIndex: currentIndex,
      onSelect: (item) => {
        const index = parseInt(item.value.replace('variant_', ''), 10);
        onSelect(index, variants[index]);
      },
    }),
    React.createElement(
      Text,
      { color: 'gray', dimColor: true },
      '(Esc to cancel)'
    )
  );
};

/**
 * Step editor - edit step fields
 */
const StepEditor = ({
  step,
  stepIndex,
  onChange,
  onSave,
  onCancel,
  onDelete,
}) => {
  const [view, setView] = useState('menu'); // 'menu', 'editField', 'addField', 'preview', 'selectType', 'selectVariant'
  const [editingField, setEditingField] = useState(null);
  const [localStep, setLocalStep] = useState(step);
  const [pendingStepType, setPendingStepType] = useState(null); // For step type selection flow

  // Determine step type
  const stepType = useMemo(() => {
    const types = getStepTypes();
    return types.find((t) => localStep[t] !== undefined) || null;
  }, [localStep]);

  // Get step value (could be string, number, boolean, or object)
  const stepValue = stepType ? localStep[stepType] : null;
  const valueType = typeof stepValue;
  const isSimpleForm = valueType === 'string' || valueType === 'number' || valueType === 'boolean';

  // Get variants for current step type
  const variants = useMemo(() => {
    if (!stepType) return [];
    return getStepTypeVariants(stepType);
  }, [stepType]);

  // Determine current variant
  const currentVariantIndex = useMemo(() => {
    if (variants.length === 0) return -1;
    return detectVariantIndex(stepValue, variants);
  }, [stepValue, variants]);

  const currentVariant = variants[currentVariantIndex] || null;

  // Get fields for this step type
  const { fields: typeFields } = useMemo(() => {
    if (!stepType) return { fields: [] };
    return getStepTypeFields(stepType);
  }, [stepType]);

  // Get common step properties
  const commonProps = getCommonStepProperties();

  // Build current field values for menu
  const currentFields = useMemo(() => {
    const result = [];

    // Add step type value
    if (stepType) {
      if (isSimpleForm) {
        result.push({
          name: stepType,
          value: stepValue,
          type: 'simple',
          description: `The ${stepType} value`,
        });
      } else if (typeof stepValue === 'object' && stepValue !== null) {
        // Add object fields
        Object.entries(stepValue).forEach(([key, val]) => {
          const fieldDef = typeFields.find((f) => f.name === key);
          result.push({
            name: `${stepType}.${key}`,
            value: val,
            type: fieldDef?.type || typeof val,
            description: fieldDef?.description || '',
            enum: fieldDef?.enum,
            pattern: fieldDef?.pattern,
          });
        });
      }
    }

    // Add common step properties that are set
    Object.entries(localStep).forEach(([key, val]) => {
      if (key !== stepType && commonProps[key]) {
        result.push({
          name: key,
          value: val,
          type: commonProps[key].type,
          description: commonProps[key].description,
          enum: commonProps[key].enum,
          pattern: commonProps[key].pattern,
        });
      }
    });

    return result;
  }, [localStep, stepType, stepValue, isSimpleForm, typeFields, commonProps]);

  // Validation
  const validation = useMemo(() => {
    if (!stepType) return { valid: false, errors: 'No step type selected' };
    return validateStep(localStep);
  }, [localStep, stepType]);

  // Handle escape to go back
  useInput((input, key) => {
    if (key.escape && view === 'menu') {
      onCancel();
    }
  });

  // Select variant view (for step types with anyOf) - check this BEFORE selectType
  if (view === 'selectVariant' && pendingStepType) {
    const type = pendingStepType;
    const typeVariants = getStepTypeVariants(type);
    
    // Safety check - if no variants, go back to menu
    if (typeVariants.length === 0) {
      const newStep = { [type]: {} };
      setLocalStep(newStep);
      setPendingStepType(null);
      setView('menu');
      return null;
    }
    
    return React.createElement(VariantSelector, {
      stepType: type,
      currentValue: null,
      onSelect: (variantIndex, variant) => {
        // Safety check for variant
        if (!variant) {
          const newStep = { [type]: '' };
          setLocalStep(newStep);
          setPendingStepType(null);
          setView('menu');
          return;
        }
        
        // Create step value based on selected variant
        let newValue;
        if (variant.type === 'string') {
          newValue = '';
        } else if (variant.type === 'number' || variant.type === 'integer') {
          newValue = variant.schema.default !== undefined ? variant.schema.default : 0;
        } else if (variant.type === 'boolean') {
          newValue = variant.schema.default !== undefined ? variant.schema.default : false;
        } else if (variant.type === 'object') {
          // Create object with required fields
          newValue = {};
          const required = variant.schema.required || [];
          if (variant.schema.properties) {
            Object.entries(variant.schema.properties).forEach(([key, prop]) => {
              if (required.includes(key)) {
                if (prop.default !== undefined) {
                  newValue[key] = prop.default;
                } else if (prop.type === 'string') {
                  newValue[key] = '';
                } else if (prop.type === 'number' || prop.type === 'integer') {
                  newValue[key] = 0;
                } else if (prop.type === 'boolean') {
                  newValue[key] = false;
                } else if (prop.type === 'array') {
                  newValue[key] = [];
                } else if (prop.type === 'object') {
                  newValue[key] = {};
                }
              }
            });
          }
        } else {
          newValue = '';
        }

        const newStep = { [type]: newValue };
        setLocalStep(newStep);
        setPendingStepType(null);
        setView('menu');
      },
      onCancel: () => {
        setPendingStepType(null);
        setView('selectType');
      },
    });
  }

  // Select step type view
  if (view === 'selectType' || !stepType) {
    return React.createElement(StepTypeSelector, {
      onSelect: (type) => {
        // Check if this step type has variants
        const typeVariants = getStepTypeVariants(type);
        if (typeVariants.length > 1) {
          // Show variant selector
          setPendingStepType(type);
          setView('selectVariant');
        } else if (typeVariants.length === 1) {
          // Only one variant, use it directly
          const variant = typeVariants[0];
          let defaultValue;
          if (variant.type === 'string') {
            defaultValue = '';
          } else if (variant.type === 'number' || variant.type === 'integer') {
            defaultValue = variant.schema.default !== undefined ? variant.schema.default : 0;
          } else if (variant.type === 'boolean') {
            defaultValue = variant.schema.default !== undefined ? variant.schema.default : false;
          } else {
            defaultValue = {};
          }
          const newStep = { [type]: defaultValue };
          setLocalStep(newStep);
          setView('menu');
        } else {
          // No variants, default to empty object
          const newStep = { [type]: {} };
          setLocalStep(newStep);
          setView('menu');
        }
      },
      onCancel,
    });
  }

  // Edit field view
  if (view === 'editField' && editingField) {
    // Determine field definition
    let fieldDef = null;
    let currentValue = null;

    if (editingField === stepType) {
      // Editing simple form value
      fieldDef = {
        name: stepType,
        type: 'string',
        description: getStepTypeInfo(stepType).description,
        ...typeFields.find((f) => f.name === '_simpleValue' || f.formType === 'simple'),
      };
      currentValue = stepValue;
    } else if (editingField.startsWith(stepType + '.')) {
      // Editing object property
      const propName = editingField.replace(stepType + '.', '');
      fieldDef = typeFields.find((f) => f.name === propName) || {
        name: propName,
        type: 'string',
        description: '',
      };
      currentValue = stepValue?.[propName];
    } else if (commonProps[editingField]) {
      // Editing common property
      const prop = commonProps[editingField];
      fieldDef = {
        name: editingField,
        type: prop.type,
        description: prop.description,
        default: prop.default,
        enum: prop.enum,
        pattern: prop.pattern,
      };
      currentValue = localStep[editingField];
    }

    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(StatusBar, {
        location: ['Step ' + (stepIndex + 1), stepType, editingField],
        validationStatus: validation.valid,
      }),
      React.createElement(FieldEditor, {
        field: fieldDef,
        value: currentValue,
        onChange: (newValue) => {
          // Update the step
          const newStep = { ...localStep };

          if (editingField === stepType) {
            // Simple form
            newStep[stepType] = newValue;
          } else if (editingField.startsWith(stepType + '.')) {
            // Object property
            const propName = editingField.replace(stepType + '.', '');
            if (typeof newStep[stepType] !== 'object') {
              newStep[stepType] = {};
            }
            newStep[stepType] = { ...newStep[stepType], [propName]: newValue };
          } else {
            // Common property
            newStep[editingField] = newValue;
          }

          setLocalStep(newStep);
        },
        onSubmit: () => setView('menu'),
        onCancel: () => setView('menu'),
      })
    );
  }

  // Add field view
  if (view === 'addField') {
    // Get available fields that aren't already set
    const availableFields = [];

    // Type-specific fields (for object form)
    if (!isSimpleForm) {
      typeFields
        .filter((f) => !f.name.startsWith('_') && f.formType !== 'simple')
        .forEach((f) => {
          const fullName = `${stepType}.${f.name}`;
          if (!currentFields.find((cf) => cf.name === fullName)) {
            availableFields.push({
              label: `${f.name}${f.required ? ' (required)' : ''}`,
              description: f.description || '',
              value: fullName,
            });
          }
        });
    }

    // Common properties
    Object.entries(commonProps).forEach(([key, prop]) => {
      if (key !== '$schema' && !currentFields.find((cf) => cf.name === key)) {
        availableFields.push({
          label: key,
          description: prop.description || '',
          value: key,
        });
      }
    });

    // Show option to switch format if variants exist
    if (variants.length > 1) {
      availableFields.unshift({
        label: `↔ Switch format (currently: ${currentVariant?.title || valueType})`,
        description: '',
        value: '_switchVariant',
      });
    }

    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(StatusBar, {
        location: ['Step ' + (stepIndex + 1), stepType, 'Add Field'],
      }),
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, { bold: true, color: 'cyan' }, 'Select field to add:')
      ),
      React.createElement(ScrollableSelect, {
        items: [
          ...availableFields,
          { label: '← Back', description: '', value: '_back' },
        ],
        itemComponent: DescriptiveItem,
        indicatorComponent: NoIndicator,
        onSelect: (item) => {
          if (item.value === '_back') {
            setView('menu');
          } else if (item.value === '_switchVariant') {
            // Show variant selector to switch format
            setView('selectVariant');
          } else {
            setEditingField(item.value);
            setView('editField');
          }
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
        location: ['Step ' + (stepIndex + 1), stepType, 'Preview'],
        validationStatus: validation.valid,
      }),
      React.createElement(JsonPreview, {
        data: localStep,
        title: 'Step Preview',
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

  // Show current format info if variants exist
  if (variants.length > 1 && currentVariant) {
    menuItems.push({
      label: `📋 Format: ${currentVariant.title}`,
      value: `none_${menuIndex++}`,
    });
  }

  // Current fields
  currentFields.forEach((field) => {
    const displayValue =
      typeof field.value === 'object'
        ? JSON.stringify(field.value).substring(0, 30)
        : String(field.value).substring(0, 30);
    menuItems.push({
      label: `✏️  ${field.name}: ${displayValue}${String(field.value).length > 30 ? '...' : ''}`,
      value: `edit:${field.name}`,
    });
  });

  // Add separator
  if (menuItems.length > 0) {
    menuItems.push({ label: '─────── Actions ────────', value: `none_${menuIndex++}` });
  }

  // Actions
  menuItems.push({ label: '➕ Add field', value: 'add' });
  menuItems.push({ label: '🔍 Preview JSON', value: 'preview' });
  
  // Show switch format option if variants exist
  if (variants.length > 1) {
    menuItems.push({ label: '↔️  Switch format', value: 'switchVariant' });
  }
  
  menuItems.push({ label: '🔄 Change step type', value: 'changeType' });

  if (currentFields.length > 0) {
    menuItems.push({ label: '🗑️  Delete field...', value: 'deleteField' });
  }

  menuItems.push({ label: '─────── Save/Exit ──────', value: `none_${menuIndex++}` });

  if (validation.valid) {
    menuItems.push({ label: '💾 Save step', value: 'save' });
  } else {
    menuItems.push({
      label: '⚠️  Fix errors before saving',
      value: `none_${menuIndex++}`,
    });
  }

  menuItems.push({ label: '🗑️  Delete step', value: 'delete' });
  menuItems.push({ label: '← Back (discard changes)', value: 'cancel' });

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(StatusBar, {
      location: ['Step ' + (stepIndex + 1), stepType],
      validationStatus: validation.valid,
      hint: 'Use ↑↓ to navigate, Enter to select',
    }),
    React.createElement(
      Box,
      { marginBottom: 1 },
      React.createElement(Text, { bold: true, color: 'cyan' }, 'Edit Step: '),
      React.createElement(Text, { color: 'white' }, stepType)
    ),
    !validation.valid &&
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(
          Text,
          { color: 'yellow' },
          '⚠️  Step has validation errors'
        )
      ),
    React.createElement(SelectInput, {
      items: menuItems,
      onSelect: (item) => {
        const value = item.value;
        
        // Handle edit action (format: "edit:fieldName")
        if (value.startsWith('edit:')) {
          const field = value.substring(5);
          setEditingField(field);
          setView('editField');
          return;
        }
        
        // Handle other actions
        switch (value) {
          case 'add':
            setView('addField');
            break;
          case 'preview':
            setView('preview');
            break;
          case 'switchVariant':
            setView('selectVariant');
            break;
          case 'changeType':
            setView('selectType');
            break;
          case 'deleteField':
            // TODO: Implement delete field submenu
            break;
          case 'save':
            onSave(localStep);
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

export default StepEditor;
