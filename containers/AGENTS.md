# Doc Detective Docker Image - AI Coding Agent Instructions

## Project Overview

This repository builds and maintains Docker images for [Doc Detective](https://doc-detective.com), a documentation testing framework. The images package Node.js, Doc Detective, browsers (Chrome/Firefox), and DITA-OT into container environments for CI/CD pipelines.

**Key Components:**
- `scripts/build.js`: Smart build orchestrator that detects Docker mode (Windows/Linux) and generates platform-specific images
- `linux.Dockerfile`: Debian-based image with apt packages, optimized for most CI systems
- `windows.Dockerfile`: Windows Server LTSC 2022 image with PowerShell-based installation
- `test/`: Mocha test suite validating Docker images post-build

## Architecture & Build System

### Dual-Platform Strategy
The build system auto-detects Docker's container mode using `docker info --format '{{.OSType}}'` and selects the appropriate Dockerfile. This matters because:
- Windows containers require Docker Desktop with Windows container mode enabled
- Linux containers are the default and work on all platforms
- Tags reflect the platform: `latest` = Linux, `latest-windows` = Windows, `latest-linux` = Linux (explicit)

### Build Script Logic (`scripts/build.js`)
```javascript
// Key pattern: OS detection drives Dockerfile and tag strategy
const dockerOSType = execSync('docker info --format "{{.OSType}}"').trim();
if (dockerOSType === "windows") {
  os = "windows";
  tags = ["windows", "latest-windows", `${version}-windows`];
  envVariables.DOCKER_BUILDKIT = 0; // BuildKit disabled for Windows
} else {
  tags = ["linux", "latest", "latest-linux", version, `${version}-linux`];
}
```

**Why BuildKit is disabled for Windows:** Windows container builds have compatibility issues with BuildKit's advanced features.

### Version Management
- Version comes from `package.json` by default
- Override with `npm run build -- --version=X.Y.Z`
- Build arg `PACKAGE_VERSION` passes version into Dockerfile for `npm install -g doc-detective@$PACKAGE_VERSION`
- Version embedded in `DOC_DETECTIVE` env var JSON: `{"container": "docdetective/docdetective:linux", "version": "X.Y.Z"}`

## Critical Developer Workflows

### Building Locally
```bash
npm run build           # Standard build using package.json version
npm run rebuild         # Forces --no-cache rebuild
npm run build -- --version=1.2.3 --no-cache  # Custom version, no cache
```

### Testing
```bash
npm test               # Runs Mocha test suite in test/*.test.js
npm test -- --version=1.2.3  # Test specific version tag
```

**Test Architecture (`test/runTests.test.js`):**
- Mounts `test/artifacts/` into container at `/app` (Linux) or `C:\app` (Windows)
- Runs Doc Detective with `config.json`, `*.spec.json` test specs, and `env` variable file
- Validates output JSON: `assert.equal(result.summary.specs.fail, 0)`
- Path handling: Windows uses `C:\app`, Linux uses `/app` - handled by OS detection

**DITA-OT Validation (`test/ditaVersion.test.js`):**
- Verifies DITA-OT installation with `dita --version` command
- Uses `--entrypoint` override to bypass default Doc Detective entrypoint
- Linux: `--entrypoint ""` then `dita --version`
- Windows: `--entrypoint cmd.exe` then `/c "dita --version"`

### Watch Mode
```bash
npm run watch          # Nodemon watches *.js and *.Dockerfile, triggers rebuild
```

## CI/CD Pipeline (`.github/workflows/build-push.yml`)

### Workflow Triggers
- **`repository_dispatch`**: External trigger with `build-push` event type
- **`pull_request`**: Automatic builds on PRs to `main` or `rc` branches (build + test only, no push)
- **`workflow_dispatch`**: Manual trigger with custom version and cache options

### Matrix Strategy
Builds run in parallel on both `windows-latest` and `ubuntu-latest` runners, automatically creating platform-specific images.

**Critical Windows Setup:**
```yaml
# Windows runner requires explicit context switch to Windows daemon
docker context ls | Select-String -Pattern "windows"
docker context use $contextName
```

### Build and Push Logic
```yaml
# Build uses same npm script as local development
npm run build -- --version=$VERSION ${{ inputs.no_cache && '--no-cache' || '' }}

# Tests MUST pass before push
npm run test -- --version=$VERSION

# Push only on non-PR runs with explicit version (not 'latest')
if: github.event_name != 'pull_request' && inputs.version != 'latest'
docker push --all-tags docdetective/docdetective
```

**Version Resolution Priority:**
1. `github.event.client_payload.version` (repository_dispatch)
2. `inputs.version` (workflow_dispatch)
3. `'latest'` (fallback)

**Publishing Rules:**
- Pull requests: Build + test only (no Docker Hub push)
- Version must NOT be 'latest' to push (prevents accidental overwrites)
- Requires `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets
- `--all-tags` pushes all generated tags from build script

## Dockerfile Patterns

### Linux Dockerfile (`linux.Dockerfile`)
```dockerfile
# Pattern: Multi-stage build with runtime stage only (no separate builder)
FROM node:22-slim AS runtime

# Pattern: Install system deps, then npm global, then DITA-OT
RUN apt update && apt install -y --no-install-recommends \
    # Browser deps for Playwright/Puppeteer
    libgbm1 libgtk-3-0 libnss3 \
    # DITA-OT requires Java
    default-jre \
    && rm -rf /var/lib/apt/lists/*

# Pattern: DITA-OT from GitHub releases, extract to /opt/dita-ot
ENV PATH="/opt/dita-ot/bin:${PATH}"

# Pattern: ENTRYPOINT for base command, CMD for default args
ENTRYPOINT [ "npx", "doc-detective" ]
CMD [ "" ]
```

### Windows Dockerfile (`windows.Dockerfile`)
```dockerfile
# Pattern: Windows Server LTSC 2022 base, PowerShell-driven installs
FROM mcr.microsoft.com/windows/server:ltsc2022 AS system

# Pattern: PowerShell error handling upfront
SHELL ["powershell", "-Command", "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue';"]

# Pattern: TLS 1.2 required for downloads
RUN [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072

# Pattern: MSI installs with msiexec silent mode
RUN Start-Process -FilePath 'msiexec.exe' -ArgumentList '/i', "$NodeJsInstaller", '/quiet', '/norestart' -Wait

# Pattern: ZIP downloads require Expand-Archive, then Move-Item
RUN Expand-Archive -Path $JavaZip -DestinationPath 'C:\temp-jdk' -Force; \
    $ExtractedDir = Get-ChildItem -Path 'C:\temp-jdk' -Directory | Select-Object -First 1; \
    Move-Item -Path $ExtractedDir.FullName -Destination 'C:\openjdk' -Force

# Pattern: cmd.exe entrypoint for Windows compatibility
ENTRYPOINT ["cmd.exe", "/c", "npx doc-detective"]
```

## Testing Conventions

### Mocha Test Structure
- `describe()` blocks use `this.timeout(0)` for Docker operations (long-running)
- Tests return Promises wrapping `exec()` child processes
- Parse command-line `--version` arg to test specific tags
- OS detection via `process.platform === "win32"` determines test commands

### Test Artifacts (`test/artifacts/`)
- `config.json`: Doc Detective config with headless Chrome/Firefox, debug logging
- `test.spec.json`: Integration test exercising multiple Doc Detective actions
- `env`: Environment variables file loaded via `setVariables` action
- `setup.spec.json`, `cleanup.spec.json`: Pre/post test specs (if needed)

## Key Dependencies

- **Node.js 22**: Explicit version for stability
- **Doc Detective**: Installed from NPM at package.json version or custom `--version`
- **DITA-OT 4.3.4**: Fixed version for DITA content transformation (update `ARG DITA_OT_VERSION` to change)
- **Java**: Required by DITA-OT (OpenJDK 17 on Windows, default-jre on Linux)
- **Browsers**: Chrome/Firefox system deps installed on Linux for headless testing

## Common Patterns

### Adding New DITA-OT Plugins
Edit Dockerfiles after DITA-OT installation, before PATH export:
```dockerfile
RUN /opt/dita-ot/bin/dita install <plugin-url>
```

### Changing Node.js Version
Update base image tag: `FROM node:X-slim` (Linux) or MSI URL (Windows)

### Modifying Entrypoint Arguments
Default args in `CMD` can be overridden by users. Empty string `CMD [ "" ]` allows passing all args at runtime.

## Repository Context

- **Branch:** `copilot/add-dita-to-container-image` (current)
- **Default Branch:** `main`
- **License:** AGPL-3.0-only
- **Docker Hub:** `docdetective/docdetective`
- **Website:** https://doc-detective.com
