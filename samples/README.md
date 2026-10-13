# Doc Detective Samples

This directory contains practical examples demonstrating Doc Detective's testing capabilities. Use these as starting points for your own documentation tests.

## Quick Start

Run any sample test from this directory:

```bash
npx doc-detective --input kitten-search.spec.json
```

Or run all tests with the config file:

```bash
npx doc-detective --config .doc-detective.json
```

## Configuration

- **`.doc-detective.json`** - Example config file showing how to configure test detection, inline test patterns for markdown, and markup rules for auto-generating tests from documentation prose.

## Test Specifications

Tests can be written as standalone JSON/YAML files or embedded inline in markdown documentation.

### Standalone Tests

- **`tests.spec.json`** - Comprehensive example showing all major action types (shell commands, HTTP requests, browser interactions, screenshots).
- **`kitten-search.spec.json`** - Simple browser test: navigate to DuckDuckGo, search for kittens, verify results.
- **`docker-hello.spec.json`** - Shell command test: run a Docker container and validate output.
- **`http.spec.yaml`** - HTTP API testing with environment variables and response validation.

### Inline Tests (Markdown)

Tests embedded directly in documentation using comment syntax. Doc Detective detects and executes these tests while leaving the documentation readable.

- **`kitten-search-inline.md`** - Step-by-step procedure with inline test specifications.
- **`doc-content-inline-tests.md`** - Documentation with explicit inline test steps.
- **`local-gui.md`** - GUI testing with inline tests and screenshot capture.

### Markup Detection

Documentation that uses natural language patterns to generate tests automatically. The `.doc-detective.json` config defines regex patterns that match common documentation phrases and convert them to test actions.

- **`kitten-search-detect.md`** - Uses natural language like "Click **Submit**" to auto-generate tests.
- **`doc-content-detect.md`** - Documentation that generates tests from markdown formatting and phrasing.

## Environment Variables

- **`variables.env`** / **`env`** - Example environment variable files used with the `setVariables`/`loadVariables` action.

## Learn More

- [Get Started Guide](https://doc-detective.com/docs/get-started/intro) - Learn the basics of Doc Detective
- [Test Reference](https://doc-detective.com/docs/get-started/tests) - Understand test structure and execution
- [Config Schema](https://doc-detective.com/docs/references/schemas/config.html) - Full configuration options

## Actions Demonstrated

These samples showcase Doc Detective's core testing actions:

- **`goTo`** - Navigate to URLs
- **`find`** - Locate elements by selector or text
- **`click`** - Click elements
- **`type`** / **`typeKeys`** - Type text and special keys
- **`checkLink`** - Validate link status codes
- **`httpRequest`** - Test APIs with request/response validation
- **`runShell`** - Execute shell commands and check output
- **`saveScreenshot`** / **`screenshot`** - Capture screenshots
- **`setVariables`** / **`loadVariables`** - Load environment variables
- **`startRecording`** / **`stopRecording`** - Record video of test execution
- **`wait`** - Add delays between actions
