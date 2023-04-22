# <img src="https://github.com/doc-detective/doc-detective/blob/main/icon.png" width=50 style="vertical-align:middle;margin-bottom:7px"/> Doc Detective: The Documentation Testing Framework

[![Discord Shield](https://img.shields.io/badge/chat-on%20discord-purple)](https://discord.gg/2M7wXEThfF)
[![Docs Shield](https://img.shields.io/badge/docs-doc--detective.com-blue)](https://doc-detective.com)

Doc Detective is an open-source documentation testing framework that makes it easy to keep your docs accurate and up-to-date. You write low-code (soon no-code) tests, and Doc Detective runs them directly against your product to make sure your docs match your user experience. Whether it’s a UI-based process or a series of API calls, Doc Detective can help you find doc bugs before your users do.

Doc Detective ingests test specifications and text files, parses them for testable actions, then executes those actions in a browser. The results (PASS/FAIL and context) are output as a JSON object so that other pieces of infrastructure can parse and manipulate them as needed.

This project handles test parsing and web-based UI testing--it doesn't support results reporting or notifications. This framework is a part of testing infrastructures and needs to be complimented by other components.

## Beta status

Doc Detective v2 is in beta. The beta currently supports the following browsers and platforms:

- Commands: `runTests`
- Apps: Firefox
- Platforms: macOS, Linux (tested on Ubuntu)

When support for at least the following features, apps, and platforms are implemented, v2 will exit beta:

- Commands: `runCoverage`, `suggestTests`
- Actions: startRecording, stopRecording
- Apps: Chrome(ium)
- Platforms: Windows

After the v2 stable release, future updates may include support for the following items:

- Apps: Safari, iOS Safari, Edge, Android Chrome, native Windows, native macOS, native Linux
- Platforms: iOS, Android

## Components

Doc Detective has multiple components to integrate with your workflows as you need it to:

- Doc Detective (this repo): A standalone CLI tool that enables testing without a separate Node project.
- [Doc Detective Core](https://github.com/doc-detective/doc-detective-core/tree/2.0.0): An NPM package that provides the testing functionality.
- [Doc Detective Docs](https://github.com/doc-detective/doc-detective.github.io): Source files for [doc-detective.com](https://doc-detective.com).

## Get started

> This section covers running Doc Detective as a CLI tool. To use Doc Detective via another interface (like as an NPM package), [see the docs](https://doc-detective.com).

You can run Doc Detective as a CLI tool with Node:

0.  Install prerequisites:

    - [Node.js](https://nodejs.org/) (tested on 18.16.0)

1.  In a terminal, clone the repo and install dependencies:

    ```bash
    git clone --single-branch --branch 2.0.0 https://github.com/doc-detective/doc-detective.git
    cd doc-detective
    npm install
    ```

1.  Run your tests, specifying your test file with the `--input` argument. For example, to run tests in a file named `doc-content.md` in the `samples` directory, run the following command:

    ```bash
    npm run runTests -- --input ./samples/doc-content.md
    ```

    To customize your test, file type, and directory options, create a [`config.json`](https://doc-detective.com/reference/schemas/config.html) file and reference it with the `--config` argument.

    ```bash
    npm run runTests -- --config ./samples/config.json
    ```

    You can override `config.json` options with command-line arguments. For example, to run tests in a file named `tests.spec.json` in the `samples` directory, run the following command:

    ```bash
    npm run runTests -- --config ./samples/config.json --input ./samples/tests.spec.json
    ```

    To see all available options, use the `--help` argument:

    ```bash
    npm run runTests -- --help
    ```

## Concepts

-   [**Test specification**](https://doc-detective.com/reference/schemas/specification.html): A group of tests to run in one or more contexts. Conceptually parallel to a document.
-   [**Test**](https://doc-detective.com/reference/schemas/test.html): A sequence of steps to perform. Conceptually parallel to a procedure.
-   **Step**: A portion of a test that includes a single action. Conceptually parallel to a step in a procedure.
-   **Action**: The task a performed in a step. Doc Detective supports a variety of actions:
    -   [**checkLink**](https://doc-detective.com/reference/schemas/checkLink.html): Check if a URL returns an acceptable status code from a GET request.
    -   [**find**](https://doc-detective.com/reference/schemas/find.html): Check if an element exists with the specified selector.
    -   [**goTo**](https://doc-detective.com/reference/schemas/goTo.html): Navigate to a specified URL.
    -   [**httpRequest**](https://doc-detective.com/reference/schemas/httpRequest.html): Perform a generic HTTP request, for example to an API.
    -   [**runShell**](https://doc-detective.com/reference/schemas/runShell.html): Perform a native shell command.
    -   [**saveScreenshot**](https://doc-detective.com/reference/schemas/saveScreenshot.html): Take a screenshot in PNG format.
    -   [**setVariables**](https://doc-detective.com/reference/schemas/setVariables.html): Load environment variables from a `.env` file.
    -   [**typeKeys**](https://doc-detective.com/reference/schemas/typeKeys.html): Type keys. To type special keys, begin and end the string with `$` and use the special key’s enum. For example, to type the Escape key, enter `$ESCAPE$`.
    -   [**wait**](https://doc-detective.com/reference/schemas/wait.html): Pause before performing the next action.
-   [**Context**](https://doc-detective.com/reference/schemas/context.html): An application and platforms that support the tests.

## License

This project uses the [MIT license](https://github.com/doc-detective/doc-detective/blob/master/LICENSE).
