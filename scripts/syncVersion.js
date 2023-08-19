const fs = require("fs");

// Get the current version number
const packageJson = JSON.parse(fs.readFileSync("./package.json"));
const version = packageJson.version;

const packages = [
  "./electron/package.json",
  "./server/package.json",
  "./frontend/package.json",
];
packages.map((package) => updateChildPackageVersion(package));

function updateChildPackageVersion(packageJsonPath) {
  const childPackageJson = JSON.parse(fs.readFileSync(packageJsonPath));
  childPackageJson.version = version;

  // Update the version number in the electron/package.json file
  fs.writeFileSync(packageJsonPath, JSON.stringify(childPackageJson, null, 2));
}
