import type { AgentAdapter } from "./types.js";
import { claudeCodeAdapter } from "./adapters/claude-code.js";

const adapters: AgentAdapter[] = [claudeCodeAdapter];

export function listAdapters(): AgentAdapter[] {
  return adapters.slice();
}

export function getAdapter(id: string): AgentAdapter {
  const adapter = adapters.find((a) => a.id === id);
  if (!adapter) {
    throw new Error(
      `Unknown agent adapter: '${id}'. Available: ${adapters.map((a) => a.id).join(", ")}`
    );
  }
  return adapter;
}
