---
status: accepted
date: 2026-11-06
decision-makers: doc-detective maintainers
---

# Let HTTP header values hold spaces

## Context and Problem Statement

The built-in `httpRequestFormat` definition reads a request from an `http` or unlabeled code block. It's shared by the
Markdown, AsciiDoc, HTML, and DITA built-ins ([ADR 01158](01158-move-the-built-ins-to-selectors.md)). Its pattern
matched a header line as `\S+:[ \t]+\S+`, so a header value couldn't hold whitespace. Many real values do, such as
`Content-Type: application/json; charset=utf-8` or `Accept: text/html, application/json`.

When a value held a space, the header block ended before that line. The header and every line after it, including the
blank line, became the body. The step sent no such header, and a JSON body didn't parse.

How should the pattern read a header line?

## Decision Drivers

- A request in a docs page should send the headers it shows.
- The body must still start after the blank line, and land in `$4`.
- Requests without headers, or without a body, must still parse.
- Keep one shared definition for every format.

## Considered Options

- **A. A header value runs to the end of its line: `\S+:[ \t]+[^\r\n]+`.**
- **B. Allow single spaces between non-space runs: `\S+:[ \t]+\S+(?:[ \t]+\S+)*`.**
- **C. Keep the pattern, and document that values can't hold spaces.**

## Decision Outcome

Chosen option: **A**.

The header part of the pattern is now `((?:\S+:[ \t]+[^\r\n]+(?:\r?\n|$))+)`. The header block still ends at the first
line that isn't a header, which is the blank line before the body. The step's header normalization already trims each
value, so trailing whitespace doesn't reach the request.

This changes what the default config detects, so it lands in 5.0 with the other detection changes.

### Consequences

- Good: header values with spaces reach the request, and the body after them parses.
- Good: one change fixes all four built-ins.
- Neutral: a body line right after the headers, with no blank line between, can still read as a header if it looks
  like `name: value`. That was already true of single-word values.
- Bad: a suite that relied on the old split, with the headers in the body, now sends different requests.

### Confirmation

- `src/common/test/builtins.test.js` asserts a multi-word header value, a request with no body, and a request with no
  headers, in Markdown, AsciiDoc, HTML, and DITA.
- The parity test against the frozen regex tables in `test/fixtures/regex-fileTypes.js` passes unchanged. No detection
  fixture held a header value with a space.
- The `builtin-markdown` case in `test/core-artifacts/detection/dry-run-detect.cjs` detects the header through the real
  CLI.

## Pros and Cons of the Options

### A. Run to the end of the line

- Good: the simplest pattern, and it matches how HTTP defines a header line.
- Neutral: trailing whitespace is kept in the capture and trimmed later.

### B. Spaced runs of non-space characters

- Good: no trailing whitespace in the capture.
- Bad: a longer pattern for the same result.

### C. Keep the pattern

- Good: no change.
- Bad: common requests in docs keep sending the wrong headers.
