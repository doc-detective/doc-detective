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
import { fetchAgentToolsZip } from "../fetcher.js";
import { parseMetadataVersion } from "./codex.js";

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface OpenCodeDeps {
  run: (cmd: string, args: string[]) => Promise<RunResult>;
  existsSync: (p: string) => boolean;
  readFileSync: (p: string, encoding?: BufferEncoding) => string;
  readdirSync?: (p: string) => string[];
  mkdirSync?: (p: string, opts?: { recursive?: boolean }) => void;
  writeFileSync?: (p: string, data: string | Buffer) => void;
  rmSync?: (p: string, opts?: { recursive?: boolean; force?: boolean }) => void;
  homedir: () => string;
  cwd: () => string;
  fetchLatestVersion: () => Promise<string | undefined>;
  fetchZip: (ref: string) => Promise<{ tempDir: string; ref: string; owned?: boolean }>;
}

const CANONICAL_SKILL = "doc-detective-init";
const LATEST_SKILL_URL =
  "https://raw.githubusercontent.com/doc-detective/agent-tools/main/skills/doc-detective-init/SKILL.md";

export function defaultOpenCodeDeps(): OpenCodeDeps {
  return {
    run: (cmd, args) => safeSpawn(cmd, args),
    existsSync: fs.existsSync,
    readFileSync: (p, enc = "utf8") => fs.readFileSync(p, enc),
    readdirSync: (p) => fs.readdirSync(p),
    mkdirSync: (p, opts) => { fs.mkdirSync(p, opts); },
    writeFileSync: (p, data) =>
      fs.writeFileSync(p, typeof data === "string" ? data : Buffer.from(data as Buffer)),
    rmSync: (p, opts) => { fs.rmSync(p, opts); },
    homedir: os.homedir,
    cwd: () => process.cwd(),
    fetchLatestVersion: async () => {
      const response = await axios.get(LATEST_SKILL_URL, {
        timeout: 5000,
        responseType: "text",
      });
      return parseMetadataVersion(String(response?.data ?? ""));
    },
    fetchZip: (ref) => fetchAgentToolsZip(ref),
  };
}

export class OpenCodeAdapter implements AgentAdapter {
  readonly id = "opencode";
  readonly displayName = "OpenCode";
  private deps: OpenCodeDeps;

  constructor(deps: OpenCodeDeps = defaultOpenCodeDeps()) {
    this.deps = deps;
  }

  supportsScopes(): Scope[] {
    return ["global", "project"];
  }

  async detect(): Promise<DetectionResult> {
    const configDir = path.join(this.deps.homedir(), ".config", "opencode");
    const installDir = path.join(this.deps.homedir(), ".opencode");
    const projectDir = path.join(this.deps.cwd(), ".opencode");

    let onPath = false;
    let version: string | undefined;
    try {
      const result = await this.deps.run("opencode", ["--version"]);
      if (result.exitCode === 0 && result.stdout.trim()) {
        onPath = true;
        version = result.stdout.trim();
      }
    } catch {
      // Binary absent — silent.
    }

    const configPaths: { global?: string; project?: string } = {};
    if (this.deps.existsSync(configDir)) configPaths.global = configDir;
    else if (this.deps.existsSync(installDir)) configPaths.global = installDir;
    if (this.deps.existsSync(projectDir)) configPaths.project = projectDir;

    const present = onPath || !!configPaths.global || !!configPaths.project;
    const notes: string[] = [];
    if (!onPath && (configPaths.global || configPaths.project)) {
      notes.push(
        "`opencode` not on PATH; skills will be written to <scope>/skills/ and auto-discovered on next OpenCode launch."
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

  async getInstallState(scope: Scope): Promise<InstallState> {
    const base = this.queryLocalInstallState(scope);
    if (!base.installed) return base;
    return this.enrichWithLatest(base);
  }

  /**
   * Resolve the scope root. Global scope prefers the XDG-style config dir
   * (~/.config/opencode/) that OpenCode documents as primary. Project scope
   * uses ./.opencode/ for committed, team-shared skills.
   */
  private scopeRoot(scope: Scope): string {
    return scope === "global"
      ? path.join(this.deps.homedir(), ".config", "opencode")
      : path.join(this.deps.cwd(), ".opencode");
  }

  private canonicalSkillPath(scope: Scope): string {
    return path.join(this.scopeRoot(scope), "skills", CANONICAL_SKILL, "SKILL.md");
  }

  private queryLocalInstallState(scope: Scope): InstallState {
    const canonical = this.canonicalSkillPath(scope);
    if (!this.deps.existsSync(canonical)) return { installed: false };
    try {
      const raw = this.deps.readFileSync(canonical, "utf8");
      return { installed: true, installedVersion: parseMetadataVersion(raw) };
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
    const local = this.queryLocalInstallState(opts.scope);
    const enriched = local.installed ? await this.enrichWithLatest(local) : local;

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

    const root = this.scopeRoot(opts.scope);

    if (opts.dryRun) {
      opts.logger(
        `[dry-run] would fetch doc-detective/agent-tools and copy into ${root}: ` +
          `skills/doc-detective-*, plugins/opencode-plugin.mjs, hooks/, agents/`,
        "info"
      );
      return {
        adapterId: this.id,
        scope: opts.scope,
        action: "dry-run",
        installedVersion: enriched.installedVersion,
      };
    }

    const fetched = await this.deps.fetchZip("main");
    try {
      const pluginSrc = path.join(fetched.tempDir, "plugins", "doc-detective");
      if (!this.deps.existsSync(pluginSrc)) {
        throw new Error(
          `Fetched agent-tools archive has no plugins/doc-detective/ directory at ${pluginSrc}.`
        );
      }

      // Fall back to module-level fs.rmSync when no rmSync is injected —
      // required for the atomic rename below to succeed when `dst` exists.
      const rmSync =
        this.deps.rmSync ??
        ((p: string, opts?: fs.RmOptions) => fs.rmSync(p, opts));

      // 1. Skills (doc-detective-* only) — fail loudly if missing, then
      //    atomic-overwrite each skill (copy to a tmp sibling, swap in).
      const skillsSrc = path.join(pluginSrc, "skills");
      const skillsDst = path.join(root, "skills");
      if (!this.deps.existsSync(skillsSrc)) {
        throw new Error(
          `Fetched agent-tools archive has no plugins/doc-detective/skills/ directory at ${skillsSrc}.`
        );
      }
      const names = (this.deps.readdirSync?.(skillsSrc) ?? []).filter((n) =>
        n.startsWith("doc-detective-")
      );
      if (names.length === 0) {
        throw new Error(
          "Fetched agent-tools archive has no OpenCode doc-detective-* skills to install."
        );
      }
      this.mkdirp(skillsDst);
      for (const name of names) {
        const src = path.join(skillsSrc, name);
        const dst = path.join(skillsDst, name);
        const tmpDst = `${dst}.install.tmp.${process.pid}.${Date.now()}`;
        if (this.deps.existsSync(tmpDst)) {
          rmSync(tmpDst, { recursive: true, force: true });
        }
        try {
          this.copyDir(src, tmpDst);
        } catch (err) {
          try { rmSync(tmpDst, { recursive: true, force: true }); } catch {}
          throw err;
        }
        if (this.deps.existsSync(dst)) {
          rmSync(dst, { recursive: true, force: true });
        }
        fs.renameSync(tmpDst, dst);
        opts.logger(`Copied skill: ${name}`, "debug");
      }

      // 2. Plugin file — also required for OpenCode integration to work.
      const pluginFileSrc = path.join(pluginSrc, "opencode-plugin.mjs");
      if (!this.deps.existsSync(pluginFileSrc)) {
        throw new Error(
          `Fetched agent-tools archive has no OpenCode plugin file at ${pluginFileSrc}.`
        );
      }
      const pluginFileDst = path.join(root, "plugins", "opencode-plugin.mjs");
      this.mkdirp(path.dirname(pluginFileDst));
      const buf = fs.readFileSync(pluginFileSrc);
      if (this.deps.writeFileSync) this.deps.writeFileSync(pluginFileDst, buf);
      else fs.writeFileSync(pluginFileDst, buf);
      opts.logger("Copied plugin: opencode-plugin.mjs", "debug");

      // 3. Hooks dir — copy additively. We can't safely wipe the whole dir
      //    because OpenCode users may keep their own hooks alongside ours.
      //    We prune only doc-detective-owned files: anything whose basename
      //    starts with "doc-detective" and lives under hooks/ gets removed
      //    first, so files renamed/removed upstream don't linger. Unrelated
      //    user content is preserved.
      const hooksSrc = path.join(pluginSrc, "hooks");
      const hooksDst = path.join(root, "hooks");
      if (this.deps.existsSync(hooksSrc)) {
        if (this.deps.existsSync(hooksDst)) {
          this.pruneDocDetectiveFiles(hooksDst);
        }
        this.copyDir(hooksSrc, hooksDst);
        opts.logger("Copied hooks/", "debug");
      }

      // 4. Agents dir — same additive-copy + targeted-prune pattern as hooks.
      const agentsSrc = path.join(pluginSrc, "agents");
      const agentsDst = path.join(root, "agents");
      if (this.deps.existsSync(agentsSrc)) {
        if (this.deps.existsSync(agentsDst)) {
          this.pruneDocDetectiveFiles(agentsDst);
        }
        this.copyDir(agentsSrc, agentsDst);
        opts.logger("Copied agents/", "debug");
      }

      const installedVersion =
        this.queryLocalInstallState(opts.scope).installedVersion ??
        enriched.latestVersion;

      let action: InstallReport["action"];
      if (opts.force && isInstalled && isUpToDate) action = "forced";
      else if (isInstalled) action = "updated";
      else action = "installed";

      return {
        adapterId: this.id,
        scope: opts.scope,
        action,
        installedVersion,
        notes: [
          "OpenCode auto-discovers skills and plugins at startup — restart OpenCode if it's currently running.",
        ],
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to install OpenCode tools from GitHub: ${reason}`);
    } finally {
      // Only clean up the fetched tempDir when the fetcher reports ownership.
      // Tests that inject a pre-populated source tree set `owned: false`.
      if (fetched.owned) {
        try { this.deps.rmSync?.(fetched.tempDir, { recursive: true, force: true }); } catch {}
      }
    }
  }

  private mkdirp(p: string): void {
    if (this.deps.mkdirSync) this.deps.mkdirSync(p, { recursive: true });
    else fs.mkdirSync(p, { recursive: true });
  }

  /**
   * Walk a directory tree and remove any file or directory whose basename
   * starts with "doc-detective". Used before re-copying hooks/ or agents/ so
   * we prune our own stale artifacts (files/dirs renamed or removed
   * upstream) without touching unrelated user content living in the same
   * directory.
   */
  private pruneDocDetectiveFiles(dir: string): void {
    const rmSync =
      this.deps.rmSync ??
      ((p: string, opts?: fs.RmOptions) => fs.rmSync(p, opts));
    const entries = this.deps.readdirSync?.(dir) ?? [];
    for (const name of entries) {
      const full = path.join(dir, name);
      if (name.startsWith("doc-detective")) {
        rmSync(full, { recursive: true, force: true });
        continue;
      }
      // Recurse into subdirectories to catch nested doc-detective-* files
      // (e.g., hooks/scripts/doc-detective-before.js).
      let isDir = false;
      try { isDir = fs.statSync(full).isDirectory(); } catch {}
      if (isDir) this.pruneDocDetectiveFiles(full);
    }
  }

  /**
   * Recursive directory copy. Uses `this.deps.readdirSync` and
   * `this.deps.writeFileSync` where the injected signatures match, but falls
   * back to `fs.statSync` and buffer-returning `fs.readFileSync` directly —
   * the `OpenCodeDeps.readFileSync` signature returns a string, so we can't
   * use it here without losing binary content.
   */
  private copyDir(src: string, dst: string): void {
    this.mkdirp(dst);
    const entries = this.deps.readdirSync?.(src) ?? [];
    for (const entry of entries) {
      const from = path.join(src, entry);
      const to = path.join(dst, entry);
      const stat = fs.statSync(from);
      if (stat.isDirectory()) {
        this.copyDir(from, to);
      } else {
        const buf = fs.readFileSync(from);
        if (this.deps.writeFileSync) this.deps.writeFileSync(to, buf);
        else fs.writeFileSync(to, buf);
        // Preserve executable bits from the source so shell-script hooks
        // keep working after install.
        try { fs.chmodSync(to, stat.mode); } catch {}
      }
    }
  }
}

export const opencodeAdapter: AgentAdapter = new OpenCodeAdapter();
