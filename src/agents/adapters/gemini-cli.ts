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

export interface GeminiCliDeps {
  run: (cmd: string, args: string[]) => Promise<RunResult>;
  existsSync: (p: string) => boolean;
  readFileSync: (p: string, encoding?: BufferEncoding) => string;
  homedir: () => string;
  fetchLatestVersion: () => Promise<string | undefined>;
}

const EXTENSION_NAME = "doc-detective";
const GIT_SOURCE = "https://github.com/doc-detective/agent-tools.git";
const LATEST_MANIFEST_URL =
  "https://raw.githubusercontent.com/doc-detective/agent-tools/main/gemini-extension.json";

export function defaultGeminiCliDeps(): GeminiCliDeps {
  return {
    run: (cmd, args) => safeSpawn(cmd, args),
    existsSync: fs.existsSync,
    readFileSync: (p, enc = "utf8") => fs.readFileSync(p, enc),
    homedir: os.homedir,
    fetchLatestVersion: async () => {
      const response = await axios.get(LATEST_MANIFEST_URL, {
        timeout: 5000,
        responseType: "json",
      });
      const version = response?.data?.version;
      return typeof version === "string" ? version : undefined;
    },
  };
}

export class GeminiCliAdapter implements AgentAdapter {
  readonly id = "gemini-cli";
  readonly displayName = "Gemini CLI";
  private deps: GeminiCliDeps;

  constructor(deps: GeminiCliDeps = defaultGeminiCliDeps()) {
    this.deps = deps;
  }

  supportsScopes(): Scope[] {
    // Gemini's `extensions install` has no --scope flag; extensions live in ~/.gemini.
    return ["global"];
  }

  async detect(): Promise<DetectionResult> {
    const geminiHome = path.join(this.deps.homedir(), ".gemini");

    let onPath = false;
    let version: string | undefined;
    try {
      const result = await this.deps.run("gemini", ["--version"]);
      if (result.exitCode === 0 && result.stdout.trim()) {
        onPath = true;
        version = result.stdout.trim();
      }
    } catch {
      // Binary absent — silent.
    }

    const configPaths: { global?: string; project?: string } = {};
    if (this.deps.existsSync(geminiHome)) configPaths.global = geminiHome;

    const present = onPath || !!configPaths.global;
    const notes: string[] = [];
    if (!onPath && configPaths.global) {
      notes.push("`gemini` not on PATH; install requires the binary — see https://github.com/google-gemini/gemini-cli for install options.");
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

  private manifestPath(): string {
    return path.join(this.deps.homedir(), ".gemini", "extensions", EXTENSION_NAME, "gemini-extension.json");
  }

  private async queryLocalInstallState(): Promise<InstallState> {
    // Preferred: `gemini extensions list --output-format json`
    try {
      const result = await this.deps.run("gemini", ["extensions", "list", "--output-format", "json"]);
      if (result.exitCode === 0 && result.stdout.trim()) {
        try {
          const parsed = JSON.parse(result.stdout);
          if (Array.isArray(parsed)) {
            const entry = parsed.find((e) => e && typeof e === "object" && e.name === EXTENSION_NAME);
            if (entry) {
              const version = typeof entry.version === "string" ? entry.version : undefined;
              return { installed: true, installedVersion: version };
            }
            return { installed: false };
          }
          // Non-array (e.g. error object) — fall through to the filesystem fallback.
        } catch {
          // Unparseable JSON — fall through.
        }
      }
    } catch {
      // CLI not available — fall through.
    }

    // Fallback: read the extension manifest directly.
    const manifestPath = this.manifestPath();
    if (!this.deps.existsSync(manifestPath)) return { installed: false };
    try {
      const parsed = JSON.parse(this.deps.readFileSync(manifestPath, "utf8"));
      return {
        installed: true,
        installedVersion: typeof parsed?.version === "string" ? parsed.version : undefined,
      };
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
      ? [["gemini", "extensions", "update", EXTENSION_NAME]]
      : [
          [
            "gemini", "extensions", "install", GIT_SOURCE,
            "--auto-update", "--consent", "--skip-settings",
          ],
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
      const result = await this.deps.run(cmd, args);
      if (result.stdout) opts.logger(result.stdout, "debug");
      if (result.exitCode !== 0) {
        throw new Error(
          `\`${cmd} ${args.join(" ")}\` exited with code ${result.exitCode}` +
            (result.stderr ? `: ${result.stderr}` : "")
        );
      }
    }

    const installedVersion = enriched.latestVersion ?? enriched.installedVersion;

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

export const geminiCliAdapter: AgentAdapter = new GeminiCliAdapter();
