const React = require('react');
const { Box, Text } = require('ink');
const Spinner = require('ink-spinner').default;
const TestRunner = require('./TestRunner');
const ResultsSummary = require('./ResultsSummary');

const App = ({ config, resolvedTests, state }) => {
  return (
    <Box flexDirection="column" paddingY={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Doc Detective
        </Text>
      </Box>

      {state.phase === 'initializing' && (
        <Box>
          <Text color="gray">
            <Spinner type="dots" /> Initializing...
          </Text>
        </Box>
      )}

      {state.phase === 'running' && (
        <TestRunner
          config={config}
          progress={state.progress}
          currentSpec={state.currentSpec}
          currentTest={state.currentTest}
        />
      )}

      {state.phase === 'completed' && state.results && (
        <ResultsSummary results={state.results} config={config} />
      )}

      {state.phase === 'error' && (
        <Box flexDirection="column">
          <Text color="red" bold>
            ✖ Error
          </Text>
          <Text color="red">{state.error}</Text>
        </Box>
      )}
    </Box>
  );
};

module.exports = App;
