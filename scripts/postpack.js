import fs from "node:fs";

const backupPath = "package.json.prepack-backup";

if (fs.existsSync(backupPath)) {
  // Restore the original package.json from the backup created by prepack.js
  const original = fs.readFileSync(backupPath, "utf8");
  fs.writeFileSync("package.json", original);
  fs.unlinkSync(backupPath);
  console.log("Restored package.json from backup after npm pack / publish.");
} else {
  console.error(
    "Error: package.json.prepack-backup is missing. " +
      "Cannot safely restore package.json after npm pack / publish. " +
      "Please restore package.json from version control (e.g., git checkout -- package.json)."
  );
  process.exit(1);
}
