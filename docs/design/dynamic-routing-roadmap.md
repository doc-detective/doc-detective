# Dynamic Routing, Assertions, and Runtime Expressions: Implementation Roadmap

> Status: **code-complete on `next`.** All phases shipped through PRs #355–#376: schema →
> operators → meta and outputs → unified assertions → custom assertions → guard `if` → routing
> handlers → retry → `goToStep` → test routing and `goToTest` → hints. Companion docs merged
> through the Promptless chain. See ["Final delivery status"](#final-delivery-status) below. The
> design sections in this document remain the semantic reference, covering flow versus verdict,
> handler defaults, and `if` timing.
> Last revised: 2026-07-08.
> Origin: the "Dynamic routing" design post in Discord `#dev-discuss → "Arazzo features"`
> (Manny, 2024-11-16):
> https://discord.com/channels/1066417654899937453/1307377637248864368/1307378108197896324

## Scope

This is no longer "just" dynamic routing. The full feature set is **five layered subsystems
built on one expression substrate**, all opt-in and **non-breaking**:

```
runtime expressions   ← the engine: $$meta, {{interp}}, ==, !=, >, contains, oneOf, matches
        │
   meta values + outputs   ← what expressions can read: $$platform, $$outputs.*, $$steps.*
        │
   assertions          ← truthy expressions that decide a step's PASS/FAIL verdict
        │
   conditional execution (guard `if`)   ← spec/test/step run only if all `if` statements are true
        │
   routing (onPass / onFail / onWarning / onSkip)   ← fire an action based on a result
        │
   retries             ← a routing action
```

The goal is full Arazzo-spec compliance. That turns Doc Detective from a test runner into a
**workflow runner**. It changes the behavior of no spec that skips the new fields.

## Foundational principle: **flow ≠ verdict**

These two axes never cross:

- **Assertions decide the verdict.** A step's result (PASS / FAIL / WARNING / SKIPPED) is
  determined solely by its assertions (and execution success). Routing **cannot** change it.
- **Routing decides the flow.** `continue`, `stop`, `retry`, `goToStep`, and `goToTest` only
  control *what runs next*. A FAILed step that routes `continue` still **fails**, and its test
  still **fails**. `continue` just means "run the next step anyway", for cleanup or to collect
  more failures.

Consequence: the way to make an *expected* failure pass is an **assertion** (e.g. `runShell` with
`exitCodes: [1]`), not routing. (This overturns the earlier draft's "onFail: continue ⇒ test
PASSES" fixture, which conflated the two axes.)

## Routing handlers: one per result status

| Step result | Handler | Default (chosen to reproduce today exactly) |
|---|---|---|
| PASS | `onPass` | `continue` |
| FAIL | `onFail` | `stop` at scope `test`, today's fail-then-skip-rest |
| WARNING | `onWarning` | `continue`, since today a WARNING never halts the loop |
| SKIPPED | `onSkip` | `continue`, since today an unsafe-skip continues |

**Routing fires only for steps that are reached and evaluated:**
- A step reached but **guard-skipped** (`if` false) or **unsafe-skipped** → result SKIPPED →
  `onSkip` fires.
- Steps **never reached** because a prior `stop` halted the test → not evaluated, no routing
  (just SKIPPED in the report, exactly as today).

### Routing entry shape (locked)

A flat array, first-match. Each entry is `{ "if"?: string | string[], <oneActionKey> }` with
**exactly one** action key (`oneOf`). The first entry whose `if` is truthy fires; an entry with no
`if` is the terminal default.

| Action key | Value | Meaning |
|---|---|---|
| `continue` | `true` | Proceed to the next step/test. |
| `stop` | `"test"` \| `"spec"` \| `"run"` (default `"test"`) | Halt at the named scope. |
| `retry` | `{ limit:int≥1, delay:int≥0 (ms), backoff:"fixed"\|"exponential" }` | Re-attempt, sleeping `delay` (with backoff) between attempts. |
| `goToStep` | step id (string) | Jump to a step in the current test. |
| `goToTest` | test id (string) | Jump to a test in the current spec. |

`goToStep` and `goToTest` are **distinct from the existing `goTo` step action**, which is browser
URL navigation. Jump targets must be **author-set** `stepId` and `testId` values, since
auto-derived hash ids aren't stable jump targets. Preflight validates them.

## `if` is two things: same engine, different timing

1. **Guard `if`** is a new spec, test, and step-level property, typed `string | string[]`, where
   an array means **AND**. It's evaluated **before** the unit runs. If not all-true, the unit is
   **SKIPPED**. This is conditional execution.
2. **Selector `if`** lives inside a routing entry. It's evaluated **after**, on the result, to
   pick which action fires.

Both read `$$outputs.*`, `$$platform`, and meta values. Per decision, **neither can read individual
assertion outcomes yet**, since `$$assertions.*` is deferred. One caveat: a test- or spec-level
guard `if` can only read *another unit's* `$$outputs.*` once tests are sequenced, in Phase 9.
Before that, those guards are limited to platform, config, and env meta values. Step-level guards
read prior steps' outputs freely.

### `if` vs `runOn` are different layers (not competing guards)

`runOn` defines the **required context** a test runs in, covering platform, browser, and headed or
headless. It shapes and selects which contexts get created and matched against the environment,
producing SKIPPED *contexts* when unsupported. Guard `if` gates execution of an **already-resolved
unit**, based on runtime expression state. They coexist, and `if` does not replace or subsume
`runOn`.

## Assertions

### The pipeline

```
action executes
  ├─ couldn't run (validation guard / timeout / spawn / driver error)
  │     → step FAIL (execution error); assertions NOT evaluated; routing sees FAIL
  └─ ran → capture outputs → $$outputs.*
        → IMPLICIT assertions (runner), in order
        → CUSTOM assertions (user), after implicit
        → step result = rollUp(evaluated assertions)        (FAIL > WARNING > PASS)
        → onPass/onFail/onWarning/onSkip routing on that result   (flow only)
```

### Rules (locked)

- **An execution failure is not an assertion.** Assertions *evaluate the result of* execution. If
  the action could not run, that's a step-level error giving FAIL, and no assertion records are
  produced for it.
- **Implicit before custom.** Runner-defined implicit assertions are articulated, named, and
  added to the report. The user's custom `assertions` run **after** them.
- **Short-circuit.** Evaluate in order and **stop at the first FAIL**. Remaining assertions are
  reported as not-evaluated. Where cheap and order-independent, evaluations may be **batched** as a
  performance optimization. Batching never changes the verdict or the reported first-failure,
  under a strict short-circuit contract.
- **Severity.** Implicit assertions may be **WARNING**, as `maxVariation` is. Custom assertions are
  **FAIL-only** for now, and WARNING severity for them is deferred. An unresolvable custom
  expression **fails closed**, giving FAIL with a clear message.
- **Fix latent bugs.** Refactoring per-action checks into `rollUp(assertions)` corrects existing
  result-precedence bugs. One example is `runShell` and `httpRequest`, where a late `maxVariation`
  WARNING `return`s and *overwrites* an earlier FAIL. These corrections are intentional and
  documented.

### Assertion report record (proposed)

```json
{
  "statement": "exitCode in [0]",
  "source": "implicit",
  "result": "PASS",
  "severity": "fail",
  "expected": [0],
  "actual": 0,
  "description": "Returned exit code 0."
}
```

The step report gains an `assertions` array. `result` is `rollUp(assertions)`, and `description` is
derived from the failing assertions for back-compat.

## Runtime expressions, meta values, and outputs

- **Operators** are currently stubbed out of `containsOperators`, where only `jq(` and `extract(`
  match. Those operators are `==`, `!=`, `>`, `>=`, `<`, `<=`, `contains`, `oneOf`, and `matches`.
  Any comparison string is therefore returned truthy, and a condition would always fire. Re-enable
  them, **gated behind a condition-only entrypoint**. The shared `resolveExpression` used by
  `step.variables` and `{{…}}` interpolation then stays byte-identical, so a `variables` value of
  `"x > out.txt"` still resolves to its literal string.
- **Fail-closed** on an unresolvable `$$token` applies **only in the condition and assertion
  path**, not in interpolation.
- Fix the **dot-escaping** (`replace(/\./g,"\\.")`) and **numeric coercion** quirks inside that
  path, covering decimals and multi-digit comparisons.
- **Meta values:** `$$platform`, which is `linux`, `mac`, or `windows`, the same enum as `runOn`,
  through `platformMap`. Also the `$$outputs.*` and `$$steps.<id>.outputs.*` namespace. Persist
  every action's `outputs` into the `metaValues` tree, so conditions and custom assertions can read
  them.

## Non-breaking strategy

Everything is additive and opt-in:

- An absent guard `if` means the unit runs, as today. An absent routing handler means the defaults
  above, byte-identical to today. Absent `assertions` means only the now-articulated implicit
  assertions decide, with results identical to today apart from the documented precedence-bug fixes.
- **Operator re-enablement** is isolated to the condition entrypoint, so `variables` and
  interpolation are untouched. Pin both with regression tests before changing the engine.
- **Test-level `goToTest`** ships behind a **dual path**. A spec with zero test-level routing
  flattens to the exact `runConcurrent(jobs)` path used today, proven byte-identical by a
  **golden-snapshot** test. Only routed specs hit the sequencer. That makes the headline capability
  `feat`, not `feat!`.
- **Report shape** grows, gaining an `assertions[]` per step and append-per-visit context entries
  for routed specs. These are additive fields only, and routed-spec report growth affects new
  opt-in behavior only.

## Phases

Each phase is independently shippable, uses red→green TDD, ships PASS or SKIPPED fixtures, and uses
`node -e` for cross-platform commands.

| # | Phase | Commit type |
|---|---|---|
| 0 | Rebase onto `origin/main` | n/a |
| 1 | Schema: routing entries (4 handlers) + guard `if` on spec/test/step + `assertions` field + assertion report schema | `feat(schema)` |
| 2 | Expression operators. A gated condition-only entrypoint, fail-closed, with dot and numeric fixes, plus a regression pin on `variables` and `{{}}` | `fix(expressions)` |
| 3 | Meta values and outputs, giving `$$platform`, `$$outputs.*`, and `$$steps.*`. Additive, and nothing reads it yet | `feat` |
| 4a | Articulate implicit assertions. Refactor every action to emit named assertion records, make the step result `rollUp`, and fix latent bugs | `feat`, `refactor` |
| 4b | Custom `assertions`, evaluated after implicit ones. Short-circuit, FAIL-only verdict, and the first real caller of `evaluateAssertion` | `feat(runner)` |
| 5 | Conditional execution. Guard `if` at spec, test, and step level, giving SKIPPED when false | `feat(runner)` |
| 6 | Step routing. `onPass`, `onFail`, `onWarning`, and `onSkip`, with `continue` and `stop` | `feat(runner)` |
| 7 | Step `retry`, with a backoff ceiling and null-exitCode coverage | `feat(runner)` |
| 8 | Step `goToStep`. An index-driven loop, a loop guard, and preflight-validated jump targets | `feat(runner)` |
| 9 | Test routing and `goToTest`. Dual-path plus a golden snapshot, so it stays non-breaking | `feat(runner)` |
| 10 | Hints and docs. Disambiguate `goTo` from `goToStep` and `goToTest`, and document append-per-visit and summary counting | `feat`, `docs` |

## Progress

- **Phase 0, rebase: done.** It was a no-op, since the branch was already even with `origin/main`,
  with runBrowserScript present.
- **Phase 1, schema foundation: done, uncommitted.** `routing_v3.schema.json` carries an entry with
  an optional `if` plus exactly one action through `oneOf`. `onPass`, `onFail`, `onWarning`,
  `onSkip`, `if`, and `assertions` are wired into step_v3. The four handlers and `if` go into
  test_v3, and `if` into spec_v3. It's registered in `dereferenceSchemas.cjs`, and both dist builds
  are regenerated. 687 common tests pass, the `routing-noop` fixture PASSes through the real
  runner, and runner source is untouched. The reusable condition shape lives at
  `routing_v3#/components/schemas/condition`, typed string or non-empty string array. Refs use a
  bare `routing_v3.schema.json#`.
  - **Decision on coercion:** conditions accept coercible scalars. `{"if":123}` coerces to `"123"`
    under the repo-wide `coerceTypes:true`. Fighting it broke legitimate strings like `"123"` and
    `"true"`, so the condition is plain `type:string`. That aligns with house style, and Phase 2
    handles the semantics.
  - **Known limitation:** `spec_v3` has no `additionalProperties:false`. A misplaced spec-level
    `onPass` or `assertions` therefore validates but is ignored, rather than being rejected. Making
    spec_v3 strict is a separate, potentially-breaking change, and is deferred.
  - **Build note:** schema edits require BOTH an `src/common` build AND a root `npm run compile`
    with `copy:schemas`, since the runner reads root `dist/common`.
- **Phase 2, expression operators: done, committed.** In `src/core/expressions.ts`, the comparison
  operators (`==`, `!=`, `>=`, `<=`, `>`, `<`) and membership operators (`contains`, `oneOf`,
  `matches`) are re-enabled. They're **gated behind an `allowOperators` flag, defaulting to false**,
  so `step.variables` and `{{ }}` interpolation stay byte-identical. Only `evaluateAssertion` passes
  `true`, and there's still no runtime caller, so it's dormant. The dot-escape bug is removed,
  covering decimals and regex dots. `preprocessExpression` is now quote-aware, so string values with
  spaces or operators are no longer mangled. Unresolved `$$` tokens fail closed on the condition
  path only, detected at resolution rather than by an output scan. A latent `String.replace`
  `$`-in-value corruption in `replaceMetaValues` is fixed. 42 expression unit tests pass.
  - **Documented in-code limitations, out of scope:** bare-bracket regex `matches [a-c]+` doesn't
    work, so use the `/regex/` slash form. `oneOf` must be the last operator in a single-condition
    expression.
- **Phase 3, meta values and outputs: done, committed.** A pure helper
  `buildConditionContext({platform, outputs, steps})` lands in the new `src/core/routing.ts`, the
  future home of `resolveRoute` and `nextRetryDelay`. It produces the object conditions evaluate
  against. The real `evaluateAssertion` validated that the locked namespace resolves. That covers
  `$$platform`, `$$outputs.*` including nested `stdio.stdout` and `response.statusCode`, and
  cross-step `$$steps.<id>.outputs.*`, with fail-closed for missing refs. 16 unit tests pass, with
  no runner or schema change. Phase 5 wires it into the step loop with a per-step outputs
  accumulator.
- **Phase 4a.1, assertion foundation plus the runShell exemplar: done, committed.** A new
  `assertion_v3` record schema lands, shaped `{statement, source: implicit|custom, result:
  PASS|FAIL|WARNING|SKIPPED, expected?, actual?, description?}`. `step_v3.assertions` is
  `anyOf:[condition, Assertion[]]`, where the condition is custom input typed string or string
  array, and `Assertion[]` holds report records. The report reuses step_v3, hence the overload.
  `runShell` is refactored to emit implicit records: exitCode, stdio if set, and saved-file
  variation, which gives WARNING if a path is set. It short-circuits at the first FAIL, but emits
  applicable-but-not-reached checks as **SKIPPED**. `status` becomes
  `rollUpResults(assertions)`, and records reach the report through the existing spread, so
  **`tests.ts` is untouched**. One sanctioned bug fix: FAIL plus WARNING now gives FAIL. Reviewed
  GO, with the canary green, no description-string test broken, and no false accept or reject from
  the anyOf.
  - **Rollout caveat for 4a.2:** some actions lack an always-evaluated leading check, unlike
    runShell's exitCode. Those can roll up all-SKIPPED to SKIPPED, or zero-records to PASS. Decide
    the intended rollup per action.
- **Phase 4a.2a, non-driver actions: done, committed.** `httpRequest` maps 8 checks in the original
  order, where a total network failure counts as an execution error. `checkLink` checks statusCode,
  where an unresolvable URL is an execution error. `runCode` delegates to runShell, and **bug #1 is
  fixed**: it now forwards exitCodes, stdio, maxVariation, overwrite, timeout, workingDirectory, and
  path, and propagates assertions. Sanctioned fix #2: a passing STRING `response.body` no longer
  short-circuits the response-headers and `path`-save checks. That was an old inconsistency, now
  locked with tests and a code comment. Reviewed GO, with backward-compat preserved, a runCode
  bug-#1 E2E fixture added, and `tests.ts` untouched.
- **Phase 4a.2b-1, find and runBrowserScript: done, uncommitted.** This used the prose-statement
  form, superseded by the pivot below. `find` emits one `element exists` assertion, and
  `runBrowserScript` mirrors runShell.

### DESIGN PIVOT (locked): assertions ARE runtime expressions, evaluated by the engine

Every assertion, implicit and custom, is now a `$$` runtime expression. `evaluateAssertion` evaluates
it against `buildConditionContext({platform, outputs, steps})`, giving **one evaluation path** for
both. An action's flow becomes: execute → expose outputs → **generate** its implicit assertion
expressions → hand them to a shared evaluator. That evaluator short-circuits on FAIL, marks
not-reached checks SKIPPED, maps severity to PASS, FAIL, or WARNING, and rolls up.

- **Simple value checks generate direct expressions:** `$$outputs.exitCode oneOf [0]`,
  `$$outputs.response.statusCode oneOf [200,201]`, `$$outputs.result matches /…/`.
- **Structurally-complex and compound checks expose a COMPUTED OUTPUT, then assert a simple
  expression over it.** That's the chosen realization. It keeps engine risk low, and hands users the
  computed values too. Examples: `$$outputs.responseSchemaValid == true`,
  `$$outputs.bodyMatches == true`, `$$outputs.headersMatch == true`, `$$outputs.variation <= 0.05`,
  `$$outputs.aspectRatioMatch == true`, and `$$outputs.found == true`. runShell's stdout-or-stderr
  check becomes `$$outputs.stdioMatched == true`, and checkLink exposes `$$outputs.statusCode`.
- **Minimal engine additions:** prefer none. Exposed outputs plus the existing operators `oneOf`,
  `contains`, `matches`, `==`, and `<=` cover everything. Avoid `subset`, `matchesSchema`, and `||`
  operators, along with the preprocessor-hardening they'd need, by pushing complexity into computed
  outputs. An optional `in` alias for `oneOf` is deferred.
- **`expected` and `actual`** on the record become largely vestigial. The expression encodes
  "expected", and the report's `outputs` carry "actual". Keep them optional.
- **Shared mechanism:** `evaluateImplicitAssertions(specs, context)` in `src/core/routing.ts`, and
  `rollUpAssertions` in `utils.ts`.

**Rework consequence:** several pieces get reworked to this model. Those are the committed 4a.1
(runShell) and 4a.2a (httpRequest, checkLink, runCode), plus the uncommitted 4a.2b-1 (find,
runBrowserScript). All used prose statements with hard-coded compute. The rework is exemplar-first:
rebuild runShell, review, then fan out. Prior commits are intermediate and get squashed at
promotion. The record shape, short-circuit, SKIPPED, and rollUp all carry over. Custom assertions
(Phase 4b) then fall out of the same path, and `tests.ts` stays untouched.

**Progress (unified model):**
- **Unified foundation plus the runShell exemplar: done, committed.** This adds
  `evaluateImplicitAssertions(specs, context)` in routing.ts, and `rollUpAssertions` in utils.ts.
  `runShell` generates `$$` expression assertions such as `$$outputs.exitCode oneOf […]`,
  `$$outputs.stdioMatched == true`, and `$$outputs.variation <= …`. It evaluates them through the
  shared engine and `buildConditionContext`. There are new user-referenceable outputs,
  `stdioMatched` and `variation`. Reviewed GO, with byte-faithful backward-compat across
  signal-kill, stderr-only and regex stdio, first-write-no-variation, and FAIL-over-WARNING
  precedence. NOTE: a find and runBrowserScript subagent over-reached, articulating the whole
  element family in the OLD prose model, unreviewed. That work was reverted, and will be redone
  unified.
- **Remaining unified conversions: pending.** Rework the committed prose-model httpRequest,
  checkLink, and runCode. Then freshly convert find, click, type, dragAndDrop, runBrowserScript,
  and screenshot.

### Final delivery status (2026-06-21)

Everything above shipped to `next`, as did the remainder of the phase table. The per-stage detail
lives in the merged PRs and their review threads:

- Foundation + unified assertions across **all** actions: [#355](https://github.com/doc-detective/doc-detective/pull/355),
  [#357](https://github.com/doc-detective/doc-detective/pull/357),
  [#359](https://github.com/doc-detective/doc-detective/pull/359) (schema normalization).
- Custom user assertions: [#360](https://github.com/doc-detective/doc-detective/pull/360). They're
  evaluated after implicit ones. A custom assertion can add a failure, but never rescues or upgrades
  a failing or skipped step.
- Guard `if` (spec/test/step): [#362](https://github.com/doc-detective/doc-detective/pull/362).
- Step routing handlers (`onPass`/`onFail`/`onWarning`/`onSkip`, continue/stop):
  [#364](https://github.com/doc-detective/doc-detective/pull/364).
- Step `retry` (limit/delay/backoff, `attempts` report field):
  [#366](https://github.com/doc-detective/doc-detective/pull/366).
- Step `goToStep` (index-driven step loop, cycle cap, `visit` report field):
  [#370](https://github.com/doc-detective/doc-detective/pull/370).
- Test routing and `goToTest`, through a non-breaking dual-path sequencer. Non-routed specs keep
  the exact flat concurrent path. See [#372](https://github.com/doc-detective/doc-detective/pull/372)
  and [#374](https://github.com/doc-detective/doc-detective/pull/374).
- Hints (`useAssertionsForOutputChecks`, `useRetryForTransientErrors`):
  [#376](https://github.com/doc-detective/doc-detective/pull/376).

**Durable namespace nuance:** action outputs are referenceable two ways. `step.variables` resolves
against a bare `$$name`, such as `$$found` or `$$statusCode`. Conditions and assertions use the
`$$outputs.*` namespace, through `buildConditionContext`. Docs must use the right form per context.
Unifying the two namespaces is a possible future change.

**Still-deferred items:** `$$assertions.*` (reading individual assertion outcomes in `if`),
WARNING severity for custom assertions, `when` alias for `if`, `stop: "run"` full propagation.

## Implicit-assertion inventory (Phase 4a, classifications locked)

Per-action articulation of today's hard-coded checks. The **classifying principle is locked**:

- An **input guard** is the per-action `validate({schemaKey:"step_v3"})` at entry. A malformed step
  gives FAIL. It is *not an assertion*, and is articulated once, globally.
- **Execution** is the action performing its effect. Failure gives a step error, so FAIL, and
  assertions don't run.
- A **verification assertion** is a check about the system under test that can pass or fail *given*
  successful execution. These get articulated, named, and reported.

**Element existence is a verification assertion (locked).** "An element matching the criteria
exists" is documentation verification, so it is an assertion wherever it is checked. That means in
`find`, and in the find-precondition of `click`, `type`, `dragAndDrop`, and the `screenshot` crop.
The interaction that follows, meaning the actual click, type, or drag, is execution.

### Group A: verification-rich

| Action | Implicit assertions (in order) | Severity | Outputs (`$$outputs.*`) |
|---|---|---|---|
| `runShell` | exitCode ∈ `exitCodes`; `stdio` substring/regex; saved-file variation ≤ `maxVariation` | FAIL, FAIL, **WARNING** | `exitCode`, `stdio.stdout`, `stdio.stderr` |
| `runCode` | delegates to `runShell` → only exitCode ∈ `[0]` until bug ① is fixed | FAIL | `exitCode`, `stdio.*` |
| `runBrowserScript` | `output` substring/regex match; saved-file variation ≤ `maxVariation` | FAIL, **WARNING** | `result` |
| `httpRequest` | In order: statusCode in `statusCodes`. Required fields present. Request schema (openApi). Response schema (openApi). Body type matches. Body match, string-equal or object-subset. Headers subset. No unexpected fields under `allowAdditionalFields:false`. Saved-file variation at or under `maxVariation` | FAIL ×8, **WARNING** | `response.body`, `response.statusCode`, `response.headers` |
| `checkLink` | statusCode in `statusCodes`, after a bounded retry and HEAD fallback | FAIL | n/a |
| `screenshot` | (crop) element exists + fits viewport; aspect ratios match; pixel-diff ≤ `maxVariation` | FAIL, FAIL, **WARNING** | `screenshotPath`, `changed`, `referenceUrl`, `element` |

### Group B: element-centric, where existence is an assertion and interaction is execution

| Action | Verification assertion | Execution (→ FAIL, not assertion) | Outputs |
|---|---|---|---|
| `find` | element matches criteria (selector/text/id/testId/class/attr/aria); `elementText`/pattern match | chained moveTo/click/type sub-effects | `element.{text,html,tag,value,location,size,clickable,enabled,selected,displayed,displayedInViewport}` |
| `click` | element exists (via `find`) | the click itself | inherits `find` outputs |
| `type` | element exists, when criteria are given | focus plus `driver.keys` | n/a |
| `dragAndDrop` | source exists, target exists | the drag, through WDIO with an HTML5 fallback | n/a |

### Group C: execution-only, with no verification assertions, passing only if they run

These are `goTo`, `wait`, `loadVariables`, `saveCookie`, `loadCookie`, `startRecording` (`record`),
and `stopRecording` (`stopRecord`). `goTo`'s `waitUntil` conditions are load **preconditions**, and
FAIL on timeout. Those conditions are document-ready, network-idle, DOM-stable, and element-found.
`moveTo` and `scroll` are not dispatched by `runStep`, per bug ③.

### Locked borderline rulings

- Element existence (find / click / type / dragAndDrop / screenshot-crop) → **assertion**.
- `checkLink` unresolvable URL (`statusCode null`) → **execution error**.
- `saveCookie` "cookie not found" → **execution error**.
- `httpRequest` total network failure (no response at all) → **execution error**; the statusCode
  assertion runs only when a status came back (incl. 4xx/5xx via `error.response`).

### SKIPPED triggers (what `onSkip` fires on)

`wait: false`; `type` with no keys; `screenshot` with an existing file + `overwrite:false`; unsafe
step + not allowed. So `onSkip` has real triggers beyond a false guard `if`.

### Latent bugs to fix in 4a (intentional and documented, per the "fix the bugs" decision)

1. **`runCode` drops its own assertions.** It sets `exitCodes`, `maxVariation`, `overwrite`, and
   `path` defaults, then builds the `runShell` step with only `{command, args}`. So
   `runCode: { exitCodes: [1] }` is silently ignored, and only exit `0` passes (`runCode.ts` ~114).
2. **WARNING overwrites FAIL.** In `runShell`, `httpRequest`, `runBrowserScript`, and `screenshot`,
   a late `maxVariation` WARNING does `status="WARNING"; return`. That clobbers an earlier exitCode
   or statusCode FAIL. `rollUp(assertions)` corrects it to FAIL.
3. **`scroll` is dead and inconsistent.** It has the legacy `(action, page, config)` signature, isn't
   in the `runStep` dispatcher, and returns PASS rather than SKIPPED when no recording is active.

## Open questions (remaining)

1. **Append-per-visit summary counting.** Revisited steps and tests count every visit. Document that
   summary totals can exceed specs × tests × contexts. This is locked: count every visit.
2. **`stop: "run"` under concurrency.** It can only stop *scheduling* new jobs. In-flight contexts
   finish, so it's deterministic only at `concurrentRunners: 1`. Document that.

## Deferred

- `$$assertions.*`, meaning reading individual assertion outcomes in `if`.
- WARNING severity for **custom** assertions.
- `onWarning` and `onSkip` were previously deferred. They're now **in scope**, per above.
- `when` as an alias for `if`.

## Worked example (OS fallback, corrected to the locked shapes)

```json
{
  "tests": [
    {
      "testId": "bashHello",
      "steps": [
        {
          "stepId": "bashHello",
          "runShell": { "command": "bash -c 'echo hello'", "exitCodes": [0], "stdio": "hello" },
          "onFail": [
            { "if": "$$platform == windows", "goToTest": "cmdHello" },
            { "stop": "test" }
          ]
        }
      ]
    },
    {
      "testId": "cmdHello",
      "if": "$$platform == windows",
      "steps": [
        {
          "stepId": "cmdHello",
          "runShell": { "command": "cmd /c echo hello", "exitCodes": [0], "stdio": "hello" }
        }
      ]
    }
  ]
}
```

On Windows, `bashHello` fails → routes to `cmdHello` (which passes); both appear in the report.
On non-Windows, `bashHello` passes and `cmdHello`'s guard `if` is false → `cmdHello` is SKIPPED.
The test verdict in each case is decided by assertions, never by the routing.
