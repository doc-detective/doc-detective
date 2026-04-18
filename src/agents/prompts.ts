import { checkbox, select, confirm } from "@inquirer/prompts";
import type { AgentAdapter, Scope } from "./types.js";

/**
 * Ask the user which detected agents to install into. Pre-selects all of them
 * since, by assumption, the caller already filtered to agents that were
 * actually detected on the machine.
 */
export async function pickAgents(available: AgentAdapter[]): Promise<string[]> {
  assertTTY();
  if (available.length === 0) return [];
  return checkbox({
    message: "Which agents should receive the doc-detective tools?",
    choices: available.map((a) => ({
      name: a.displayName,
      value: a.id,
      checked: true,
    })),
    required: false,
  });
}

/**
 * Ask the user which install scope to use. If only one is supported, skip the
 * prompt and return it directly.
 */
export async function pickScope(supported: Scope[]): Promise<Scope> {
  assertTTY();
  if (supported.length === 1) return supported[0];
  const chosen = await select<Scope>({
    message: "Install scope?",
    choices: buildScopeChoices(supported),
    default: supported.includes("project") ? "project" : supported[0],
  });
  return chosen;
}

export async function confirmForce(modifiedFiles: string[]): Promise<boolean> {
  assertTTY();
  if (modifiedFiles.length > 0) {
    console.log(
      "Locally modified files detected:\n" +
        modifiedFiles.map((f) => "  " + f).join("\n")
    );
  }
  return confirm({
    message: "Overwrite them? (equivalent to --force)",
    default: false,
  });
}

/**
 * Factory to hand into {@link runInstallAgents} as its `prompts` dep. The
 * `install-agents` command already imports this module lazily (dynamic
 * `import("./prompts.js")` from the yargs handler) so other subcommands
 * don't pay the inquirer load cost.
 */
export function createPrompts() {
  return { pickAgents, pickScope };
}

function assertTTY(): void {
  if (!process.stdin.isTTY) {
    throw new Error(
      "No TTY detected; run interactively or pass --agent and --scope with --yes."
    );
  }
}

function buildScopeChoices(supported: Scope[]): { name: string; value: Scope; description?: string }[] {
  const labels: Record<Scope, { name: string; description: string }> = {
    project: {
      name: "Project — applies to this repo only",
      description: "Installs into the current project directory.",
    },
    global: {
      name: "User-global — applies to every project for this user",
      description: "Installs into your user home directory.",
    },
  };
  return supported.map((s) => ({ name: labels[s].name, value: s, description: labels[s].description }));
}
