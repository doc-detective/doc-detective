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
 * are vestigial and omitted here.
 */
interface ImplicitAssertionRecord {
  statement: string;
  source: "implicit";
  result: "PASS" | "FAIL" | "WARNING" | "SKIPPED";
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
 * @returns `{ assertions, status }`.
 */
async function evaluateImplicitAssertions(
  specs: ImplicitAssertionSpec[],
  context: ConditionContext
): Promise<{ assertions: ImplicitAssertionRecord[]; status: string }> {
  const records: ImplicitAssertionRecord[] = [];
  let failed = false;

  for (const spec of specs) {
    if (failed) {
      // Short-circuit: an earlier assertion FAILed, so this applicable check is
      // not evaluated — report it as SKIPPED.
      records.push({
        statement: spec.statement,
        source: "implicit",
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
    records.push({ statement: spec.statement, source: "implicit", result });
  }

  return { assertions: records, status: rollUpAssertions(records) };
}

export { buildConditionContext, evaluateImplicitAssertions };
export type {
  BuildConditionContextArgs,
  ConditionContext,
  StepContextEntry,
  ImplicitAssertionSpec,
  ImplicitAssertionRecord,
};
