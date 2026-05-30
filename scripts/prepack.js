import fs from "node:fs";
import { fileURLToPath } from "node:url";

const backupPath = "package.json.prepack-backup";

/**
 * Transform the manifest for publishing. Returns a new object; does not mutate
 * the input. Two changes:
 *   1. Drop `workspaces` — npx/global installs of the published package must not
 *      see the monorepo workspaces field (see PR #236).
 *   2. Move `optionalDependencies` (which by this point holds only the heavy
 *      lazy-installed runtime deps) into the custom `ddRuntimeDependencies`
 *      field. npm never auto-installs a custom field, so a default
 *      `npm i doc-detective` no longer drags in webdriverio/appium/sharp/etc.
 *      and their deprecated transitive deps. The runtime loader reads versions
 *      from `ddRuntimeDependencies` via getDeclaredVersion(). The source
 *      manifest keeps `optionalDependencies` so Dependabot still bumps them.
 * Exported so test/prepack.test.js can exercise it without running the script.
 */
export function transformForPublish(pkg) {
  const out = { ...pkg };
  delete out.workspaces;
  if (
    out.optionalDependencies &&
    typeof out.optionalDependencies === "object" &&
    Object.keys(out.optionalDependencies).length > 0
  ) {
    out.ddRuntimeDependencies = { ...out.optionalDependencies };
    delete out.optionalDependencies;
  }
  return out;
}

// True only when run as the prepack lifecycle script, not when imported by a
// test. Use fileURLToPath (NOT `new URL(...).pathname`, which yields a
// leading-slash `/C:/...` on Windows that realpathSync rejects) and guard the
// whole comparison: realpathSync throws ENOENT if argv[1] isn't an existing
// file, and a throw here would crash any importer at module-load time.
function isInvokedDirectly() {
  try {
    if (!process.argv[1]) return false;
    return (
      fs.realpathSync(process.argv[1]) ===
      fs.realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}
if (isInvokedDirectly()) {
  main();
}

function main() {

  // Back up the original package.json so postpack can restore it reliably,
  // even if pack/publish is interrupted before postpack runs.
  if (fs.existsSync(backupPath)) {
    console.error(
      "Error: package.json.prepack-backup already exists. " +
        "A previous pack may have failed before postpack ran. " +
        "Restore package.json first (e.g., git checkout -- package.json) and remove the backup."
    );
    process.exit(1);
  }

  const originalContents = fs.readFileSync("package.json", "utf8");
  fs.writeFileSync(backupPath, originalContents);

  const pkg = transformForPublish(JSON.parse(originalContents));
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
  console.log(
    "Prepared package.json for packing: removed workspaces" +
      (pkg.ddRuntimeDependencies
        ? " and moved optionalDependencies to ddRuntimeDependencies."
        : ".")
  );
}
