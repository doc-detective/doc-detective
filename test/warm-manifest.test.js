// The warm ownership-handoff manifest (docs/design/warm-phase.md, phase B3):
// `doc-detective warm` exits with devices left up and records them in
// <cacheDir>/warm-manifest.json; the next run claims the manifest atomically
// (rename to warm-manifest.claimed-<runId>.json in the same directory),
// adopts live devices as bootedByUs, sweeps stale ones, and deletes the
// claimed file only after its run-end sweep. Hermetic: fs/clock/pid effects
// are injected.
import assert from "node:assert/strict";
import path from "node:path";
import {
  WARM_MANIFEST_NAME,
  DEFAULT_WARM_MANIFEST_TTL_MS,
  writeWarmManifest,
  claimWarmManifest,
  releaseWarmClaim,
  listOrphanedClaims,
  collectWarmLeftovers,
} from "../dist/core/warmManifest.js";

const CACHE = "C:\\cache";

// Minimal in-memory fs covering exactly the surface the module uses.
function memFs(initial = {}) {
  const files = new Map(Object.entries(initial));
  const norm = (p) => String(p);
  return {
    files,
    existsSync: (p) => files.has(norm(p)),
    readFileSync: (p) => {
      if (!files.has(norm(p))) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return files.get(norm(p));
    },
    writeFileSync: (p, data) => {
      files.set(norm(p), String(data));
    },
    renameSync: (from, to) => {
      if (!files.has(norm(from)))
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      files.set(norm(to), files.get(norm(from)));
      files.delete(norm(from));
    },
    unlinkSync: (p) => {
      if (!files.has(norm(p)))
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      files.delete(norm(p));
    },
    readdirSync: () => [...files.keys()].map((p) => path.basename(p)),
    mkdirSync: () => {},
  };
}

const manifestPath = path.join(CACHE, WARM_MANIFEST_NAME);
const claimedPath = (runId) =>
  path.join(CACHE, `warm-manifest.claimed-${runId}.json`);

const androidDevice = {
  platform: "android",
  name: "doc-detective",
  udid: "emulator-5554",
  pid: 4242,
  sdkRoot: "C:\\sdk",
};
const iosDevice = {
  platform: "ios",
  name: "doc-detective-iphone",
  udid: "UDID-1",
};

function manifestContent({ createdAt = "2026-07-14T00:00:00.000Z", devices = [androidDevice, iosDevice] } = {}) {
  return JSON.stringify({ version: 1, createdAt, devices });
}

const T0 = Date.parse("2026-07-14T00:00:00.000Z");

function deps({ fs, nowMs = T0 + 60_000, alivePids = [4242, process.pid] } = {}) {
  return {
    fs,
    now: () => nowMs,
    isPidAlive: (pid) => alivePids.includes(pid),
    pid: 777,
  };
}

describe("warm manifest: write / claim / release / sweep", function () {
  it("writes the manifest atomically and leaves no temp file behind", function () {
    const fs = memFs();
    const written = writeWarmManifest({
      cacheDir: CACHE,
      devices: [androidDevice, iosDevice],
      deps: deps({ fs }),
    });
    assert.equal(written, manifestPath);
    const parsed = JSON.parse(fs.files.get(manifestPath));
    assert.equal(parsed.version, 1);
    assert.equal(typeof parsed.createdAt, "string");
    assert.deepEqual(parsed.devices, [androidDevice, iosDevice]);
    assert.equal(fs.files.size, 1, `stray files: ${[...fs.files.keys()]}`);
  });

  it("creates the cache root before writing (pristine-host warm)", function () {
    const fs = memFs();
    const made = [];
    fs.mkdirSync = (p, opts) => {
      made.push({ p, recursive: opts?.recursive });
    };
    writeWarmManifest({
      cacheDir: CACHE,
      devices: [iosDevice],
      deps: deps({ fs }),
    });
    assert.deepEqual(made, [{ p: CACHE, recursive: true }]);
  });

  it("treats an uncertain pid probe as alive — sweeping requires proof of death", function () {
    // isPidAlive contract: only a definite "no such process" may route a
    // device to sweep. The default probe reads EPERM/unknown as alive; the
    // injected fake here mimics that by only reporting 4242 dead when told.
    const fs = memFs({ [manifestPath]: manifestContent() });
    const claim = claimWarmManifest({
      cacheDir: CACHE,
      runId: "run-1",
      deps: { ...deps({ fs }), isPidAlive: () => true },
    });
    assert.deepEqual(claim.sweep, []);
    assert.equal(claim.adopt.length, 2);
  });

  it("writes nothing when there are no devices to hand off", function () {
    const fs = memFs();
    const written = writeWarmManifest({ cacheDir: CACHE, devices: [], deps: deps({ fs }) });
    assert.equal(written, null);
    assert.equal(fs.files.size, 0);
  });

  it("claims atomically: renames, stamps claimedBy, and adopts live devices", function () {
    const fs = memFs({ [manifestPath]: manifestContent() });
    const claim = claimWarmManifest({
      cacheDir: CACHE,
      runId: "run-1",
      deps: deps({ fs }),
    });
    assert.ok(claim);
    assert.deepEqual(claim.adopt, [androidDevice, iosDevice]);
    assert.deepEqual(claim.sweep, []);
    assert.equal(fs.files.has(manifestPath), false, "manifest must be renamed away");
    const claimed = JSON.parse(fs.files.get(claimedPath("run-1")));
    assert.equal(claimed.claimedBy.runId, "run-1");
    assert.equal(claimed.claimedBy.pid, 777);
  });

  it("returns null when there is no manifest", function () {
    const fs = memFs();
    assert.equal(
      claimWarmManifest({ cacheDir: CACHE, runId: "run-1", deps: deps({ fs }) }),
      null
    );
  });

  it("loses the claim race gracefully when another runner renamed first", function () {
    const fs = memFs({ [manifestPath]: manifestContent() });
    // Simulate the race: the manifest disappears between read and rename.
    const racedFs = {
      ...fs,
      renameSync: (from, to) => {
        fs.files.delete(manifestPath);
        return memFs().renameSync(from, to);
      },
    };
    const claim = claimWarmManifest({
      cacheDir: CACHE,
      runId: "run-2",
      deps: deps({ fs: racedFs }),
    });
    assert.equal(claim, null);
  });

  it("deletes a corrupt manifest instead of adopting it", function () {
    const fs = memFs({ [manifestPath]: "not json{{" });
    const claim = claimWarmManifest({
      cacheDir: CACHE,
      runId: "run-1",
      deps: deps({ fs }),
    });
    assert.equal(claim, null);
    assert.equal(fs.files.has(manifestPath), false);
  });

  it("sweeps (never adopts) a manifest older than the TTL", function () {
    const fs = memFs({ [manifestPath]: manifestContent() });
    const claim = claimWarmManifest({
      cacheDir: CACHE,
      runId: "run-1",
      deps: deps({ fs, nowMs: T0 + DEFAULT_WARM_MANIFEST_TTL_MS + 1 }),
    });
    assert.ok(claim);
    assert.deepEqual(claim.adopt, []);
    assert.deepEqual(claim.sweep, [androidDevice, iosDevice]);
  });

  it("sweeps a device whose recorded pid is dead and adopts the rest", function () {
    const fs = memFs({ [manifestPath]: manifestContent() });
    const claim = claimWarmManifest({
      cacheDir: CACHE,
      runId: "run-1",
      deps: deps({ fs, alivePids: [process.pid] }), // 4242 is dead
    });
    assert.ok(claim);
    assert.deepEqual(claim.adopt, [iosDevice]);
    assert.deepEqual(claim.sweep, [androidDevice]);
  });

  it("releaseWarmClaim deletes the claimed file, idempotently", function () {
    const fs = memFs({ [manifestPath]: manifestContent() });
    claimWarmManifest({ cacheDir: CACHE, runId: "run-1", deps: deps({ fs }) });
    releaseWarmClaim({ cacheDir: CACHE, runId: "run-1", deps: deps({ fs }) });
    assert.equal(fs.files.has(claimedPath("run-1")), false);
    // Releasing again must not throw.
    releaseWarmClaim({ cacheDir: CACHE, runId: "run-1", deps: deps({ fs }) });
  });

  it("lists claimed files whose adopter is dead as orphaned", function () {
    const fs = memFs({ [manifestPath]: manifestContent() });
    claimWarmManifest({
      cacheDir: CACHE,
      runId: "dead-run",
      deps: { ...deps({ fs }), pid: 99999 },
    });
    const orphans = listOrphanedClaims({
      cacheDir: CACHE,
      deps: deps({ fs, alivePids: [process.pid, 4242] }), // 99999 dead
    });
    assert.equal(orphans.length, 1);
    assert.equal(orphans[0].path, claimedPath("dead-run"));
    assert.deepEqual(
      orphans[0].devices.map((d) => d.udid).sort(),
      ["UDID-1", "emulator-5554"]
    );
  });

  it("does not list a live adopter's claim as orphaned", function () {
    const fs = memFs({ [manifestPath]: manifestContent() });
    claimWarmManifest({
      cacheDir: CACHE,
      runId: "live-run",
      deps: { ...deps({ fs }), pid: 4242 },
    });
    const orphans = listOrphanedClaims({
      cacheDir: CACHE,
      deps: deps({ fs, alivePids: [4242] }),
    });
    assert.deepEqual(orphans, []);
  });

  it("merges into an existing unclaimed manifest instead of clobbering it", function () {
    // Two warms racing: the loser's ownership records must survive the
    // winner's write, or its devices become undiscoverable orphans.
    const fs = memFs({
      [manifestPath]: manifestContent({ devices: [androidDevice] }),
    });
    writeWarmManifest({
      cacheDir: CACHE,
      devices: [iosDevice],
      deps: deps({ fs }),
    });
    const merged = JSON.parse(fs.files.get(manifestPath));
    assert.deepEqual(
      merged.devices.map((d) => d.udid).sort(),
      ["UDID-1", "emulator-5554"]
    );
  });

  it("the newer entry wins a udid collision during the merge", function () {
    const fs = memFs({
      [manifestPath]: manifestContent({ devices: [iosDevice] }),
    });
    const renamed = { ...iosDevice, name: "renamed-same-sim" };
    writeWarmManifest({
      cacheDir: CACHE,
      devices: [renamed],
      deps: deps({ fs }),
    });
    const merged = JSON.parse(fs.files.get(manifestPath));
    assert.deepEqual(merged.devices, [renamed]);
  });

  it("falls back to remove-then-rename when the atomic write's rename is refused", function () {
    // Windows can refuse an overwrite-rename with EEXIST/EPERM.
    const fs = memFs({ [manifestPath]: manifestContent() });
    let refused = false;
    const realRename = fs.renameSync;
    fs.renameSync = (from, to) => {
      if (!refused && to === manifestPath) {
        refused = true;
        throw Object.assign(new Error("EEXIST"), { code: "EEXIST" });
      }
      realRename(from, to);
    };
    const written = writeWarmManifest({
      cacheDir: CACHE,
      devices: [iosDevice],
      deps: deps({ fs }),
    });
    assert.equal(written, manifestPath);
    // Merge-on-write: the pre-existing manifest's devices survive alongside
    // the new entry.
    assert.deepEqual(
      JSON.parse(fs.files.get(manifestPath)).devices.map((d) => d.udid).sort(),
      ["UDID-1", "emulator-5554"]
    );
  });

  it("returns null when the manifest exists but can't be read", function () {
    const fs = memFs({ [manifestPath]: manifestContent() });
    fs.readFileSync = () => {
      throw Object.assign(new Error("EACCES"), { code: "EACCES" });
    };
    assert.equal(
      claimWarmManifest({ cacheDir: CACHE, runId: "run-1", deps: deps({ fs }) }),
      null
    );
  });

  it("still adopts when the claimed-file stamp write fails", function () {
    // The rename IS the claim; a failed claimedBy stamp only degrades the
    // orphan scan to its TTL fallback.
    const fs = memFs({ [manifestPath]: manifestContent() });
    const realWrite = fs.writeFileSync;
    fs.writeFileSync = (p, data) => {
      if (String(p).includes("claimed-")) {
        throw Object.assign(new Error("ENOSPC"), { code: "ENOSPC" });
      }
      realWrite(p, data);
    };
    const claim = claimWarmManifest({
      cacheDir: CACHE,
      runId: "run-1",
      deps: deps({ fs }),
    });
    assert.ok(claim);
    assert.equal(claim.adopt.length, 2);
  });

  it("treats an unstamped claim (crash between rename and stamp) as orphaned only past the TTL", function () {
    const fs = memFs({ [manifestPath]: manifestContent() });
    // Simulate the crash window: rename succeeded, stamp never written.
    fs.renameSync(manifestPath, claimedPath("crashed"));
    const fresh = listOrphanedClaims({
      cacheDir: CACHE,
      deps: deps({ fs, nowMs: T0 + 60_000 }),
    });
    assert.deepEqual(fresh, []);
    const old = listOrphanedClaims({
      cacheDir: CACHE,
      deps: deps({ fs, nowMs: T0 + DEFAULT_WARM_MANIFEST_TTL_MS + 1 }),
    });
    assert.equal(old.length, 1);
    assert.equal(old[0].path, claimedPath("crashed"));
  });

  it("skips an unreadable claimed file in the orphan scan but --down still lists a corrupt manifest", function () {
    const fs = memFs({
      [manifestPath]: "corrupt{{",
      [claimedPath("x")]: manifestContent(),
    });
    const realRead = fs.readFileSync;
    fs.readFileSync = (p) => {
      if (String(p).includes("claimed-")) {
        throw Object.assign(new Error("EACCES"), { code: "EACCES" });
      }
      return realRead(p);
    };
    assert.deepEqual(listOrphanedClaims({ cacheDir: CACHE, deps: deps({ fs }) }), []);
    const leftovers = collectWarmLeftovers({ cacheDir: CACHE, deps: deps({ fs }) });
    // The corrupt manifest is still a file --down must delete; it just
    // contributes no devices.
    assert.deepEqual(leftovers.files, [manifestPath]);
    assert.deepEqual(leftovers.devices, []);
  });

  it("ignores non-manifest files in the cache root", function () {
    const fs = memFs({
      [path.join(CACHE, "installed.json")]: "{}",
      [path.join(CACHE, "warm-manifest.claimed-x.txt")]: "not json suffix",
    });
    assert.deepEqual(listOrphanedClaims({ cacheDir: CACHE, deps: deps({ fs }) }), []);
    assert.deepEqual(
      collectWarmLeftovers({ cacheDir: CACHE, deps: deps({ fs }) }).files,
      []
    );
  });

  it("collectWarmLeftovers gathers the unclaimed manifest and every claimed file for --down", function () {
    const fs = memFs({ [manifestPath]: manifestContent() });
    claimWarmManifest({
      cacheDir: CACHE,
      runId: "run-x",
      deps: { ...deps({ fs }), pid: 99999 },
    });
    // A fresh, unclaimed manifest appears after the claim (a later warm).
    writeWarmManifest({
      cacheDir: CACHE,
      devices: [iosDevice],
      deps: deps({ fs }),
    });
    const leftovers = collectWarmLeftovers({ cacheDir: CACHE, deps: deps({ fs }) });
    assert.equal(leftovers.files.length, 2);
    assert.ok(leftovers.files.includes(manifestPath));
    assert.ok(leftovers.files.includes(claimedPath("run-x")));
    // Devices deduped by udid across files.
    assert.deepEqual(
      leftovers.devices.map((d) => d.udid).sort(),
      ["UDID-1", "emulator-5554"]
    );
  });
});
