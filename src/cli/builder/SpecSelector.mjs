/**
 * Spec selector component for choosing which spec to edit
 * When multiple input files are provided, this component displays a list
 * of specs for the user to choose from.
 */

import React from 'react';
const { useState, useEffect } = React;
import { Box, Text, useApp } from 'ink';
import * as path from 'path';
import { ScrollableSelect, NoIndicator } from './components.mjs';

/**
 * SpecSelector component - displays a list of specs to choose from
 * @param {Object} props
 * @param {Array} props.specs - Array of spec objects: { spec, filePath, extension, isValid, validationErrors }
 * @param {string} props.outputDir - Output directory for new specs
 */
const SpecSelector = ({ specs, outputDir }) => {
  const { exit } = useApp();
  const [selectedSpec, setSelectedSpec] = useState(null);
  const [TestBuilder, setTestBuilder] = useState(null);

  // Dynamically import TestBuilder when a spec is selected
  useEffect(() => {
    if (selectedSpec) {
      import('./TestBuilder.mjs').then(module => {
        setTestBuilder(() => module.default);
      });
    }
  }, [selectedSpec]);

  // Handle going back to the spec list
  const handleBack = () => {
    setSelectedSpec(null);
    setTestBuilder(null);
  };

  // If a spec is selected and TestBuilder is loaded, render the TestBuilder
  if (selectedSpec && TestBuilder) {
    return React.createElement(TestBuilder, {
      initialSpec: selectedSpec.spec,
      inputFilePath: selectedSpec.filePath,
      inputFileExtension: selectedSpec.extension,
      isValid: selectedSpec.isValid,
      validationErrors: selectedSpec.validationErrors,
      outputDir,
      onBack: handleBack,
    });
  }

  // Show loading state while TestBuilder is being imported
  if (selectedSpec && !TestBuilder) {
    return React.createElement(
      Box,
      { padding: 1 },
      React.createElement(Text, { color: 'cyan' }, 'Loading editor...')
    );
  }

  // Build menu items from specs
  const items = specs.map((specData, index) => {
    const { spec, filePath, isValid, validationErrors } = specData;
    const fileName = filePath ? path.basename(filePath) : 'untitled';
    const dirName = filePath ? path.dirname(filePath) : outputDir;
    const specId = spec.specId || spec.id || `Spec ${index + 1}`;
    const testCount = (spec.tests || []).length;
    
    // Build status indicator
    let statusIcon = '✅';
    let statusColor = 'green';
    if (!isValid) {
      statusIcon = '⚠️';
      statusColor = 'yellow';
    }

    return {
      label: `${statusIcon} ${specId}`,
      value: index,
      specData,
      fileName,
      dirName,
      testCount,
      isValid,
      validationErrors,
    };
  });

  // Add option to create new spec
  items.push({
    label: '➕ Create new specification',
    value: 'new',
  });

  // Add exit option
  items.push({
    label: '🚪 Exit',
    value: 'exit',
  });

  // Custom item component with additional details
  const SpecItem = ({ isSelected, label, value, fileName, dirName, testCount, isValid, validationErrors }) => {
    if (value === 'new' || value === 'exit') {
      return React.createElement(
        Box,
        { marginBottom: 1 },
        React.createElement(
          Text,
          { color: isSelected ? 'cyan' : 'white', bold: isSelected },
          (isSelected ? '❯ ' : '  ') + label
        )
      );
    }

    return React.createElement(
      Box,
      { flexDirection: 'column', marginBottom: 1 },
      React.createElement(
        Text,
        { color: isSelected ? 'cyan' : 'white', bold: isSelected },
        (isSelected ? '❯ ' : '  ') + label
      ),
      React.createElement(
        Box,
        { marginLeft: 4, flexDirection: 'column' },
        React.createElement(
          Text,
          { color: 'gray', dimColor: true },
          `📁 ${fileName}`
        ),
        React.createElement(
          Text,
          { color: 'gray', dimColor: true },
          `📂 ${dirName}`
        ),
        React.createElement(
          Text,
          { color: 'gray', dimColor: true },
          `📝 ${testCount} test${testCount !== 1 ? 's' : ''}`
        ),
        !isValid && validationErrors && React.createElement(
          Text,
          { color: 'yellow' },
          `⚠️  ${validationErrors}`
        )
      )
    );
  };

  const handleSelect = (item) => {
    if (item.value === 'exit') {
      exit();
      return;
    }
    
    if (item.value === 'new') {
      // Set a null selectedSpec to trigger TestBuilder with no initial spec
      setSelectedSpec({ spec: null, filePath: null, extension: null, isValid: true });
      return;
    }

    // Set the selected spec
    setSelectedSpec(item.specData);
  };

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
      React.createElement(Text, null, 'Select a specification to edit:')
    ),
    React.createElement(
      Box,
      { marginBottom: 1 },
      React.createElement(
        Text,
        { color: 'gray', dimColor: true },
        `Found ${specs.length} specification${specs.length !== 1 ? 's' : ''}`
      )
    ),
    React.createElement(ScrollableSelect, {
      items,
      itemComponent: SpecItem,
      indicatorComponent: NoIndicator,
      onSelect: handleSelect,
      limit: 5, // Show 5 specs at a time, each takes ~4 lines
    }),
    React.createElement(
      Box,
      { marginTop: 1 },
      React.createElement(
        Text,
        { color: 'gray', dimColor: true },
        'Use ↑↓ to navigate, Enter to select'
      )
    )
  );
};

export default SpecSelector;
