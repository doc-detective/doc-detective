const React = require('react');
const { Box, Text } = require('ink');

const ResultsSummary = ({ results, config }) => {
  if (!results || !results.summary) {
    return (
      <Box>
        <Text color="yellow">No results available.</Text>
      </Box>
    );
  }

  const { specs, tests, contexts, steps } = results.summary;

  // Calculate totals
  const totalSpecs = specs ? specs.pass + specs.fail + specs.warning + specs.skipped : 0;
  const totalTests = tests ? tests.pass + tests.fail + tests.warning + tests.skipped : 0;
  const totalContexts = contexts ? contexts.pass + contexts.fail + contexts.warning + contexts.skipped : 0;
  const totalSteps = steps ? steps.pass + steps.fail + steps.warning + steps.skipped : 0;

  // Check for failures
  const hasFailures =
    (specs && specs.fail > 0) ||
    (tests && tests.fail > 0) ||
    (contexts && contexts.fail > 0) ||
    (steps && steps.fail > 0);

  // Check if all skipped
  const allSpecsSkipped =
    specs && specs.pass === 0 && specs.fail === 0 && specs.skipped > 0;

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold underline>
          Test Results Summary
        </Text>
      </Box>

      {/* Summary sections */}
      {specs && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Specs</Text>
          <Box marginLeft={2}>
            <Text>Total: {totalSpecs} </Text>
            {specs.pass > 0 && <Text color="green">✓ {specs.pass} passed </Text>}
            {specs.fail > 0 && <Text color="red">✖ {specs.fail} failed </Text>}
            {specs.warning > 0 && <Text color="yellow">⚠ {specs.warning} warnings </Text>}
            {specs.skipped > 0 && <Text color="gray">⊘ {specs.skipped} skipped</Text>}
          </Box>
        </Box>
      )}

      {tests && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Tests</Text>
          <Box marginLeft={2}>
            <Text>Total: {totalTests} </Text>
            {tests.pass > 0 && <Text color="green">✓ {tests.pass} passed </Text>}
            {tests.fail > 0 && <Text color="red">✖ {tests.fail} failed </Text>}
            {tests.warning > 0 && <Text color="yellow">⚠ {tests.warning} warnings </Text>}
            {tests.skipped > 0 && <Text color="gray">⊘ {tests.skipped} skipped</Text>}
          </Box>
        </Box>
      )}

      {contexts && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Contexts</Text>
          <Box marginLeft={2}>
            <Text>Total: {totalContexts} </Text>
            {contexts.pass > 0 && <Text color="green">✓ {contexts.pass} passed </Text>}
            {contexts.fail > 0 && <Text color="red">✖ {contexts.fail} failed </Text>}
            {contexts.warning > 0 && <Text color="yellow">⚠ {contexts.warning} warnings </Text>}
            {contexts.skipped > 0 && <Text color="gray">⊘ {contexts.skipped} skipped</Text>}
          </Box>
        </Box>
      )}

      {steps && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Steps</Text>
          <Box marginLeft={2}>
            <Text>Total: {totalSteps} </Text>
            {steps.pass > 0 && <Text color="green">✓ {steps.pass} passed </Text>}
            {steps.fail > 0 && <Text color="red">✖ {steps.fail} failed </Text>}
            {steps.warning > 0 && <Text color="yellow">⚠ {steps.warning} warnings </Text>}
            {steps.skipped > 0 && <Text color="gray">⊘ {steps.skipped} skipped</Text>}
          </Box>
        </Box>
      )}

      {/* Overall status */}
      <Box marginTop={1}>
        {allSpecsSkipped ? (
          <Text color="yellow">⚠ All items were skipped</Text>
        ) : hasFailures ? (
          <Text color="red" bold>
            ✖ Tests failed
          </Text>
        ) : (
          <Text color="green" bold>
            ✓ All tests passed!
          </Text>
        )}
      </Box>

      {/* Failed items detail */}
      {hasFailures && results.specs && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="red">
            Failed Items:
          </Text>
          {getFailedItems(results).map((item, index) => (
            <Box key={index} marginLeft={2}>
              <Text color="red">
                • {item}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

// Helper function to extract failed items
function getFailedItems(results) {
  const failures = [];

  if (!results.specs) return failures;

  results.specs.forEach((spec, specIndex) => {
    if (spec.result === 'FAIL') {
      failures.push(`Spec: ${spec.specId || `Spec ${specIndex + 1}`}`);
    }

    if (spec.tests && spec.tests.length > 0) {
      spec.tests.forEach((test, testIndex) => {
        if (test.result === 'FAIL') {
          failures.push(
            `Test: ${test.testId || `Test ${testIndex + 1}`} (from ${
              spec.specId || `Spec ${specIndex + 1}`
            })`
          );
        }

        if (test.contexts && test.contexts.length > 0) {
          test.contexts.forEach((context, contextIndex) => {
            if (
              context.result === 'FAIL' ||
              (context.result && context.result.status === 'FAIL')
            ) {
              failures.push(
                `Context: ${context.platform || 'unknown'}/${
                  context.browser ? context.browser.name : 'unknown'
                } (from ${test.testId || `Test ${testIndex + 1}`})`
              );
            }

            if (context.steps && context.steps.length > 0) {
              context.steps.forEach((step, stepIndex) => {
                if (step.result === 'FAIL') {
                  failures.push(
                    `Step: ${step.stepId || `Step ${stepIndex + 1}`} - ${
                      step.resultDescription || 'Unknown error'
                    }`
                  );
                }
              });
            }
          });
        }
      });
    }
  });

  return failures;
}

module.exports = ResultsSummary;
