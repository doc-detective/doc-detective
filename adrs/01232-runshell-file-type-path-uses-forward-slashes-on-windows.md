---
status: accepted
date: 2026-11-26
decision-makers: hawkeyexl
---

# A runShell file type's `$1` uses forward slashes on Windows

## Context and Problem Statement

A `runShell` file type replaces `$1` with the matched file's absolute path. On Windows that path
has backslashes, such as `C:\docs\a.cjs`. The default shell on Windows is bash from Git for
Windows. Bash strips backslashes from an unquoted word. The documented `"command": "node $1"`
then runs `node C:docsa.cjs`, and the test fails.

How should `$1` reach the shell so the documented, unquoted form works on every platform?

## Decision Drivers

* The documented `node $1` example must work on Windows, macOS, and Linux.
* Configs that already quote `$1` as `'$1'` or `"$1"` must keep working unchanged.
* Paths on macOS and Linux must not change.

## Considered Options

* Substitute the path with forward slashes on Windows.
* Wrap the substituted path in quotes.
* Leave the path as is and document quoting.

## Decision Outcome

Chosen option: "Substitute the path with forward slashes on Windows". Windows APIs and the tools
users run, such as Node.js and Python, accept `C:/docs/a.cjs`. Bash leaves forward slashes alone,
quoted or not. Other platforms get the path unchanged.

### Consequences

* Good, because `node $1` works on Windows without quotes.
* Good, because `'$1'` and `"$1"` keep their quotes and still work.
* Bad, because a command that needs native backslashes now gets forward slashes. Few Windows tools
  reject them.
* Neutral, because a path with spaces still needs quotes around `$1`, as on any shell.

### Confirmation

`substituteFilePath()` in `src/core/detectTests.ts` takes the platform as a parameter.
`test/detecttests-coverage.test.js` checks the Windows and non-Windows forms on every OS. The
`runshell-path` case in `test/core-artifacts/detection/dry-run-detect.cjs` runs quoted and
unquoted `$1` through the CLI on Windows, macOS, and Linux.

## Pros and Cons of the Options

### Substitute the path with forward slashes on Windows

* Good, because it needs no change to existing configs.
* Good, because bash, `cmd.exe`, and PowerShell all accept the result.
* Bad, because the path differs from the one in the spec's `contentPath`.

### Wrap the substituted path in quotes

* Good, because it also protects paths with spaces.
* Bad, because `'$1'` would become doubly quoted and break existing configs.
* Bad, because quoting rules differ between bash, `cmd.exe`, and PowerShell.

### Leave the path as is and document quoting

* Good, because it changes no behavior.
* Bad, because the documented `node $1` example stays broken on Windows.
