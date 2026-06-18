# Dynamic Routing, Assertions & Runtime Expressions — Implementation Roadmap

> Status: **planning** (no runtime code yet; Phase 1 schema work exists on a sibling branch).
> Last revised: 2026-06-18.
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

Goal: full Arazzo-spec compliance — turn Doc Detective from a test runner into a **workflow
runner** — without changing the behavior of any spec that doesn't adopt the new fields.

## Foundational principle: **flow ≠ verdict**

These two axes never cross:

- **Assertions decide the verdict.** A step's result (PASS / FAIL / WARNING / SKIPPED) is
  determined solely by its assertions (and execution success). Routing **cannot** change it.
- **Routing decides the flow.** `continue` / `stop` / `retry` / `goToStep` / `goToTest` only
  control *what runs next*. A FAILed step that routes `continue` still **fails**, and its test
  still **fails** — `continue` just means "run the next step anyway" (e.g. cleanup, or to collect
  more failures).

Consequence: the way to make an *expected* failure pass is an **assertion** (e.g. `runShell` with
`exitCodes: [1]`), not routing. (This overturns the earlier draft's "onFail: continue ⇒ test
PASSES" fixture, which conflated the two axes.)

## Routing handlers — one per result status

| Step result | Handler | Default (chosen to reproduce today exactly) |
|---|---|---|
| PASS | `onPass` | `continue` |
| FAIL | `onFail` | `stop` (scope `test`) — today's fail-then-skip-rest |
| WARNING | `onWarning` | `continue` — today a WARNING never halts the loop |
| SKIPPED | `onSkip` | `continue` — today an unsafe-skip continues |

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

`goToStep` / `goToTest` are **distinct from the existing `goTo` step action** (browser URL
navigation). Jump targets must be **author-set** `stepId` / `testId` values (auto-derived hash ids
aren't stable jump targets) — validated at preflight.

## `if` is two things (same engine, different timing)

1. **Guard `if`** — new spec/test/step-level property, `string | string[]` (array = **AND**).
   Evaluated **before** the unit runs; if not all-true, the unit is **SKIPPED**. This is
   conditional execution.
2. **Selector `if`** — inside a routing entry. Evaluated **after**, on the result, to pick which
   action fires.

Both read `$$outputs.*` / `$$platform` / meta values. Per decision, **neither can read individual
assertion outcomes yet** (`$$assertions.*` is deferred). Caveat: test-/spec-level guard `if` can
only read *another unit's* `$$outputs.*` once tests are sequenced (Phase 9); before that, those
guards are limited to platform/config/env meta values. Step-level guards read prior steps' outputs
freely.

### `if` vs `runOn` are different layers (not competing guards)

`runOn` defines the **required context** a test runs in (platform, browser, headed/headless) — it
shapes/selects which contexts get created and matched against the environment, producing SKIPPED
*contexts* when unsupported. Guard `if` gates execution of an **already-resolved unit** based on
runtime expression state. They coexist; `if` does not replace or subsume `runOn`.

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

- **Execution failure ≠ assertion.** Assertions *evaluate the result of* execution. If the action
  could not run, that's a step-level error → FAIL; no assertion records are produced for it.
- **Implicit before custom.** Runner-defined (implicit) assertions are articulated, named, and
  added to the report; the user's custom `assertions` run **after** them.
- **Short-circuit.** Evaluate in order; **stop at the first FAIL**. Remaining assertions are
  reported as not-evaluated. Where cheap and order-independent, evaluations may be **batched** as a
  performance optimization — but batching never changes the verdict or the reported first-failure
  (strict short-circuit contract).
- **Severity.** Implicit assertions may be **WARNING** (e.g. `maxVariation`). Custom assertions are
  **FAIL-only** for now (WARNING severity for custom assertions is deferred). An unresolvable custom
  expression **fails closed** → FAIL with a clear message.
- **Fix latent bugs.** Refactoring per-action checks into `rollUp(assertions)` corrects existing
  result-precedence bugs (e.g. `runShell`/`httpRequest` where a late `maxVariation` WARNING
  `return`s and *overwrites* an earlier FAIL). These corrections are intentional and documented.

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

The step report gains an `assertions` array; `result` is `rollUp(assertions)`; `description` is
derived from the failing assertion(s) for back-compat.

## Runtime expressions / meta values / outputs

- **Operators** (`==`, `!=`, `>`, `>=`, `<`, `<=`, `contains`, `oneOf`, `matches`) are currently
  stubbed out of `containsOperators` (only `jq(` / `extract(` match), so any comparison string is
  returned truthy and a condition would always fire. Re-enable them — but **gated behind a
  condition-only entrypoint** so the shared `resolveExpression` used by `step.variables` and
  `{{…}}` interpolation stays byte-identical (a `variables` value of `"x > out.txt"` must still
  resolve to its literal string).
- **Fail-closed** on an unresolvable `$$token` applies **only in the condition/assertion path**,
  not in interpolation.
- Fix the **dot-escaping** (`replace(/\./g,"\\.")`) and **numeric coercion** quirks inside that
  path (decimals and multi-digit comparisons).
- **Meta values:** `$$platform` (`linux`/`mac`/`windows`, same enum as `runOn`, via `platformMap`)
  and the `$$outputs.*` / `$$steps.<id>.outputs.*` namespace. Persist every action's `outputs`
  into the `metaValues` tree so conditions and custom assertions can read them.

## Non-breaking strategy

Everything is additive and opt-in:

- Absent guard `if` ⇒ the unit runs (today). Absent routing handler ⇒ the defaults above ⇒
  byte-identical to today. Absent `assertions` ⇒ only the (now-articulated) implicit assertions
  decide, with results identical to today (modulo the documented precedence-bug fixes).
- **Operator re-enablement** is isolated to the condition entrypoint, so `variables`/interpolation
  are untouched. Pin both with regression tests before changing the engine.
- **Test-level `goToTest`** ships behind a **dual path**: a spec with zero test-level routing
  flattens to the exact `runConcurrent(jobs)` path used today, proven byte-identical by a
  **golden-snapshot** test; only routed specs hit the sequencer. This makes the headline capability
  `feat`, not `feat!`.
- **Report shape** grows (an `assertions[]` per step; append-per-visit context entries for routed
  specs). Additive fields only; routed-spec report growth affects new opt-in behavior only.

## Phases (each independently shippable; red→green TDD; PASS/SKIPPED fixtures; `node -e` for cross-platform)

| # | Phase | Commit type |
|---|---|---|
| 0 | Rebase onto `origin/main` | — |
| 1 | Schema: routing entries (4 handlers) + guard `if` on spec/test/step + `assertions` field + assertion report schema | `feat(schema)` |
| 2 | Expression operators — gated condition-only entrypoint; fail-closed; dot/numeric fixes; regression-pin `variables`/`{{}}` | `fix(expressions)` |
| 3 | Meta values + outputs → `$$platform`, `$$outputs.*`, `$$steps.*` (additive; nothing reads it yet) | `feat` |
| 4a | Articulate implicit assertions — refactor every action to emit named assertion records; step result = `rollUp`; fix latent bugs | `feat` / `refactor` |
| 4b | Custom `assertions` — evaluated after implicit; short-circuit; FAIL-only verdict; first real caller of `evaluateAssertion` | `feat(runner)` |
| 5 | Conditional execution — guard `if` at spec/test/step → SKIPPED when false | `feat(runner)` |
| 6 | Step routing — `onPass`/`onFail`/`onWarning`/`onSkip`, `continue` + `stop` | `feat(runner)` |
| 7 | Step `retry` (backoff ceiling; null-exitCode coverage) | `feat(runner)` |
| 8 | Step `goToStep` — index-driven loop; loop guard; preflight-validate jump targets | `feat(runner)` |
| 9 | Test routing + `goToTest` — dual-path + golden snapshot ⇒ non-breaking | `feat(runner)` |
| 10 | Hints + docs — disambiguate `goTo` vs `goToStep`/`goToTest`; document append-per-visit, summary counting | `feat` / `docs` |

## Progress

- **Phase 0 (rebase) — done.** No-op: branch was already even with `origin/main` (runBrowserScript present).
- **Phase 1 (schema foundation) — done, uncommitted.** `routing_v3.schema.json` (entry: optional
  `if` + exactly-one action via `oneOf`); `onPass`/`onFail`/`onWarning`/`onSkip` + `if` + `assertions`
  wired into step_v3, the four handlers + `if` into test_v3, `if` into spec_v3; registered in
  `dereferenceSchemas.cjs`; both dist builds regenerated. 687 common tests pass; `routing-noop`
  fixture PASS through the real runner; runner source untouched. Reusable condition shape at
  `routing_v3#/components/schemas/condition` (string | non-empty string[]); refs use bare
  `routing_v3.schema.json#`.
  - **Decision (coercion):** conditions accept coercible scalars — `{"if":123}` coerces to `"123"`
    under the repo-wide `coerceTypes:true`; fighting it broke legitimate strings like `"123"`/`"true"`,
    so the condition is plain `type:string`. Aligns with house style; semantics handled in Phase 2.
  - **Known limitation:** `spec_v3` has no `additionalProperties:false`, so a misplaced spec-level
    `onPass`/`assertions` validates-but-is-ignored rather than being rejected. Making spec_v3 strict
    is a separate, potentially-breaking change — deferred.
  - **Build note:** schema edits require BOTH `src/common` build AND root `npm run compile` +
    `copy:schemas` (the runner reads root `dist/common`).

## Implicit-assertion inventory (Phase 4a — classifications locked)

Per-action articulation of today's hard-coded checks. **Classifying principle (locked):**

- **Input guard** — the per-action `validate({schemaKey:"step_v3"})` at entry. Malformed step ⇒
  FAIL. *Not an assertion* (articulated once, globally).
- **Execution** — the action performing its effect. Failure ⇒ step error → FAIL; assertions don't
  run.
- **Verification assertion** — a check about the system under test that can pass/fail *given*
  successful execution. These get articulated, named, and reported.

**Element existence is a verification assertion (locked).** "An element matching the criteria
exists" is documentation verification, so it is an assertion wherever it is checked — in `find` and
in the find-precondition of `click` / `type` / `dragAndDrop` / `screenshot` crop. The interaction
that follows (the actual click / type / drag) is execution.

### Group A — verification-rich

| Action | Implicit assertions (in order) | Severity | Outputs (`$$outputs.*`) |
|---|---|---|---|
| `runShell` | exitCode ∈ `exitCodes`; `stdio` substring/regex; saved-file variation ≤ `maxVariation` | FAIL, FAIL, **WARNING** | `exitCode`, `stdio.stdout`, `stdio.stderr` |
| `runCode` | delegates to `runShell` → only exitCode ∈ `[0]` until bug ① is fixed | FAIL | `exitCode`, `stdio.*` |
| `runBrowserScript` | `output` substring/regex match; saved-file variation ≤ `maxVariation` | FAIL, **WARNING** | `result` |
| `httpRequest` | statusCode ∈ `statusCodes`; required fields present; request schema (openApi); response schema (openApi); body type matches; body match (string-eq / object-subset); headers subset; no unexpected fields (`allowAdditionalFields:false`); saved-file variation ≤ `maxVariation` | FAIL ×8, **WARNING** | `response.body`, `response.statusCode`, `response.headers` |
| `checkLink` | statusCode ∈ `statusCodes` (after bounded retry + HEAD fallback) | FAIL | — |
| `screenshot` | (crop) element exists + fits viewport; aspect ratios match; pixel-diff ≤ `maxVariation` | FAIL, FAIL, **WARNING** | `screenshotPath`, `changed`, `referenceUrl`, `element` |

### Group B — element-centric (existence = assertion; interaction = execution)

| Action | Verification assertion | Execution (→ FAIL, not assertion) | Outputs |
|---|---|---|---|
| `find` | element matches criteria (selector/text/id/testId/class/attr/aria); `elementText`/pattern match | chained moveTo/click/type sub-effects | `element.{text,html,tag,value,location,size,clickable,enabled,selected,displayed,displayedInViewport}` |
| `click` | element exists (via `find`) | the click itself | inherits `find` outputs |
| `type` | element exists (when criteria given) | focus + `driver.keys` | — |
| `dragAndDrop` | source exists; target exists | the drag (WDIO + HTML5 fallback) | — |

### Group C — execution-only (no verification assertions; pass iff they run)

`goTo` (its `waitUntil` document-ready / network-idle / DOM-stable / element-found conditions are
load **preconditions** — FAIL on timeout), `wait`, `loadVariables`, `saveCookie`, `loadCookie`,
`startRecording` (`record`), `stopRecording` (`stopRecord`). (`moveTo` and `scroll` are not
dispatched by `runStep` — see bug ③.)

### Locked borderline rulings

- Element existence (find / click / type / dragAndDrop / screenshot-crop) → **assertion**.
- `checkLink` unresolvable URL (`statusCode null`) → **execution error**.
- `saveCookie` "cookie not found" → **execution error**.
- `httpRequest` total network failure (no response at all) → **execution error**; the statusCode
  assertion runs only when a status came back (incl. 4xx/5xx via `error.response`).

### SKIPPED triggers (what `onSkip` fires on)

`wait: false`; `type` with no keys; `screenshot` with an existing file + `overwrite:false`; unsafe
step + not allowed. So `onSkip` has real triggers beyond a false guard `if`.

### Latent bugs to fix in 4a (intentional, documented — per the "fix the bugs" decision)

1. **`runCode` drops its own assertions** — it sets `exitCodes`/`maxVariation`/`overwrite`/`path`
   defaults, then builds the `runShell` step with only `{command, args}`, so e.g.
   `runCode: { exitCodes: [1] }` is silently ignored and only exit `0` passes (`runCode.ts` ~114).
2. **WARNING overwrites FAIL** — in `runShell`/`httpRequest`/`runBrowserScript`/`screenshot`, a late
   `maxVariation` WARNING does `status="WARNING"; return`, clobbering an earlier exitCode/statusCode
   FAIL. `rollUp(assertions)` corrects this to FAIL.
3. **`scroll` is dead + inconsistent** — legacy `(action, page, config)` signature, not in the
   `runStep` dispatcher, and returns PASS (not SKIPPED) when no recording is active.

## Open questions (remaining)

1. **Append-per-visit summary counting** — revisited steps/tests count every visit; document that
   summary totals can exceed specs × tests × contexts. (Locked: count every visit.)
2. **`stop: "run"` under concurrency** — can only stop *scheduling* new jobs; in-flight contexts
   finish, so it's deterministic only at `concurrentRunners: 1`. Document.

## Deferred

- `$$assertions.*` (reading individual assertion outcomes in `if`).
- WARNING severity for **custom** assertions.
- `onWarning`/`onSkip` were previously deferred — now **in scope** (above).
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
