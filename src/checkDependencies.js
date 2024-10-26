#!/usr/bin/env node

const path = require("path");
const fs = require("fs");
const readline = require("readline");

// Check if package.json exists, and if it's for doc-detective
if (fs.existsSync(path.resolve(process.cwd(), "package.json"))) {
  try {
    const json = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "package.json"))
    );
    if (json.name === "doc-detective") {
      // Check if dependencies are installed
      checkDependencies();
    }
  } catch (error) {
    console.error(`Failed to parse package.json: ${error.message}`);
  }
}

// Check if dependencies are installed
function checkDependencies() {
  if (!fs.existsSync(path.resolve(process.cwd(), "node_modules"))) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Handle SIGINT (Ctrl+C)
    rl.on('SIGINT', () => {
      console.log('\nOperation cancelled by user');
      rl.close();
      process.exit(0);
    });

    rl.question(
      "It looks like you haven't installed the local dependencies yet. Would you like to install them now? (yes/no): ",
      (answer) => {
        const normalizedAnswer = answer.toLowerCase().trim();
        if (normalizedAnswer === "yes" || normalizedAnswer === "y") {
          console.log("Installing dependencies. This may take a few minutes.");
          const { spawn } = require("child_process");
          const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
          const install = spawn(npmCmd, ["install"], { 
            stdio: "inherit",
            shell: true 
          });

          // Set timeout
          const timeout = setTimeout(() => {
            console.error('Installation timed out after 5 minutes');
            install.kill();
            rl.close();
          }, 5 * 60 * 1000);

          install.on("close", (code) => {
            clearTimeout(timeout);
            if (code !== 0) {
              console.error(
                `Failed to install dependencies (exit code ${code}). Try running 'npm install' manually and check for errors.`
              );
              process.exit(1);
            } else {
              console.log("Dependencies installed successfully.");
            }
            rl.close();
          });

          install.on("error", (error) => {
            clearTimeout(timeout);
            console.error(`Failed to start 'npm install': ${error.message}`);
            rl.close();
            process.exit(1);
          });
        } else {
          console.log("Dependencies not installed. Please run 'npm install' manually before proceeding.");
          rl.close();
          process.exit(1);
        }
      }
    );
  }
}
