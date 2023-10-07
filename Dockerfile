FROM node:20-slim

# Set environment container to trigger container-based behaviors
# TODO: Update scripts to override certain config options to static container values (for example, -i and -o should always map to the same directories).
ENV CONTAINER=1
ENV DEBIAN_FRONTEND=noninteractive

# Create app directory
WORKDIR /app

# Bundle app source
COPY package.json .
COPY package-lock.json .

# Install app dependencies
RUN npm ci
RUN npx playwright install --with-deps firefox chromium
RUN npm cache clean --force

# Copy source code
COPY . .

# TODO: Run all builds so nothing needs to be compiled
# Run all builds/prebuilds
# RUN cd electron && npm run prebuild
# RUN cd server && npm run prebuild

# Clea up files/dirs not needed for production
# RUN rm -rf frontend dev

# Add entrypoint command base
ENTRYPOINT [ "npm", "run" ]

# Set default command
CMD [ "start" ]