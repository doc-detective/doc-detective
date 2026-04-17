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
import { parseMetadataVersion } from "./codex.js";

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface QwenCodeDeps {
  run: (cmd: string, args: string[]) => Promise<RunResult>;
  existsSync: (p: string) => boolean;
  readFileSync: (p: string, encoding?: BufferEncoding) => string;
  homedir: () => string;
  fetchLatestVersion: () => Promise<string | undefined>;
}

const EXTENSION_NAME = "doc-detective";
const GIT_SOURCE = "https://github.com/doc-detective/agent-tools";
const LATEST_SKILL_URL =
  "https://raw.githubusercontent.com/doc-detective/agent-tools/main/skills/doc-detective-init/SKILL.md";

export function defaultQwenCodeDeps(): QwenCodeDeps {
  return {
    run: (cmd, args) => safeSpawn(cmd, args),
    existsSync: fs.existsSync,
    readFileSync: (p, enc = "utf8") => fs.readFileSync(p, enc),
    homedir: os.homedir,
    fetchLatestVersion: async () => {
      const response = await axios.get(LATEST_SKILL_URL, {
        timeout: 5000,
        responseType: "text",
      });
      return parseMetadataVersion(String(response?.data ?? ""));
    },
  };
}

export class QwenCodeAdapter implements AgentAdapter {
  readonly id = "qwen-code";
  readonly displayName = "Qwen Code";
  private deps: QwenCodeDeps;

  constructor(deps: QwenCodeDeps = defaultQwenCodeDeps()) {
    this.deps = deps;
  }

  supportsScopes(): Scope[] {
    // Qwen's `extensions install` has no --scope flag; extensions live in ~/.qwen.
    return ["global"];
  }

  async detect(): Promise<DetectionResult> {
    const qwenHome = path.join(this.deps.homedir(), ".qwen");

    let onPath = false;
    let version: string | undefined;
    try {
      const result = await this.deps.run("qwen", ["--version"]);
      if (result.exitCode === 0 && result.stdout.trim()) {
        onPath = true;
        version = result.stdout.trim();
      }
    } catch {
      // Binary absent — silent.
    }

    const configPaths: { global?: string; project?: string } = {};
    if (this.deps.existsSync(qwenHome)) configPaths.global = qwenHome;

    const present = onPath || !!configPaths.global;
    const notes: string[] = [];
    if (!onPath && configPaths.global) {
      notes.push("`qwen` not on PATH; install requires the binary — `npm install -g @qwen-code/qwen-code`.");
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
    const base = this.queryLocalInstallState();
    if (!base.installed) return base;
    return this.enrichWithLatest(base);
  }

  private canonicalSkillPath(): string {
    // Read version from doc-detective's canonical SKILL.md frontmatter, which
    // is the authoritative source doc-detective itself declares. Avoiding
    // qwen-extension.json sidesteps upstream bug QwenLM/qwen-code#1737 which
    // leaves that manifest's `version` undefined on single-plugin Claude
    // marketplace installs — the route Qwen takes for our repo.
    return path.join(
      this.deps.homedir(),
      ".qwen",
      "extensions",
      EXTENSION_NAME,
      "skills",
      "doc-detective-init",
      "SKILL.md"
    );
  }

  private queryLocalInstallState(): InstallState {
    const canonical = this.canonicalSkillPath();
    if (!this.deps.existsSync(canonical)) return { installed: false };
    try {
      const raw = this.deps.readFileSync(canonical, "utf8");
      const version = parseMetadataVersion(raw);
      return { installed: true, installedVersion: version };
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
    const base = this.queryLocalInstallState();
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
      ? [["qwen", "extensions", "update", EXTENSION_NAME]]
      : [["qwen", "extensions", "install", GIT_SOURCE, "--auto-update", "--consent"]];

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

    // Prefer the network-fetched latest version (authoritative post-install);
    // fall back to a fresh on-disk SKILL.md read, then to the pre-install
    // state. This matters on a fresh install where `fetchLatestVersion()`
    // failed — we still surface the installed version rather than undefined.
    const installedVersion =
      enriched.latestVersion ??
      this.queryLocalInstallState().installedVersion ??
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

export const qwenCodeAdapter: AgentAdapter = new QwenCodeAdapter();
