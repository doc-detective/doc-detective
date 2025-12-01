const React = require('react');
const { Box, Text } = require('ink');
const Spinner = require('ink-spinner').default;

const TestRunner = ({ config, progress, currentSpec, currentTest }) => {
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color="yellow">
          <Spinner type="dots" /> Running tests...
        </Text>
      </Box>

      {/* Progress bars */}
      {progress.specs.total > 0 && (
        <Box marginBottom={0}>
          <Text color="gray">
            Specs: {progress.specs.current}/{progress.specs.total}
          </Text>
        </Box>
      )}

      {progress.tests.total > 0 && (
        <Box marginBottom={0}>
          <Text color="gray">
            Tests: {progress.tests.current}/{progress.tests.total}
          </Text>
        </Box>
      )}

      {progress.steps.total > 0 && (
        <Box marginBottom={1}>
          <Text color="gray">
            Steps: {progress.steps.current}/{progress.steps.total}
          </Text>
        </Box>
      )}

      {/* Current execution context */}
      {currentSpec && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="cyan">Current: {currentSpec}</Text>
          {currentTest && (
            <Text color="gray" dimColor>
              → {currentTest}
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
};

module.exports = TestRunner;
