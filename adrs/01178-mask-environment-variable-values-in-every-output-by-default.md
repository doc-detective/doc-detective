---
status: accepted
date: 2026-11-07
decision-makers: doc-detective maintainers
---

# Mask environment variable values in every output by default

Supersedes item 0.1, "Mask secrets", of [docs/design/v5-rollout.md](../docs/design/v5-rollout.md), which planned
name-based masking on 4.x. Prior art: PR #647, and its ADRs 01071 (inline `$secret.NAME` references) and 01072
(run-wide secret mask registry). This decision keeps 01072's exact-value registry and drops 01071's opt-in syntax.

## Context and Problem Statement

`replaceEnvs` writes each substituted value into the step, and the step report spreads the step. So a token
written as `$API_TOKEN` appears in the report's command, its stdout, and its headers. From there it reaches every
reporter, the `-o` file, and `--json`. It also reaches the run folder, the Action's issue body, and the debug log. Values also
arrive with no `$NAME` at all: a project `.env`, a `loadVariables` file, or a credential file loads them, and a
child process prints them.

PR #647 masked only values the author declared with `$secret.NAME`, and it failed any step that compared one. Most
specs already use plain `$NAME` for credentials, so opt-in masking leaves them exposed until every author edits
every spec.

Which values does Doc Detective treat as secret, how does a user say a value isn't, and where is it masked?

## Decision Drivers

- Safe by default: a credential a spec already uses is masked without an edit.
- Steps keep working. A comparison, a routing condition, `$$`, and a `variables` export see the real value.
- One rule a user can predict, and one key to say a value is public.
- Runner values such as `HOME=/home/runner`, `USER=runner`, `GITHUB_REF_NAME=main`, and `CI=true` don't erase
  paths, branch names, and common words from every report.
- Every output path is covered, including ones added later.

## Considered Options

- **A. Mask every value a run uses or loads, plus secret-looking names, with `publicVariables` for exceptions**
  (chosen).
- **B. Opt-in `$secret.NAME` references** (PR #647).
- **C. Mask the value of every environment variable.**
- **D. Mask by name only** (rollout item 0.1).

## Decision Outcome

Chosen option: **A**.

### The masking rule

A value is secret when all of these hold:

1. It came from one of these:
   - a substituted `$NAME`, in a step, config, or OpenAPI example, including a variable a step's `variables`
     exported;
   - a variable loaded from `.env`, `loadVariables`, or a credential file (`apiKeyFile`, `apiTokenFile`), even if
     never referenced;
   - a variable whose name contains `TOKEN`, `SECRET`, `PASSWORD`, `API_KEY`, `PRIVATE_KEY`, or `CREDENTIAL`
     (case-insensitive), even if never referenced.
2. Its name doesn't match `publicVariables`.
3. It's at least 4 characters and isn't `true`, `false`, or `null`.

A value registered under several names is secret if any of those names isn't public. A credential file's value is
registered under its config key, `apiKey` or `apiToken`.

### `publicVariables`

An array of names on the config, a spec, or a test. `*` matches any characters, so `["*"]` turns masking off.
Names match the way the platform's environment does: case-insensitively on Windows. There's no default, there's no
flag (`DOC_DETECTIVE_CONFIG` covers one-off runs), and declarations only add.

The union of every level across the run is public for the whole run. One variable has one value across a run, so
once any test shows it, masking it elsewhere protects nothing. A spec or test can't make a name secret again.

### Mask text and forms

A secret value shows as `***NAME***`. When that text would itself contain a secret, such as `MY_TOKEN=TOKEN`, it's
`***`. These forms are masked, longest first:

- raw, JSON-escaped, and HTML-escaped;
- URL-encoded four ways, each with `%20` and `+` for spaces. They're `encodeURIComponent`, strict RFC 3986
  (which also encodes `!'()*`, as curl `--data-urlencode` and Python's `quote` do), and `URLSearchParams`. The
  fourth also encodes `~`, as PHP's `urlencode` and older curl do;
- base64 and base64url at all three byte alignments, for values of 7 or more bytes, so short values don't scrub
  image data;
- a `Basic <token>` header: the token is decoded, and if it holds a secret the whole token becomes `***NAME***`.
  That covers a password too short for a base64 needle.

A value a child process hashes, splits, or otherwise transforms isn't masked.

### Where values are registered

- `replaceEnvs`, for each value it substitutes. It also notes each `$NAME` it sees.
- `loadProjectEnv` (`.env`) and `loadEnvs` (config and step `loadVariables`), for every name parsed. Each
  registers the value the run uses, which is the shell's when the file doesn't override. It also registers the
  file's value when that differs.
- `readCredentialFiles`.
- A step's `variables` export, when the run references the name as `$NAME` or the name looks secret. That way a
  log line can't print it before a later step substitutes it.
- At run start, once specs are resolved: every secret-looking variable in `process.env`, and every `$NAME` the
  specs will substitute. That covers logs printed before a step runs.

The registry is module state, shared by concurrent runners, and append-only for the process. Tests reset it
between cases. Each core `runTests` starts with an empty public list and no hint names, so an earlier
programmatic run's `["*"]` can't unmask a later one. Two runs at once in one process still share one public
list.

### Masked copies

Reports are masked as copies of their values. Keys are never masked: they're report structure, and a value such
as `pass` or `test` would rename `summary.specs.pass` or `tests` and break counts and exit codes. Logs still mask
a key's text, because `diag()` masks the whole line. An object with a `toJSON` method, such as axios's response
headers, is masked as what `toJSON` returns, since that's what serializes. Other class instances are walked by
their own enumerable properties. Buffers, typed arrays, dates, and regular expressions stay as they are.

### Where output is masked

| Output | How |
|---|---|
| Log lines | `diag()` masks every line. The core `log` masks object messages before `JSON.stringify` |
| Step reports | Masked when created, in `pushStepReport` and `stopAllRecordings`' direct push. The runner keeps the real `outputs` for routing, `$$`, and `variables` |
| Truncated text | Each site masks before it cuts. That's the schema-error value preview, ffmpeg's stderr tail on start and stop, and the Android emulator's boot log. Background `runShell` buffers keep real values. Their cut moves past any secret it would split instead |
| Results | Masked once more at the end of core `runTests`. That covers every reporter, `-o`, `--json`, the run folder, `reportResults`, the JS API return, Online, and the Action |
| The dry-run plan | Masked before `runTests` returns it |
| CLI errors | The top-level error line and the crash report |
| Core warnings that bypassed `log` | Detection's parse warning, OpenAPI example generation, and element finding printed with `console.*`. They print through `diag()` now. `readFile` already warns through `log` |

Not masked:

- what `runViaApi` sends to run;
- telemetry, which sends counts only;
- `doc-detective debug`, which keeps `src/debug/redact.ts`;
- `saveCookie` files, which `loadCookie` reads back;
- `getRunner().runStep`, which returns a step's real result to the program driving it, like the outputs routing
  reads.

### Saved files

runShell, runCode, httpRequest, and runBrowserScript mask what they save through `path`: `maskString` on text,
`maskDeep` on an httpRequest's JSON body. A comparison with an existing file (`maxVariation`,
`overwrite: "aboveVariation"`) masks the new output first, so it compares masked against masked. A saved file
then keeps matching when the secret behind it rotates. `saveCookie` files stay raw, because `loadCookie` reads them
back.

### Browser captures

Masking text can't reach pixels, so the page hides secrets itself:

- Before a `type` step types keys that hold a secret, it styles the focused field with
  `-webkit-text-security: disc`, or `color: transparent` where the browser lacks that property. The style stays
  for the life of the page, so later screenshots and recording frames show dots.
- Before each browser screenshot through `saveScreenshot` (authored, automatic, and recording checkpoints), it
  blurs every form field whose value holds a secret. It also blurs every element with text of its own whose whole
  text holds one. The blur is `filter: blur(8px)`. It captures, then removes the blur.
- The page never receives a secret. Its own scripts could patch `String.prototype.includes` to read an argument,
  and with automatic screenshots on, any third-party page a test opens would get `GITHUB_TOKEN`. So a first
  script returns `[index, text]` candidates, Node picks the indices that hold a secret, and a second script blurs
  those. Hiding a typed field sends no argument at all; the typed keys reach the page by typing, which is
  unavoidable.
- Failures fail closed where they'd show a secret. If the blur scripts fail, the screenshot fails rather than
  capture the page unblurred. If hiding a typed field fails, typing goes on and logs at debug. A later screenshot
  still blurs that field, because its value holds the secret.
- Not covered, and documented: page text that shows a secret during a recording, and native app and device
  captures. Text in iframes, shadow DOM, canvas, and CSS pseudo-elements isn't blurred either.

### Messages

- Debug, at run start, names only: `Masking the values of 4 variables: API_TOKEN, BASE_URL, PASSWORD, SESSION.`
- Hint `listPublicVariables`, priority 30, when a masked name doesn't look secret:

  ```
  `BASE_URL` and `APP_ENV` show as `***NAME***` in this run's output. If they aren't secret, list them in `publicVariables`:
    "publicVariables": ["BASE_URL", "APP_ENV"]
  ```

  The plan named the hint `publicVariables`. Hint ids are verb-first (`src/hints/AGENTS.md`), so it's
  `listPublicVariables`. Names and the mask are in backticks, because the hint renderer reads `_` and `*` as
  emphasis.

Exit codes don't change, and masking never fails a run. An invalid `publicVariables` is a config error (exit 2):

```
Error: Invalid config in DOC_DETECTIVE_CONFIG:
publicVariables: must be array (got "BASE_URL").
See https://docs.doc-detective.com/reference/schemas/config
```

### Consequences

- Good: credentials a spec already uses are masked with no edit, in every output, including ones added later.
- Good: comparisons and routing keep working, because masking is output-only.
- Bad: a non-secret value the run substitutes or loads is masked too, such as a `BASE_URL`. The hint names it,
  and `publicVariables` shows it. A path built from a masked value is masked in reports. A reporter can't link
  a file under it until the variable is public.
- Bad: exact-value masking misses transformed values, and over-masks when a value collides with ordinary output.
  The 4-character floor bounds the worst of it.
- Bad: a background process's 256 KiB buffer drops a secret that straddles its cut rather than keeping part of it.
- Neutral: `runShell` children inherit the whole environment, so a child can print a variable no rule registers.
  The docs say so.
- Neutral: the runtime installers' default loggers (`src/runtime/loader.ts`, `installer.ts`, `browsers.ts`,
  `selfUpdate.ts`) keep `console.*`. They print package names, versions, paths, and npm output, never run data,
  and moving them to stderr would change what `install` prints.
- Neutral: masking costs a scan per log line and a walk of each step report and the results. It's skipped when
  nothing is registered.

### Confirmation

- `test/masking.test.js`:
  - each form, the base64 floor, and `Basic` decoding;
  - the 4-character floor, and `true`, `false`, and `null`;
  - exact and `*` names with Windows case handling, and the run-wide union;
  - a value under a public and a secret name, and the `***` fallback;
  - idempotence, cycle safety, and `keepTail`;
  - keys never masked, and `toJSON` and class instances;
  - the strict and `URLSearchParams` URL encodings.
- `test/masking-runner.test.js`:
  - registration at each point, including a shell value that beats `.env` and a config `loadVariables` file;
  - the step report masked while routing, `stdio`, and a `variables` export see the real value;
  - a secret-named variable never referenced, and the union across specs;
  - no fragment of a 300-character secret in runShell and httpRequest failures;
  - report keys kept when values are `pass` and `test`, and httpRequest response headers;
  - each run's own public list and hint names, the dry-run plan, and the debug line.
- `test/cli-contract.test.js`:
  - the value is absent from `-o`, `--json`, stderr at `-l debug`, and the dry run;
  - `publicVariables` shows it, and a non-array is exit 2;
  - a run with `DB_PASSWORD=pass` and `NODE_ENV=test` in `.env` passes and exits 0.
- `src/common/test/validate.test.js`: `publicVariables` on `config_v3`, `spec_v3`, and `test_v3`.
- `test/hints.test.js`: `listPublicVariables`.
- Fixture `test/core-artifacts/cli/masking.spec.json`, through `cli/masking.cjs`:
  - an `Authorization` header the 8092 server echoes into an httpRequest response header;
  - referenced, `.env`, and secret-named values;
  - `publicVariables` exact, `DD_*`, and `*` on the config, a spec, and a test;
  - a 3-character value, and URL-encoded and base64 forms;
  - a `Basic` header the 8092 server echoes.
- Saved files, in `test/masking-runner.test.js`:
  - runShell, runCode, httpRequest, and runBrowserScript `path` files hold `***NAME***`;
  - a second run with `maxVariation: 0` passes with a variation of `0`;
  - a `saveCookie` file keeps the real value.

  The fixture case `path-save-and-compare` runs the CLI twice against one saved file.
- Browser captures, in `test/masking-capture.test.js`, in headless Chrome against the 8092 page:
  - the candidate, selection, and blur scripts blur exact text, text inside a longer string, split text, and an
    input value;
  - they skip a `<script>`, and blur nothing when no secret is registered.

  With a stubbed driver, it checks four things:
  - no page script receives a secret value;
  - a blur the page won't run fails the screenshot, naming why;
  - typing hides the field only when the keys hold a secret;
  - a page that rejects the style doesn't fail the `type` step.
- `test/screenshot-resize-to-reference.test.js` checks that the retake at a reference's size blurs too.
- A focused test in `test/core-core.test.js` screenshots an element that holds a secret. Inside that element, the
  image differs from one taken with `publicVariables: ["*"]`. Below it, the two match.
- Fixture `test/core-artifacts/interactions/type-secret.spec.json` types a secret, a public variable, and literal
  text in headless Chrome and Firefox. Only the secret hides the field. Both browsers support
  `-webkit-text-security`, so the `color: transparent` fallback covers older engines only.

## Pros and Cons of the Options

### A. What the run uses or loads, plus secret-looking names

- Good: safe by default for the values a run handles, with no spec edits.
- Good: one public list, at any level, with a hint that names candidates.
- Bad: masks some public values until listed.

### B. Opt-in `$secret.NAME`

- Good: never over-masks.
- Bad: every existing `$NAME` credential stays exposed until an author edits it.
- Bad: forbidding comparisons breaks login flows that check what a user typed.

### C. Every environment variable

- Good: nothing in the environment leaks.
- Bad: erases runner paths, branch names, and words like `main` and `true` from every report.

### D. Names only

- Good: predictable.
- Bad: misses `$PASS`, `$KEY`, and `.env` values with plain names, the common case.
