#!/usr/bin/env node
// Prewarm builder — Phase 2, step 4 of the "shippable prewarmed runtime" plan.
//
// Runs on a CI matrix runner (linux/macos/windows). It drives the GLOBALLY
// INSTALLED, PUBLISHED doc-detective CLI to populate a cold runtime + browsers
// cache, verifies the result, then tars each kind into a release asset with a
// manifest sidecar. The consumer-side restore engine (src/runtime/prewarm.ts,
// Track B) reads these assets, so the filenames, platform key, and manifest
// shape MUST match the frozen contract byte-for-byte.
//
// Platform detection and the asset filename scheme are imported from the
// published package's own `dist/runtime/prewarm.js` (`detectPlatform`,
// `assetFilenames`) so the builder and the consumer can never drift.
//
// Usage:
//   node scripts/prewarm-build.mjs --version <v> --out <dir> [--expect-key <key>]
//
// Exits non-zero on any verification/tar failure so CI fails visibly rather
// than uploading a broken asset.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const KINDS = ["runtime", "browsers"];

function fail(msg) {
  console.error(`[prewarm-build] ERROR: ${msg}`);
  process.exit(1);
}

function log(msg) {
  console.log(`[prewarm-build] ${msg}`);
}

// --- CLI parsing -------------------------------------------------------------

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--version") opts.version = argv[++i];
    else if (a === "--out") opts.out = argv[++i];
    else if (a === "--expect-key") opts.expectKey = argv[++i];
    else fail(`unknown argument: ${a}`);
  }
  if (!opts.version) fail("--version <v> is required");
  if (!opts.out) fail("--out <dir> is required");
  return opts;
}

// --- Locate the globally-installed published doc-detective -------------------

// Resolve the install root of the GLOBAL `doc-detective` package so we can
// import its `dist/runtime/prewarm.js` (the shared detector/filename module)
// and spawn its CLI. `npm install -g` places the package under the global
// prefix's node_modules; ask npm where that is and probe the usual layouts.
function resolveGlobalDocDetective() {
  const res = spawnSync("npm", ["root", "-g"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const candidates = [];
  if (res.status === 0 && res.stdout) {
    const root = res.stdout.trim().split(/\r?\n/).pop().trim();
    if (root) candidates.push(path.join(root, "doc-detective"));
  }
  // Fallbacks in case `npm root -g` is unavailable in the environment.
  if (process.env.npm_config_prefix) {
    candidates.push(
      path.join(process.env.npm_config_prefix, "lib", "node_modules", "doc-detective"),
      path.join(process.env.npm_config_prefix, "node_modules", "doc-detective")
    );
  }
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    } catch {
      /* keep probing */
    }
  }
  fail(
    "could not locate the globally-installed doc-detective package. " +
      "Install it first: `npm install -g doc-detective@<version>`. " +
      `Probed: ${candidates.join(", ")}`
  );
}

// --- Sharp / libvips repair (linux only) -------------------------------------

// Port of src/container/linux.Dockerfile:62-83. Some published versions pin
// `@img/sharp-libvips-linux-*` at a newer release than sharp's platform package
// needs; npm hoists the newer libvips, sharp's prebuilt .node RPATH resolves to
// it, and `require('sharp')` fails with a libvips-cpp.so version error. Detect
// the broken load against the freshly-built runtime tree and pin the top-level
// libvips back to the version `@img/sharp-linux-<cpu>` declares, then re-verify.
// No-op when sharp is healthy or absent.
function repairSharpLibvips(runtimeDir) {
  if (process.platform !== "linux") return;
  const sharpDir = path.join(runtimeDir, "node_modules", "sharp");
  if (!fs.existsSync(sharpDir)) return;

  const loadOk = () =>
    spawnSync(process.execPath, ["-e", "require('sharp')"], {
      cwd: runtimeDir,
      stdio: "ignore",
    }).status === 0;

  if (loadOk()) return; // healthy

  const machine = os.arch(); // 'x64' | 'arm64' | ...
  let cpu = "";
  if (machine === "x64") cpu = "x64";
  else if (machine === "arm64") cpu = "arm64";
  if (!cpu) {
    fail(`sharp: unsupported architecture ${machine}; supported: x64, arm64`);
  }

  const lv = `@img/sharp-libvips-linux-${cpu}`;
  const platformPkgJson = path.join(
    runtimeDir,
    "node_modules",
    `@img/sharp-linux-${cpu}`,
    "package.json"
  );
  let req;
  try {
    const pkg = JSON.parse(fs.readFileSync(platformPkgJson, "utf8"));
    req = pkg.optionalDependencies?.[lv];
  } catch (err) {
    fail(`sharp: could not read ${lv} version from ${platformPkgJson}: ${err}`);
  }
  if (!req) fail(`sharp: ${lv} version not declared in ${platformPkgJson}`);

  log(`sharp: libvips mismatch detected; pinning ${lv}@${req} for linux/${cpu}`);
  const install = spawnSync(
    "npm",
    [
      "install",
      "--prefix",
      runtimeDir,
      "--no-save",
      "--include=optional",
      "--os=linux",
      `--cpu=${cpu}`,
      "--libc=glibc",
      `${lv}@${req}`,
    ],
    { stdio: "inherit", shell: process.platform === "win32" }
  );
  if (install.status !== 0) fail(`sharp: libvips repair npm install failed`);

  if (!loadOk()) fail("sharp: still fails to load after libvips repair");
  log("sharp: verified OK after libvips repair");
}

// --- Verification suite ------------------------------------------------------

// Runtime: each installed npm package resolves inside the runtime tree, and the
// native `require('sharp')` load succeeds out-of-process (the real ABI guard).
function verifyRuntime(runtimeDir, record) {
  const runtimeRequire = createRequire(
    pathToFileURL(path.join(runtimeDir, "package.json")).href
  );
  const names = Object.keys(record.npmPackages || {});
  if (names.length === 0) {
    fail("runtime verification: installed.json lists no npmPackages");
  }
  for (const name of names) {
    try {
      runtimeRequire.resolve(name);
    } catch (err) {
      fail(`runtime verification: package '${name}' does not resolve in ${runtimeDir}: ${err}`);
    }
  }
  // Native load check (out-of-process, cwd anchored at the runtime tree) — the
  // sharp/libvips hoist-mismatch class that repairSharpLibvips() addresses.
  if (record.npmPackages?.sharp) {
    const res = spawnSync(
      process.execPath,
      ["-e", "require('sharp')"],
      { cwd: runtimeDir, encoding: "utf8" }
    );
    if (res.status !== 0) {
      fail(
        `runtime verification: require('sharp') failed out-of-process: ${(res.stderr || "").trim()}`
      );
    }
  }
  log(`runtime verification: ${names.length} package(s) resolve; sharp loads`);
}

// Browsers: every expected browser/driver binary exists and is executable.
// installed.json records the buildId per browser name; the actual binaries live
// under <cacheDir>/browsers/<name>/... — locate each by walking for known
// executable filenames and assert existence + the exec bit on POSIX.
const BROWSER_EXECUTABLES = {
  chrome: ["chrome", "chrome.exe", "Google Chrome for Testing"],
  "chrome-headless-shell": ["chrome-headless-shell", "chrome-headless-shell.exe"],
  chromium: ["chrome", "chrome.exe", "chromium", "chromium.exe"],
  firefox: ["firefox", "firefox.exe", "firefox-bin"],
  chromedriver: ["chromedriver", "chromedriver.exe"],
  geckodriver: ["geckodriver", "geckodriver.exe"],
};

function walkFind(dir, wantedNames, hits, depth = 0) {
  if (depth > 8) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walkFind(full, wantedNames, hits, depth + 1);
    } else if (e.isFile() && wantedNames.has(e.name)) {
      hits.push(full);
    }
  }
}

function verifyBrowsers(browsersDir, record) {
  const browsers = record.browsers || {};
  const names = Object.keys(browsers);
  if (names.length === 0) {
    // A browsers cache with no recorded browsers is unexpected but not
    // inherently broken; still, an empty asset is not worth shipping.
    fail("browsers verification: installed.json lists no browsers");
  }
  for (const name of names) {
    const wanted = BROWSER_EXECUTABLES[name.toLowerCase()];
    if (!wanted) {
      log(`browsers verification: no known executable name for '${name}'; skipping binary check`);
      continue;
    }
    const wantedSet = new Set(wanted);
    const hits = [];
    // Prefer the per-browser subdir when it exists; fall back to the whole tree.
    const subdir = path.join(browsersDir, name);
    walkFind(fs.existsSync(subdir) ? subdir : browsersDir, wantedSet, hits);
    if (hits.length === 0) {
      fail(`browsers verification: no executable found for '${name}' under ${browsersDir}`);
    }
    if (process.platform !== "win32") {
      let anyExec = false;
      for (const bin of hits) {
        try {
          fs.accessSync(bin, fs.constants.X_OK);
          anyExec = true;
          break;
        } catch {
          /* not executable, keep checking */
        }
      }
      if (!anyExec) {
        fail(`browsers verification: '${name}' binary is present but not executable: ${hits[0]}`);
      }
    }
  }
  log(`browsers verification: ${names.length} browser(s)/driver(s) present and executable`);
}

// --- tar + manifest ----------------------------------------------------------

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

// Pick the tar binary. On Windows use System32 bsdtar by absolute path, not a
// bare "tar": Git for Windows' GNU tar (often first on PATH) parses the `C:` in
// an absolute `-f C:\...\archive.tar.gz` as an rsh `host:path` remote and fails
// ("Cannot connect to C: resolve failed") — for both create and extract, and
// `shell:true` does not change which tar resolves. bsdtar (Win10 1803+, all GH
// windows runners) handles drive-letter paths. Elsewhere, PATH `tar`.
function tarBinary() {
  if (process.platform === "win32") {
    return path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
  }
  return "tar";
}

// Create a single-top-level-dir gzip tarball: `tar -czf <archive> -C <cacheDir> <kind>`.
function tarKind(cacheDir, kind, archivePath) {
  const res = spawnSync(
    tarBinary(),
    ["-czf", archivePath, "-C", cacheDir, kind],
    { stdio: "inherit" }
  );
  if (res.error) fail(`tar failed for ${kind}: ${res.error.message}`);
  if (res.status !== 0) fail(`tar exited ${res.status} for ${kind}`);
  if (!fs.existsSync(archivePath)) fail(`tar produced no archive for ${kind}`);
}

function kindSpecific(kind, record) {
  if (kind === "runtime") {
    const npmPackages = {};
    for (const [name, entry] of Object.entries(record.npmPackages || {})) {
      npmPackages[name] = entry.installedVersion;
    }
    return { npmPackages };
  }
  // browsers
  const browsers = {};
  for (const [name, entry] of Object.entries(record.browsers || {})) {
    browsers[name] = { installedVersion: entry.installedVersion };
  }
  return { browsers };
}

// --- main --------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(opts.out);
  fs.mkdirSync(outDir, { recursive: true });

  const ddRoot = resolveGlobalDocDetective();
  log(`using global doc-detective at ${ddRoot}`);

  // Import the shared detector/filename module from the PUBLISHED package so
  // the builder and the consumer share one detection code path.
  const prewarmModPath = path.join(ddRoot, "dist", "runtime", "prewarm.js");
  if (!fs.existsSync(prewarmModPath)) {
    fail(
      `${prewarmModPath} not found. The published doc-detective@${opts.version} must ship ` +
        `dist/runtime/prewarm.js (Track B). Cannot build prewarm assets without the shared detector.`
    );
  }
  const { detectPlatform, assetFilenames } = await import(
    pathToFileURL(prewarmModPath).href
  );

  const platform = detectPlatform();
  if (!platform || !platform.key) {
    fail(
      `detectPlatform() returned no key for this runner ` +
        `(os=${platform?.os} arch=${platform?.arch} libc=${platform?.libc}). ` +
        `musl/unsupported runners have no prewarm asset — aborting for this runner.`
    );
  }
  const key = platform.key;
  log(`platform key: ${key} (os=${platform.os} arch=${platform.arch} libc=${platform.libc} osVersion=${platform.osVersion})`);

  if (opts.expectKey && opts.expectKey !== key) {
    fail(`--expect-key '${opts.expectKey}' does not match detected key '${key}'`);
  }

  // --- Cold build via the global CLI -----------------------------------------
  const cacheDir = path.join(
    process.env.RUNNER_TEMP || os.tmpdir(),
    "prewarm-cache"
  );
  // Start from a clean cache so this is a genuinely cold build.
  fs.rmSync(cacheDir, { recursive: true, force: true });
  fs.mkdirSync(cacheDir, { recursive: true });

  const cliPath = path.join(ddRoot, "bin", "doc-detective.js");
  const childEnv = {
    ...process.env,
    DOC_DETECTIVE_CACHE_DIR: cacheDir,
    // Own controlled install step; assets don't exist yet ⇒ genuinely cold.
    DOC_DETECTIVE_AUTOINSTALL: "0",
    DOC_DETECTIVE_PREBUILT: "0",
  };

  log(`running cold: doc-detective install all --yes (cacheDir=${cacheDir})`);
  const install = spawnSync(
    process.execPath,
    [cliPath, "install", "all", "--yes"],
    { stdio: "inherit", env: childEnv }
  );
  if (install.status !== 0) {
    fail(`\`doc-detective install all --yes\` exited ${install.status}`);
  }

  const runtimeDir = path.join(cacheDir, "runtime");
  const browsersDir = path.join(cacheDir, "browsers");
  const installedJsonPath = path.join(cacheDir, "installed.json");
  if (!fs.existsSync(installedJsonPath)) {
    fail(`installed.json not found at ${installedJsonPath} after install`);
  }
  const record = JSON.parse(fs.readFileSync(installedJsonPath, "utf8"));

  // --- Sharp/libvips repair (linux only) -------------------------------------
  repairSharpLibvips(runtimeDir);

  // --- Verification (fail before producing any asset) ------------------------
  verifyRuntime(runtimeDir, record);
  verifyBrowsers(browsersDir, record);

  // Prune the install log so it isn't shipped inside the runtime tarball.
  try {
    fs.rmSync(path.join(runtimeDir, "install.log"), { force: true });
  } catch {
    /* best-effort */
  }

  // --- Tar + manifest per kind -----------------------------------------------
  const createdAt = new Date().toISOString();
  for (const kind of KINDS) {
    const dir = kind === "runtime" ? runtimeDir : browsersDir;
    if (!fs.existsSync(dir)) {
      fail(`expected cache dir missing for kind '${kind}': ${dir}`);
    }
    const { archive: archiveName, manifest: manifestName } = assetFilenames(kind, key);
    const archivePath = path.join(outDir, archiveName);
    const manifestPath = path.join(outDir, manifestName);

    log(`tarring ${kind} → ${archiveName}`);
    tarKind(cacheDir, kind, archivePath);

    const sha256 = sha256File(archivePath);
    const bytes = fs.statSync(archivePath).size;

    const manifest = {
      schemaVersion: 1,
      ddVersion: opts.version,
      kind,
      platform: {
        os: platform.os,
        arch: platform.arch,
        libc: platform.libc,
        osVersion: platform.osVersion,
      },
      node: { builtWith: process.versions.node },
      createdAt,
      archive: {
        filename: archiveName,
        sha256,
        bytes,
        format: "tar.gz",
        rootDir: kind,
      },
      ...kindSpecific(kind, record),
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    log(`wrote ${manifestName} (archive ${bytes} bytes, sha256 ${sha256.slice(0, 12)}…)`);
  }

  log(`done. assets written to ${outDir}`);
}

main().catch((err) => {
  fail(err && err.stack ? err.stack : String(err));
});
