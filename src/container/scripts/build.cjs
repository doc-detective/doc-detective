// Script to build Docker image with version from package.json
const { execFileSync, execSync } = require("child_process");
const path = require("path");

const containerDir = path.resolve(__dirname, "..");

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
if (!/^[\w.\-]+$/.test(version)) {
  console.error(`Invalid version string: ${version}`);
  process.exit(1);
}
console.log(`Building Docker image with version: ${version}`);

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
  envVariables.DOCKER_BUILDKIT = "0";
} else {
  os = "linux";
  tags = ["linux", "latest", "latest-linux", version, `${version}-linux`];
}
console.log(`Building for OS: ${os}`);
console.log(`Tags: ${tags}`);

// Construct '-t' arguments for Docker build
const tagArgs = tags.flatMap((tag) => ["-t", `docdetective/docdetective:${tag}`]);
console.log(`Tag arguments: ${tagArgs.join(" ")}`);

// Build the Docker command args
const dockerArgs = [
  "build",
  ...(args.includes("--pull") ? ["--pull"] : []),
  "-f",
  path.join(containerDir, `${os}.Dockerfile`),
  ...tagArgs,
  "--build-arg",
  `PACKAGE_VERSION=${version}`,
  ...(args.includes("--no-cache") ? ["--no-cache"] : []),
  containerDir,
];

console.log(`Docker command: docker ${dockerArgs.join(" ")}`);

// Execute the command
try {
  console.log(`Executing: docker ${dockerArgs.join(" ")}`);

  execFileSync("docker", dockerArgs, {
    stdio: "inherit",
    env: envVariables,
  });

  console.log("Docker build completed successfully");
} catch (error) {
  console.error("Docker build failed:", error);
  process.exit(1);
}
