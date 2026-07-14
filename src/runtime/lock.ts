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
  renameSync(from: string, to: string): void;
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
    // Dead ONLY on ESRCH (no such process). Any other error — EPERM
    // (exists, different user) or something unexpected — reads as alive:
    // this check licenses stealing a lock and deleting a live xcodebuild's
    // output, so uncertainty must never count as dead. Matches the
    // repo's other liveness probes (src/core/tests.ts).
    return err?.code !== "ESRCH";
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
    deps.sleep ??
    ((ms: number) =>
      new Promise<void>((r) => {
        const timer = setTimeout(r, ms);
        (timer as any).unref?.();
      }));
  const pid = deps.pid ?? process.pid;
  const hostname = deps.hostname ?? os.hostname();
  const isPidAlive = deps.isPidAlive ?? defaultIsPidAlive;
  const startInterval = deps.startInterval ?? defaultStartInterval;

  const ownerPath = `${dir}/${OWNER_FILE}`;
  const deadline = now() + waitMs;
  // The parent provably exists after this; the loop body only runs the
  // exclusive-mkdir arbiter plus the staleness read.
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  // Missing/corrupt owner metadata gets one poll-cycle of grace before it is
  // treated as stealable: a healthy acquirer writes owner.json microseconds
  // after its mkdir wins, so metadata that is STILL absent a poll later marks
  // a crash in that window, not a race with a live acquirer.
  let metaMissingSince: number | null = null;

  for (;;) {
    // Attempt the exclusive mkdir that IS the lock. EEXIST means contention;
    // anything else propagates.
    try {
      fs.mkdirSync(dir);
      return takeOwnership();
    } catch (err: any) {
      if (err?.code !== "EEXIST") throw err;
    }

    // Held by someone. Decide whether the holder is recoverable. Metadata
    // that parses but has the wrong shape (non-numeric heartbeatAt would make
    // the staleness comparison NaN — permanently false) is treated exactly
    // like missing metadata: grace, then stealable.
    const meta = readOwnerMeta(fs, ownerPath);

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
      // Takeover is arbitrated by RENAME, not rm: exactly one of N
      // simultaneous stealers wins the rename of the dead holder's dir to a
      // unique trash name, so a loser can never delete a lock a winner just
      // re-acquired (the classic rm-based double-steal race). The loser's
      // rename throws (ENOENT) and it loops back to find the winner's fresh
      // lock. Trash dirs are cleaned best-effort here and are also
      // markerless siblings to the WDA prune pass.
      const trash = `${dir}.stale-${pid}-${now()}`;
      try {
        fs.renameSync(dir, trash);
        try {
          fs.rmSync(trash, { recursive: true, force: true });
        } catch {
          /* best-effort trash cleanup */
        }
        // Won the takeover — retry the mkdir immediately (guaranteed
        // progress, no busy-spin risk: the dir is gone).
        continue;
      } catch {
        // Lost the takeover race, or the dir is un-removable (EACCES from a
        // different-user run). Fall through to the deadline check and sleep
        // so an un-stealable stale lock still times out instead of spinning.
      }
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
    // Still-ours check: after a lease takeover (this process was suspended
    // past staleMs and a contender legitimately stole the lock), the old
    // holder must neither overwrite the new owner's metadata nor remove the
    // new owner's lock dir on release.
    const isStillOwner = () => {
      const meta = readOwnerMeta(fs, ownerPath);
      return meta !== null && meta.pid === pid && meta.hostname === hostname;
    };
    writeMeta();

    let lost = false;
    const stopHeartbeat = startInterval(() => {
      // Refresh the lease — but never resurrect a stolen lock. Never throw
      // from a timer: if the dir vanished (external cleanup), the refresh
      // just fails and release() stays safe.
      try {
        if (!isStillOwner()) {
          lost = true;
          stopHeartbeat();
          return;
        }
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
        if (lost) return;
        try {
          // Same guard on the release path: only remove the dir while the
          // metadata is still ours.
          if (!isStillOwner()) return;
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          /* already gone */
        }
      },
    };
  }
}

/** Parse and shape-validate owner metadata; null for missing/corrupt/wrong-shape. */
function readOwnerMeta(fs: LockFs, ownerPath: string): OwnerMeta | null {
  try {
    const parsed = JSON.parse(String(fs.readFileSync(ownerPath)));
    if (
      typeof parsed?.pid !== "number" ||
      typeof parsed?.hostname !== "string" ||
      typeof parsed?.acquiredAt !== "number" ||
      typeof parsed?.heartbeatAt !== "number"
    ) {
      return null;
    }
    return parsed as OwnerMeta;
  } catch {
    return null;
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
