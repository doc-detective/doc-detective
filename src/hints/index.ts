// Public entry point for the post-run hints system.
//
// `maybeShowHint(config, results)` is wired into `src/cli.ts` after the
// reporters finish. It is wrapped in a top-level try/catch so a buggy
// predicate or render call cannot break a test run; any error is logged
// at `debug` and silently swallowed.
//
// Selection algorithm (see ./AGENTS.md for the rationale):
//   1. Filter the registry to hints whose `when()` returns true.
//   2. Compute a weight for each eligible hint via `priorityWeight()`
//      (priority 10 → 5, 20 → 4, 30 → 3, 40 → 2, 50 → 1).
//   3. Pick one via a weighted random draw across the full eligible
//      pool.
//
// This biases output toward higher-priority tiers without making them
// exclusive — earlier versions filtered hard to the lowest tier and
// users reported "almost nothing but the highest-priority hints". The
// weighted scheme keeps lower tiers in rotation while still favouring
// onboarding-tier hints for new users.

import { log } from "../utils.js";
import { buildHintContext } from "./context.js";
import { renderMarkdown, colors } from "./render.js";
import { HINTS } from "./hints.js";
import type { Hint, HintContext } from "./types.js";

const DEFAULT_PRIORITY = 50;

export interface MaybeShowHintOptions {
  /** Override the registry — used by tests. */
  hints?: Hint[];
  /** Override Math.random — used by tests. Returns a number in [0, 1). */
  random?: () => number;
  /** Override the context builder — used by tests. */
  contextOverride?: HintContext;
  /** Override console.log — used by tests. */
  print?: (line: string) => void;
}

/**
 * Optionally print one applicable hint to stdout. Never throws.
 *
 * Silent-skip rules (must mirror `./AGENTS.md` "Behavior rules"):
 *   1. `config.hints?.enabled === false`
 *   2. `ctx.isTTY === false`
 *   3. `config.logLevel` is anything other than `info` (undefined counts
 *      as `info` because that is the runtime default in `log()`)
 *   4. no hint's `when()` returned true
 *   5. any predicate or render call threw — caught here, logged at debug
 */
export async function maybeShowHint(
  config: any,
  results: any,
  options: MaybeShowHintOptions = {}
): Promise<void> {
  try {
    if (config?.hints?.enabled === false) return;

    // Early-exit for log levels where running hint evaluation buys
    // nothing the user cares about. `info` is the default and the
    // only level that actually prints a hint. `debug` users also
    // exercise the eval path so they can see predicate/render error
    // logs (the previous version of this function returned at
    // `!= "info"`, which silently swallowed every predicate error
    // because `log(..., "debug", ...)` is suppressed at `info` and
    // unreachable at `debug` — a catch-22). Silent / error / warning
    // users want clean output, so we skip everything for them.
    const logLevel = config?.logLevel ?? "info";
    if (logLevel !== "info" && logLevel !== "debug") return;

    // Cheap TTY short-circuit BEFORE building the context. On non-TTY
    // runs (CI logs, piped output), hints will be suppressed anyway —
    // skipping the build avoids the agent-probe latency, the
    // .git/config + .gitignore + package.json file reads, and the
    // results walk. Tests that pass `contextOverride` set the TTY flag
    // explicitly and bypass this check, so coverage of the non-TTY
    // skip rule lives in the contextOverride-driven test below.
    //
    // Falsy check (not strict `=== false`) because Node leaves
    // `process.stdout.isTTY` as `undefined` when stdout is piped or
    // redirected — the most common non-TTY case in CI.
    if (!options.contextOverride && !process.stdout.isTTY) return;

    const ctx =
      options.contextOverride ??
      (await buildHintContext({ config, results }));
    if (!ctx.isTTY) return;

    const registry = options.hints ?? HINTS;
    const eligible: Hint[] = [];
    for (const hint of registry) {
      try {
        if (hint.when(ctx)) eligible.push(hint);
      } catch (err) {
        // A bad predicate must not poison the rest of the registry.
        // Logged at debug — visible to `--logLevel debug` users who
        // reach this point precisely so they can diagnose issues.
        log(
          `hints: predicate for "${hint.id}" threw: ${(err as Error)?.message ?? err}`,
          "debug",
          config
        );
      }
    }

    // Debug users get the eval (and any error logs above) but never
    // a printed hint — they explicitly chose verbose output and a
    // hint at the end would be noise.
    if (logLevel === "debug") return;

    if (eligible.length === 0) return;

    const chosen = pickByPriority(eligible, options.random ?? Math.random);

    // Render and pull the first markdown line onto the prefix line so
    // short hints (single-line ones, ~half of the registry) fit in two
    // terminal lines including the leading blank. Multi-line hint
    // bodies still get the rest of their content emitted as a second
    // print call to preserve the renderer's line shape.
    const rendered = renderMarkdown(chosen.markdown);
    const newlineIdx = rendered.indexOf("\n");
    const firstLine =
      newlineIdx === -1 ? rendered : rendered.slice(0, newlineIdx);
    const restLines = newlineIdx === -1 ? "" : rendered.slice(newlineIdx + 1);

    const print = options.print ?? ((line: string) => console.log(line));
    print("");
    print(`${colors.dim}💡 Hint:${colors.reset} ${firstLine}`);
    if (restLines.length > 0) print(restLines);
  } catch (err) {
    log(
      `hints: maybeShowHint failed: ${(err as Error)?.message ?? err}`,
      "debug",
      config
    );
  }
}

/**
 * Compute the selection weight for a hint's priority. Lower priority
 * means higher weight, with a gentle ramp:
 *
 *   priority 10 → weight 5  (onboarding)
 *   priority 20 → weight 4  (current-run problems)
 *   priority 30 → weight 3  (output / reporting)
 *   priority 40 → weight 2  (feature discovery)
 *   priority 50 → weight 1  (advanced / optimization)
 *
 * Anything below 10 still maps to 5; anything above 50 clamps to 1.
 * Missing priority defaults to weight 1.
 */
export function priorityWeight(priority: number | undefined): number {
  const p = typeof priority === "number" ? priority : DEFAULT_PRIORITY;
  return Math.max(1, Math.min(5, 6 - Math.floor(p / 10)));
}

/**
 * Pick one applicable hint with a weighted random draw biased toward
 * higher-priority (lower-numbered) tiers. Earlier versions filtered
 * hard to the single lowest-priority tier, which meant users almost
 * always saw the same onboarding hint and rarely discovered
 * lower-tier ones. The new scheme keeps all eligible hints in the
 * draw and uses `priorityWeight` to bias the outcome.
 *
 * Exported so tests can drive the algorithm directly without the
 * surrounding I/O.
 */
export function pickByPriority(eligible: Hint[], rand: () => number): Hint {
  if (eligible.length === 1) return eligible[0];
  const weights = eligible.map((h) => priorityWeight(h.priority));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = rand() * total;
  for (let i = 0; i < eligible.length; i++) {
    r -= weights[i];
    if (r < 0) return eligible[i];
  }
  // Defensive fallback for floating-point rounding at the very tail.
  return eligible[eligible.length - 1];
}
