import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
delete pkg.workspaces;
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
console.log("Removed workspaces field from package.json for publishing.");
