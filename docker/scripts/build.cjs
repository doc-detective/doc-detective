// Script to build Docker image with version from package.json
const { execSync } = require("child_process");
const path = require("path");

// Get arguments from command line
const args = process.argv.slice(2);

// Check if a custom version is specified with --version
let version = "latest";
const versionArg = args.find(
  (arg) => arg.startsWith("--version=") || arg.startsWith("-v=")
);
if (versionArg) {
  version = versionArg.split("=")[1];
}
console.log(`Building Docker image with version: ${version}`);

// Resolve docker directory (parent of scripts/)
const dockerDir = path.resolve(__dirname, "..");

// Detect Docker container mode
let dockerOSType;
try {
  dockerOSType = execSync('docker info --format "{{.OSType}}"', {
    encoding: "utf8",
  }).trim();
  console.log(`Docker is running ${dockerOSType} containers`);
} catch (error) {
  console.error("Failed to detect Docker container mode:", error.message);
  console.log("Falling back to process platform detection");
  dockerOSType = process.platform === "win32" ? "windows" : "linux";
}

let os;
let tags;
let envVariables = {
  ...process.env,
};
if (dockerOSType === "windows") {
  os = "windows";
  tags = ["windows", "latest-windows", `${version}-windows`];
  envVariables.DOCKER_BUILDKIT = 0;
} else {
  os = "linux";
  tags = ["linux", "latest", "latest-linux", version, `${version}-linux`];
}
console.log(`Building for OS: ${os}`);
console.log(`Tags: ${tags}`);

// Construct '-t' arguments for Docker build
const tagArgs = tags
  .map((tag) => `-t docdetective/docdetective:${tag}`)
  .join(" ");
console.log(`Tag arguments: ${tagArgs}`);

let pullOption = "";
if (args.includes("--pull")) pullOption = "--pull ";

// Build the Docker command (use docker/ directory as context)
let dockerCommand = `docker build ${pullOption} -f ${path.join(dockerDir, `${os}.Dockerfile`)} ${tagArgs} ${dockerDir} --build-arg PACKAGE_VERSION=${version}`;

// Add --no-cache flag if requested
// Check if --no-cache is passed as an argument
const useNoCache = args.includes("--no-cache");
if (useNoCache) {
  console.log("Using --no-cache option");
  dockerCommand += " --no-cache";
}

console.log(`Docker command: ${dockerCommand}`);

// Execute the command
try {
  console.log(`Executing: ${dockerCommand}`);

  execSync(dockerCommand, {
    stdio: "inherit",
    env: envVariables,
  });

  console.log("Docker build completed successfully");
} catch (error) {
  console.error("Docker build failed:", error);
  process.exit(1);
}
