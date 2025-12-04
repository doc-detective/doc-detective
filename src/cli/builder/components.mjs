/**
 * Reusable components for the test builder (ESM version)
 */

import React from 'react';
const { useState, useEffect, useMemo } = React;
import { Box, Text, useInput, useStdout } from 'ink';
import SelectInput from 'ink-select-input';

/**
 * Custom item component for SelectInput that wraps text properly
 */
export const DescriptiveItem = ({ isSelected, label, description }) => {
  return React.createElement(
    Box,
    { flexDirection: 'column', marginBottom: description ? 1 : 0 },
    React.createElement(
      Text,
      { 
        color: isSelected ? 'cyan' : 'white',
        bold: isSelected,
      },
      (isSelected ? '❯ ' : '  ') + label
    ),
    description && React.createElement(
      Box,
      { marginLeft: 4 },
      React.createElement(
        Text,
        { color: 'gray', dimColor: true, wrap: 'wrap' },
        description
      )
    )
  );
};

/**
 * Custom indicator that works with DescriptiveItem (returns null since indicator is in item)
 */
export const NoIndicator = () => null;

/**
 * Scrollable SelectInput with viewport indicators
 * Shows ▲ when there are items above the viewport
 * Shows ▼ when there are items below the viewport
 */
export const ScrollableSelect = ({ 
  items, 
  onSelect, 
  itemComponent = DescriptiveItem,
  indicatorComponent = NoIndicator,
  limit: customLimit,
  initialIndex = 0,
}) => {
  const { stdout } = useStdout();
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  
  // Calculate visible items based on terminal height
  // Reserve lines for: header, scroll indicators, footer hints
  const terminalHeight = stdout?.rows || 24;
  const reservedLines = 8; // Header, title, hints, margins
  const defaultLimit = Math.max(5, Math.floor((terminalHeight - reservedLines) / 3)); // ~3 lines per item with description
  const limit = customLimit || defaultLimit;

  // Track scroll position
  const scrollOffset = useMemo(() => {
    if (selectedIndex < limit) {
      return 0;
    }
    return Math.min(selectedIndex - limit + 1, items.length - limit);
  }, [selectedIndex, limit, items.length]);

  const hasItemsAbove = scrollOffset > 0;
  const hasItemsBelow = scrollOffset + limit < items.length;

  // Handle keyboard navigation to track selected index
  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => Math.min(items.length - 1, prev + 1));
    }
  });

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    // Scroll up indicator
    hasItemsAbove && React.createElement(
      Box,
      { marginLeft: 2 },
      React.createElement(
        Text,
        { color: 'yellow' },
        `▲ ${scrollOffset} more above`
      )
    ),
    // The actual select input
    React.createElement(SelectInput, {
      items,
      limit,
      initialIndex,
      itemComponent,
      indicatorComponent,
      onSelect,
      onHighlight: (item) => {
        const idx = items.findIndex(i => i.value === item.value);
        if (idx !== -1) setSelectedIndex(idx);
      },
    }),
    // Scroll down indicator
    hasItemsBelow && React.createElement(
      Box,
      { marginLeft: 2 },
      React.createElement(
        Text,
        { color: 'yellow' },
        `▼ ${items.length - scrollOffset - limit} more below`
      )
    )
  );
};

/**
 * Simple text input using ink's useInput hook
 */
export const SimpleTextInput = ({ value, onChange, onSubmit, placeholder = '', focus = true }) => {
  const [cursorVisible, setCursorVisible] = useState(true);

  // Blink cursor
  useEffect(() => {
    if (!focus) return;
    const interval = setInterval(() => {
      setCursorVisible((v) => !v);
    }, 500);
    return () => clearInterval(interval);
  }, [focus]);

  useInput(
    (input, key) => {
      if (!focus) return;

      if (key.return) {
        if (onSubmit) onSubmit(value);
        return;
      }

      if (key.backspace || key.delete) {
        onChange(value.slice(0, -1));
        return;
      }

      // Ignore control characters
      if (key.ctrl || key.meta || key.escape) {
        return;
      }

      // Add printable characters
      if (input && !key.ctrl && !key.meta) {
        onChange(value + input);
      }
    },
    { isActive: focus }
  );

  const displayValue = value || '';
  const showPlaceholder = displayValue.length === 0 && placeholder;

  return React.createElement(
    Box,
    null,
    showPlaceholder
      ? React.createElement(Text, { color: 'gray', dimColor: true }, placeholder)
      : React.createElement(Text, null, displayValue),
    focus && cursorVisible && React.createElement(Text, { color: 'cyan' }, '█')
  );
};

/**
 * Labeled text input with validation support
 */
export const LabeledTextInput = ({
  label,
  value,
  onChange,
  placeholder = '',
  error = null,
  description = '',
  focus = true,
  onSubmit,
}) => {
  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(
      Box,
      null,
      React.createElement(Text, { bold: true, color: 'cyan' }, label + ': '),
      React.createElement(SimpleTextInput, {
        value: value || '',
        onChange,
        placeholder,
        focus,
        onSubmit,
      })
    ),
    description &&
      React.createElement(
        Text,
        { color: 'gray', dimColor: true },
        '  ' + description
      ),
    error &&
      React.createElement(Text, { color: 'red' }, '  ✖ ' + error)
  );
};

/**
 * Labeled enum selector
 */
export const EnumSelector = ({
  label,
  options,
  value,
  onSelect,
  description = '',
}) => {
  const items = options.map((opt) => ({
    label: opt,
    value: opt,
  }));

  // Find initial index
  const initialIndex = Math.max(0, options.indexOf(value));

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(
      Box,
      { marginBottom: 0 },
      React.createElement(Text, { bold: true, color: 'cyan' }, label + ':')
    ),
    description &&
      React.createElement(
        Text,
        { color: 'gray', dimColor: true },
        '  ' + description
      ),
    React.createElement(SelectInput, {
      items,
      initialIndex,
      onSelect: (item) => onSelect(item.value),
    })
  );
};

/**
 * Navigation menu with title
 */
export const Menu = ({
  title,
  items,
  onSelect,
  description = '',
}) => {
  return React.createElement(
    Box,
    { flexDirection: 'column' },
    title &&
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, { bold: true, color: 'cyan' }, title)
      ),
    description &&
      React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(Text, { color: 'gray' }, description)
      ),
    React.createElement(SelectInput, {
      items,
      onSelect: (item) => onSelect(item.value, item),
    })
  );
};

/**
 * Display JSON with syntax highlighting
 */
export const JsonPreview = ({ data, title = 'Preview', maxLines = 30 }) => {
  const jsonStr = JSON.stringify(data, null, 2);
  const lines = jsonStr.split('\n');
  const truncated = lines.length > maxLines;
  const displayLines = truncated ? lines.slice(0, maxLines) : lines;

  const getLineColor = (line) => {
    if (line.includes('": "')) return 'green';
    if (line.includes('": true') || line.includes('": false')) return 'yellow';
    if (line.includes('": null')) return 'gray';
    if (/": \d/.test(line)) return 'magenta';
    return 'white';
  };

  return React.createElement(
    Box,
    { flexDirection: 'column', borderStyle: 'single', borderColor: 'gray', paddingX: 1 },
    React.createElement(
      Box,
      { marginBottom: 1 },
      React.createElement(Text, { bold: true, color: 'cyan' }, title)
    ),
    React.createElement(
      Box,
      { flexDirection: 'column' },
      displayLines.map((line, i) =>
        React.createElement(
          Text,
          { key: i, color: getLineColor(line) },
          line
        )
      )
    ),
    truncated &&
      React.createElement(
        Text,
        { color: 'gray', dimColor: true },
        `... (${lines.length - maxLines} more lines)`
      )
  );
};

/**
 * Status bar showing current location and validation status
 */
export const StatusBar = ({
  location = [],
  validationStatus = null,
  hint = '',
}) => {
  const locationStr = location.length > 0 ? location.join(' > ') : 'Home';

  return React.createElement(
    Box,
    {
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderStyle: 'single',
      borderColor: 'gray',
      paddingX: 1,
      marginBottom: 1,
    },
    React.createElement(
      Box,
      null,
      React.createElement(Text, { color: 'cyan' }, '📍 '),
      React.createElement(Text, { bold: true }, locationStr)
    ),
    validationStatus !== null &&
      React.createElement(
        Box,
        null,
        validationStatus
          ? React.createElement(Text, { color: 'green' }, '✓ Valid')
          : React.createElement(Text, { color: 'red' }, '✖ Invalid')
      ),
    hint &&
      React.createElement(
        Text,
        { color: 'gray', dimColor: true },
        hint
      )
  );
};

/**
 * Yes/No confirmation prompt
 */
export const ConfirmPrompt = ({ message, onConfirm, onCancel }) => {
  useInput((input, key) => {
    if (input.toLowerCase() === 'y' || key.return) {
      onConfirm();
    } else if (input.toLowerCase() === 'n' || key.escape) {
      onCancel();
    }
  });

  return React.createElement(
    Box,
    null,
    React.createElement(Text, { color: 'yellow' }, message + ' '),
    React.createElement(Text, { color: 'gray' }, '(Y/n)')
  );
};

export default {
  SimpleTextInput,
  LabeledTextInput,
  EnumSelector,
  Menu,
  JsonPreview,
  StatusBar,
  ConfirmPrompt,
  DescriptiveItem,
  NoIndicator,
  ScrollableSelect,
};
