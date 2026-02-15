# Builder stage to install packages and dependencies
FROM node:22-slim AS runtime
ARG PACKAGE_VERSION=latest

# Set environment container to trigger container-based behaviors
ENV DEBIAN_FRONTEND=noninteractive \
    DOC_DETECTIVE='{"container": "docdetective/docdetective:linux", "version": "'$PACKAGE_VERSION'"}'

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
RUN apt update \
    && apt install -y --no-install-recommends software-properties-common curl xz-utils unzip \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 \
    libatk1.0-0 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libglib2.0-0 \
    libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libx11-6 libx11-xcb1 libxcb1 \
    libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 \
    libxtst6 ffmpeg wget xdg-utils \
    default-jre \
    python3 python3-pip python3-venv \
    && update-ca-certificates \
    && apt autoclean -y \
    && apt autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Install Doc Detective from NPM
RUN npm install -g doc-detective@$PACKAGE_VERSION

# Install DITA-OT
ARG DITA_OT_VERSION=4.3.4
RUN curl -kL https://github.com/dita-ot/dita-ot/releases/download/${DITA_OT_VERSION}/dita-ot-${DITA_OT_VERSION}.zip -o /tmp/dita-ot.zip \
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

# Add entrypoint command base
ENTRYPOINT [ "npx", "doc-detective" ]

# Set default command
CMD [ "" ]
# CMD [ "bash"]
