/**
 * Builder runner - launches the Ink-based test builder
 * Uses dynamic imports to handle ESM dependencies
 */

/**
 * Run the interactive test builder
 * @param {Object} options - Builder options
 * @param {string} options.outputDir - Output directory for the spec file
 * @param {Object} options.initialSpec - Initial spec to edit (optional)
 * @returns {Promise<void>}
 */
async function runBuilder(options = {}) {
  const { outputDir = process.cwd(), initialSpec = null } = options;

  // Dynamic import of ESM modules
  const [{ render }, React, TestBuilderModule] = await Promise.all([
    import('ink'),
    import('react'),
    import('./TestBuilder.mjs'),
  ]);

  const TestBuilder = TestBuilderModule.default;

  return new Promise((resolve, reject) => {
    try {
      const app = render(
        React.createElement(TestBuilder, {
          initialSpec,
          outputDir,
        })
      );

      // Wait for the app to exit
      app.waitUntilExit().then(() => {
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { runBuilder };
