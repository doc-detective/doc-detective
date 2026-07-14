// Cross-process advisory lock (mkdir-as-lock) for single-writer critical
// sections in the runtime cache — first consumer: the WebDriverAgent prebuild
// in `install ios` (docs/design/ios-wda-prebuild.md), where a legitimate
// xcodebuild can hold the lock for ~20 minutes.
//
// Staleness is a HEARTBEAT LEASE, not age-since-acquire: the holder refreshes
// the metadata timestamp on a short interval, and a contender may take over
// only when that heartbeat has gone stale (many missed refreshes) or, on the
// same host, the recorded pid is dead. Lock age alone never permits takeover —
// a TTL long enough to cover a slow build would make a crashed holder block
// the next build for that whole window, and a shorter one would steal live
// builds.
//
// All effects (fs, clock, sleep, pid liveness, the heartbeat timer) are
// injectable so the lock is hermetically unit-testable.

import fsDefault from "node:fs";
import os from "node:os";
import path from "node:path";

export interface LockFs {
  mkdirSync(p: string, opts?: { recursive?: boolean }): unknown;
  writeFileSync(p: string, data: string): void;
  readFileSync(p: string): string | Buffer;
  rmSync(p: string, opts?: { recursive?: boolean; force?: boolean }): void;
}

export interface LockDeps {
  fs?: LockFs;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  pid?: number;
  hostname?: string;
  /** Whether a pid is alive on THIS host (only consulted for same-hostname metadata). */
  isPidAlive?: (pid: number) => boolean;
  /** Start a repeating timer; returns a stop function. Default: unref'd setInterval. */
  startInterval?: (fn: () => void, ms: number) => () => void;
}

export interface AcquireLockOptions {
  /** The lock directory itself (created exclusively; its existence IS the lock). */
  dir: string;
  /** Max time to wait for the lock before giving up (default 10 min). */
  waitMs?: number;
  /** Poll interval while waiting (default 1 s). */
  pollMs?: number;
  /** Holder heartbeat refresh interval (default 30 s). */
  heartbeatMs?: number;
  /** Heartbeat age beyond which a contender may take over (default 5 min). */
  staleMs?: number;
  deps?: LockDeps;
}

export interface LockHandle {
  /** Stop the heartbeat and remove the lock dir. Safe to call twice. */
  release(): void;
}

interface OwnerMeta {
  pid: number;
  hostname: string;
  acquiredAt: number;
  heartbeatAt: number;
}

function defaultIsPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    // EPERM means the pid exists but belongs to another user — alive.
    return err?.code === "EPERM";
  }
}

function defaultStartInterval(fn: () => void, ms: number): () => void {
  const timer = setInterval(fn, ms);
  (timer as any).unref?.();
  return () => clearInterval(timer);
}

const OWNER_FILE = "owner.json";

/**
 * Acquire the advisory lock at `dir`, waiting up to `waitMs`. Returns a
 * handle whose `release()` frees the lock, or `null` when the wait elapsed
 * with the lock still held by a live owner.
 */
export async function acquireLock(
  options: AcquireLockOptions
): Promise<LockHandle | null> {
  const {
    dir,
    waitMs = 10 * 60_000,
    pollMs = 1_000,
    heartbeatMs = 30_000,
    staleMs = 5 * 60_000,
    deps = {},
  } = options;
  const fs = deps.fs ?? (fsDefault as LockFs);
  const now = deps.now ?? Date.now;
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pid = deps.pid ?? process.pid;
  const hostname = deps.hostname ?? os.hostname();
  const isPidAlive = deps.isPidAlive ?? defaultIsPidAlive;
  const startInterval = deps.startInterval ?? defaultStartInterval;

  const ownerPath = `${dir}/${OWNER_FILE}`;
  const deadline = now() + waitMs;
  // Missing/corrupt owner metadata gets one poll-cycle of grace before it is
  // treated as stealable: a healthy acquirer writes owner.json microseconds
  // after its mkdir wins, so metadata that is STILL absent a poll later marks
  // a crash in that window, not a race with a live acquirer.
  let metaMissingSince: number | null = null;

  for (;;) {
    // Ensure the parent exists, then attempt the exclusive mkdir that IS the
    // lock. EEXIST means contention; anything else propagates.
    try {
      fs.mkdirSync(path.dirname(dir), { recursive: true });
      fs.mkdirSync(dir);
      return takeOwnership();
    } catch (err: any) {
      if (err?.code !== "EEXIST") throw err;
    }

    // Held by someone. Decide whether the holder is recoverable.
    let meta: OwnerMeta | null = null;
    try {
      meta = JSON.parse(String(fs.readFileSync(ownerPath)));
    } catch {
      meta = null;
    }

    let stealable = false;
    if (meta) {
      metaMissingSince = null;
      const heartbeatStale = now() - meta.heartbeatAt > staleMs;
      const deadOnThisHost =
        meta.hostname === hostname && !isPidAlive(meta.pid);
      stealable = heartbeatStale || deadOnThisHost;
    } else {
      metaMissingSince ??= now();
      stealable = now() - metaMissingSince >= pollMs;
    }

    if (stealable) {
      // Remove the dead holder's dir and loop straight back to mkdir. If a
      // concurrent contender removed it first (ENOENT), the retry settles who
      // wins — mkdir is the arbiter either way.
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // force:true makes ENOENT quiet on real fs; fakes may still throw.
      }
      continue;
    }

    if (now() >= deadline) return null;
    await sleep(pollMs);
  }

  function takeOwnership(): LockHandle {
    const acquiredAt = now();
    const writeMeta = () => {
      // acquiredAt is fixed at acquisition; only the heartbeat refreshes.
      const meta: OwnerMeta = {
        pid,
        hostname,
        acquiredAt,
        heartbeatAt: now(),
      };
      fs.writeFileSync(ownerPath, JSON.stringify(meta));
    };
    writeMeta();
    const stopHeartbeat = startInterval(() => {
      // Refresh the lease. Never throw from a timer: if the dir vanished
      // (external cleanup), the next refresh attempt just fails again and
      // release() stays safe.
      try {
        writeMeta();
      } catch {
        /* best-effort */
      }
    }, heartbeatMs);

    let released = false;
    return {
      release() {
        if (released) return;
        released = true;
        stopHeartbeat();
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          /* already gone */
        }
      },
    };
  }
}

/**
 * Run `fn` while holding the lock, releasing on both success and throw.
 * Returns `null` without running `fn` when the lock could not be acquired
 * within the wait bound.
 */
export async function withLock<T>(
  options: AcquireLockOptions,
  fn: () => Promise<T> | T
): Promise<{ acquired: boolean; result?: T }> {
  const handle = await acquireLock(options);
  if (!handle) return { acquired: false };
  try {
    return { acquired: true, result: await fn() };
  } finally {
    handle.release();
  }
}
