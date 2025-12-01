const { render } = require('ink');
const React = require('react');
const App = require('./App');
const { runTests } = require('doc-detective-core');

/**
 * Run tests with Ink-based CLI UI
 * @param {Object} config - Configuration object
 * @param {Object} options - Additional options like resolvedTests
 * @returns {Promise<Object>} Test results
 */
async function runWithUI(config, options = {}) {
  let appInstance;
  let updateState;

  // Create a promise that resolves when the app is mounted
  const mountPromise = new Promise((resolve) => {
    const AppWrapper = () => {
      const [state, setState] = React.useState({
        phase: 'initializing',
        results: null,
        error: null,
        currentSpec: null,
        currentTest: null,
        progress: {
          specs: { current: 0, total: 0 },
          tests: { current: 0, total: 0 },
          steps: { current: 0, total: 0 },
        },
      });

      // Store the state updater for external use
      React.useEffect(() => {
        updateState = setState;
        resolve();
      }, []);

      return React.createElement(App, {
        config,
        resolvedTests: options.resolvedTests,
        state,
      });
    };

    appInstance = render(React.createElement(AppWrapper));
  });

  // Wait for the app to mount
  await mountPromise;

  try {
    // Update to running phase
    updateState((prev) => ({ ...prev, phase: 'running' }));

    // Run tests
    const results = options.resolvedTests
      ? await runTests(config, { resolvedTests: options.resolvedTests })
      : await runTests(config);

    // Update to completed phase with results
    updateState((prev) => ({
      ...prev,
      phase: 'completed',
      results,
    }));

    // Wait a bit to show the results before unmounting
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Unmount the app
    if (appInstance) {
      appInstance.unmount();
    }

    return results;
  } catch (error) {
    // Update to error phase
    updateState((prev) => ({
      ...prev,
      phase: 'error',
      error: error.message,
    }));

    // Wait a bit to show the error before unmounting
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Unmount the app
    if (appInstance) {
      appInstance.unmount();
    }

    throw error;
  }
}

module.exports = { runWithUI };
