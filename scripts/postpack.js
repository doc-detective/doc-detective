import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

// Restore the workspaces field that prepack.js removed
const { name, version, description, ...rest } = pkg;
const restored = { name, version, description, workspaces: ["src/common"], ...rest };

fs.writeFileSync("package.json", JSON.stringify(restored, null, 2) + "\n");
console.log("Restored workspaces field to package.json after publishing.");
