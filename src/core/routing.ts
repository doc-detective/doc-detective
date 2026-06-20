// Dynamic routing: the cohesive home for the routing/condition primitives of the
// dynamic-routing feature — `buildConditionContext`, the implicit/custom
// assertion evaluators, and `evaluateGuard` for conditional execution. These are
// wired into the runner (custom assertions in runStep; step-level guard `if` in
// the runContext step loop). Later phases will add `resolveRoute` /
// `nextRetryDelay` here for routing handlers and retries.

import { evaluateAssertion } from "./expressions.js";
import { rollUpAssertions } from "./utils.js";

/**
 * Shape of a single prior step's recorded data, addressed by stepId.
 */
interface StepContextEntry {
  outputs?: any;
}

/**
 * Inputs for building a condition-evaluation context.
 */
interface BuildConditionContextArgs {
  /**
   * The already-mapped platform value ("linux" | "mac" | "windows"), i.e. the
   * same value runtime code stores on `context.platform` (via platformMap).
   */
  platform?: string;
  /** The CURRENT step's outputs object (e.g. { exitCode, stdio, response }). */
  outputs?: any;
  /** Map of prior steps' data keyed by author-set stepId: { [stepId]: { outputs } }. */
  steps?: Record<string, StepContextEntry>;
}

/**
 * The object that conditions / assertions are evaluated against. The locked
 * `$$` meta-value namespace resolves against this:
 *   - `$$platform`              -> `platform`
 *   - `$$outputs.*`             -> `outputs.*`
 *   - `$$steps.<stepId>.outputs.*` -> `steps[stepId].outputs.*`
 */
interface ConditionContext {
  platform: string | undefined;
  outputs: any;
  steps: Record<string, StepContextEntry>;
}

/**
 * Builds the context object a condition/assertion is evaluated against.
 *
 * Tiny and defensive: missing/undefined `outputs` or `steps` default to `{}` so
 * a condition that references a not-yet-run step (or an absent output) resolves
 * to `undefined` and the condition fails CLOSED via `evaluateAssertion` rather
 * than throwing.
 *
 * @param args - Optional `{ platform, outputs, steps }`.
 * @returns `{ platform, outputs, steps }` ready for `evaluateAssertion`.
 */
function buildConditionContext(
  args: BuildConditionContextArgs = {}
): ConditionContext {
  const { platform, outputs, steps } = args || {};
  return {
    platform,
    outputs: outputs ?? {},
    steps: steps ?? {},
  };
}

/**
 * A single applicable implicit-assertion spec: a `$$` runtime expression plus
 * the severity to record when it evaluates false. `severity` defaults to
 * "fail" when omitted.
 */
interface ImplicitAssertionSpec {
  statement: string;
  severity?: "fail" | "warning";
}

/**
 * One emitted assertion record. `statement` is the runtime expression that was
 * (or would have been) evaluated. Under the unified model `expected`/`actual`
 * are vestigial and omitted here. `source` distinguishes engine-emitted
 * ("implicit") records from author-written ("custom") `step.assertions`.
 */
interface ImplicitAssertionRecord {
  statement: string;
  source: "implicit" | "custom";
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
}

/**
 * Options for the shared evaluator. Defaults reproduce the original
 * implicit-only behavior so the 8 existing call sites are untouched.
 */
interface EvaluateAssertionsOptions {
  /** Stamped onto every emitted record's `source`. Defaults to "implicit". */
  source?: "implicit" | "custom";
  /**
   * When true, the evaluator starts in the short-circuited state: the FIRST
   * spec (and every later one) is recorded SKIPPED without evaluation. Used by
   * custom assertions to CONTINUE an implicit short-circuit — when an implicit
   * check already FAILed, the custom checks are not meaningful to assert on.
   */
  startFailed?: boolean;
}

/**
 * Evaluate an ordered list of APPLICABLE implicit-assertion specs against a
 * condition context, in order, through the shared `evaluateAssertion` engine.
 *
 * Short-circuit semantics: once any spec evaluates to FAIL, every later spec is
 * recorded as SKIPPED (not evaluated) — its inputs may no longer be meaningful.
 * A false WARNING-severity spec records WARNING and does NOT short-circuit. The
 * step status is the FAIL > WARNING > SKIPPED > PASS roll-up (empty -> PASS).
 *
 * @param specs - Ordered, already-applicable specs.
 * @param context - A `buildConditionContext(...)` output.
 * @param options - Optional `{ source, startFailed }` (see
 *   `EvaluateAssertionsOptions`). Defaults reproduce implicit-only behavior.
 * @returns `{ assertions, status }`.
 */
async function evaluateImplicitAssertions(
  specs: ImplicitAssertionSpec[],
  context: ConditionContext,
  options: EvaluateAssertionsOptions = {}
): Promise<{ assertions: ImplicitAssertionRecord[]; status: string }> {
  const source = options.source ?? "implicit";
  const records: ImplicitAssertionRecord[] = [];
  let failed = options.startFailed === true;

  for (const spec of specs) {
    if (failed) {
      // Short-circuit: an earlier assertion FAILed (or the chain was started in
      // the failed state), so this applicable check is not evaluated — report
      // it as SKIPPED.
      records.push({
        statement: spec.statement,
        source,
        result: "SKIPPED",
      });
      continue;
    }

    const ok = await evaluateAssertion(spec.statement, context);
    let result: ImplicitAssertionRecord["result"];
    if (ok) {
      result = "PASS";
    } else if (spec.severity === "warning") {
      result = "WARNING";
    } else {
      result = "FAIL";
    }
    if (result === "FAIL") failed = true;
    records.push({ statement: spec.statement, source, result });
  }

  return { assertions: records, status: rollUpAssertions(records) };
}

/**
 * The CURRENT step as seen by the custom-assertion helper. Only `assertions` is
 * read here; it is the author condition form (string | string[]). An
 * array-of-objects (the report shape) is tolerated by the type but ignored at
 * runtime — it is not author input.
 */
interface CustomAssertionStep {
  assertions?: string | string[] | unknown[];
}

/**
 * The action's result the helper folds custom records into (and mutates).
 * `status` is the rolled-up verdict; `assertions` holds any prior (implicit)
 * records; `outputs` is the per-action computed-output bag conditions read.
 */
interface CustomAssertionActionResult {
  status: string;
  assertions?: ImplicitAssertionRecord[];
  outputs?: any;
  [key: string]: any;
}

/**
 * Evaluate the author-written `step.assertions` (the "custom" condition form)
 * AFTER an action has run, folding the results into `actionResult`.
 *
 * This is the runner-facing helper for custom assertions. It is strictly
 * additive: a step with no usable `assertions` field is left byte-identical.
 *
 * Contract:
 *   - Only the condition form is evaluated: a string or an array of strings
 *     (AND across the array). An array-of-objects (the report shape) is IGNORED
 *     — it is not author input.
 *   - Custom assertions are EVALUATED (and the status re-rolled) ONLY when the
 *     action's status is PASS or WARNING. For ANY other status (FAIL for any
 *     reason — execution error, an implicit FAIL record, etc. — or SKIPPED) the
 *     custom checks are emitted as SKIPPED, NOT evaluated, and the action's
 *     original status is PRESERVED (no re-roll). This guarantees custom
 *     assertions can only ADD a failure to a passing/warning step, never
 *     rescue/upgrade a failing or skipped one.
 *   - Custom assertions are FAIL-only (no WARNING). An unresolvable `$$` fails
 *     closed to FAIL (via `evaluateAssertion`).
 *   - Custom records are appended to `actionResult.assertions` and, when
 *     evaluated, `actionResult.status` is re-rolled across ALL records.
 *
 * Cross-step `$$steps.*` in custom assertions is DEFERRED: `steps` is passed as
 * `{}` here (resolution would fail closed to FAIL today).
 *
 * @param args - `{ step, actionResult, platform }`. `platform` is the mapped
 *   `context.platform` value (or undefined).
 * @returns The same (mutated) `actionResult`, for convenience.
 */
async function evaluateCustomAssertions(args: {
  step?: CustomAssertionStep;
  actionResult?: CustomAssertionActionResult;
  platform?: string;
}): Promise<CustomAssertionActionResult | undefined> {
  const { step, actionResult, platform } = args;
  if (!step || !actionResult) return actionResult;

  // Normalize the author condition form. Only string | string[] is user input;
  // an array-of-objects is the report shape and is ignored.
  const raw = step.assertions;
  let statements: string[] | null = null;
  if (typeof raw === "string") {
    statements = [raw];
  } else if (
    Array.isArray(raw) &&
    raw.length > 0 &&
    raw.every((s) => typeof s === "string")
  ) {
    statements = raw as string[];
  }
  if (!statements || statements.length === 0) return actionResult;

  const existing: ImplicitAssertionRecord[] = Array.isArray(
    actionResult.assertions
  )
    ? actionResult.assertions
    : [];

  const specs: ImplicitAssertionSpec[] = statements.map((statement) => ({
    statement,
    severity: "fail",
  }));

  // Custom assertions may only ADD a failure to a passing/warning step. For any
  // other status (FAIL for any reason — execution error or an existing implicit
  // FAIL record — or SKIPPED) there is nothing meaningful to assert on: emit
  // SKIPPED custom records and PRESERVE the original status (no re-roll, which
  // could otherwise upgrade a FAIL to PASS or flip a SKIPPED).
  if (actionResult.status !== "PASS" && actionResult.status !== "WARNING") {
    const customRecords: ImplicitAssertionRecord[] = specs.map((spec) => ({
      statement: spec.statement,
      source: "custom",
      result: "SKIPPED",
    }));
    actionResult.assertions = [...existing, ...customRecords];
    return actionResult;
  }

  const ctx = buildConditionContext({
    platform,
    outputs: actionResult.outputs,
    steps: {},
  });
  const { assertions: customRecords } = await evaluateImplicitAssertions(
    specs,
    ctx,
    { source: "custom" }
  );

  actionResult.assertions = [...existing, ...customRecords];
  actionResult.status = rollUpAssertions(actionResult.assertions);
  return actionResult;
}

/**
 * The author form of a guard `if`: a single condition string, or an array of
 * condition strings that are AND-ed together (all must be truthy).
 */
type GuardCondition = string | string[];

/**
 * Evaluate a guard `if` against a condition context.
 *
 * Used at spec, test, and step scope. The guard decides whether the unit runs
 * at all (it is evaluated BEFORE the unit). Semantics:
 *   - `undefined`/empty (no usable conditions) -> `true` (guard absent; run).
 *   - A single string -> the truthiness of that one condition.
 *   - An array of strings -> AND across all of them: `true` only if EVERY
 *     condition is truthy. Evaluation short-circuits on the first falsy one.
 *   - Each condition is evaluated through `evaluateAssertion`, which fails
 *     CLOSED: an unresolvable `$$` reference resolves to `false` (so a guard
 *     that references a not-yet-available value blocks the unit rather than
 *     throwing).
 *
 * Non-string array entries are ignored (filtered out), and string entries are
 * trimmed with empty/whitespace-only ones dropped — only non-empty string
 * conditions are author input. If normalization leaves no conditions, the
 * guard is treated as absent (`true`). So `""`, `"   "`, and `["", "  "]` all
 * mean "guard absent", not "a falsy condition".
 *
 * @param ifValue - The author `if` value (`string | string[]` or undefined).
 * @param context - A `buildConditionContext(...)` output.
 * @returns `true` if the unit should run, `false` if it should be skipped.
 */
async function evaluateGuard(
  ifValue: GuardCondition | undefined | null,
  context: ConditionContext
): Promise<boolean> {
  // Normalize to a string array; drop anything that isn't a string, then trim
  // and drop empty/whitespace-only entries (an empty condition is "no
  // condition", not a falsy one — treat it as guard-absent).
  let raw: string[];
  if (typeof ifValue === "string") {
    raw = [ifValue];
  } else if (Array.isArray(ifValue)) {
    raw = ifValue.filter((c): c is string => typeof c === "string");
  } else {
    raw = [];
  }
  const conditions = raw
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  // No usable conditions -> guard absent -> run.
  if (conditions.length === 0) return true;

  // AND across all conditions; short-circuit on the first falsy one.
  for (const condition of conditions) {
    const ok = await evaluateAssertion(condition, context);
    if (!ok) return false;
  }
  return true;
}

/**
 * Authoring-time detector: does a guard `if` value reference `$$steps.*`?
 *
 * `$$steps.<id>.outputs.*` is only populated at STEP scope (the per-step
 * accumulator in `runContext`). A spec- or test-level guard that references it
 * resolves against an empty `steps` map and fails closed — so the unit is
 * always skipped. Callers use this to emit an authoring warning rather than
 * letting the misuse silently swallow the unit. Non-string entries are ignored.
 *
 * @param ifValue - The author `if` value (`string | string[]` or undefined).
 * @returns `true` if any string condition references `$$steps.`.
 */
function guardReferencesSteps(
  ifValue: GuardCondition | undefined | null
): boolean {
  const conditions =
    typeof ifValue === "string"
      ? [ifValue]
      : Array.isArray(ifValue)
        ? ifValue
        : [];
  return conditions.some(
    (c) => typeof c === "string" && c.includes("$$steps.")
  );
}

/**
 * A step's result status, used to select the matching routing handler.
 */
type StepRoutingStatus = "PASS" | "FAIL" | "WARNING" | "SKIPPED";

/**
 * A retry spec as authored on a routing entry.
 */
interface RetrySpec {
  limit: number;
  delay?: number;
  backoff?: "fixed" | "exponential";
}

/**
 * The control-flow decision produced by resolving a step's routing handler.
 * `continue` runs the next step; `stop` halts the unit at the given scope;
 * `retry` re-runs the step (the runtime loops, then re-resolves with
 * `skipRetry` to get the terminal decision); `goToStep` jumps execution to the
 * step with the given stepId. (`goToTest` is deferred to a later phase.)
 */
type RoutingDecision =
  | { action: "continue" }
  | { action: "stop"; scope: "test" | "spec" | "run" }
  | {
      action: "retry";
      limit: number;
      delay: number;
      backoff: "fixed" | "exponential";
    }
  | { action: "goToStep"; stepId: string };

// One routing entry as authored: an optional `if` selector plus exactly one
// action.
interface RoutingEntry {
  if?: GuardCondition;
  continue?: true;
  stop?: "test" | "spec" | "run";
  retry?: RetrySpec;
  goToStep?: string;
  goToTest?: string;
}

// The handler key and default decision for each result status. Defaults
// reproduce today's hardcoded behavior exactly: a FAIL stops the test, every
// other status continues — so a step with no routing fields is byte-identical
// to the pre-routing runner.
const ROUTING_BY_STATUS: Record<
  StepRoutingStatus,
  { key: "onPass" | "onFail" | "onWarning" | "onSkip"; default: RoutingDecision }
> = {
  PASS: { key: "onPass", default: { action: "continue" } },
  FAIL: { key: "onFail", default: { action: "stop", scope: "test" } },
  WARNING: { key: "onWarning", default: { action: "continue" } },
  SKIPPED: { key: "onSkip", default: { action: "continue" } },
};

/**
 * Resolve a step's routing handler for a given result status into a
 * control-flow decision.
 *
 * Selects the handler array for the status (`onPass`/`onFail`/`onWarning`/
 * `onSkip`), then returns the FIRST entry whose `if` selector matches (an entry
 * with no `if` always matches; `if` is evaluated by `evaluateGuard`, which AND-s
 * an array and fails CLOSED). The matched entry maps to a decision:
 *   - `{ continue: true }` -> `{ action: "continue" }`
 *   - `{ stop: <scope> }`  -> `{ action: "stop", scope }`
 *   - `{ retry: {...} }`   -> `{ action: "retry", limit, delay, backoff }`
 *                             (delay defaults to 0, backoff to "fixed")
 *   - `{ goToStep: <id> }` -> `{ action: "goToStep", stepId }`
 *   - goToTest (not implemented this phase) -> the status default
 *
 * If the handler is absent/empty or no entry matches, the status DEFAULT is
 * returned. Defaults reproduce today's behavior (FAIL stops the test; PASS,
 * WARNING, and SKIPPED continue), so an unrouted step is byte-identical to the
 * pre-routing runner. flow != verdict: this only chooses control flow, never
 * the step's result.
 *
 * `skipRetry` makes a matched `retry` entry behave as a non-match (skip to the
 * next entry / fall to the default). The runtime uses it once retries are
 * exhausted to find the terminal action — so `onFail:[{retry},{continue}]`
 * means "retry, then continue", and `onFail:[{retry}]` means "retry, then the
 * default (stop)".
 *
 * @param args.status - The step's result status.
 * @param args.step - The step (read for `onPass`/`onFail`/`onWarning`/`onSkip`).
 * @param args.context - A `buildConditionContext(...)` output for `if` selectors.
 * @param args.skipRetry - Treat `retry` entries as non-matching (post-exhaustion).
 * @returns The control-flow decision.
 */
async function resolveStepRouting(args: {
  status: StepRoutingStatus;
  step: {
    onPass?: RoutingEntry[];
    onFail?: RoutingEntry[];
    onWarning?: RoutingEntry[];
    onSkip?: RoutingEntry[];
  };
  context: ConditionContext;
  skipRetry?: boolean;
}): Promise<RoutingDecision> {
  const { status, step, context, skipRetry } = args;
  const config = ROUTING_BY_STATUS[status];
  // An unknown status has no handler family; default to continue (never halt
  // execution on a status we don't understand). runStep only emits the four
  // known statuses today, so this is defensive.
  if (!config) return { action: "continue" };
  const { key, default: fallback } = config;
  const handlers = step?.[key];
  if (!Array.isArray(handlers) || handlers.length === 0) return fallback;

  for (const entry of handlers) {
    if (!entry || typeof entry !== "object") continue;
    const isRetry = entry.retry != null && typeof entry.retry === "object";
    // When re-resolving after retries are exhausted, a retry entry is treated
    // as a non-match so resolution can fall to a later entry or the default.
    if (skipRetry && isRetry) continue;
    // An entry with no `if` always matches; otherwise it matches when its
    // condition(s) evaluate truthy (evaluateGuard: absent -> true, array ->
    // AND, fails closed).
    const matches =
      entry.if === undefined || (await evaluateGuard(entry.if, context));
    if (!matches) continue;

    if (entry.continue === true) return { action: "continue" };
    if (typeof entry.stop === "string") {
      return { action: "stop", scope: entry.stop };
    }
    if (isRetry) {
      const retry = entry.retry as RetrySpec;
      return {
        action: "retry",
        limit: retry.limit,
        delay: retry.delay ?? 0,
        backoff: retry.backoff ?? "fixed",
      };
    }
    if (typeof entry.goToStep === "string" && entry.goToStep.trim() !== "") {
      // Return the trimmed id so `goToStep: "target "` matches the step `target`
      // rather than failing as an unknown target on incidental whitespace.
      return { action: "goToStep", stepId: entry.goToStep.trim() };
    }
    // Matched, but the action isn't implemented this phase (goToTest). Treat as
    // the status default and stop scanning — a later entry must not override an
    // already-matched selector.
    return fallback;
  }
  // No entry matched.
  return fallback;
}

// The largest retry wait we will actually sleep, mirroring the schema's
// `retry.delay` maximum. Caps an exponential series so it can't exceed
// setTimeout's 2^31-1 ms range (beyond which Node clamps to 1ms, silently
// turning a long wait into a near-instant re-run).
const MAX_RETRY_DELAY_MS = 3_600_000;

/**
 * The wait (ms) before a retry attempt. `retryIndex` is 0-based (0 = first
 * retry). `fixed` backoff waits `delay` every time; `exponential` waits
 * `delay * 2^retryIndex`. Returns 0 when delay is 0/undefined, and never
 * exceeds `MAX_RETRY_DELAY_MS`.
 *
 * @param delay - Base delay in milliseconds.
 * @param backoff - `"fixed"` or `"exponential"`.
 * @param retryIndex - 0-based retry index.
 * @returns The wait in milliseconds (0 .. MAX_RETRY_DELAY_MS).
 */
function computeRetryDelay(
  delay: number | undefined,
  backoff: "fixed" | "exponential",
  retryIndex: number
): number {
  if (!delay || delay <= 0) return 0;
  const raw =
    backoff === "exponential" ? delay * Math.pow(2, retryIndex) : delay;
  return Math.min(raw, MAX_RETRY_DELAY_MS);
}

export {
  buildConditionContext,
  evaluateImplicitAssertions,
  evaluateCustomAssertions,
  evaluateGuard,
  guardReferencesSteps,
  resolveStepRouting,
  computeRetryDelay,
};
export type {
  BuildConditionContextArgs,
  ConditionContext,
  StepContextEntry,
  ImplicitAssertionSpec,
  ImplicitAssertionRecord,
  EvaluateAssertionsOptions,
  CustomAssertionStep,
  CustomAssertionActionResult,
  GuardCondition,
  StepRoutingStatus,
  RoutingDecision,
  RoutingEntry,
  RetrySpec,
};
