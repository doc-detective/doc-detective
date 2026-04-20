import type { AgentAdapter, InstallReport, LogLevel, Scope } from "./types.js";
import { listAdapters } from "./registry.js";
import type { InstallAgentsArgv } from "./command.js";

export interface RunnerDeps {
  adapters?: AgentAdapter[];
  prompts?: {
    pickAgents: (available: AgentAdapter[]) => Promise<string[]>;
    pickScope: (supported: Scope[]) => Promise<Scope>;
  };
  logger?: (message: string, level?: LogLevel) => void;
  isTTY?: () => boolean;
}

const defaultLogger = (msg: string, level: LogLevel = "info") => {
  if (level === "error") console.error(msg);
  else console.log(msg);
};

export async function runInstallAgents(
  argv: InstallAgentsArgv,
  deps: RunnerDeps = {}
): Promise<InstallReport[]> {
  const adapters = deps.adapters ?? listAdapters();
  const logger = deps.logger ?? defaultLogger;
  const isTTY = deps.isTTY ?? (() => Boolean(process.stdin.isTTY));

  const dryRun = argv["dry-run"] === true;

  // --yes requires explicit --agent and --scope; no prompts.
  if (argv.yes) {
    if (!argv.agent || argv.agent.length === 0) {
      throw new Error(
        "--yes requires at least one --agent (for example, --agent claude)."
      );
    }
    if (!argv.scope) {
      throw new Error("--yes requires --scope project|global.");
    }
  }

  // Resolve which agents to target.
  const targeted = await resolveTargetAgents(argv, adapters, {
    isTTY: isTTY(),
    prompts: deps.prompts,
    logger,
  });
  if (targeted.length === 0) {
    return [];
  }

  // Resolve scope.
  const scope = await resolveScope(argv, targeted, {
    isTTY: isTTY(),
    prompts: deps.prompts,
  });

  // Install each in order; collect reports. When an adapter doesn't support
  // the requested scope, degrade to its nearest supported scope and attach a
  // note to the report so callers see the divergence. Each install() is
  // isolated so one adapter's failure doesn't prevent the remaining adapters
  // from getting a chance — otherwise the user who said "install into these
  // three" would lose the last two when the first one errors.
  const reports: InstallReport[] = [];
  const failures: { adapter: AgentAdapter; error: unknown }[] = [];
  for (const adapter of targeted) {
    const effective = effectiveScopeFor(adapter, scope);
    if (effective.degraded) {
      logger(
        `⚠ ${adapter.displayName} does not support ${scope} scope — installing as ${effective.scope}.`,
        "warn"
      );
    }
    logger(`\n→ ${adapter.displayName} (${adapter.id}) — scope: ${effective.scope}`, "info");
    try {
      const report = await adapter.install({
        scope: effective.scope,
        force: Boolean(argv.force),
        dryRun,
        logger,
      });
      const finalReport = effective.degraded
        ? {
            ...report,
            notes: [
              ...(report.notes ?? []),
              `Requested scope '${scope}' is not supported by ${adapter.displayName}; installed as '${effective.scope}' instead.`,
            ],
          }
        : report;
      reports.push(finalReport);
      logger(summarizeReport(finalReport), "info");
    } catch (err) {
      failures.push({ adapter, error: err });
      const message = err instanceof Error ? err.message : String(err);
      logger(`  failed: ${message}`, "error");
    }
  }
  if (failures.length > 0) {
    const names = failures.map((f) => f.adapter.displayName).join(", ");
    // Throw so the CLI exits nonzero and the postinstall prompt's retry hint
    // fires; earlier adapters that succeeded still completed their side
    // effects, they just don't show up in the thrown error's message.
    throw new Error(`Agent install failed for: ${names}.`);
  }
  return reports;
}

/**
 * Resolve the effective scope an adapter will actually receive. If the desired
 * scope is supported, pass it through. Otherwise, degrade to the adapter's
 * first supported scope and flag that we did.
 */
function effectiveScopeFor(
  adapter: AgentAdapter,
  desired: Scope
): { scope: Scope; degraded: boolean } {
  const supported = adapter.supportsScopes();
  if (supported.includes(desired)) return { scope: desired, degraded: false };
  return { scope: supported[0], degraded: true };
}

async function resolveTargetAgents(
  argv: InstallAgentsArgv,
  adapters: AgentAdapter[],
  ctx: { isTTY: boolean; prompts?: RunnerDeps["prompts"]; logger: (m: string, l?: LogLevel) => void }
): Promise<AgentAdapter[]> {
  if (argv.agent && argv.agent.length > 0) {
    const chosen: AgentAdapter[] = [];
    const seen = new Set<string>();
    for (const id of argv.agent) {
      // Preserve first-seen order but drop duplicates — `--agent codex --agent codex`
      // should run one install, not two.
      if (seen.has(id)) continue;
      seen.add(id);
      const match = adapters.find((a) => a.id === id);
      if (!match) {
        const known = adapters.map((a) => a.id).join(", ");
        throw new Error(`Unknown agent '${id}'. Known agents: ${known}`);
      }
      chosen.push(match);
    }
    return chosen;
  }

  // No --agent: run detection across all adapters and prompt the user with the
  // ones that reported present.
  const detections = await Promise.all(
    adapters.map(async (a) => ({ adapter: a, result: await a.detect() }))
  );
  const detected = detections.filter((d) => d.result.present).map((d) => d.adapter);
  if (detected.length === 0) {
    ctx.logger(
      "No supported coding agents detected on this machine. Install one (e.g., Claude Code) and re-run.",
      "info"
    );
    return [];
  }

  if (!ctx.isTTY) {
    throw new Error(
      "Cannot prompt for agents in a non-TTY environment. Pass --agent explicitly (repeatable)."
    );
  }
  if (!ctx.prompts) {
    throw new Error("No prompts implementation available; pass --agent explicitly.");
  }
  const selectedIds = await ctx.prompts.pickAgents(detected);
  return detected.filter((a) => selectedIds.includes(a.id));
}

async function resolveScope(
  argv: InstallAgentsArgv,
  targeted: AgentAdapter[],
  ctx: { isTTY: boolean; prompts?: RunnerDeps["prompts"] }
): Promise<Scope> {
  if (argv.scope === "project" || argv.scope === "global") {
    return argv.scope;
  }
  // Intersect the supported-scope sets across all chosen adapters. Seed with
  // the first adapter's supported scopes (not `[]`) so that an empty running
  // intersection stays empty — otherwise the next adapter would re-seed it.
  const [first, ...rest] = targeted;
  const intersection = rest.reduce<Scope[]>(
    (acc, a) => acc.filter((s) => a.supportsScopes().includes(s)),
    first.supportsScopes()
  );
  // If no scope is common to every chosen adapter, pick "global" as a
  // sensible default and let each adapter degrade via effectiveScopeFor().
  if (intersection.length === 0) return "global";
  if (intersection.length === 1) return intersection[0];
  if (!ctx.isTTY) {
    throw new Error(
      "Cannot prompt for scope in a non-TTY environment. Pass --scope project|global."
    );
  }
  if (!ctx.prompts) {
    throw new Error("No prompts implementation available; pass --scope project|global.");
  }
  return ctx.prompts.pickScope(intersection);
}

function summarizeReport(r: InstallReport): string {
  const ver = r.installedVersion ? ` @ ${r.installedVersion}` : "";
  switch (r.action) {
    case "installed":
      return `  installed${ver}`;
    case "updated":
      return `  updated${ver}`;
    case "already-up-to-date":
      return `  already up to date${ver}`;
    case "forced":
      return `  forced reinstall${ver}`;
    case "dry-run":
      return `  dry-run (no changes)`;
    case "fallback":
      return `  wrote settings.json fallback${ver}`;
    default:
      return `  ${r.action}${ver}`;
  }
}
