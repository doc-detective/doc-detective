FROM node:bookworm-slim AS node_base

# TODO: Run all builds and copy over generated artifacts
# FROM ubuntu:jammy as builder
# ARG DEBIAN_FRONTEND=noninteractive
# COPY --from=node_base /usr/local/bin /usr/local/bin
# COPY --from=node_base /usr/local/lib /usr/local/lib
# Run all builds/prebuilds
# RUN cd electron && npm run prebuild
# RUN cd server && npm run prebuild
# Clean up files/dirs not needed for production
# RUN rm -rf frontend dev

FROM ubuntu:jammy

ARG DEBIAN_FRONTEND=noninteractive

COPY --from=node_base /usr/local/bin /usr/local/bin
COPY --from=node_base /usr/local/lib /usr/local/lib

# Set environment container to trigger container-based behaviors
# TODO: Update scripts to override certain config options to static container values (for example, -i and -o should always map to the same directories).
ENV CONTAINER=1
ENV DEBIAN_FRONTEND=noninteractive

# Create app directory
WORKDIR /app

# Install dependencies
ENV PLAYWRIGHT_BROWSERS_PATH=./browsers
RUN apt update && \
    apt install -y jq && \
    npx playwright install --with-deps firefox chromium && \
    apt autoremove -y && \
    rm -rf /var/lib/apt/lists/*

# Bundle app source
COPY package.json .
COPY package-lock.json .

# Install app dependencies
RUN npm ci
RUN npx playwright install --with-deps firefox chromium
RUN npm cache clean --force

# Copy source code
COPY . .

# Add entrypoint command base
ENTRYPOINT [ "npm", "run" ]

# Set default command
CMD [ "runTests" ]
# CMD /bin/bash