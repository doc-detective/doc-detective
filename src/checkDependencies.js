#!/usr/bin/env node

const path = require("path");
const fs = require("fs");
const readline = require("readline");

// Check if package.json exists, and if it's for doc-detective
if (fs.existsSync(path.resolve(process.cwd(), "package.json"))) {
  const json = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "package.json"))
  );
  if (json.name === "doc-detective") {
    // Check if dependencies are installed
    checkDependencies();
  }
}

// Check if dependencies are installed
function checkDependencies() {
  if (!fs.existsSync(path.resolve(process.cwd(), "node_modules"))) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(
      "It looks like you haven't installed the local dependencies yet. Would you like to install them now? (yes/no): ",
      (answer) => {
        if (answer.toLowerCase() === "yes") {
          console.log("Installing dependencies. This may take a few minutes.");
          const { spawn } = require("child_process");
          const install = spawn("npm", ["install"], { stdio: "inherit" });

          install.on("close", (code) => {
            if (code !== 0) {
              console.error(
                `Failed to install dependencies (exit code ${code}). Try running 'npm install' manually and check for errors.`
              );
            } else {
              console.log("Dependencies installed successfully.");
            }
            rl.close();
          });

          install.on("error", (error) => {
            console.error(`Failed to start 'npm install': ${error.message}`);
            rl.close();
          });
        } else {
          console.log("Dependencies not installed.");
          rl.close();
        }
      }
    );
  }
}
