import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import axios from "axios";
import YAML from "yaml";
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

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CodexDeps {
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

export function defaultCodexDeps(): CodexDeps {
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

export class CodexAdapter implements AgentAdapter {
  readonly id = "codex";
  readonly displayName = "Codex";
  private deps: CodexDeps;

  constructor(deps: CodexDeps = defaultCodexDeps()) {
    this.deps = deps;
  }

  supportsScopes(): Scope[] {
    return ["global", "project"];
  }

  async detect(): Promise<DetectionResult> {
    const codexHome = path.join(this.deps.homedir(), ".codex");
    const projectAgents = path.join(this.deps.cwd(), ".agents");

    let onPath = false;
    let version: string | undefined;
    try {
      const result = await this.deps.run("codex", ["--version"]);
      if (result.exitCode === 0 && result.stdout.trim()) {
        onPath = true;
        version = result.stdout.trim();
      }
    } catch {
      // Binary absent — silent.
    }

    const configPaths: { global?: string; project?: string } = {};
    if (this.deps.existsSync(codexHome)) configPaths.global = codexHome;
    if (this.deps.existsSync(projectAgents)) configPaths.project = projectAgents;

    const present = onPath || !!configPaths.global;
    const notes: string[] = [];
    if (!onPath && (configPaths.global || configPaths.project)) {
      notes.push("`codex` not on PATH; skills will be written to .agents/skills/ and auto-discovered on next Codex launch.");
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

  private skillsRoot(scope: Scope): string {
    const root = scope === "global" ? this.deps.homedir() : this.deps.cwd();
    return path.join(root, ".agents", "skills");
  }

  private canonicalSkillPath(scope: Scope): string {
    return path.join(this.skillsRoot(scope), CANONICAL_SKILL, "SKILL.md");
  }

  private queryLocalInstallState(scope: Scope): InstallState {
    const canonical = this.canonicalSkillPath(scope);
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

  // Public (readonly) accessor on `deps` so tests can swap dependencies after
  // construction if needed (e.g., force fetchZip to fail mid-test).
  public get depsRef(): CodexDeps {
    return this.deps;
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

    const target = this.skillsRoot(opts.scope);

    if (opts.dryRun) {
      opts.logger(
        `[dry-run] would fetch doc-detective/agent-tools and copy doc-detective-* skills into ${target}`,
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
      const sourceSkills = path.join(fetched.tempDir, "skills");
      if (!this.deps.existsSync(sourceSkills)) {
        throw new Error(
          `Fetched agent-tools archive has no skills/ directory at ${sourceSkills}.`
        );
      }
      const sourceNames = (this.deps.readdirSync?.(sourceSkills) ?? []).filter(
        (n) => n.startsWith("doc-detective-")
      );
      if (sourceNames.length === 0) {
        throw new Error(
          "Fetched agent-tools archive has no doc-detective-* skills to install."
        );
      }

      this.mkdirp(target);
      for (const name of sourceNames) {
        const src = path.join(sourceSkills, name);
        const dst = path.join(target, name);
        // Remove any existing copy of this specific skill (fresh overwrite).
        if (this.deps.existsSync(dst)) {
          this.deps.rmSync?.(dst, { recursive: true, force: true });
        }
        this.copyDir(src, dst);
        opts.logger(`Copied skill: ${name}`, "debug");
      }

      // Read back the newly-installed version from the canonical skill.
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
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to install Codex skills from GitHub: ${reason}`);
    } finally {
      // Only clean up the fetched tempDir when the fetcher reports ownership.
      // Tests that point at a pre-populated source tree set `owned: false` so
      // their fixtures aren't wiped out of from under them.
      if (fetched.owned) {
        try { this.deps.rmSync?.(fetched.tempDir, { recursive: true, force: true }); } catch {}
      }
    }
  }

  private mkdirp(p: string): void {
    if (this.deps.mkdirSync) {
      this.deps.mkdirSync(p, { recursive: true });
    } else {
      fs.mkdirSync(p, { recursive: true });
    }
  }

  /**
   * Recursive directory copy. Uses `this.deps.readdirSync` and
   * `this.deps.writeFileSync` where the injected signatures match, but falls
   * back to `fs.statSync` and buffer-returning `fs.readFileSync` directly —
   * the `CodexDeps.readFileSync` signature returns a string (UTF-8), so we
   * can't use it here without losing binary content (images, shell scripts
   * with executable bits, etc.). Fully-injected recursion would require
   * widening the deps interface with buffer/stat variants; for the narrow
   * use case of copying extracted skills the direct fs calls are fine.
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
        if (this.deps.writeFileSync) {
          this.deps.writeFileSync(to, buf);
        } else {
          fs.writeFileSync(to, buf);
        }
      }
    }
  }
}

/**
 * Parse YAML frontmatter from a SKILL.md body and return metadata.version.
 * Returns undefined if the front matter is missing, malformed, or lacks the
 * metadata.version key. Never throws — Codex skills can vary.
 */
export function parseMetadataVersion(body: string): string | undefined {
  const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return undefined;
  try {
    const frontmatter = YAML.parse(match[1]);
    const v = frontmatter?.metadata?.version;
    return typeof v === "string" ? v : undefined;
  } catch {
    return undefined;
  }
}

export const codexAdapter: AgentAdapter = new CodexAdapter();
