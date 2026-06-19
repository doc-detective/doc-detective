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
 * The author form of a step-level guard `if`: a single condition string, or an
 * array of condition strings that are AND-ed together (all must be truthy).
 */
type GuardCondition = string | string[];

/**
 * Evaluate a step-level guard `if` against a condition context.
 *
 * The guard decides whether a step's action runs at all (it is evaluated BEFORE
 * the action). Semantics:
 *   - `undefined`/empty (no usable conditions) -> `true` (guard absent; run).
 *   - A single string -> the truthiness of that one condition.
 *   - An array of strings -> AND across all of them: `true` only if EVERY
 *     condition is truthy. Evaluation short-circuits on the first falsy one.
 *   - Each condition is evaluated through `evaluateAssertion`, which fails
 *     CLOSED: an unresolvable `$$` reference resolves to `false` (so a guard
 *     that references a not-yet-available value blocks the step rather than
 *     throwing).
 *
 * Non-string array entries are ignored (filtered out) — only string conditions
 * are author input. If filtering leaves no conditions, the guard is treated as
 * absent (`true`).
 *
 * @param ifValue - The author `if` value (`string | string[]` or undefined).
 * @param context - A `buildConditionContext(...)` output.
 * @returns `true` if the step should run, `false` if it should be skipped.
 */
async function evaluateGuard(
  ifValue: GuardCondition | undefined | null,
  context: ConditionContext
): Promise<boolean> {
  // Normalize to a string array; drop anything that isn't a string.
  let conditions: string[];
  if (typeof ifValue === "string") {
    conditions = [ifValue];
  } else if (Array.isArray(ifValue)) {
    conditions = ifValue.filter((c): c is string => typeof c === "string");
  } else {
    conditions = [];
  }

  // No usable conditions -> guard absent -> run.
  if (conditions.length === 0) return true;

  // AND across all conditions; short-circuit on the first falsy one.
  for (const condition of conditions) {
    const ok = await evaluateAssertion(condition, context);
    if (!ok) return false;
  }
  return true;
}

export {
  buildConditionContext,
  evaluateImplicitAssertions,
  evaluateCustomAssertions,
  evaluateGuard,
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
};
