// System-information collectors for the debug dump.
//
// Pure synchronous reads of `os` and `process`. No I/O, no spawns.
// Output is consumed by `render.ts` and `index.ts` only.

import os from "node:os";

export interface SystemInfo {
  platform: string;
  arch: string;
  release: string;
  osVersion: string;
  cpuCount: number;
  cpuModel: string;
  cpuSpeedMhz: number;
  totalMemoryMb: number;
  freeMemoryMb: number;
  uptimeSeconds: number;
  hostname: string;
  wallclockIso: string;
  timezone: string;
  pid: number;
  ppid: number;
  cwd: string;
  argv: string[];
  execPath: string;
  isTTY: boolean;
  ci: string | undefined;
}

export function collectSystemInfo(): SystemInfo {
  const cpus = (() => {
    try {
      return os.cpus() || [];
    } catch {
      return [];
    }
  })();
  const first = cpus[0];

  const timezone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "<unknown>";
    } catch {
      return "<unknown>";
    }
  })();

  return {
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    osVersion: safe(() => os.version(), "<unknown>"),
    cpuCount: cpus.length,
    cpuModel: first?.model || "<unknown>",
    cpuSpeedMhz: first?.speed || 0,
    totalMemoryMb: Math.round(os.totalmem() / (1024 * 1024)),
    freeMemoryMb: Math.round(os.freemem() / (1024 * 1024)),
    uptimeSeconds: Math.round(os.uptime()),
    hostname: safe(() => os.hostname(), "<unknown>"),
    wallclockIso: new Date().toISOString(),
    timezone,
    pid: process.pid,
    ppid: process.ppid,
    cwd: safe(() => process.cwd(), "<unknown>"),
    argv: process.argv.slice(),
    execPath: process.execPath,
    isTTY: Boolean(process.stdout.isTTY),
    ci: process.env.CI,
  };
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
