# Hints — AI Coding Agent Guide

This package owns the post-run hint system: a small, opt-out feature that
prints **one** contextual tip after a test run completes (pass or fail —
several built-in hints, like `enableDebugLog` and
`useRecordStepOnFailure`, intentionally fire on failures). Hints
nudge users toward features they aren't yet using (CI workflow, HTML
reporter, stable find patterns, etc.).

When you add a feature anywhere in doc-detective, **consider adding a
hint** that surfaces it to users who would benefit. This file is the
playbook.

---

## When to add a hint (and when not to)

Add a hint when:

- The feature is **opt-in** and most users won't discover it on their own.
- There is a **detectable signal** that tells you the feature would
  actually help right now (a flag they didn't set, a step type they're
  not using, a config field they left at default).
- The payload is **immediately actionable** — a code sample, a flag,
  a short config snippet — not a long explanation.

Skip when:

- The feature is the default (`detectSteps`, `recursive`) — no nudging
  needed.
- The signal would be too noisy (e.g. "user has tests" is true for
  everyone running `doc-detective`; don't gate on that).
- The hint would need to fire on every run forever (e.g. "consider
  contributing on GitHub" — that's marketing, not a hint).
- The advice depends on subjective judgment ("you should refactor your
  selectors") rather than a measurable signal.

If in doubt: **don't add the hint.** A noisy hint registry teaches users
to ignore the entire feature.

---

## Anatomy of a hint

```ts
{
  id: "useStableFindingPatterns",
  priority: 20,
  markdown: [
    "Selectors are the #1 source of flaky doc tests. Prefer stable",
    "identifiers — accessible labels, ARIA roles, or `data-testid`:",
    "",
    "```diff",
    "- find: { selector: \"#login button.primary\" }",
    "+ find: { elementText: \"Sign in\", elementAria: \"button\" }",
    "```",
    "",
    "More: [doc-detective.com/docs/find](https://doc-detective.com/docs/references/schemas/find)",
  ].join("\n"),
  when: (ctx) => ctx.failedCount > 0 && ctx.usedSelectorOnlyFinds,
}
```

Every hint is a `{ id, priority?, markdown, when }` object in
[`hints.ts`](./hints.ts). Adding a hint is a **single-file change**
unless you need a new context signal — see "Adding new context signals"
below.

---

## Id rules

- **Stable forever once shipped.** Ids surface in debug logs today and
  will become user-visible if a per-hint disable list is added later.
  Renaming a shipped id breaks anyone who'd added it to a disable list
  in their config.
- **camelCase.** Matches the convention used everywhere else in the
  project (step names like `goTo` / `httpRequest`, config fields like
  `concurrentRunners` / `afterAll`).
- **Verb-first.** Start with the action you want the user to take:
  `use`, `add`, `enable`, `extract`, `install`, `upgrade`, `set`, `try`,
  `gitignore`. So: `useScreenshotStep`, `addNpmScript`,
  `extractAfterAllCleanup`, `gitignoreOutputDir`.
- **Embed API names verbatim** when referencing them. Doc Detective's
  schema field and step names are already camelCase, so they drop in
  directly: `useHttpRequestStep`, `extractAfterAllCleanup`,
  `useLoadCookieSaveCookie`. The id stays grep-able against the schema.
- **No hyphens, underscores, or other separators.**
- **Order entries alphabetically by id** in [`hints.ts`](./hints.ts) so
  reviewers can scan the list.

The id-shape regex is enforced by `test/hints.test.js`:
`/^[a-z][a-zA-Z0-9]*$/`.

---

## Priority bands

Pick the **lowest band** that applies — lower = more important. The
selection algorithm filters to the lowest priority among eligible hints
before random-picking, so a tier-10 hint always wins over a tier-50 hint
when both are eligible.

| Band | When to use |
|------|-------------|
| **10** — onboarding | First-run setup. CI workflow, config file, npm script, installAgents. The user is new, give them the runway. |
| **20** — current-run problems | Something failed *this run* or the env is misconfigured. Old Node, no tests resolved, brittle selectors, no recording on failure. |
| **30** — output & reporting | Better artifacts. HTML reporter, JSON for CI artifacts, output dir. |
| **40** — feature discovery | A first-class step type the user hasn't reached for yet. screenshot, checkLink, httpRequest, runCode. |
| **50** — optimization & advanced | Power-user setup. concurrency hints, beforeAny/afterAll, origin, fileTypes, telemetry userId. |

Omit `priority` only if you genuinely mean priority 50 (the default).
Better to be explicit.

---

## Predicate rules (hard requirements)

1. **Synchronous and pure.** Predicates are called once per hint per
   run; they must not block, do I/O, or throw. All probing goes in
   [`context.ts`](./context.ts), which builds a fully populated
   `HintContext` before any predicate runs.

2. **Defensive.** Read every field with `?.` and tolerate missing data.
   `ctx.config?.reporters?.includes("html")` — not
   `ctx.config.reporters.includes("html")`. The hint registry must work
   on a half-broken results shape from a failed run.

3. **Tight.** A hint should fire when the user would clearly benefit,
   not just when "feature X isn't enabled." The `tryHtmlReporter`
   hint, for example, gates on the user having an explicit reporters
   array — not on the (default) absence of `html`. We don't tell users
   "you could use HTML" unconditionally.

4. **Skipped when the feature is already in use.** Always include the
   "is the user already doing this?" check. `useScreenshotStep` only
   fires when no screenshot was actually produced this run.

5. **Anything that throws inside `when()` is caught and logged at
   `debug` level by `maybeShowHint`. Don't rely on this — write
   predicates that can't throw.

---

## Markdown rules

The body is rendered by [`render.ts`](./render.ts), which supports a
deliberate subset:

- `**bold**`
- `_italic_`
- `` `inline code` `` (cyan)
- ``` ```fenced``` ``` blocks (cyan, indented)
- `[text](url)` (OSC 8 hyperlink when terminal supports it, otherwise
  `text (url)` with a cyan url)
- `- ` / `* ` bullet lists

Style:

- **One line per prose paragraph in the source array.** The terminal
  soft-wraps based on its width. Do not hand-wrap prose at ~70 columns
  — that produces hard line breaks the terminal can't reflow, so a hint
  designed to be 2 lines on a narrow terminal becomes 4 lines on a wide
  one (or vice versa). Each entry in the `markdown` array is either a
  full prose paragraph (one long string, however long), an empty string
  for vertical spacing, a fenced-code delimiter line (`` ```bash ``),
  or one line of code-block / bullet-list content (which DO want
  individual lines).
- **2-3 short prose paragraphs.** If you need more, link to the docs.
- **One fenced code block.** More than one and the hint feels like a
  tutorial.
- **Always link the docs.** A markdown link to
  `doc-detective.com/docs/...` at the end of the body. The user wants to
  know where to read more.
- **No headings.** The hint is already prefixed with `💡 Hint:`.
- **No emojis** beyond what the renderer already emits.
- **Don't promise the moon.** "Prefer X — usually faster" is honest;
  "X is 10x faster" is a claim to substantiate elsewhere.

---

## Adding a new context signal

Most hints can be expressed against the existing `HintContext`
([`types.ts`](./types.ts)). Before adding a new field, check that an
existing one doesn't already cover it.

If you do need a new signal:

1. **Add it to `HintContext`** in [`types.ts`](./types.ts). Use a
   primitive (`number`, `boolean`) or `Set<string>` over arrays so
   predicates stay one-liners.

2. **Populate it in [`context.ts`](./context.ts).** If it can be
   computed from `results.specs[]`, fold it into the existing
   `walkResults` pass — don't add a second walk. If it needs the
   filesystem, add a small helper next to `readNpmScripts` /
   `detectOutputDirGitignored` and **wrap in try/catch with a safe
   default** (`false`, `0`, empty `Set`).

3. **Bound the cost.** Cheap signals are: a single file read, a single
   linear walk over already-in-memory data, an `os.platform()` check.
   Expensive things require a budget:
   - Filesystem walks: cap at 100 files (see `detectRstFiles` in
     `context.ts` for the canonical pattern — `scanForExtensions` with
     a budget callback).
   - Async probes (e.g. agent adapters): per-call timeout of 500ms
     (see `withTimeout` in `context.ts`).
   - Network calls: don't. Push the data through telemetry instead.

4. **Add positive + negative tests** for the new probe in
   `test/hints.test.js`, alongside the existing helper-level test
   blocks (`walkResults`, `readNpmScripts`, etc.).

5. **Document the field's source** in the JSDoc on `HintContext`.
   Reviewers should be able to tell the cost of a field without
   opening `context.ts`.

---

## TDD checklist

For every new hint:

- [ ] **Predicate test (positive).** With a fixture `HintContext` that
      satisfies every condition, `hint.when(ctx)` returns `true`.
- [ ] **Predicate test (each negative branch).** One test per condition
      in the predicate, flipping it to demonstrate the gate works.
- [ ] **Priority recorded.** `expect(h.priority).to.equal(N)` in one of
      the registry tests.
- [ ] If the hint requires a new context field: helper-level positive
      and negative test (e.g. parse a fixture `.gitignore`, walk a
      synthetic `results.specs[]`).
- [ ] Run `npx mocha --exit test/hints.test.js`. All ~90+ tests should
      pass; coverage shouldn't decrease.

There's a worked example pattern in `test/hints.test.js` — search for
`fakeCtx` and copy the structure of any existing hint test.

---

## Behavior rules in `maybeShowHint` (don't add code that bypasses these)

A hint is shown only when **all** of:

1. `config.hints?.enabled` is not `false`.
2. `ctx.isTTY === true`.
3. `config.logLevel` is `info` (the default; `silent`/`error`/
   `warning`/`debug` all suppress hints).
4. At least one hint's `when()` returned true.
5. No predicate or render call threw at the top level.

The first three are rules about **when not to show any hint**. They
live in [`index.ts`](./index.ts) `maybeShowHint`. Don't bypass them per
hint — if you need a hint to show in a non-info log level, the answer
is almost always "don't make this a hint, log it instead."

---

## Files at a glance

| File | Purpose |
|------|---------|
| [`types.ts`](./types.ts) | `HintContext` and `Hint` interfaces. Add new context fields here. |
| [`render.ts`](./render.ts) | Markdown → ANSI renderer. Pure. Don't add features unless multiple hints would use them. |
| [`context.ts`](./context.ts) | All probes — git, workflow, npm, gitignore, agents, results walk. Async at the boundary; predicates stay sync. |
| [`hints.ts`](./hints.ts) | The registry. Add new hints here. Alphabetical by id. |
| [`index.ts`](./index.ts) | `maybeShowHint` — the public entry point and selection algorithm. |
| `test/hints.test.js` | Mocha tests for everything above. |

---

## When in doubt

Ask: *"If I were the user receiving this hint right now, would it land
as helpful, or as noise?"*

Helpful hints are concrete, specific, and immediately actionable. They
reference what the user just did this run, or a missing piece of their
setup that has a one-line fix. Noisy hints are vague suggestions or
cheerleading. We can have at most one hint per run; spend that budget
on the helpful kind.
