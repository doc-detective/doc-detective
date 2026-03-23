import fs from "node:fs";

const backupPath = "package.json.prepack-backup";

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

const pkg = JSON.parse(originalContents);
delete pkg.workspaces;
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
console.log("Removed workspaces field from package.json for packing.");
