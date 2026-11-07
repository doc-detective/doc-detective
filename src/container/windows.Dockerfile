# Thin top layer on top of docdetective/docdetective-windows-base, which
# carries Node.js, Python, OpenJDK, and DITA-OT. See windows-base.Dockerfile.
#
# Only `npm install -g doc-detective@<version>` runs here, so cold local
# builds collapse to one image pull + one short install layer.

ARG BASE_TAG=latest
FROM docdetective/docdetective-windows-base:${BASE_TAG}

ARG PACKAGE_VERSION=latest
ENV PACKAGE_VERSION=${PACKAGE_VERSION}

LABEL authors="Doc Detective" \
    description="The official Docker image for Doc Detective. Keep your docs accurate with ease." \
    version=$PACKAGE_VERSION \
    maintainer="manny@doc-detective.com" \
    license="AGPL-3.0" \
    homepage="https://www.doc-detective.com" \
    repository="https://github.com/doc-detective/doc-detective" \
    source="https://github.com/doc-detective/doc-detective" \
    documentation="https://www.doc-detective.com" \
    vendor="Doc Detective"

# DOC_DETECTIVE_CACHE_DIR is pinned to a fixed image path so the pre-warm
# below isn't lost to a per-boot temp-dir wipe at runtime. SKIP_AUTO_UPDATE
# stops the runtime from quietly bumping the version baked into the image —
# image releases own that signal.
#
# The image's own defaults live in a user config, the lowest config layer, so
# any project config, environment variable, or flag overrides them (ADR 01165).
# The only default: the container is the sandbox, so steps marked unsafe run.
ENV XDG_CONFIG_HOME=C:\\ProgramData\\doc-detective-xdg \
    DOC_DETECTIVE_CACHE_DIR=C:\\ProgramData\\doc-detective \
    DOC_DETECTIVE_SKIP_AUTO_UPDATE=1

SHELL ["powershell", "-Command", "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue';"]

# ConvertTo-Json writes the quotes, which survive no Dockerfile quoting rules;
# ASCII keeps PowerShell 5.1 from writing a byte-order mark JSON.parse rejects.
RUN New-Item -ItemType Directory -Force -Path C:/ProgramData/doc-detective-xdg/doc-detective | Out-Null; \
    @{ allowUnsafeSteps = $true } | ConvertTo-Json | Set-Content -Encoding ascii -Path C:/ProgramData/doc-detective-xdg/doc-detective/config.json

# Pre-warm tolerates older published versions that don't yet have the
# `install all` subcommand — see linux.Dockerfile for the rationale.
#
# Detect the new CLI surface by grepping root `--help` for the
# `install` line. Older versions exit 0 from `--help`
# regardless of which subcommand was named, so an exit-code probe
# (`install --help` then `$LASTEXITCODE`) doesn't actually distinguish
# old from new — content-based detection does. PowerShell's
# `try/catch` doesn't trap native-command non-zero exits under the
# SHELL-level `$ErrorActionPreference = 'Stop'`, so real `install all`
# failures throw explicitly via `$LASTEXITCODE` check.
#
# Same local-package escape hatch as linux.Dockerfile: a CI build of a pull
# request installs the tarball staged in `.local-package/` when there is one, so
# the image under test is the change under review rather than the last published
# package. See src/container/scripts/localPackage.cjs and ADR 01097.
COPY .local-package/ C:/local-package/

RUN Set-ExecutionPolicy Bypass -Scope Process -Force; \
    $localPkg = @(Get-ChildItem -Path 'C:/local-package' -Filter '*.tgz' -ErrorAction SilentlyContinue); \
    if ($localPkg.Count -gt 0) { \
      $pkgPath = $localPkg[0].FullName; \
      Write-Host "[build] installing the locally packed $($localPkg[0].Name) instead of doc-detective@$env:PACKAGE_VERSION"; \
      npm install -g $pkgPath \
    } else { \
      npm install -g doc-detective@$env:PACKAGE_VERSION \
    }; \
    if ($LASTEXITCODE -ne 0) { throw "npm install -g doc-detective failed with exit code $LASTEXITCODE" }; \
    $help = (doc-detective --help 2>&1 | Out-String); \
    if ($help -match '(?m)^\s*(doc-detective(\.js)?\s+)?install\s') { \
      doc-detective install all --yes; \
      if ($LASTEXITCODE -ne 0) { throw "doc-detective install all failed with exit code $LASTEXITCODE" } \
    } else { \
      Write-Host '[postinstall] doc-detective install all unavailable in installed version. Skipping cache pre-warm.'; \
      $global:LASTEXITCODE = 0 \
    }

WORKDIR /app

ENTRYPOINT ["C:\\Program Files\\nodejs\\npx.cmd", "doc-detective"]
CMD []
