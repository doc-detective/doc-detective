FROM node:bookworm

# Set environment container to trigger container-based behaviors
# TODO: Update scripts to override certain config options to static container values (for example, -i and -o should always map to the same directories).
ENV CONTAINER=1

# Create app directory
WORKDIR /app

# Install necessary packages for XFCE, VNC, Firefox, and Google Chrome
RUN apt-get update && apt-get install -y xfce4 xfce4-goodies x11vnc xvfb chromium wget gnupg \
    && wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && dpkg -i google-chrome-stable_current_amd64.deb; apt-get -fy install \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* ./google-chrome-stable_current_amd64.deb \
    && adduser --disabled-password --gecos "" user

# Install from NPM
RUN npm install -g doc-detective@dev

# Add entrypoint command base
# ENTRYPOINT [ "npx", "doc-detective" ]

# Set default command
CMD [ "/bin/bash" ]
# CMD [ "" ]