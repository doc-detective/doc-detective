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
ENV DOC_DETECTIVE='{"container": "docdetective/docdetective:windows", "version": "'$PACKAGE_VERSION'"}' \
    DOC_DETECTIVE_CACHE_DIR=C:\\ProgramData\\doc-detective \
    DOC_DETECTIVE_SKIP_AUTO_UPDATE=1

SHELL ["powershell", "-Command", "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue';"]

RUN Set-ExecutionPolicy Bypass -Scope Process -Force; \
    npm install -g doc-detective@$env:PACKAGE_VERSION; \
    doc-detective install all --yes

WORKDIR /app

ENTRYPOINT ["C:\\Program Files\\nodejs\\npx.cmd", "doc-detective"]
CMD []
