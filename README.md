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

### Lazy-installed runtime

`npm i doc-detective` installs the CLI and then, at postinstall, pre-installs the heavy runtime assets — browsers (Chrome, Firefox), drivers (ChromeDriver, Geckodriver), ffmpeg, and the npm packages that drive them (webdriverio, appium, sharp, etc.) — into `<os.tmpdir()>/doc-detective/` (or `DOC_DETECTIVE_CACHE_DIR`). This keeps a fresh install — and any Docker image built `FROM` it — ready to run without a separate step. The pre-install runs in a child process whose output is captured, so npm's deprecation warnings from the heavy transitive trees never reach your terminal.

**Opt out of the heavy pre-install** by setting `DOC_DETECTIVE_AUTOINSTALL=0` (also accepts `false`/`no`/`off`). The CLI install then stays small — no browser download, no heavy npm packages — and the heavy assets install lazily the first time a test needs them instead, or up front via `doc-detective install all`.

Either way, the *published* package declares the heavy packages in neither `dependencies` nor `optionalDependencies`, so npm itself never fetches them as part of the dependency tree. (In the source repo they live under `optionalDependencies`; the publish step rewrites them into a custom `ddRuntimeDependencies` field.) The resolver reads that field's version constraints when it installs each dep into the cache — whether at postinstall or on first use.

- **Pre-install everything up front:**

  ```bash
  doc-detective install all --yes
  ```

- **Install only what you need:**

  ```bash
  doc-detective install browsers chrome
  doc-detective install runtime webdriverio appium
  doc-detective install agents
  ```

- **Inspect what's installed vs. expected:**

  ```bash
  doc-detective install status
  ```

- **Override the cache location** (useful in containers and CI):

  ```bash
  DOC_DETECTIVE_CACHE_DIR=/opt/doc-detective doc-detective install all --yes
  ```

#### Prebuilt runtime cache

To make the *first* run on a fresh machine fast, each Doc Detective release ships prebuilt, per-platform tarballs of the warm cache (the heavy npm packages and the browsers/drivers) attached to the GitHub Release. Before falling back to the lazy `npm install`/browser download, the loader tries to restore the matching tarball for your exact platform and Doc Detective version, verifying it against a checksummed manifest.

The restore is **strict and self-healing**: it only proceeds when the release version, platform (OS, arch, libc, and OS major version), and every pinned dependency version match exactly, and the downloaded archive's SHA-256 matches its manifest. Any mismatch, checksum failure, or missing asset (e.g. a platform with no published tarball) silently falls back to the normal lazy install — you never get a broken cache, only a slower first run. Restores are recorded so a known-bad asset isn't re-downloaded on the next run.

Environment variables:

- **`DOC_DETECTIVE_PREBUILT=0`** — opt out of the prebuilt-cache restore entirely (also accepts `false`/`no`/`off`). Behavior is then identical to today's lazy install. Orthogonal to `DOC_DETECTIVE_AUTOINSTALL`.
- **`DOC_DETECTIVE_PREBUILT_BASE_URL`** — override the base URL the tarballs and manifests are fetched from (trailing slash optional). Useful for air-gapped mirrors or internal artifact stores. Defaults to the GitHub Release download path for your installed version.
- **`DOC_DETECTIVE_PIN_BROWSERS=1`** — treat an already-installed browser/driver record as authoritative and skip the daily channel re-check (the `resolveBuildId`/latest-geckodriver network call). Combined with a warm cache this makes repeat runs do zero browser-related network I/O. `--force` still bypasses it and reinstalls.

**Proxy note:** downloads use `axios`, which honors the standard `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` environment variables. Doc Detective's shim deliberately does not bundle a proxy agent, so in an environment where those variables aren't enough for the download to succeed, the prewarm restore simply fails and falls back to the lazy install path — it never blocks the run.

### Auto-update

By default, `doc-detective` checks the npm registry on startup and self-updates if a newer release is available — global installs run `npm install -g`, `npx` invocations re-exec via `npx -y doc-detective@latest`, and local project installs print an "update available" hint instead of mutating your `package.json`. To opt out:

- `--no-auto-update` on the CLI
- `autoUpdate: false` in `.doc-detective.json`
- `DOC_DETECTIVE_SKIP_AUTO_UPDATE=1` in the environment

CI environments (where `process.env.CI` is set) skip the check automatically.

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
