/**
 * Builder runner - launches the Ink-based test builder
 * Uses dynamic imports to handle ESM dependencies
 */

/**
 * Run the interactive test builder
 * @param {Object} options - Builder options
 * @param {string} options.outputDir - Output directory for the spec file
 * @param {Object} options.initialSpec - Initial spec to edit (optional, deprecated - use specs instead)
 * @param {Array} options.specs - Array of spec objects to choose from: { spec, filePath, extension, isValid, validationErrors }
 * @returns {Promise<void>}
 */
async function runBuilder(options = {}) {
  const { outputDir = process.cwd(), initialSpec = null, specs = [] } = options;

  // Clear terminal and move cursor to top-left
  process.stdout.write('\x1b[2J\x1b[H');

  // Dynamic import of ESM modules
  const [{ render }, React, TestBuilderModule, SpecSelectorModule] = await Promise.all([
    import('ink'),
    import('react'),
    import('./TestBuilder.mjs'),
    import('./SpecSelector.mjs'),
  ]);

  const TestBuilder = TestBuilderModule.default;
  const SpecSelector = SpecSelectorModule.default;

  return new Promise((resolve, reject) => {
    try {
      let component;
      
      if (specs.length > 1) {
        // Multiple specs - show selector
        component = React.createElement(SpecSelector, {
          specs,
          outputDir,
        });
      } else if (specs.length === 1) {
        // Single spec - go directly to editor
        const { spec, filePath, extension, isValid, validationErrors } = specs[0];
        component = React.createElement(TestBuilder, {
          initialSpec: spec,
          inputFilePath: filePath,
          inputFileExtension: extension,
          isValid,
          validationErrors,
          outputDir,
        });
      } else if (initialSpec) {
        // Legacy: initialSpec provided directly
        component = React.createElement(TestBuilder, {
          initialSpec,
          outputDir,
        });
      } else {
        // No specs - create new
        component = React.createElement(TestBuilder, {
          outputDir,
        });
      }

      const app = render(component, {
        // Use fullscreen mode to fill the terminal
        exitOnCtrlC: true,
      });

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
