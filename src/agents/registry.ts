import type { AgentAdapter } from "./types.js";
import { claudeCodeAdapter } from "./adapters/claude-code.js";
import { copilotCliAdapter } from "./adapters/copilot-cli.js";
import { geminiCliAdapter } from "./adapters/gemini-cli.js";
import { codexAdapter } from "./adapters/codex.js";
import { qwenCodeAdapter } from "./adapters/qwen-code.js";
import { opencodeAdapter } from "./adapters/opencode.js";

const adapters: AgentAdapter[] = [
  claudeCodeAdapter,
  copilotCliAdapter,
  geminiCliAdapter,
  codexAdapter,
  qwenCodeAdapter,
  opencodeAdapter,
];

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
