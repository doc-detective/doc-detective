import { acquireLock, withLock } from "../dist/runtime/lock.js";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

// In-memory fs fake covering the exact surface lock.ts uses. Directories and
// files live in flat maps; mkdir on an existing dir throws EEXIST like the
// real non-recursive mkdirSync — that collision IS the lock.
function makeFsFake() {
  const dirs = new Set();
  const files = new Map();
  const err = (code) => Object.assign(new Error(code), { code });
  return {
    dirs,
    files,
    mkdirSync(p, opts = {}) {
      if (opts.recursive) {
        dirs.add(p);
        return;
      }
      if (dirs.has(p)) throw err("EEXIST");
      dirs.add(p);
    },
    writeFileSync(p, data) {
      files.set(p, String(data));
    },
    readFileSync(p) {
      if (!files.has(p)) throw err("ENOENT");
      return files.get(p);
    },
    rmSync(p, opts = {}) {
      let removed = dirs.delete(p);
      for (const d of [...dirs]) {
        if (d.startsWith(p + "/")) {
          dirs.delete(d);
          removed = true;
        }
      }
      for (const f of [...files.keys()]) {
        if (f === p || f.startsWith(p + "/")) {
          files.delete(f);
          removed = true;
        }
      }
      if (!removed && !opts.force) throw err("ENOENT");
    },
    renameSync(from, to) {
      let moved = false;
      if (dirs.delete(from)) {
        dirs.add(to);
        moved = true;
      }
      for (const d of [...dirs]) {
        if (d.startsWith(from + "/")) {
          dirs.delete(d);
          dirs.add(to + d.slice(from.length));
          moved = true;
        }
      }
      for (const f of [...files.keys()]) {
        if (f === from || f.startsWith(from + "/")) {
          const value = files.get(f);
          files.delete(f);
          files.set(to + f.slice(from.length), value);
          moved = true;
        }
      }
      if (!moved) throw err("ENOENT");
    },
  };
}

// Deterministic clock: now() reads a counter, sleep() advances it and fires
// any callbacks whose scheduled time has arrived, so acquire's poll loop
// interleaves with test-driven state changes at specific fake times.
function makeClock() {
  let t = 1_000_000;
  const scheduled = [];
  return {
    now: () => t,
    sleep: async (ms) => {
      t += ms;
      for (let i = scheduled.length - 1; i >= 0; i--) {
        if (scheduled[i].time <= t) {
          const { cb } = scheduled.splice(i, 1)[0];
          cb();
        }
      }
    },
    schedule(time, cb) {
      scheduled.push({ time, cb });
    },
  };
}

function makeDeps({ fs = makeFsFake(), clock = makeClock(), pid = 111, hostname = "host-a", alivePids = new Set([111]) } = {}) {
  const intervals = [];
  return {
    fs,
    clock,
    intervals,
    deps: {
      fs,
      now: clock.now,
      sleep: clock.sleep,
      pid,
      hostname,
      isPidAlive: (p) => alivePids.has(p),
      startInterval: (fn, ms) => {
        const entry = { fn, ms, stopped: false };
        intervals.push(entry);
        return () => {
          entry.stopped = true;
        };
      },
    },
  };
}

const LOCK_DIR = "/cache/ios/wda/.lock";

describe("runtime advisory lock", function () {
  it("acquires when free, writes holder metadata, and releases", async function () {
    const { fs, deps, intervals } = makeDeps();

    const lock = await acquireLock({ dir: LOCK_DIR, deps });
    expect(lock, "acquire on a free lock returns a handle").to.not.equal(null);
    expect(fs.dirs.has(LOCK_DIR), "lock dir exists while held").to.equal(true);

    const meta = JSON.parse(fs.readFileSync(`${LOCK_DIR}/owner.json`));
    expect(meta.pid).to.equal(111);
    expect(meta.hostname).to.equal("host-a");
    expect(meta.heartbeatAt).to.be.a("number");

    expect(intervals, "a heartbeat interval is started").to.have.length(1);
    expect(intervals[0].stopped).to.equal(false);

    lock.release();
    expect(fs.dirs.has(LOCK_DIR), "release removes the lock dir").to.equal(false);
    expect(intervals[0].stopped, "release stops the heartbeat").to.equal(true);
  });

  it("contends: waits while held, acquires after the holder releases", async function () {
    const fs = makeFsFake();
    const clock = makeClock();
    const holder = makeDeps({ fs, clock, pid: 111 });
    const contender = makeDeps({ fs, clock, pid: 222, alivePids: new Set([111, 222]) });

    const held = await acquireLock({ dir: LOCK_DIR, deps: holder.deps });
    // Release the lock 3 poll-cycles into the contender's wait.
    clock.schedule(clock.now() + 3_000, () => held.release());

    const lock = await acquireLock({
      dir: LOCK_DIR,
      waitMs: 60_000,
      pollMs: 1_000,
      deps: contender.deps,
    });
    expect(lock, "contender acquires once the holder releases").to.not.equal(null);
    const meta = JSON.parse(fs.readFileSync(`${LOCK_DIR}/owner.json`));
    expect(meta.pid).to.equal(222);
    lock.release();
  });

  it("contends: returns null when the wait bound elapses", async function () {
    const fs = makeFsFake();
    const clock = makeClock();
    const holder = makeDeps({ fs, clock, pid: 111 });
    const contender = makeDeps({ fs, clock, pid: 222, alivePids: new Set([111, 222]) });

    // Holder keeps a live heartbeat across the contender's whole wait window.
    await acquireLock({ dir: LOCK_DIR, deps: holder.deps });
    const beat = () => {
      holder.intervals[0].fn();
      clock.schedule(clock.now() + 25_000, beat);
    };
    clock.schedule(clock.now() + 25_000, beat);

    const lock = await acquireLock({
      dir: LOCK_DIR,
      waitMs: 30_000,
      pollMs: 1_000,
      deps: contender.deps,
    });
    expect(lock, "bounded wait gives up on a live holder").to.equal(null);
  });

  it("does not steal an old lock whose heartbeat is fresh", async function () {
    const fs = makeFsFake();
    const clock = makeClock();
    const holder = makeDeps({ fs, clock, pid: 111 });
    const contender = makeDeps({ fs, clock, pid: 222, alivePids: new Set([111, 222]) });

    await acquireLock({ dir: LOCK_DIR, deps: holder.deps });
    // A ~20-minute xcodebuild: the lock is old, but the holder's heartbeat
    // timer keeps refreshing the lease the whole time.
    const beat = () => {
      holder.intervals[0].fn();
      clock.schedule(clock.now() + 30_000, beat);
    };
    clock.schedule(clock.now() + 30_000, beat);

    const lock = await acquireLock({
      dir: LOCK_DIR,
      waitMs: 20 * 60_000,
      pollMs: 5_000,
      staleMs: 5 * 60_000,
      deps: contender.deps,
    });
    expect(lock, "a live slow build is never stolen").to.equal(null);
    const meta = JSON.parse(fs.readFileSync(`${LOCK_DIR}/owner.json`));
    expect(meta.pid, "the original holder still owns the lock").to.equal(111);
    expect(
      meta.heartbeatAt,
      "the heartbeat kept refreshing during the wait"
    ).to.be.greaterThan(meta.acquiredAt);
  });

  it("takes over when the holder's heartbeat has gone stale", async function () {
    const fs = makeFsFake();
    const clock = makeClock();
    const holder = makeDeps({ fs, clock, pid: 111 });
    // The stale holder's pid is still "alive" (e.g. a wedged process on
    // another host, or liveness unknowable) — staleness alone must suffice.
    const contender = makeDeps({
      fs,
      clock,
      pid: 222,
      hostname: "host-b",
      alivePids: new Set([222]),
    });

    await acquireLock({ dir: LOCK_DIR, deps: holder.deps });
    // No heartbeats ever fire; walk the clock past the stale threshold.
    await clock.sleep(6 * 60_000);

    const lock = await acquireLock({
      dir: LOCK_DIR,
      waitMs: 60_000,
      pollMs: 1_000,
      staleMs: 5 * 60_000,
      deps: contender.deps,
    });
    expect(lock, "stale heartbeat permits takeover").to.not.equal(null);
    const meta = JSON.parse(fs.readFileSync(`${LOCK_DIR}/owner.json`));
    expect(meta.pid).to.equal(222);
    lock.release();
  });

  it("takes over immediately when the same-host holder pid is dead", async function () {
    const fs = makeFsFake();
    const clock = makeClock();
    const holder = makeDeps({ fs, clock, pid: 111 });
    // Same hostname, holder pid NOT in the alive set — crashed holder with a
    // heartbeat that is still fresh (it died between refreshes).
    const contender = makeDeps({
      fs,
      clock,
      pid: 222,
      hostname: "host-a",
      alivePids: new Set([222]),
    });

    await acquireLock({ dir: LOCK_DIR, deps: holder.deps });

    const lock = await acquireLock({
      dir: LOCK_DIR,
      waitMs: 10_000,
      pollMs: 1_000,
      deps: contender.deps,
    });
    expect(lock, "dead same-host pid permits takeover").to.not.equal(null);
    const meta = JSON.parse(fs.readFileSync(`${LOCK_DIR}/owner.json`));
    expect(meta.pid).to.equal(222);
    lock.release();
  });

  it("does not treat a dead-looking pid on a DIFFERENT host as stealable", async function () {
    const fs = makeFsFake();
    const clock = makeClock();
    const holder = makeDeps({ fs, clock, pid: 111, hostname: "host-a" });
    // Contender runs on host-b; pid 111 means nothing there, and the
    // heartbeat is fresh — no takeover.
    const contender = makeDeps({
      fs,
      clock,
      pid: 222,
      hostname: "host-b",
      alivePids: new Set([222]),
    });

    await acquireLock({ dir: LOCK_DIR, deps: holder.deps });
    const beat = () => {
      holder.intervals[0].fn();
      clock.schedule(clock.now() + 25_000, beat);
    };
    clock.schedule(clock.now() + 25_000, beat);

    const lock = await acquireLock({
      dir: LOCK_DIR,
      waitMs: 30_000,
      pollMs: 1_000,
      deps: contender.deps,
    });
    expect(lock, "cross-host pid liveness is never consulted").to.equal(null);
    const meta = JSON.parse(fs.readFileSync(`${LOCK_DIR}/owner.json`));
    expect(meta.pid).to.equal(111);
  });

  it("respects the wait bound when a stale lock cannot be removed (no busy spin)", async function () {
    const fs = makeFsFake();
    const clock = makeClock();
    // Stale holder from a different-user run: takeover is justified, but the
    // rename fails with EACCES every time.
    fs.dirs.add(LOCK_DIR);
    fs.files.set(
      `${LOCK_DIR}/owner.json`,
      JSON.stringify({ pid: 999, hostname: "host-x", acquiredAt: 0, heartbeatAt: 0 })
    );
    fs.renameSync = () => {
      throw Object.assign(new Error("EACCES"), { code: "EACCES" });
    };
    const contender = makeDeps({ fs, clock, pid: 222, alivePids: new Set([222]) });

    const lock = await acquireLock({
      dir: LOCK_DIR,
      waitMs: 10_000,
      pollMs: 1_000,
      staleMs: 1,
      deps: contender.deps,
    });
    expect(lock, "an un-stealable stale lock still times out").to.equal(null);
  });

  it("treats shape-invalid owner metadata as missing (stealable after grace)", async function () {
    const fs = makeFsFake();
    const clock = makeClock();
    // Valid JSON, wrong shape: heartbeatAt is a string, so the staleness
    // comparison would be NaN — must not make the lock permanently unstealable.
    fs.dirs.add(LOCK_DIR);
    fs.files.set(
      `${LOCK_DIR}/owner.json`,
      JSON.stringify({ pid: "not-a-pid", hostname: 7, heartbeatAt: "later" })
    );
    const contender = makeDeps({
      fs,
      clock,
      pid: 222,
      hostname: "host-b",
      alivePids: new Set([222]),
    });

    const lock = await acquireLock({
      dir: LOCK_DIR,
      waitMs: 30_000,
      pollMs: 1_000,
      deps: contender.deps,
    });
    expect(lock, "shape-invalid metadata is recoverable").to.not.equal(null);
    const meta = JSON.parse(fs.readFileSync(`${LOCK_DIR}/owner.json`));
    expect(meta.pid).to.equal(222);
    lock.release();
  });

  it("a stolen-from holder neither re-heartbeats nor releases the new owner's lock", async function () {
    const fs = makeFsFake();
    const clock = makeClock();
    const holderA = makeDeps({ fs, clock, pid: 111, alivePids: new Set([111, 222]) });
    const holderB = makeDeps({
      fs,
      clock,
      pid: 222,
      hostname: "host-b",
      alivePids: new Set([111, 222]),
    });

    const lockA = await acquireLock({ dir: LOCK_DIR, deps: holderA.deps });
    // A is suspended: no heartbeats. Walk past the stale threshold and let B
    // legitimately take over.
    await clock.sleep(6 * 60_000);
    const lockB = await acquireLock({
      dir: LOCK_DIR,
      waitMs: 10_000,
      pollMs: 1_000,
      staleMs: 5 * 60_000,
      deps: holderB.deps,
    });
    expect(lockB).to.not.equal(null);

    // A resumes: its heartbeat timer fires — it must see B's ownership and
    // stand down rather than overwrite B's metadata.
    holderA.intervals[0].fn();
    let meta = JSON.parse(fs.readFileSync(`${LOCK_DIR}/owner.json`));
    expect(meta.pid, "the resumed old holder must not resurrect its lease").to.equal(222);

    // A's release must not destroy B's lock either.
    lockA.release();
    expect(fs.dirs.has(LOCK_DIR), "B's lock survives A's release").to.equal(true);
    meta = JSON.parse(fs.readFileSync(`${LOCK_DIR}/owner.json`));
    expect(meta.pid).to.equal(222);

    lockB.release();
    expect(fs.dirs.has(LOCK_DIR)).to.equal(false);
  });

  it("withLock releases on throw and propagates the error", async function () {
    const fs = makeFsFake();
    const { deps, intervals } = makeDeps({ fs });

    let thrown;
    try {
      await withLock({ dir: LOCK_DIR, deps }, () => {
        throw new Error("xcodebuild exploded");
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown?.message).to.equal("xcodebuild exploded");
    expect(fs.dirs.has(LOCK_DIR), "lock released despite the throw").to.equal(false);
    expect(intervals[0].stopped).to.equal(true);
  });

  it("withLock reports acquired:false without running fn when the lock is busy", async function () {
    const fs = makeFsFake();
    const clock = makeClock();
    const holder = makeDeps({ fs, clock, pid: 111 });
    const contender = makeDeps({ fs, clock, pid: 222, alivePids: new Set([111, 222]) });

    await acquireLock({ dir: LOCK_DIR, deps: holder.deps });
    const beat = () => {
      holder.intervals[0].fn();
      clock.schedule(clock.now() + 25_000, beat);
    };
    clock.schedule(clock.now() + 25_000, beat);

    let ran = false;
    const outcome = await withLock(
      { dir: LOCK_DIR, waitMs: 5_000, pollMs: 1_000, deps: contender.deps },
      () => {
        ran = true;
      }
    );
    expect(outcome.acquired).to.equal(false);
    expect(ran, "fn is not run when acquisition fails").to.equal(false);
  });
});
