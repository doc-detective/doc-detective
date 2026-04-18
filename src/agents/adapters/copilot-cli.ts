import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import axios from "axios";
import type {
  AgentAdapter,
  DetectionResult,
  InstallOptions,
  InstallReport,
  InstallState,
  Scope,
} from "../types.js";
import { safeSpawn } from "../spawn-helper.js";

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CopilotCliDeps {
  run: (cmd: string, args: string[]) => Promise<RunResult>;
  existsSync: (p: string) => boolean;
  readFileSync: (p: string, encoding?: BufferEncoding) => string;
  homedir: () => string;
  fetchLatestVersion: () => Promise<string | undefined>;
}

const MARKETPLACE_NAME = "doc-detective";
const PLUGIN_NAME = "doc-detective";
const PLUGIN_KEY = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;
const LATEST_PLUGIN_JSON_URL =
  "https://raw.githubusercontent.com/doc-detective/agent-tools/main/plugins/doc-detective/.claude-plugin/plugin.json";

export function defaultCopilotCliDeps(): CopilotCliDeps {
  return {
    run: (cmd, args) => safeSpawn(cmd, args),
    existsSync: fs.existsSync,
    readFileSync: (p, enc = "utf8") => fs.readFileSync(p, enc),
    homedir: os.homedir,
    fetchLatestVersion: async () => {
      const response = await axios.get(LATEST_PLUGIN_JSON_URL, {
        timeout: 5000,
        responseType: "json",
      });
      const version = response?.data?.version;
      return typeof version === "string" ? version : undefined;
    },
  };
}

export class CopilotCliAdapter implements AgentAdapter {
  readonly id = "copilot-cli";
  readonly displayName = "GitHub Copilot CLI";
  private deps: CopilotCliDeps;

  constructor(deps: CopilotCliDeps = defaultCopilotCliDeps()) {
    this.deps = deps;
  }

  supportsScopes(): Scope[] {
    // Copilot CLI's `plugin install` has no --scope flag — always user-global.
    return ["global"];
  }

  async detect(): Promise<DetectionResult> {
    const copilotHome = path.join(this.deps.homedir(), ".copilot");

    let onPath = false;
    let version: string | undefined;
    try {
      const result = await this.deps.run("copilot", ["--version"]);
      if (result.exitCode === 0 && result.stdout.trim()) {
        onPath = true;
        version = result.stdout.trim();
      }
    } catch {
      // Binary absent — fall through.
    }

    const configPaths: { global?: string; project?: string } = {};
    if (this.deps.existsSync(copilotHome)) configPaths.global = copilotHome;

    const present = onPath || !!configPaths.global;
    const notes: string[] = [];
    if (!onPath && configPaths.global) {
      notes.push(
        "`copilot` not on PATH but ~/.copilot exists; install requires the binary — run `npm install -g @github/copilot`."
      );
    }
    return {
      present,
      onPath,
      version,
      configPaths,
      notes: notes.length ? notes : undefined,
    };
  }

  async getInstallState(_scope: Scope): Promise<InstallState> {
    const base = await this.queryLocalInstallState();
    if (!base.installed) return base;
    return this.enrichWithLatest(base);
  }

  private pluginJsonPath(): string {
    // Copilot CLI nests the plugin manifest under `.claude-plugin/` inside
    // the installed plugin directory (verified on disk; the Claude-plugin
    // format requires a `.claude-plugin/plugin.json` manifest).
    return path.join(
      this.deps.homedir(),
      ".copilot",
      "installed-plugins",
      MARKETPLACE_NAME,
      PLUGIN_NAME,
      ".claude-plugin",
      "plugin.json"
    );
  }

  private async queryLocalInstallState(): Promise<InstallState> {
    const manifestPath = this.pluginJsonPath();
    if (!this.deps.existsSync(manifestPath)) return { installed: false };
    try {
      const raw = this.deps.readFileSync(manifestPath, "utf8");
      const parsed = JSON.parse(raw);
      if (typeof parsed?.version === "string") {
        return { installed: true, installedVersion: parsed.version };
      }
      return { installed: true };
    } catch {
      return { installed: false };
    }
  }

  private async enrichWithLatest(state: InstallState): Promise<InstallState> {
    let latestVersion: string | undefined;
    try {
      latestVersion = await this.deps.fetchLatestVersion();
    } catch {
      latestVersion = undefined;
    }
    if (!latestVersion) {
      return { ...state, latestVersion: undefined, upToDate: undefined };
    }
    const upToDate =
      state.installedVersion !== undefined
        ? state.installedVersion === latestVersion
        : undefined;
    return { ...state, latestVersion, upToDate };
  }

  async install(opts: InstallOptions): Promise<InstallReport> {
    const base = await this.queryLocalInstallState();
    const enriched = base.installed ? await this.enrichWithLatest(base) : base;

    const isInstalled = enriched.installed;
    const isUpToDate = enriched.upToDate === true;

    if (isInstalled && isUpToDate && !opts.force) {
      return {
        adapterId: this.id,
        scope: opts.scope,
        action: "already-up-to-date",
        installedVersion: enriched.installedVersion,
      };
    }

    type Cmd = [string, ...string[]];
    const commands: Cmd[] = isInstalled
      ? [["copilot", "plugin", "update", PLUGIN_KEY]]
      : [
          ["copilot", "plugin", "marketplace", "add", "doc-detective/agent-tools"],
          ["copilot", "plugin", "install", PLUGIN_KEY],
        ];

    if (opts.dryRun) {
      for (const cmd of commands) {
        opts.logger(`[dry-run] would run: ${cmd.join(" ")}`, "info");
      }
      return {
        adapterId: this.id,
        scope: opts.scope,
        action: "dry-run",
        installedVersion: enriched.installedVersion,
      };
    }

    for (const [cmd, ...args] of commands) {
      opts.logger(`Running: ${cmd} ${args.join(" ")}`, "debug");
      let result: RunResult;
      try {
        result = await this.deps.run(cmd, args);
      } catch (err) {
        // ENOENT from safeSpawn = binary missing. Surface an actionable
        // install hint rather than the raw spawn error.
        const code = (err as NodeJS.ErrnoException | undefined)?.code;
        if (code === "ENOENT") {
          throw new Error(
            "GitHub Copilot CLI is not installed or not on PATH. Run `npm install -g @github/copilot` (then `copilot login`) and re-run install-agents."
          );
        }
        throw err;
      }
      if (result.stdout) opts.logger(result.stdout, "debug");
      if (result.exitCode !== 0) {
        const msg = result.stderr || `exit code ${result.exitCode}`;
        if (/auth|login|token|unauthori[sz]ed/i.test(msg)) {
          throw new Error(
            `GitHub Copilot CLI is not authenticated. Run \`copilot login\` and re-run install-agents. (copilot said: ${msg})`
          );
        }
        throw new Error(
          `\`${cmd} ${args.join(" ")}\` exited with code ${result.exitCode}: ${msg}`
        );
      }
    }

    // Prefer the network-fetched latest (authoritative post-install); fall
    // back to a fresh read of ~/.copilot/installed-plugins/…/plugin.json,
    // then to the pre-install state. Same pattern as the Qwen adapter — keeps
    // the install report accurate when `fetchLatestVersion()` failed.
    const postInstall = await this.queryLocalInstallState();
    const installedVersion =
      enriched.latestVersion ??
      postInstall.installedVersion ??
      enriched.installedVersion;

    let action: InstallReport["action"];
    if (opts.force && isInstalled && isUpToDate) action = "forced";
    else if (isInstalled) action = "updated";
    else action = "installed";

    return {
      adapterId: this.id,
      scope: opts.scope,
      action,
      installedVersion,
    };
  }
}

export const copilotCliAdapter: AgentAdapter = new CopilotCliAdapter();
