export type Scope = "global" | "project";

export interface DetectionResult {
  present: boolean;
  onPath: boolean;
  version?: string;
  configPaths: { global?: string; project?: string };
  notes?: string[];
}

export interface InstallState {
  installed: boolean;
  installedVersion?: string;
  latestVersion?: string;
  upToDate?: boolean;
}

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface InstallOptions {
  scope: Scope;
  force: boolean;
  dryRun: boolean;
  logger: (message: string, level?: LogLevel) => void;
}

export type InstallAction =
  | "installed"
  | "updated"
  | "already-up-to-date"
  | "forced"
  | "dry-run"
  | "fallback";

export interface InstallReport {
  adapterId: string;
  scope: Scope;
  action: InstallAction;
  installedVersion?: string;
  notes?: string[];
}

export interface AgentAdapter {
  id: string;
  displayName: string;
  detect(): Promise<DetectionResult>;
  supportsScopes(): Scope[];
  getInstallState(scope: Scope): Promise<InstallState>;
  install(opts: InstallOptions): Promise<InstallReport>;
}
