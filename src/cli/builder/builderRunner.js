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

  // Clear terminal and move cursor to top-left
  process.stdout.write('\x1b[2J\x1b[H');

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
        }),
        {
          // Use fullscreen mode to fill the terminal
          exitOnCtrlC: true,
        }
      );

      // Wait for the app to exit
      app.waitUntilExit().then(() => {
        // Clear screen on exit for clean terminal
        process.stdout.write('\x1b[2J\x1b[H');
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { runBuilder };
