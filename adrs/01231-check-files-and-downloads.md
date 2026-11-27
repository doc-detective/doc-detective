---
status: accepted
date: 2026-11-26
decision-makers: hawkeyexl
---

# Check files and browser downloads with a `checkFile` step

## Context and Problem Statement

Docs often end a procedure with a file: "Click **Export CSV**", "Run the build, then open
`out/report.txt`". Doc Detective can click the button or run the command, but no step checks the
file that results. Authors reach for Playwright's download API or a `runShell` script that polls
the disk.

Downloads are worse. v3 dropped the `downloadDirectory` config key without a replacement. Chrome
saves downloads to a temp folder named for browser recordings, which ADR 01176 stopped using.
Firefox and Safari have no download prefs, so Firefox prompts or saves to the user's own
Downloads folder.

How should a spec check that a file exists, is finished, and holds the right text, whether the
run wrote it or the browser downloaded it?

## Decision Drivers

* Wren (W2) documents export flows. Diego (D1) checks that a command writes its output.
* A downloaded file is a file. One step should cover both.
* Downloads land somewhere the runner owns, so parallel contexts and runs never share a folder.
* Browsers that can't save to a known folder skip clearly, never fail.
* One shared shape: the schema in common is the only contract.

## Considered Options

1. **One `checkFile` step, with a `download` key for the context's download folder** (chosen).
2. **Two steps, `checkFile` and `waitForDownload`.**
3. **A `download` option on `click`.**

## Decision Outcome

Chosen option 1.

### Download folder

Every desktop Chrome and Firefox context saves downloads, with no prompt, to
`<runDir>/specs/<specId>/tests/<testId>/contexts/<contextId>/downloads/`. That's next to the
context's `screenshots/` folder. A run whose tests include a `checkFile` `download` step counts
as writing artifacts, so the run folder is created for it.

* Chrome: `download.default_directory` points at the folder, with
  `download.prompt_for_download: false`.
* Firefox: `browser.download.folderList: 2`, `browser.download.dir`,
  `browser.download.useDownloadDir: true`, and
  `browser.download.always_ask_before_handling_new_types: false`.
* Safari has no setting for a download folder, so it keeps its own behavior.

The stale `downloadDirectory` config path entry goes. The browser-recording staging folder
(`browserDownloadDir`) stays, because the recorder still stages its `.webm` there before
transcoding, but no browser downloads into it any more.

### Interface

```json
{ "checkFile": "out/report.txt" }
{ "checkFile": { "path": "out/*.log", "content": "/build \\d+ passed/" } }
{ "checkFile": { "download": "*.csv" } }
{ "checkFile": { "download": "invoice-*.pdf", "content": "Invoice", "timeout": 60000 } }
```

| Key | Type | Default | Required | Effect |
|---|---|---|---|---|
| `checkFile` | string (shorthand for `path`) or object | | | |
| `path` | glob string, `minLength: 1`. Relative paths resolve against the spec, honoring `relativePathBase`. | none | one of `path` or `download` | Waits for a finished file matching this glob. |
| `download` | glob string, `minLength: 1`, matched against file names in the context's download folder | none | one of `path` or `download` | Waits for a finished download matching this glob. |
| `content` | string, or `/regex/`. Same convention as `runShell`'s `stdio`. | none | no | Fails unless the file's text, read as UTF-8, contains this. |
| `timeout` | integer ≥ 1, milliseconds | `30000` | no | How long to wait for a finished match. |

Outputs: `outputs.filePath` (absolute path), `outputs.fileName` (file name), and
`outputs.fileSize` (bytes). They follow `screenshotPath` and `recordingPath`. A bare `path` would
be read as `$$path` in step `variables`, which collides with the `PATH` environment variable.

| Case | Result | Message |
|---|---|---|
| `path` times out | FAIL | ``Couldn't find a finished file matching `<absolute glob>` within 30000 ms.`` |
| `download` times out | FAIL | ``Couldn't find a finished download matching `*.csv` within 30000 ms.`` |
| `content` doesn't match | FAIL | ``Couldn't find `Invoice` in `<absolute path>`.`` |
| `download` on Safari | SKIPPED | ``Skipped: `safari` can't save downloads to a known folder.`` |
| `download` on mobile, app, or no-browser contexts | SKIPPED | ``Skipped: `download` needs a desktop Chrome or Firefox context.`` |
| Both `path` and `download`, or neither | spec invalid, exit `2` | ``set `path` or `download`, not both.`` |

### Behavior

* **Finished:** a file counts once it has no `.crdownload` or `.part` suffix, no sibling of its
  name plus one of those suffixes (Firefox writes an empty placeholder next to its `.part` file),
  and its size is unchanged across two polls 250 ms apart. Polling continues until `timeout`.
* **`path` returns the newest finished match.** It points at the user's own files, so checking
  the same file twice passes twice.
* **`download` treats the folder as a queue.** It returns the oldest finished match that no earlier
  `checkFile` in this context returned. Two exports followed by two checks return two files. A
  download that finished before the step runs still counts. The queue lives on the context,
  because the folder is per context and a context can hold several browser sessions.
* `path` works in every context: browser, app, process, or none. It needs no browser, so it
  doesn't start one. `download` doesn't start a browser either: it checks the folder of the
  browser a previous step opened, and skips when the context has none.
* `content` reuses the runner's `stdio` matcher. A malformed `/regex/` is a mismatch.
* For checks beyond `content`, export `$$filePath` with step `variables` and read it in
  `runShell` or `runCode` through `process.env`.

### Consequences

* Good: export flows and generated files are testable with one step, in every OS.
* Good: downloads stay in the run folder, next to screenshots, and never in the user's own
  Downloads folder.
* Neutral: every desktop Chrome and Firefox context now has a download folder path, but the folder
  appears on disk only when something downloads.
* Bad: Safari can't take part in download checks.
* Bad: on Windows, Chrome can't save past the 260-character path limit. The folder sits deep in
  the run folder, so a long `outputDir`, spec ID, or test ID makes the download time out. The docs
  name the fix: a shorter `outputDir` or IDs.

### Confirmation

* `src/common/test/validate.test.js`: the shorthand, `path`, `download`, `content`, `timeout`;
  both keys, neither key, empty strings, unknown keys, and a zero `timeout` are rejected.
* `test/checkFile.test.js`: newest-wins for `path`, the download queue, ignoring `.crdownload` and
  `.part`, the size settle, a `content` string and regex, every message, and the Safari,
  mobile, app, and no-browser skips.
* `test/core-artifacts/process/check-file.spec.json`: `path` permutations on every OS.
* `test/core-artifacts/interactions/download.spec.json`: Chrome and Firefox downloads, two
  downloads, `content`, `timeout`, a `variables` and `runShell` check, and the Safari skip.

## Pros and Cons of the Options

### Option 1: one `checkFile` step with `download`
* Good: one step to learn. The download case is the file case pointed at a runner-owned folder.
* Good: works for files any step writes, not only downloads.
* Bad: one key, `download`, needs a browser while the rest of the step doesn't.

### Option 2: two steps
* Good: each step's needs are uniform.
* Bad: two names for one check, and `content` and `timeout` defined twice.

### Option 3: a `download` option on `click`
* Good: ties the download to the click that caused it.
* Bad: downloads also start from `goTo`, scripts, and keyboard input. Files that aren't downloads
  stay uncovered.
