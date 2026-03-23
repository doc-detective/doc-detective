import fs from "node:fs";

// Back up the original package.json so postpack can restore it reliably,
// even if pack/publish is interrupted before postpack runs.
const originalContents = fs.readFileSync("package.json", "utf8");
fs.writeFileSync("package.json.prepack-backup", originalContents);

const pkg = JSON.parse(originalContents);
delete pkg.workspaces;
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
console.log("Removed workspaces field from package.json for packing.");
