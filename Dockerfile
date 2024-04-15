FROM node:bookworm

# Set environment container to trigger container-based behaviors
# TODO: Update scripts to override certain config options to static container values (for example, -i and -o should always map to the same directories).
ENV CONTAINER=1

# Create app directory
WORKDIR /app

# Install from NPM
RUN npm install -g doc-detective

# TODO: Run all builds so nothing needs to be compiled
# Run all builds/prebuilds
# RUN cd electron && npm run prebuild
# RUN cd server && npm run prebuild

# Clea up files/dirs not needed for production
# RUN rm -rf frontend dev

# Add entrypoint command base
ENTRYPOINT [ "npx", "doc-detective" ]

# Set default command
# CMD [ "/bin/bash" ]
CMD [ "" ]