---
title: Docker image
---

The [`src/container/`](https://github.com/doc-detective/doc-detective/tree/main/src/container) directory in the [`doc-detective`](doc-detective) repository contains Docker infrastructure for Doc Detective. While Doc Detective runs on most machines as-is, the Docker image simplifies installation on machines without Node.js or with heightened security requirements.

## What's included

The Docker image includes:

- **Node.js and Doc Detective**: The core testing framework
- **Python 3**: Python interpreter (3.11.2 on Linux, 3.13.1 on Windows) with pip and venv for running Python scripts via the `runCode` action
- **Browsers**: Google Chrome and Firefox for browser-based tests
- **DITA-OT**: DITA Open Toolkit for DITA content transformation
- **Java Runtime**: Required for DITA-OT operations

## Directory structure

Docker-related files live in the `src/container/` directory:

- `linux.Dockerfile` / `windows.Dockerfile` — Multi-platform Docker images
- `scripts/build.cjs` — Build script with OS auto-detection, version tagging, and cache control
- `test/` — Test runner and spec files for validating Docker images

## Build and test locally

Use these npm scripts to build and test Docker images:

```bash
# Build with a specific version
npm run container:build -- --version=beta

# Build without cache
npm run container:rebuild

# Run tests in the container
npm run container:test -- --version=beta
```

The build script automatically detects your OS and builds the appropriate image (Linux or Windows).
