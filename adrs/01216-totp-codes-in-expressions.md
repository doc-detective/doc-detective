---
status: accepted
date: 2026-11-25
decision-makers: hawkeyexl
---

# TOTP codes in expressions

## Context and Problem Statement

Many sign-in flows ask for a one-time code from an authenticator app after the password. A
doc test can't read a phone, so it stops at the code prompt. The code depends only on a shared
base32 secret and the clock (RFC 6238). If the test holds the secret, the runner can compute it.

How should a test get the current code?

## Decision Drivers

* No new dependency. `node:crypto` has HMAC-SHA-1.
* The secret stays in the environment, so CI secrets and masking cover it.
* A code generated near the end of its 30-second window can expire before the form submits.
* Fit the existing expression surface instead of adding a step type.

## Considered Options

* **A. A `totp(secret)` function operator in expressions.**
* **B. A `totp` option on the `type` action.**
* **C. A new step that writes the code to a variable.**

## Decision Outcome

Chosen option: **A**. `totp(secret)` joins `jq()` and `extract()` as an always-on function
operator in `evaluateExpression`, so it runs in a step's `variables` and in conditions.

* RFC 6238 with SHA-1, 6 digits, and a 30-second step: the defaults nearly every site uses.
* The secret is base32. Spaces, lowercase letters, and `=` padding are accepted.
* If fewer than 3 seconds remain in the window, evaluation waits for the next window first. The
  3 seconds is fixed.
* `runStep` substitutes `$NAME` variables in the whole step before it resolves `variables`. So
  `totp("$TOTP_SECRET")` reads the secret from the environment. The existing masking hides both
  the secret and the exported code.
* A secret that isn't base32 throws ``Couldn't generate a TOTP code: the secret isn't valid
  base32.`` Inside `{{...}}`, the embedded-expression contract (ADR 01014) keeps the text verbatim.
  It logs that message as a warning. A bare `totp(...)` in `variables` fails the step,
  like a bad `jq()` query (ADR 01151).

Expressions don't run in other step fields, such as `type.keys`. A test generates the code in
the `variables` of the step that opens the prompt, then types `$OTP_CODE`.

### Consequences

* Good, because a test can sign in to a two-factor account with no device and no new dependency.
* Good, because the secret rides the existing env, CI-secret, and masking paths.
* Bad, because SHA-256, SHA-512, 8-digit, and 60-second variants aren't supported. Add optional
  arguments when someone needs one.
* Bad, because a slow app can take longer than 3 seconds to submit. Make the margin configurable
  if that shows up.

### Confirmation

* `test/totp.test.js` checks the RFC 6238 Appendix B SHA-1 vectors, truncated to 6 digits. It also
  covers the secret formats, a bad secret, and the window wait on a fake clock. Last, it checks
  resolution through `{{...}}`, a bare call, and `$VAR` substitution.
* `test/core-artifacts/sessions/totp.spec.json` runs on every OS without an authenticator. It
  checks the 6-digit shape, that two calls in one window match, and that a bad secret keeps the
  `{{...}}` text.

## Pros and Cons of the Options

### A. A function operator

* Good, because it reuses the expression evaluator and its error contract.
* Good, because the code lands in a variable that any later step can use.
* Bad, because it needs a carrier step's `variables`.

### B. A `type` option

* Good, because it's one step.
* Bad, because it only works for `type`, and adds a schema field to one action.

### C. A new step type

* Good, because it's explicit.
* Bad, because it adds a schema, docs, and a runner branch for one computed value.
