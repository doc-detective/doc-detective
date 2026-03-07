# Test Artifacts

This directory contains comprehensive test artifacts borrowed from [doc-detective/core](https://github.com/doc-detective/core) for thorough testing of the Doc Detective Docker images.

## Overview

These test artifacts validate various Doc Detective actions and ensure the Docker images work correctly across different platforms and browsers.

## Files

### Configuration
- **config.json**: Main configuration file that sets up test contexts for the Chrome browser on different platforms
- **env**: Environment variables file used by tests (contains USER, JOB, SECRET, URL, WAIT variables)

### Spec Files
Test specification files that validate different Doc Detective actions:

- **test.spec.json**: Main comprehensive test that exercises multiple actions
- **setup.spec.json**: Setup tasks run before tests
- **cleanup.spec.json**: Cleanup tasks run after tests

#### Action-Specific Tests
- **checkLink.spec.json**: Tests link validation functionality
- **goTo.spec.json**: Tests navigation to URLs
- **find_matchText.spec.json**: Tests finding elements by text matching
- **find_rightClick.spec.json**: Tests right-click functionality
- **find_setVariables.spec.json**: Tests variable setting from found elements
- **runShell.spec.json**: Tests shell command execution
- **runShell_pipes.spec.json**: Tests piped shell commands
- **type.spec.json**: Tests keyboard input
- **wait.spec.json**: Tests wait/delay functionality

#### Context-Specific Tests
- **context_chrome.spec.json**: Tests specific to Chrome browser
- **context_firefox.spec.json**: Tests specific to Firefox browser
- **context_safari.spec.json**: Tests specific to Safari browser

### Documentation Files
- **doc-content.md**: Sample markdown documentation with embedded test steps
- **httpRequestFormat.md**: Documentation for HTTP request formatting

### Server-Dependent and Environment-Specific Tests
The `../requires-server/` directory (at `src/container/test/requires-server/` from the repository root) contains tests that require special environments:
- **cookie-test.spec.json**: Tests cookie handling (requires Docker-in-Docker and localhost server)
- **dragAndDrop.spec.json**: Tests drag-and-drop functionality (requires localhost server on port 8092)
- **httpRequest.spec.yaml**: Tests HTTP request actions (requires localhost server on port 8092)
- **runCode.spec.json**: Tests code execution in multiple languages with additional runtimes/tooling that may not be available in all container or CI/CD environments
- **screenshot.spec.json**: Tests screenshot capture and comparison (has image aspect ratio comparison issues)

These are separated from the main test artifacts directory to avoid failures when running tests in CI/CD environments without the required dependencies or servers.

## Running Tests

### Full Test Suite
```bash
npm run container:test
```

This runs all spec files in `src/container/test/artifacts` inside the Docker container. Tests in `src/container/test/requires-server/` are not included.

### Individual Spec Files
To run a specific spec file:
```bash
docker run --rm -v "$(pwd)/src/container/test/artifacts:/app" docdetective/docdetective:latest-linux \
  -c /app/config.json \
  -i /app/checkLink.spec.json
```

### With Test Server
To run server-dependent tests, first start a test server on port 8092, then:
```bash
docker run --rm --network=host -v "$(pwd)/src/container/test/requires-server:/app" docdetective/docdetective:latest-linux \
  -c /app/config.json \
  -i /app/
```

Note: These tests are located in `src/container/test/requires-server/`, not under `src/container/test/artifacts/`.

## Test Results

Tests generate a `results.json` file with detailed information about:
- Spec pass/fail counts
- Test pass/fail counts
- Context execution results
- Individual step results
