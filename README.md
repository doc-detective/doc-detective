# <img src="https://github.com/doc-detective/doc-detective/blob/main/icon.png" width=50 style="vertical-align:middle;margin-bottom:7px"/> Doc Detective: The Documentation Testing Framework

![Current version](https://img.shields.io/github/package-json/v/doc-detective/doc-detective?color=orange)
[![NPM Shield](https://img.shields.io/npm/v/doc-detective)](https://www.npmjs.com/package/doc-detective)
[![Discord Shield](https://img.shields.io/badge/chat-on%20discord-purple)](https://discord.gg/2M7wXEThfF)
[![Docs Shield](https://img.shields.io/badge/docs-doc--detective.com-blue)](https://doc-detective.com)

Doc Detective is doc content testing framework that makes it easy to keep your docs accurate and up-to-date. You write tests, and Doc Detective runs them directly against your product to make sure your docs match your user experience. Whether it’s a UI-based process or a series of API calls, Doc Detective can help you find doc bugs before your users do.

Doc Detective ingests test specifications and text files, parses them for testable actions, then executes those actions in a browser. The results (PASS/FAIL and context) are output as a JSON object so that other pieces of infrastructure can parse and manipulate them as needed.

This project handles test parsing and web-based UI testing---it doesn't support results reporting or notifications. This framework is a part of testing infrastructures and needs to be complemented by other components.

## Components

Doc Detective has multiple components to integrate with your workflows as you need it to:

- Doc Detective (this repo): A standalone tool that enables testing without a separate Node project.
- [Doc Detective Core](https://github.com/doc-detective/doc-detective-core): An NPM package that provides the testing functionality.
- [Doc Detective Docs](https://github.com/doc-detective/doc-detective.github.io): Source files for [doc-detective.com](https://doc-detective.com).

## Install

1. Install prerequisites:

   - [Node.js](https://nodejs.org/) (tested on v20 and v22)

1. In a terminal, install Doc Detective globally:

   ```bash
   npm i -g doc-detective
   ```

   If you don't install Doc Detective globally, you'll be prompted to install the first time you run an `npx` command.

   **Note:** If you're working in a cloned `doc-detective` repository, run `npm i` to install local dependencies or the `npx` command in the next step will fail.

## Run tests

To run your tests, use the following command:

```bash
npx doc-detective
```

By default, Doc Detective scans the current directory for valid tests, but you can specify your test file with the `--input` argument. For example, to run tests in a file named `doc-content-inline-tests.md`, run the following command:

```bash
npx doc-detective --input doc-content-inline-tests.md
```

To customize your test, file type, and directory options, create a `.doc-detective.json` [config](https://doc-detective.com/docs/references/schemas/config.html) file. If a `.doc-detective.json` file exists in the directory when you run the comment, Doc Detective loads the config. Otherwise, you can specify a config path with the `--config` argument.

```bash
npx doc-detective --config .doc-detective.json
```

**Note**: All paths are relative to the current working directory, regardless where the config file is located.

You can override config options with command-line arguments. For example, to run tests in a file named `tests.spec.json`, even if that isn't included in your config, run the following command:

```bash
npx doc-detective --config .doc-detective.json --input tests.spec.json
```

### Check out some samples

You can find test and config samples in the [samples](https://github.com/doc-detective/doc-detective/tree/main/samples) directory.

## Concepts

- **Test specification**: A group of tests to run in one or more contexts. Conceptually parallel to a document.
- [**Test**](https://doc-detective.com/docs/get-started/tests): A sequence of steps to perform. Conceptually parallel to a procedure.
- **Step**: A portion of a test that includes a single action. Conceptually parallel to a step in a procedure.
- **Action**: The task a performed in a step. Doc Detective supports a variety of actions:
  - [**checkLink**](https://doc-detective.com/docs/get-started/actions/checkLink): Check if a URL returns an acceptable status code from a GET request.
  - [**click**](https://doc-detective.com/docs/get-started/actions/click): Click an element with the specified text or selector.
  - [**find**](https://doc-detective.com/docs/get-started/actions/find): Check if an element exists with the specified text or selector and optionally interact with it.
  - [**goTo**](https://doc-detective.com/docs/get-started/actions/goTo): Navigate to a specified URL.
  - [**httpRequest**](https://doc-detective.com/docs/get-started/actions/httpRequest): Perform a generic HTTP request, for example to an API.
  - [**runCode**](https://doc-detective.com/docs/get-started/actions/runCode): Execute code, such as how it appears in a code block.
  - [**runShell**](https://doc-detective.com/docs/get-started/actions/runShell): Perform a native shell command.
  - [**screenshot**](https://doc-detective.com/docs/get-started/actions/screenshot): Take a screenshot in PNG format.
  - [**loadVariables**](https://doc-detective.com/docs/get-started/actions/loadVariables): Load environment variables from a `.env` file.
  - [**record**](https://doc-detective.com/docs/get-started/actions/record) and [**stopRecord**](https://doc-detective.com/docs/get-started/actions/stopRecord): Capture a video of test execution.
  - [**type**](https://doc-detective.com/docs/get-started/actions/type): Type keys. To type special keys, begin and end the string with `$` and use the special key’s enum. For example, to type the Escape key, enter `$ESCAPE$`.
  - [**wait**](https://doc-detective.com/docs/get-started/actions/wait): Pause before performing the next action.
- [**Context**](https://doc-detective.com/docs/get-started/config/contexts): A combination of platform and application to run tests on.

## Develop

To develop Doc Detective, clone the repo and install dependencies:

```bash
git clone https://github.com/doc-detective/doc-detective.git
cd doc-detective
npm i
```

To run commands, use the same `npx` commands as above.

Make sure you review the [contributions guide](CONTRIBUTIONS.md) before submitting a pull request.

## Contributions

Looking to help out? See our [contributions guide](CONTRIBUTIONS.md) for more info. If you can't contribute code, you can still help by reporting issues, suggesting new features, improving the documentation, or sponsoring the project.

## License

This project uses the [AGPL-3.0 license](https://github.com/doc-detective/doc-detective/blob/master/LICENSE).
