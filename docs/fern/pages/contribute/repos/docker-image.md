---
title: docker-image (alpha)
---

> This repo is in alpha. It's not ready for production use.

[`docker-image`](https://github.com/doc-detective/docker-image) runs Doc Detective in a container. While Doc Detective can run on most machines as-is, this Docker image simplifies installation and running Doc Detective on machines without Node.js or with heightened security requirements.

## Supported platforms

The Docker image is published as a multi-architecture manifest, so `docker pull` automatically selects the right image for your system:

| Platform | Architectures |
|----------|---------------|
| Linux | amd64 (x86_64), arm64 (Apple Silicon, AWS Graviton, Raspberry Pi) |
| Windows | amd64 (x86_64) only |

Existing tags (`latest`, `linux`, `windows`, version-scoped tags) work the same way—arm64 Linux hosts now receive native images without any tag changes.

## What's included

The Docker image includes:

- **Node.js and Doc Detective**: The core testing framework
- **Python 3**: Python interpreter (3.11.2 on Linux, 3.13.1 on Windows) with pip and venv for running Python scripts via the `runCode` action
- **Browsers**: Google Chrome and Firefox for browser-based tests
- **DITA-OT**: DITA Open Toolkit for DITA content transformation
- **Java Runtime**: Required for DITA-OT operations

This repo depends on [`doc-detective`](doc-detective) for performing the tests.
