// Script to build Docker image with version from package.json.
//
// Default (no --target): builds the thin top-layer image, `docdetective/docdetective`.
//   npm run container:build -- --version=X.Y.Z
//
// Base (--target=base): builds the prebuilt Windows toolchain base image,
// `docdetective/docdetective-windows-base`. Rebuild only when a tool
// version in windows-base.versions.json bumps.
//   npm run container:build:base
//   npm run container:build:base -- --push
const { execFileSync, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const containerDir = path.resolve(__dirname, "..");

// ---------- arg parsing ----------
const args = process.argv.slice(2);

function readFlagValue(flag) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === flag) {
      const next = args[i + 1];
      if (!next || next.startsWith("-")) {
        console.error(`Missing value for ${arg}`);
        process.exit(1);
      }
      return next;
    }
    if (arg.startsWith(`${flag}=`)) {
      return arg.slice(flag.length + 1);
    }
  }
  return undefined;
}

let version = readFlagValue("--version") || readFlagValue("-v") || "latest";
if (!/^[\w.\-]+$/.test(version)) {
  console.error(`Invalid version string: ${version}`);
  process.exit(1);
}

const target = readFlagValue("--target") || "app";
if (target !== "app" && target !== "base") {
  console.error(`Invalid --target: ${target} (expected 'app' or 'base')`);
  process.exit(1);
}

const shouldPush = args.includes("--push");
const noCache = args.includes("--no-cache");
const pullBaseImage = args.includes("--pull");
const skipBasePrePull = args.includes("--no-pull-base");

// ---------- detect Docker container mode ----------
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

const os = dockerOSType === "windows" ? "windows" : "linux";

// Reads and validates windows-base.versions.json, and composes the base
// image's composite tag. Central so the base-build and app-build paths
// cannot drift on the tag scheme. Exits non-zero on any missing/invalid
// field rather than silently composing an "undefined-..." tag.
function readBasePins() {
  const versionsPath = path.join(containerDir, "windows-base.versions.json");
  if (!fs.existsSync(versionsPath)) {
    console.error(`Missing version pin file: ${versionsPath}`);
    process.exit(1);
  }
  let pins;
  try {
    pins = JSON.parse(fs.readFileSync(versionsPath, "utf8"));
  } catch (err) {
    console.error(`Failed to parse ${versionsPath}: ${err.message}`);
    process.exit(1);
  }
  const required = ["windowsServer", "node", "python", "java", "dita"];
  const missing = required.filter(
    (k) => typeof pins[k] !== "string" || pins[k].length === 0
  );
  if (missing.length) {
    console.error(
      `${versionsPath} is missing required field(s): ${missing.join(", ")}`
    );
    process.exit(1);
  }
  // Tag encodes every pin so bumping any one — including the OS base —
  // produces a distinct tag; the thin windows.Dockerfile pins its FROM
  // to this exact composite tag via BASE_TAG.
  const baseTag = `${pins.windowsServer}-${pins.node}-${pins.python}-${pins.java}-${pins.dita}`;
  return { pins, baseTag };
}

// ---------- base-image build path ----------
function buildBaseImage() {
  if (os !== "windows") {
    console.error(
      "--target=base is only supported in Windows container mode (there is no linux-base image)."
    );
    process.exit(1);
  }

  const { pins, baseTag } = readBasePins();
  const repo = "docdetective/docdetective-windows-base";
  const tags = [baseTag, "latest"];
  const tagArgs = tags.flatMap((t) => ["-t", `${repo}:${t}`]);

  const dockerArgs = [
    "build",
    ...(pullBaseImage ? ["--pull"] : []),
    "-f",
    path.join(containerDir, "windows-base.Dockerfile"),
    ...tagArgs,
    "--build-arg",
    `WINDOWS_SERVER_TAG=${pins.windowsServer}`,
    "--build-arg",
    `NODE_VERSION=${pins.node}`,
    "--build-arg",
    `PYTHON_VERSION=${pins.python}`,
    "--build-arg",
    `JAVA_VERSION=${pins.java}`,
    "--build-arg",
    `DITA_VERSION=${pins.dita}`,
    ...(noCache ? ["--no-cache"] : []),
    containerDir,
  ];

  console.log(`Building base image: ${repo}:${baseTag}`);
  console.log(`Docker command: docker ${dockerArgs.join(" ")}`);

  execFileSync("docker", dockerArgs, {
    stdio: "inherit",
    env: { ...process.env, DOCKER_BUILDKIT: "0" },
  });

  if (shouldPush) {
    console.log(`Pushing base image tags to Docker Hub...`);
    for (const t of tags) {
      execFileSync("docker", ["push", `${repo}:${t}`], { stdio: "inherit" });
    }
  }

  console.log(`Base image build complete: ${repo}:${baseTag}`);
  return { repo, baseTag };
}

// ---------- app-image build path ----------
function buildAppImage() {
  let tags;
  const envVariables = { ...process.env };

  if (os === "windows") {
    tags = ["windows", "latest-windows", `${version}-windows`];
    envVariables.DOCKER_BUILDKIT = "0";
  } else {
    tags = [
      ...new Set([
        "linux",
        "latest",
        "latest-linux",
        version,
        `${version}-linux`,
      ]),
    ];
  }

  console.log(`Building for OS: ${os}`);
  console.log(`Tags: ${tags}`);

  // For Windows, always pin the FROM to the exact versioned tag from
  // windows-base.versions.json so builds stay deterministic — drifting to
  // `:latest` would silently pull whatever base was last published.
  // Optionally pre-pull the base image so the developer sees a clean
  // pull-progress bar instead of a silent fetch mid-build; --no-pull-base
  // only skips the pre-pull, not the pinning.
  let extraBuildArgs = [];
  if (os === "windows") {
    const { baseTag } = readBasePins();
    const baseRef = `docdetective/docdetective-windows-base:${baseTag}`;
    extraBuildArgs = ["--build-arg", `BASE_TAG=${baseTag}`];
    if (!skipBasePrePull) {
      try {
        console.log(`Pre-pulling base image: ${baseRef}`);
        execFileSync("docker", ["pull", baseRef], { stdio: "inherit" });
      } catch (err) {
        console.warn(
          `Warning: could not pre-pull ${baseRef} (${err.message}). ` +
            `Continuing — docker build will attempt the pull itself.`
        );
      }
    }
  }

  const tagArgs = tags.flatMap((tag) => [
    "-t",
    `docdetective/docdetective:${tag}`,
  ]);

  const dockerArgs = [
    "build",
    ...(args.includes("--pull") ? ["--pull"] : []),
    "-f",
    path.join(containerDir, `${os}.Dockerfile`),
    ...tagArgs,
    "--build-arg",
    `PACKAGE_VERSION=${version}`,
    ...extraBuildArgs,
    ...(noCache ? ["--no-cache"] : []),
    containerDir,
  ];

  console.log(`Docker command: docker ${dockerArgs.join(" ")}`);

  execFileSync("docker", dockerArgs, {
    stdio: "inherit",
    env: envVariables,
  });

  console.log("Docker build completed successfully");
}

// ---------- entrypoint ----------
try {
  if (target === "base") {
    buildBaseImage();
  } else {
    console.log(`Building Docker image with version: ${version}`);
    buildAppImage();
  }
} catch (error) {
  console.error("Docker build failed:", error.message || error);
  process.exit(1);
}
