# <img src="https://github.com/doc-detective/doc-detective/blob/main/icon.png" width=50 style="vertical-align:middle;margin-bottom:7px"/> Doc Detective Docker Image

![Docker Image Version](https://img.shields.io/docker/v/docdetective/docdetective?sort=semver&color=orange)
[![Docker Hub](https://img.shields.io/badge/docker-docdetective%2Fdocdetective-blue)](https://hub.docker.com/r/docdetective/docdetective)
[![Discord Shield](https://img.shields.io/badge/chat-on%20discord-purple)](https://discord.gg/2M7wXEThfF)
[![Docs Shield](https://img.shields.io/badge/docs-doc--detective.com-blue)](https://doc-detective.com)

The official Docker image for Doc Detective, a documentation testing framework that makes it easy to keep your docs accurate and up-to-date. This image provides a pre-configured environment with all the dependencies needed to run Doc Detective tests without having to install Node.js or other prerequisites locally.

## Features

- Pre-installed with
  - Doc Detective
  - Node.js
  - Python 3
  - Java Runtime Environment (JRE)
  - DITA Open Toolkit (DITA-OT)
- Includes Google Chrome and Firefox for browser-based tests
- Optimized for CI/CD pipelines and containerized environments
- Simple volume mounting for working with your local test files

> **Note:** This image runs Doc Detective in a headless mode and isn't compatible with the `record` step. If you need to record test runs, use the [Doc Detective CLI](https://github.com/doc-detective/doc-detective) directly in your local or CI/CD environment.

## Usage

### Basic Usage

Run Doc Detective tests in the current directory:

```bash
docker run --rm -v .:/app docdetective/docdetective
```

This command:

- Mounts your current directory to `/app` in the container
- Runs Doc Detective on any test files in that directory
- Automatically cleans up the container after execution (`--rm`)

### Specify a Test File

To run tests from a specific file:

```bash
docker run --rm -v .:/app docdetective/docdetective --input my-tests.spec.json
```

### Using a Config File

If you have a custom `.doc-detective.json` config file:

```bash
docker run --rm -v .:/app docdetective/docdetective --config .doc-detective.json
```

### Using Environment Variables

To pass environment variables to your tests:

```bash
docker run --rm -v .:/app -e API_KEY=your_key docdetective/docdetective
```

### Running with Custom Arguments

You can pass any Doc Detective arguments to the container:

```bash
docker run --rm -v .:/app docdetective/docdetective --input tests.spec.json --output results.json
```

## Docker Tags

- `latest`: The most recent stable release

## Build the Image Locally

If you want to build the Docker image locally:

```bash
git clone https://github.com/doc-detective/docker-image.git
cd docker-image/linux
npm run build
```

## License

This project uses the [AGPL-3.0 license](https://github.com/doc-detective/doc-detective/blob/master/LICENSE).
