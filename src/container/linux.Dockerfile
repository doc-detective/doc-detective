# Install packages and dependencies
FROM node:22-slim AS runtime
ARG PACKAGE_VERSION=latest

# Set environment container to trigger container-based behaviors. The cache
# dir is pinned to /opt/doc-detective so the pre-warm step at image build
# time isn't lost to a per-boot /tmp wipe at runtime. Auto-update is off
# because the image is the authoritative version-bump signal — image
# releases bump doc-detective, not runtime self-update.
ENV DEBIAN_FRONTEND=noninteractive \
    DOC_DETECTIVE='{"container": "docdetective/docdetective:linux", "version": "'$PACKAGE_VERSION'"}' \
    DOC_DETECTIVE_CACHE_DIR=/opt/doc-detective \
    DOC_DETECTIVE_SKIP_AUTO_UPDATE=1

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

# Install essential dependencies for building Node.js packages
RUN apt-get update \
    && apt-get install -y --no-install-recommends software-properties-common curl xz-utils unzip \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 \
    libatk1.0-0 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libglib2.0-0 \
    libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libx11-6 libx11-xcb1 libxcb1 \
    libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 \
    libxtst6 ffmpeg wget xdg-utils \
    default-jre \
    python3 python3-pip python3-venv \
    && update-ca-certificates \
    && apt-get autoclean -y \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Install Doc Detective from NPM. By default its postinstall pre-installs the
# heavy deps (browsers, ffmpeg, webdriverio, appium, sharp) into
# DOC_DETECTIVE_CACHE_DIR (set above), so this `npm install -g` already warms
# the cache. The follow-up `doc-detective install all` is then an idempotent
# safety net — and the cache pre-warm path for older versions whose postinstall
# predates the auto-install.
#
# Detect whether the installed CLI has the new `install <subcommand>`
# surface by grepping for it in the root `--help` output. yargs always
# exits 0 from `--help` regardless of whether a subcommand exists, so
# `install --help` isn't a useful availability probe; matching the
# command line in root help text IS reliable. Real `install all`
# failures (transient npm errors, partial cache writes) then propagate
# normally and fail the build instead of being swallowed.
RUN npm install -g doc-detective@$PACKAGE_VERSION \
    && if doc-detective --help 2>&1 | grep -q "install <subcommand>"; then \
         doc-detective install all --yes; \
       else \
         echo "[postinstall] doc-detective install all unavailable in $(doc-detective --version 2>/dev/null || echo 'unknown'); skipping cache pre-warm."; \
       fi

# Install DITA-OT
ARG DITA_OT_VERSION=4.3.4
RUN curl -fSL https://github.com/dita-ot/dita-ot/releases/download/${DITA_OT_VERSION}/dita-ot-${DITA_OT_VERSION}.zip -o /tmp/dita-ot.zip \
    && unzip /tmp/dita-ot.zip -d /opt \
    && mv /opt/dita-ot-${DITA_OT_VERSION} /opt/dita-ot \
    && rm /tmp/dita-ot.zip

# Add DITA-OT to PATH
ENV PATH="/opt/dita-ot/bin:${PATH}"

# Check versions of installed packages
RUN node -v \
    && npm -v \
    && java -version \
    && python3 --version \
    && pip3 --version \
    && dita --version

# Create app directory
WORKDIR /app

# Default entrypoint runs the doc-detective CLI directly so `docker run`
# users get the existing behavior. The doc-detective.com platform
# overrides this to `doc-detective-runner` (also installed by
# `npm install -g doc-detective`, see package.json `bin`) via the Fly
# Machine `init.entrypoint` field.
ENTRYPOINT [ "npx", "doc-detective" ]

# Set default command
CMD []
