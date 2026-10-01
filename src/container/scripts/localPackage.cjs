// Staging for a locally packed doc-detective tarball, so a container build can
// test the tree it was invoked from instead of the published npm package
// (ADR 01097).
//
// Both Dockerfiles install `doc-detective@$PACKAGE_VERSION` from the registry.
// That is right for a release build, but it means a pull-request build of the
// image proves nothing about the pull request: the image under test is the last
// published one. The fix is a fixed directory inside the Docker build context
// that a local build stages a tarball into; the Dockerfiles COPY that directory
// and prefer the tarball when it holds one.
//
// Two rules keep the mechanism honest, and both are load-bearing:
//   1. The directory ALWAYS exists — `COPY .local-package/ …` fails outright on
//      a missing source, so a registry-only build would break without it. The
//      committed `.gitkeep` covers a fresh checkout; `ensureLocalPackageDir`
//      covers everything else.
//   2. A build that was NOT asked for a local package CLEARS the directory. A
//      tarball left over from an earlier local build would otherwise keep
//      overriding the registry install silently — an image that claims to be
//      version X while running someone's week-old working tree.

const fs = require("fs");
const path = require("path");

// The Dockerfiles COPY this literal path. Renaming it means editing them too.
const LOCAL_PACKAGE_DIRNAME = ".local-package";

function localPackageDir(containerDir) {
  return path.join(containerDir, LOCAL_PACKAGE_DIRNAME);
}

function ensureLocalPackageDir(containerDir) {
  const dir = localPackageDir(containerDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Remove any staged tarballs, keeping the directory itself. */
function clearLocalPackage(containerDir) {
  const dir = ensureLocalPackageDir(containerDir);
  for (const entry of fs.readdirSync(dir)) {
    if (entry.endsWith(".tgz")) fs.rmSync(path.join(dir, entry), { force: true });
  }
  return dir;
}

/**
 * Copy `tarballPath` into the build context, replacing anything staged before.
 *
 * @returns {string} the staged tarball's path.
 */
function stageLocalPackage(containerDir, tarballPath) {
  if (!tarballPath || !fs.existsSync(tarballPath)) {
    throw new Error(`Local package not found: ${tarballPath}`);
  }
  if (!tarballPath.endsWith(".tgz")) {
    throw new Error(
      `Local package must be an npm pack tarball (.tgz): ${tarballPath}`
    );
  }
  // Clear first: leaving two tarballs behind would make the Dockerfile's
  // `npm install -g /tmp/local-package/*.tgz` pick one arbitrarily.
  const dir = clearLocalPackage(containerDir);
  const staged = path.join(dir, path.basename(tarballPath));
  fs.copyFileSync(tarballPath, staged);
  return staged;
}

module.exports = {
  LOCAL_PACKAGE_DIRNAME,
  localPackageDir,
  ensureLocalPackageDir,
  clearLocalPackage,
  stageLocalPackage,
};
