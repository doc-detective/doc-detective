// Public entry point for the post-run hints system.
//
// `maybeShowHint(config, results)` is wired into `src/cli.ts` after the
// reporters finish. It is wrapped in a top-level try/catch so a buggy
// predicate or render call cannot break a test run; any error is logged
// at `debug` and silently swallowed.
//
// Selection algorithm (see ./AGENTS.md for the rationale):
//   1. Filter the registry to hints whose `when()` returns true.
//   2. Find the lowest `priority` value among the eligible hints
//      (default priority = 50 if omitted).
//   3. Keep only hints tied at that lowest priority.
//   4. Pick uniformly at random from those.
//
// This biases output toward the most-important relevant tip rather than
// a uniform-random pick across all eligible hints. New users see
// onboarding hints (priority 10) until those are no longer applicable;
// veterans see optimization hints (priority 50) once the early tiers
// stop firing.

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

    const logLevel = config?.logLevel ?? "info";
    if (logLevel !== "info") return;

    // Cheap TTY short-circuit BEFORE building the context. On non-TTY
    // runs (CI logs, piped output), hints will be suppressed anyway —
    // skipping the build avoids the agent-probe latency, the
    // .git/config + .gitignore + package.json file reads, and the
    // results walk. Tests that pass `contextOverride` set the TTY flag
    // explicitly and bypass this check, so coverage of the non-TTY
    // skip rule lives in the contextOverride-driven test below.
    if (!options.contextOverride && process.stdout.isTTY === false) return;

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
        log(
          `hints: predicate for "${hint.id}" threw: ${(err as Error)?.message ?? err}`,
          "debug",
          config
        );
      }
    }
    if (eligible.length === 0) return;

    const chosen = pickByPriority(eligible, options.random ?? Math.random);

    const print = options.print ?? ((line: string) => console.log(line));
    print("");
    print(`${colors.dim}💡 Hint:${colors.reset}`);
    print(renderMarkdown(chosen.markdown));
    print(
      `${colors.dim}Hide hints: --no-hints or set hints.enabled: false in your config${colors.reset}`
    );
  } catch (err) {
    log(
      `hints: maybeShowHint failed: ${(err as Error)?.message ?? err}`,
      "debug",
      config
    );
  }
}

/**
 * Pick the most-important applicable hint. Exported so tests can drive
 * the algorithm directly without the surrounding I/O.
 */
export function pickByPriority(eligible: Hint[], rand: () => number): Hint {
  let lowest = Number.POSITIVE_INFINITY;
  for (const h of eligible) {
    const p = typeof h.priority === "number" ? h.priority : DEFAULT_PRIORITY;
    if (p < lowest) lowest = p;
  }
  const tied = eligible.filter(
    (h) => (typeof h.priority === "number" ? h.priority : DEFAULT_PRIORITY) === lowest
  );
  const idx = Math.floor(rand() * tied.length);
  return tied[Math.min(idx, tied.length - 1)];
}
