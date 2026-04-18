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

/**
 * Dependencies injected into the adapter. Default implementations use real
 * system calls; tests pass stubs. Keeping this as a plain interface (not a
 * class) avoids leaking test-only code into the runtime and keeps the adapter
 * cheap to instantiate.
 */
export interface ClaudeCodeDeps {
  /** Run a command and resolve with stdout/stderr/exitCode. Rejects on spawn failures (e.g., ENOENT). */
  run: (cmd: string, args: string[]) => Promise<RunResult>;
  existsSync: (p: string) => boolean;
  readFileSync: (p: string, encoding?: BufferEncoding) => string;
  readdirSync: (p: string) => string[];
  /** Write a file, creating parent directories as needed. Optional — defaults to fs. */
  writeFileSync?: (p: string, data: string) => void;
  /** Ensure a directory exists (recursive). Optional — defaults to fs.mkdirSync. */
  mkdirSync?: (p: string, options?: { recursive?: boolean }) => void;
  /** Rename a file. Optional — defaults to fs.renameSync. Used for atomic writes. */
  renameSync?: (from: string, to: string) => void;
  homedir: () => string;
  cwd: () => string;
  /**
   * Best-effort fetch of the latest plugin version from GitHub. Returning
   * undefined or throwing is treated as "unknown" — never fatal.
   */
  fetchLatestVersion: () => Promise<string | undefined>;
}

const LATEST_PLUGIN_JSON_URL =
  "https://raw.githubusercontent.com/doc-detective/agent-tools/main/plugins/doc-detective/.claude-plugin/plugin.json";

export function defaultClaudeCodeDeps(): ClaudeCodeDeps {
  return {
    run: (cmd, args) => safeSpawn(cmd, args),
    existsSync: fs.existsSync,
    readFileSync: (p, encoding = "utf8") => fs.readFileSync(p, encoding),
    readdirSync: (p) => fs.readdirSync(p),
    writeFileSync: (p, data) => fs.writeFileSync(p, data, "utf8"),
    mkdirSync: (p, opts) => { fs.mkdirSync(p, opts); },
    renameSync: fs.renameSync,
    homedir: os.homedir,
    cwd: () => process.cwd(),
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

const MARKETPLACE_NAME = "doc-detective";
const PLUGIN_NAME = "doc-detective";
const PLUGIN_KEY = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;

export class ClaudeCodeAdapter implements AgentAdapter {
  readonly id = "claude";
  readonly displayName = "Claude Code";
  private deps: ClaudeCodeDeps;

  constructor(deps: ClaudeCodeDeps = defaultClaudeCodeDeps()) {
    this.deps = deps;
  }

  supportsScopes(): Scope[] {
    return ["global", "project"];
  }

  async detect(): Promise<DetectionResult> {
    const homeClaude = path.join(this.deps.homedir(), ".claude");
    const projectClaude = path.join(this.deps.cwd(), ".claude");

    let onPath = false;
    let version: string | undefined;
    try {
      const result = await this.deps.run("claude", ["--version"]);
      if (result.exitCode === 0 && result.stdout.trim()) {
        onPath = true;
        version = result.stdout.trim();
      }
    } catch {
      // Binary not on PATH, or spawn failure — silently fall through.
    }

    const configPaths: { global?: string; project?: string } = {};
    if (this.deps.existsSync(homeClaude)) configPaths.global = homeClaude;
    if (this.deps.existsSync(projectClaude)) configPaths.project = projectClaude;

    const present = onPath || !!configPaths.global || !!configPaths.project;
    const notes: string[] = [];
    if (!onPath && (configPaths.global || configPaths.project)) {
      notes.push(
        "`claude` not on PATH but Claude Code settings exist; install will use settings-file fallback."
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
    const baseState = await this.queryLocalInstallState(scope);
    if (!baseState.installed) return baseState;
    return this.enrichWithLatest(baseState);
  }

  private async queryLocalInstallState(scope: Scope): Promise<InstallState> {
    // Path A: talk to the `claude` CLI if we can.
    const listed = await this.queryMarketplaceList(scope);
    if (listed.binaryAvailable) {
      if (listed.installed) {
        const version =
          listed.installedVersion ?? this.findInstalledVersionFromCache();
        return { installed: true, installedVersion: version };
      }
      return { installed: false };
    }

    // Path B: binary not available — inspect the settings file for the target scope.
    const settingsPath = this.settingsPathFor(scope);
    if (!this.deps.existsSync(settingsPath)) {
      return { installed: false };
    }
    try {
      const raw = this.deps.readFileSync(settingsPath, "utf8");
      const parsed = JSON.parse(raw);
      const enabled = parsed?.enabledPlugins?.[PLUGIN_KEY];
      if (enabled === true) {
        return { installed: true };
      }
      return { installed: false };
    } catch {
      // Corrupt settings file: treat as not-installed; the install() path
      // handles this more loudly when a write is actually attempted.
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

  /**
   * Invoke `claude plugin list --json` and find our plugin at the requested
   * scope. Returns binaryAvailable=false on spawn failure so callers can fall
   * back to the settings-file path; binaryAvailable=true otherwise, with
   * `installed` reflecting whether doc-detective@doc-detective is present at
   * the mapped Claude scope (`user` for our `global`, `project` for `project`).
   *
   * Note: `claude plugin marketplace list --json` returns the *marketplaces*,
   * not the installed plugins — a separate command (`plugin list`) is the
   * authoritative source for install state.
   */
  private async queryMarketplaceList(scope: Scope): Promise<{
    binaryAvailable: boolean;
    installed: boolean;
    installedVersion?: string;
  }> {
    const mappedScope = scope === "global" ? "user" : "project";
    let stdout: string;
    try {
      const result = await this.deps.run("claude", [
        "plugin",
        "list",
        "--json",
      ]);
      // A non-zero exit here means the binary ran but the subcommand failed
      // (auth, transient error, corrupt config, etc.). Don't conflate that
      // with ENOENT/spawn failure — keep `binaryAvailable: true` so install()
      // still takes Path A and surfaces the real error at install time
      // instead of silently dropping into the settings.json fallback.
      if (result.exitCode !== 0) return { binaryAvailable: true, installed: false };
      stdout = result.stdout;
    } catch {
      // Spawn failure (e.g., ENOENT — `claude` not on PATH). Fall back to
      // reading settings.json directly.
      return { binaryAvailable: false, installed: false };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      // Binary was there but returned non-JSON — treat as "available but empty".
      return { binaryAvailable: true, installed: false };
    }

    const plugins = toPluginListArray(parsed);
    const plugin = plugins.find(
      (p) => p?.id === PLUGIN_KEY && p?.scope === mappedScope
    );
    if (!plugin) return { binaryAvailable: true, installed: false };

    // `enabled` flag distinguishes installed-and-on from installed-but-disabled.
    // Treat disabled-but-installed as installed — the user made a choice to
    // keep it disabled, so we shouldn't clobber their state by reinstalling.
    const installedVersion =
      typeof plugin.version === "string" ? plugin.version : undefined;
    return { binaryAvailable: true, installed: true, installedVersion };
  }

  private findInstalledVersionFromCache(): string | undefined {
    const cacheDir = path.join(
      this.deps.homedir(),
      ".claude",
      "plugins",
      "cache",
      MARKETPLACE_NAME,
      PLUGIN_NAME
    );
    if (!this.deps.existsSync(cacheDir)) return undefined;
    let entries: string[];
    try {
      entries = this.deps.readdirSync(cacheDir);
    } catch {
      return undefined;
    }
    if (entries.length === 0) return undefined;

    // Pick the highest semver-ish entry. Numeric component comparison avoids
    // the "1.10.0" < "1.2.0" trap that a raw lexicographic sort would hit.
    // Falls back to localeCompare for entries that don't parse as numeric
    // tuples (pre-release tags, unexpected names).
    const chosen = [...entries].sort(compareSemverish).reverse()[0];
    const pluginJson = path.join(cacheDir, chosen, ".claude-plugin", "plugin.json");
    try {
      const raw = this.deps.readFileSync(pluginJson, "utf8");
      const parsed = JSON.parse(raw);
      if (typeof parsed?.version === "string") return parsed.version;
    } catch {
      // fall through
    }
    // Last resort: the directory name itself.
    return chosen;
  }

  private settingsPathFor(scope: Scope): string {
    const root = scope === "global" ? this.deps.homedir() : this.deps.cwd();
    return path.join(root, ".claude", "settings.json");
  }

  async install(opts: InstallOptions): Promise<InstallReport> {
    const local = await this.queryLocalInstallState(opts.scope);
    const binaryAvailable = await this.isClaudeAvailable();

    if (binaryAvailable) {
      return this.installViaCli(local, opts);
    }
    return this.installViaSettingsFile(local, opts);
  }

  /**
   * Path B: edit ~/.claude/settings.json (or ./.claude/settings.json) directly.
   * Claude Code will notice the extraKnownMarketplaces + enabledPlugins entries
   * on its next launch and prompt to trust + complete the install.
   */
  private async installViaSettingsFile(
    local: InstallState,
    opts: InstallOptions
  ): Promise<InstallReport> {
    const settingsPath = this.settingsPathFor(opts.scope);

    // Compute the desired shape first so dry-run can report it.
    const current = this.readSettingsFile(settingsPath);
    const merged = this.mergeSettingsForDocDetective(current);

    // Only treat settings as current when the marketplace entry actually
    // points at our repo. A stale fork URL or malformed entry should still
    // be repaired — otherwise we'd silently leave broken state in place.
    const mp = current?.extraKnownMarketplaces?.[MARKETPLACE_NAME];
    const hasExpectedMarketplace =
      mp?.source?.source === "github" &&
      mp?.source?.repo === "doc-detective/agent-tools";
    const alreadyRegistered =
      current?.enabledPlugins?.[PLUGIN_KEY] === true && hasExpectedMarketplace;

    if (opts.dryRun) {
      opts.logger(
        `[dry-run] would merge extraKnownMarketplaces + enabledPlugins into ${settingsPath}`,
        "info"
      );
      return {
        adapterId: this.id,
        scope: opts.scope,
        action: "dry-run",
        installedVersion: local.installedVersion,
      };
    }

    if (alreadyRegistered && !opts.force) {
      return {
        adapterId: this.id,
        scope: opts.scope,
        action: "already-up-to-date",
        installedVersion: local.installedVersion,
        notes: [`Settings already reference the doc-detective plugin at ${settingsPath}.`],
      };
    }

    this.writeSettingsFile(settingsPath, merged);
    opts.logger(
      `Wrote ${settingsPath}. Claude Code will prompt to install + trust on next launch.`,
      "info"
    );
    return {
      adapterId: this.id,
      scope: opts.scope,
      action: "fallback",
      installedVersion: local.installedVersion,
      notes: [
        "Claude Code binary was not on PATH; updated settings.json directly.",
        "Start Claude Code to complete the install (you'll see a trust prompt).",
      ],
    };
  }

  private readSettingsFile(p: string): Record<string, any> | undefined {
    if (!this.deps.existsSync(p)) return undefined;
    try {
      const raw = this.deps.readFileSync(p, "utf8");
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : undefined;
    } catch (err) {
      throw new Error(
        `Settings file at ${p} is not valid JSON. Fix or remove it, then re-run install-agents. (${String(err)})`
      );
    }
  }

  private mergeSettingsForDocDetective(
    existing: Record<string, any> | undefined
  ): Record<string, any> {
    const next: Record<string, any> = { ...(existing ?? {}) };
    next.enabledPlugins = { ...(next.enabledPlugins ?? {}), [PLUGIN_KEY]: true };
    next.extraKnownMarketplaces = {
      ...(next.extraKnownMarketplaces ?? {}),
      [MARKETPLACE_NAME]: {
        source: { source: "github", repo: "doc-detective/agent-tools" },
      },
    };
    return next;
  }

  private writeSettingsFile(p: string, contents: Record<string, any>): void {
    const dir = path.dirname(p);
    const mkdir = this.deps.mkdirSync ?? ((d, o) => { fs.mkdirSync(d, o); });
    const write = this.deps.writeFileSync ?? ((f, d) => fs.writeFileSync(f, d, "utf8"));
    const rename = this.deps.renameSync ?? fs.renameSync;
    const exists = this.deps.existsSync ?? fs.existsSync;

    mkdir(dir, { recursive: true });
    const tmp = `${p}.tmp.${process.pid}.${Date.now()}`;
    write(tmp, JSON.stringify(contents, null, 2) + "\n");
    // On Windows, `fs.renameSync` fails when the destination already exists.
    // Unlink the old settings.json first (if present), then rename the tmp
    // copy into place. If rename throws for any reason, best-effort clean up
    // the tmp file so we don't leave it around.
    try {
      if (exists(p)) fs.unlinkSync(p);
      rename(tmp, p);
    } catch (err) {
      try { if (exists(tmp)) fs.unlinkSync(tmp); } catch {}
      throw err;
    }
  }

  /**
   * Path A: `claude plugin ...` subcommands. Assumes binary is available.
   */
  private async installViaCli(
    local: InstallState,
    opts: InstallOptions
  ): Promise<InstallReport> {
    const mappedScope = opts.scope === "global" ? "user" : "project";
    const enriched = local.installed ? await this.enrichWithLatest(local) : local;

    const isInstalled = enriched.installed;
    const isUpToDate = enriched.upToDate === true;

    // Already up-to-date and no --force → no-op.
    if (isInstalled && isUpToDate && !opts.force) {
      return {
        adapterId: this.id,
        scope: opts.scope,
        action: "already-up-to-date",
        installedVersion: enriched.installedVersion,
      };
    }

    // Compute the command sequence. `--force` on a pristine install still uses
    // the install path (Claude Code reinstalls cleanly); `--force` on an
    // existing install prefers update semantics.
    type Cmd = [string, ...string[]];
    const commands: Cmd[] = isInstalled
      ? [
          ["claude", "plugin", "marketplace", "update", MARKETPLACE_NAME],
          ["claude", "plugin", "update", PLUGIN_KEY, "--scope", mappedScope],
        ]
      : [
          [
            "claude",
            "plugin",
            "marketplace",
            "add",
            "doc-detective/agent-tools",
            "--scope",
            mappedScope,
          ],
          [
            "claude",
            "plugin",
            "install",
            PLUGIN_KEY,
            "--scope",
            mappedScope,
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

    // Report the version we expect after the install. Prefer the freshly-
    // fetched latest; fall back to re-querying the plugin list; last resort
    // is the cache-dir snoop.
    const after = await this.queryMarketplaceList(opts.scope);
    const installedVersion =
      enriched.latestVersion ??
      after.installedVersion ??
      this.findInstalledVersionFromCache();

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

  private async isClaudeAvailable(): Promise<boolean> {
    try {
      const result = await this.deps.run("claude", ["--version"]);
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }
}

export const claudeCodeAdapter: AgentAdapter = new ClaudeCodeAdapter();

/**
 * `claude plugin list --json` returns an array of installed plugin entries:
 *
 *   [{ "id": "doc-detective@doc-detective",
 *      "version": "1.3.0",
 *      "scope": "user" | "project",
 *      "enabled": true,
 *      "installPath": "...",
 *      ...
 *   }]
 *
 * Accept either that shape or an object wrapping the array under a common
 * key so we stay compatible with small future schema tweaks.
 */
function toPluginListArray(parsed: unknown): Array<{
  id?: string;
  version?: string;
  scope?: string;
  enabled?: boolean;
}> {
  if (Array.isArray(parsed)) return parsed as any;
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    for (const key of ["plugins", "installedPlugins", "items"]) {
      if (Array.isArray(obj[key])) return obj[key] as any;
    }
  }
  return [];
}

/**
 * Compare two version-ish directory names, component-wise by numeric segments.
 * Falls back to localeCompare for any segment that isn't an integer (e.g.
 * pre-release tags or unexpected names). Used to pick the "latest" entry in
 * the Claude Code plugin cache without the "1.10.0" < "1.2.0" trap.
 */
function compareSemverish(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const sa = pa[i] ?? "";
    const sb = pb[i] ?? "";
    const na = /^\d+$/.test(sa) ? parseInt(sa, 10) : NaN;
    const nb = /^\d+$/.test(sb) ? parseInt(sb, 10) : NaN;
    if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b);
    if (na !== nb) return na - nb;
  }
  return 0;
}
