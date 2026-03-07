# Doc Detective VSCode Extension

The Doc Detective VSCode Extension integrates the [Doc Detective](https://doc-detective.com) documentation testing framework directly into your Visual Studio Code environment. This extension helps you detect, view, and manage documentation tests embedded in your content files, making it easier to keep your documentation accurate and up-to-date.

## Features

- **Real-time Test Detection**: Automatically detects Doc Detective tests in your open files
- **Sidebar Integration**: View detected tests in a dedicated Doc Detective panel in the activity bar
- **Interactive Test Explorer**: Navigate through detected tests with collapsible sections for easy viewing
- **Syntax Highlighting**: Tests are displayed with proper syntax highlighting for improved readability

## How It Works

Doc Detective is a documentation testing framework that helps validate documentation against real product behavior. This extension uses `doc-detective-common` (the shared library in `src/common`) to scan your documentation files for embedded tests and displays them in the sidebar panel.

## Requirements

- Visual Studio Code v1.101.0 or higher

## Installation

### Via VS Code Marketplace

1. Open VS Code
2. Go to the Extensions view (Ctrl+Shift+X)
3. Search for "Doc Detective"
4. Click Install

### Manual Installation

If you prefer to install the extension manually:

1. Download the VSIX file from the [latest release](https://github.com/doc-detective/doc-detective/releases/latest)
2. In VS Code, go to the Extensions view (Ctrl+Shift+X)
3. Click the "..." menu in the top right of the Extensions view
4. Select "Install from VSIX..." and choose the downloaded file

## Using Doc Detective Extension

1. Open a file that contains Doc Detective tests or inline test steps
2. Click the Doc Detective icon in the activity bar
3. Review the detected tests in your document

The extension will automatically scan open files for:
- Inline tests using HTML comments or markdown comment syntax
- Test specifications in YAML or JSON format
- Documentation with embedded test steps

## Configuration

### Config Path

You can specify a custom path to your Doc Detective configuration file using the `docDetective.configPath` setting:

1. Open VS Code Settings (File > Preferences > Settings)
2. Search for "Doc Detective"
3. Set the "Config Path" field to your configuration file path

The path can be:
- **Absolute path**: Full path to your config file (e.g., `/home/user/my-project/.doc-detective.json`)
- **Relative path**: Path relative to your workspace root (e.g., `config/.doc-detective.yaml`)

If no custom path is specified, the extension automatically searches for these files in your workspace root:
- `.doc-detective.json`
- `.doc-detective.yaml`
- `.doc-detective.yml`

The configuration file can be in JSON or YAML format and follows the Doc Detective configuration schema.

## Related Projects

This extension is part of the [Doc Detective monorepo](https://github.com/doc-detective/doc-detective):

- **`src/common`**: Shared library for test detection and schema validation
- **`src/core`**: Core testing functionality (browser automation, HTTP requests, etc.)
- **`src/vscode`**: This VS Code extension
- **`src/container`**: Docker image for running Doc Detective in containers

## Learn More

- [Doc Detective Documentation](https://doc-detective.com)
- [GitHub Repository](https://github.com/doc-detective/doc-detective)
- [Discord Community](https://discord.gg/2M7wXEThfF)

## Contributing

Interested in contributing to this extension? Check out the [Doc Detective GitHub organization](https://github.com/doc-detective) to learn more about the project and how to get involved.

---

**Made with ❤️ by the Doc Detective team**
