// Dynamic routing (Phase 3): the condition-context builder.
//
// This module is the cohesive home for the routing/condition primitives of the
// dynamic-routing feature. Phase 3 ships only `buildConditionContext`; later
// phases will add `resolveRoute` / `nextRetryDelay` here. Nothing in the runner
// calls this yet — it is additive and dormant until Phase 5 wires it into the
// step loop.

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

export { buildConditionContext };
export type { BuildConditionContextArgs, ConditionContext, StepContextEntry };
