// Dynamic routing (Phase 3): the condition-context builder.
//
// This module is the cohesive home for the routing/condition primitives of the
// dynamic-routing feature. Phase 3 ships only `buildConditionContext`; later
// phases will add `resolveRoute` / `nextRetryDelay` here. Nothing in the runner
// calls this yet — it is additive and dormant until Phase 5 wires it into the
// step loop.

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
 *   - If the action produced no assertable result — i.e. it was deliberately
 *     SKIPPED (e.g. `wait: false`), or it returned FAIL with NO implicit
 *     assertion records (an execution-error early return) — the custom
 *     assertions are emitted as SKIPPED, NOT evaluated, and the original status
 *     is preserved (no re-roll).
 *   - Otherwise, when an existing implicit record already FAILed, the custom
 *     records continue that short-circuit (all SKIPPED).
 *   - Custom assertions are FAIL-only (no WARNING). An unresolvable `$$` fails
 *     closed to FAIL (via `evaluateAssertion`).
 *   - Custom records are appended to `actionResult.assertions` and
 *     `actionResult.status` is re-rolled across ALL records.
 *
 * Cross-step `$$steps.*` in custom assertions is DEFERRED: `steps` is passed as
 * `{}` here (resolution would fail closed to FAIL today).
 *
 * @param args - `{ step, actionResult, platform }`. `platform` is the mapped
 *   `context.platform` value (or undefined).
 * @returns The same (mutated) `actionResult`, for convenience.
 */
async function evaluateCustomAssertions(args: {
  step: any;
  actionResult: any;
  platform?: string;
}): Promise<any> {
  const { step, actionResult, platform } = args || ({} as any);
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

  // No assertable result: either a deliberately-skipped step (status SKIPPED,
  // e.g. `wait: false`) or an execution-error early return (the action FAILed
  // before producing any implicit records). In both cases there is nothing
  // meaningful to assert on, so the custom checks are SKIPPED (not evaluated)
  // and the action's original status is PRESERVED (no re-roll that could flip
  // SKIPPED -> PASS/FAIL or demote FAIL -> SKIPPED).
  const noAssertableResult =
    actionResult.status === "SKIPPED" ||
    (actionResult.status === "FAIL" && existing.length === 0);

  // Continue an implicit short-circuit when an implicit check already FAILed.
  const implicitFailed = existing.some((a) => a.result === "FAIL");

  const specs: ImplicitAssertionSpec[] = statements.map((statement) => ({
    statement,
    severity: "fail",
  }));

  if (noAssertableResult) {
    // Nothing meaningful to assert on: emit SKIPPED custom records but PRESERVE
    // the action's original (SKIPPED or FAIL) status — a re-roll over a lone
    // SKIPPED record would wrongly flip SKIPPED -> PASS / demote FAIL -> SKIPPED.
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
    { source: "custom", startFailed: implicitFailed }
  );

  actionResult.assertions = [...existing, ...customRecords];
  actionResult.status = rollUpAssertions(actionResult.assertions);
  return actionResult;
}

export {
  buildConditionContext,
  evaluateImplicitAssertions,
  evaluateCustomAssertions,
};
export type {
  BuildConditionContextArgs,
  ConditionContext,
  StepContextEntry,
  ImplicitAssertionSpec,
  ImplicitAssertionRecord,
  EvaluateAssertionsOptions,
};
