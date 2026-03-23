import fs from "node:fs";

const backupPath = "package.json.prepack-backup";

if (fs.existsSync(backupPath)) {
  // Restore the original package.json from the backup created by prepack.js
  const original = fs.readFileSync(backupPath, "utf8");
  fs.writeFileSync("package.json", original);
  fs.unlinkSync(backupPath);
  console.log("Restored package.json from backup after npm pack / publish.");
} else {
  // Fallback: re-add workspaces manually if backup is missing
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const { name, version, description, ...rest } = pkg;
  const restored = { name, version, description, workspaces: ["src/common"], ...rest };
  fs.writeFileSync("package.json", JSON.stringify(restored, null, 2) + "\n");
  console.warn("No backup found; restored workspaces field manually after npm pack / publish.");
}
