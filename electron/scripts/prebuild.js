const { exec } = require("child_process");
const fs = require("fs");

console.log("Fetching icon");
fs.cpSync("../icon.png", "./icon.png");

console.log("Building frontend");
const frontendBuild = exec("npm run build", { cwd: "../frontend" });

frontendBuild.on("exit", (code) => {
  if (code !== 0) {
    console.error(`Build failed with code ${code}`);
    return;
  }

  fs.cpSync("../frontend/build", "./frontend", {
    recursive: true,
    force: true,
  });
  console.log("Build files copied successfully!");
});
