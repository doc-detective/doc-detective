/**
 * Field editor component - handles editing individual fields based on their schema (ESM version)
 */

import React from 'react';
const { useState, useEffect } = React;
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { SimpleTextInput } from './components.mjs';
import { validatePattern, describePattern, getFieldVariants, detectVariantIndex } from './schemaUtils.mjs';

/**
 * Variant type selector for fields with anyOf
 */
const FieldVariantSelector = ({ field, currentValue, onSelect, onCancel }) => {
  const variants = getFieldVariants(field);
  const currentIndex = detectVariantIndex(currentValue, variants);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  const items = variants.map((variant, index) => ({
    label: `${variant.title}${variant.description ? ' - ' + variant.description.substring(0, 40) : ''}`,
    value: `variant_${index}`,
    key: `variant_${index}`,
  }));

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(
      Box,
      { marginBottom: 1 },
      React.createElement(Text, { bold: true, color: 'cyan' }, field.name + ' - Select type:')
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
 * Universal field editor that adapts to field type
 */
const FieldEditor = ({
  field,
  value,
  onChange,
  onSubmit,
  onCancel,
  autoFocus = true,
}) => {
  const [localValue, setLocalValue] = useState(
    value !== undefined ? String(value) : ''
  );
  const [error, setError] = useState(null);
  const [showVariantSelector, setShowVariantSelector] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState(null);

  // Check if this field has anyOf variants (and it's not just an enum)
  const variants = getFieldVariants(field);
  const hasMultipleVariants = variants.length > 1 && !field.enum;

  // Determine the effective field based on selected variant
  const effectiveField = selectedVariant ? {
    ...field,
    type: selectedVariant.type,
    pattern: selectedVariant.schema.pattern,
    minimum: selectedVariant.schema.minimum,
    maximum: selectedVariant.schema.maximum,
    enum: selectedVariant.schema.enum,
    default: selectedVariant.schema.default,
  } : field;

  // Validate on change
  useEffect(() => {
    if (effectiveField.pattern && localValue) {
      const isValid = validatePattern(localValue, effectiveField.pattern);
      if (!isValid) {
        setError(describePattern(effectiveField.pattern));
      } else {
        setError(null);
      }
    } else {
      setError(null);
    }
  }, [localValue, effectiveField.pattern]);

  // Handle escape key
  useInput((input, key) => {
    if (key.escape) {
      if (showVariantSelector) {
        setShowVariantSelector(false);
      } else {
        onCancel();
      }
    }
  });

  // Show variant selector first if field has multiple variants and none selected
  if (hasMultipleVariants && !selectedVariant && showVariantSelector === false && value === undefined) {
    // Auto-show variant selector for new values
    setShowVariantSelector(true);
    return null;
  }

  if (showVariantSelector && hasMultipleVariants) {
    return React.createElement(FieldVariantSelector, {
      field,
      currentValue: value,
      onSelect: (index, variant) => {
        setSelectedVariant(variant);
        setShowVariantSelector(false);
        // Set default value based on variant type
        if (variant.type === 'null') {
          onChange(null);
          onSubmit(null);
        } else if (variant.type === 'boolean') {
          setLocalValue('true');
        } else if (variant.type === 'number' || variant.type === 'integer') {
          const defaultVal = variant.schema.default !== undefined ? String(variant.schema.default) : '0';
          setLocalValue(defaultVal);
        } else {
          setLocalValue('');
        }
      },
      onCancel: () => {
        setShowVariantSelector(false);
        onCancel();
      },
    });
  }

  // Enum field - use select input
  if (effectiveField.enum && Array.isArray(effectiveField.enum)) {
    const items = effectiveField.enum.map((opt) => ({
      label: String(opt),
      value: opt,
    }));

    // Add option to switch type if field has variants
    if (hasMultipleVariants) {
      items.push({ label: '↔ Switch type...', value: '_switchType' });
    }

    const initialIndex = Math.max(0, effectiveField.enum.indexOf(value));

    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(
        Box,
        { marginBottom: 0 },
        React.createElement(
          Text,
          { bold: true, color: 'cyan' },
          field.name + ':'
        ),
        selectedVariant && React.createElement(
          Text,
          { color: 'gray' },
          ' (' + selectedVariant.title + ')'
        )
      ),
      field.description &&
        React.createElement(
          Text,
          { color: 'gray', dimColor: true },
          '  ' + field.description
        ),
      React.createElement(
        Box,
        { marginTop: 1 },
        React.createElement(SelectInput, {
          items,
          initialIndex,
          onSelect: (item) => {
            if (item.value === '_switchType') {
              setShowVariantSelector(true);
            } else {
              onChange(item.value);
              onSubmit(item.value);
            }
          },
        })
      ),
      React.createElement(
        Text,
        { color: 'gray', dimColor: true },
        '  (Esc to cancel)'
      )
    );
  }

  // Boolean field
  if (effectiveField.type === 'boolean') {
    const items = [
      { label: 'true', value: true },
      { label: 'false', value: false },
    ];

    // Add option to switch type if field has variants
    if (hasMultipleVariants) {
      items.push({ label: '↔ Switch type...', value: '_switchType' });
    }

    const initialIndex = value === true ? 0 : 1;

    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(
        Box,
        { marginBottom: 0 },
        React.createElement(
          Text,
          { bold: true, color: 'cyan' },
          field.name + ':'
        ),
        selectedVariant && React.createElement(
          Text,
          { color: 'gray' },
          ' (' + selectedVariant.title + ')'
        )
      ),
      field.description &&
        React.createElement(
          Text,
          { color: 'gray', dimColor: true },
          '  ' + field.description
        ),
      React.createElement(
        Box,
        { marginTop: 1 },
        React.createElement(SelectInput, {
          items,
          initialIndex,
          onSelect: (item) => {
            if (item.value === '_switchType') {
              setShowVariantSelector(true);
            } else {
              onChange(item.value);
              onSubmit(item.value);
            }
          },
        })
      ),
      React.createElement(
        Text,
        { color: 'gray', dimColor: true },
        '  (Esc to cancel)'
      )
    );
  }

  // Number/Integer field
  if (effectiveField.type === 'number' || effectiveField.type === 'integer') {
    const handleChange = (val) => {
      setLocalValue(val);
      // Allow empty or valid numbers
      if (val === '' || val === '-') {
        setError(null);
      } else {
        const num = Number(val);
        if (isNaN(num)) {
          setError('Must be a number');
        } else if (effectiveField.minimum !== undefined && num < effectiveField.minimum) {
          setError(`Must be at least ${effectiveField.minimum}`);
        } else if (effectiveField.maximum !== undefined && num > effectiveField.maximum) {
          setError(`Must be at most ${effectiveField.maximum}`);
        } else {
          setError(null);
        }
      }
    };

    const handleSubmit = () => {
      if (error) return;
      const num = localValue === '' ? effectiveField.default : Number(localValue);
      onChange(num);
      onSubmit(num);
    };

    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(
        Box,
        null,
        React.createElement(
          Text,
          { bold: true, color: 'cyan' },
          field.name + ': '
        ),
        selectedVariant && React.createElement(
          Text,
          { color: 'gray' },
          '(' + selectedVariant.title + ') '
        ),
        React.createElement(SimpleTextInput, {
          value: localValue,
          onChange: handleChange,
          onSubmit: handleSubmit,
          focus: autoFocus,
        })
      ),
      field.description &&
        React.createElement(
          Text,
          { color: 'gray', dimColor: true },
          '  ' + field.description
        ),
      effectiveField.default !== undefined &&
        React.createElement(
          Text,
          { color: 'gray', dimColor: true },
          '  Default: ' + effectiveField.default
        ),
      hasMultipleVariants &&
        React.createElement(
          Text,
          { color: 'blue', dimColor: true },
          '  [Press Tab to switch type]'
        ),
      error && React.createElement(Text, { color: 'red' }, '  ✖ ' + error),
      React.createElement(
        Text,
        { color: 'gray', dimColor: true },
        '  (Enter to save, Esc to cancel)'
      )
    );
  }

  // Default: String field
  const handleSubmit = () => {
    if (error) return;
    onChange(localValue);
    onSubmit(localValue);
  };

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(
      Box,
      null,
      React.createElement(
        Text,
        { bold: true, color: 'cyan' },
        field.name + ': '
      ),
      selectedVariant && React.createElement(
        Text,
        { color: 'gray' },
        '(' + selectedVariant.title + ') '
      ),
      React.createElement(SimpleTextInput, {
        value: localValue,
        onChange: setLocalValue,
        onSubmit: handleSubmit,
        focus: autoFocus,
      })
    ),
    field.description &&
      React.createElement(
        Text,
        { color: 'gray', dimColor: true },
        '  ' + field.description
      ),
    effectiveField.pattern &&
      React.createElement(
        Text,
        { color: 'gray', dimColor: true },
        '  Pattern: ' + describePattern(effectiveField.pattern)
      ),
    effectiveField.default !== undefined &&
      React.createElement(
        Text,
        { color: 'gray', dimColor: true },
        '  Default: ' + String(effectiveField.default)
      ),
    hasMultipleVariants &&
      React.createElement(
        Text,
        { color: 'blue', dimColor: true },
        '  [Type "?" to switch type]'
      ),
    error && React.createElement(Text, { color: 'red' }, '  ✖ ' + error),
    React.createElement(
      Text,
      { color: 'gray', dimColor: true },
      '  (Enter to save, Esc to cancel)'
    )
  );
};

export default FieldEditor;
