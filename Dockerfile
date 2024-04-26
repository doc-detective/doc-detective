FROM ubuntu:jammy
LABEL authors="Doc Detective"

#Arguments to define the user running Selenium
ARG USER=dd
ARG GROUP=${USER}
ARG PASSWD=secret
ARG UID=1200
ARG GID=1201
ARG TZ="UTC"
ARG TARGETARCH=amd64
ARG TARGETVARIANT

ENV DEBIAN_FRONTEND=noninteractive \
    # No interactive frontend during docker build
    DEBCONF_NONINTERACTIVE_SEEN=true \
    HOME=/home/${USER} \
    TZ=${TZ} \
    DOWNLOAD_DIR=${HOME}/Downloads

#========================
# Miscellaneous packages
#========================
RUN  echo "deb http://archive.ubuntu.com/ubuntu jammy main universe\n" > /etc/apt/sources.list \
  && echo "deb http://archive.ubuntu.com/ubuntu jammy-updates main universe\n" >> /etc/apt/sources.list \
  && echo "deb http://security.ubuntu.com/ubuntu jammy-security main universe\n" >> /etc/apt/sources.list \
  && apt-get -qqy update \
  && apt-get upgrade -yq \
  && apt-get -qqy --no-install-recommends install \
    acl \
    bzip2 \
    ca-certificates \
    tzdata \
    sudo \
    unzip \
    wget \
    jq \
    curl \
    supervisor \
    gnupg2 \
    libnss3-tools \
    libavcodec-extra \
    libgtk-3-dev libdbus-glib-1-dev \
    nano \
  && rm -rf /var/lib/apt/lists/* /var/cache/apt/* \
#========================================
# Add normal user and group without password sudo
#========================================
  && groupadd ${GROUP} \
         --gid ${GID} \
  && useradd ${USER} \
         --create-home \
         --gid ${GID} \
         --shell /bin/bash \
         --uid ${UID} \
  && usermod -a -G sudo ${USER} \
  && echo 'ALL ALL = (ALL) NOPASSWD: ALL' >> /etc/sudoers \
  && echo "${USER}:${PASSWD}" | chpasswd

# Install Node
RUN apt-get update && apt-get install -y curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# #=========
# # Firefox
# #=========
# ARG FIREFOX_VERSION=latest
# RUN FIREFOX_DOWNLOAD_URL=$(if [ $FIREFOX_VERSION = "latest" ] || [ $FIREFOX_VERSION = "beta-latest" ] || [ $FIREFOX_VERSION = "nightly-latest" ] || [ $FIREFOX_VERSION = "devedition-latest" ] || [ $FIREFOX_VERSION = "esr-latest" ]; then echo "https://download.mozilla.org/?product=firefox-$FIREFOX_VERSION-ssl&os=linux64&lang=en-US"; else echo "https://download-installer.cdn.mozilla.net/pub/firefox/releases/$FIREFOX_VERSION/linux-x86_64/en-US/firefox-$FIREFOX_VERSION.tar.bz2"; fi) \
#   && apt-get update -qqy \
#   && apt-get -qqy --no-install-recommends install libavcodec-extra \
#      libgtk-3-dev libdbus-glib-1-dev \
#   && rm -rf /var/lib/apt/lists/* /var/cache/apt/* \
#   && wget --no-verbose -O /tmp/firefox.tar.bz2 $FIREFOX_DOWNLOAD_URL \
#   && rm -rf /opt/firefox \
#   && tar -C /opt -xjf /tmp/firefox.tar.bz2 \
#   && rm /tmp/firefox.tar.bz2 \
#   && mv /opt/firefox /opt/firefox-$FIREFOX_VERSION \
#   && ln -fs /opt/firefox-$FIREFOX_VERSION/firefox /usr/bin/firefox

# #============
# # GeckoDriver
# #============
# ARG GECKODRIVER_VERSION=latest
# RUN GK_VERSION=$(if [ ${GECKODRIVER_VERSION:-latest} = "latest" ]; then echo "0.34.0"; else echo $GECKODRIVER_VERSION; fi) \
#   && echo "Using GeckoDriver version: "$GK_VERSION \
#   && wget --no-verbose -O /tmp/geckodriver.tar.gz https://github.com/mozilla/geckodriver/releases/download/v$GK_VERSION/geckodriver-v$GK_VERSION-linux64.tar.gz \
#   && rm -rf /opt/geckodriver \
#   && tar -C /opt -zxf /tmp/geckodriver.tar.gz \
#   && rm /tmp/geckodriver.tar.gz \
#   && mv /opt/geckodriver /opt/geckodriver-$GK_VERSION \
#   && chmod 755 /opt/geckodriver-$GK_VERSION \
#   && ln -fs /opt/geckodriver-$GK_VERSION /usr/bin/geckodriver

# #============================================
# # Google Chrome
# #============================================
# # can specify versions by CHROME_VERSION;
# #  e.g. google-chrome-stable
# #       google-chrome-beta
# #       google-chrome-unstable
# #============================================
# ARG CHROME_VERSION="google-chrome-stable"
# ARG TARGETARCH=amd64
# RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor | tee /etc/apt/trusted.gpg.d/google.gpg >/dev/null \
#   && echo "deb http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list \
#   && apt-get update -qqy \
#   && if echo "${CHROME_VERSION}" | grep -qE "google-chrome-stable[_|=][0-9]*"; \
#     then \
#       CHROME_VERSION=$(echo "$CHROME_VERSION" | tr '=' '_') \
#       && wget -qO google-chrome.deb "https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/${CHROME_VERSION}_${TARGETARCH}.deb" \
#       && apt-get -qqy --no-install-recommends install --allow-downgrades ./google-chrome.deb \
#       && rm -rf google-chrome.deb ; \
#     else \
#       apt-get -qqy --no-install-recommends install ${CHROME_VERSION} ; \
#     fi \
#   && rm /etc/apt/sources.list.d/google-chrome.list \
#   && rm -rf /var/lib/apt/lists/* /var/cache/apt/*

# #============================================
# # Chrome webdriver
# #============================================
# # can specify versions by CHROME_DRIVER_VERSION
# # Latest released version will be used by default
# #============================================
# ARG CHROME_DRIVER_VERSION
# RUN if [ ! -z "$CHROME_DRIVER_VERSION" ]; \
#   then CHROME_DRIVER_URL=https://storage.googleapis.com/chrome-for-testing-public/$CHROME_DRIVER_VERSION/linux64/chromedriver-linux64.zip ; \
#   else CHROME_MAJOR_VERSION=$(google-chrome --version | sed -E "s/.* ([0-9]+)(\.[0-9]+){3}.*/\1/") \
#     && echo "Geting ChromeDriver latest version from https://googlechromelabs.github.io/chrome-for-testing/LATEST_RELEASE_${CHROME_MAJOR_VERSION}" \
#     && CHROME_DRIVER_VERSION=$(wget -qO- https://googlechromelabs.github.io/chrome-for-testing/LATEST_RELEASE_${CHROME_MAJOR_VERSION} | sed 's/\r$//') \
#     && CHROME_DRIVER_URL=https://storage.googleapis.com/chrome-for-testing-public/$CHROME_DRIVER_VERSION/linux64/chromedriver-linux64.zip ; \
#   fi \
#   && echo "Using ChromeDriver from: "$CHROME_DRIVER_URL \
#   && echo "Using ChromeDriver version: "$CHROME_DRIVER_VERSION \
#   && wget --no-verbose -O /tmp/chromedriver_linux64.zip $CHROME_DRIVER_URL \
#   && rm -rf /opt/selenium/chromedriver \
#   && unzip /tmp/chromedriver_linux64.zip -d /opt/selenium \
#   && rm /tmp/chromedriver_linux64.zip \
#   && mv /opt/selenium/chromedriver-linux64/chromedriver /opt/selenium/chromedriver-$CHROME_DRIVER_VERSION \
#   && chmod 755 /opt/selenium/chromedriver-$CHROME_DRIVER_VERSION \
#   && ln -fs /opt/selenium/chromedriver-$CHROME_DRIVER_VERSION /usr/bin/chromedriver

# #============================================
# # Microsoft Edge
# #============================================
# # can specify versions by EDGE_VERSION;
# #  e.g. microsoft-edge-beta=88.0.692.0-1
# #============================================
# ARG EDGE_VERSION="microsoft-edge-stable"
# ARG TARGETARCH=amd64
# RUN wget -q -O - https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor | tee /etc/apt/trusted.gpg.d/microsoft.gpg >/dev/null \
#   && echo "deb https://packages.microsoft.com/repos/edge stable main" >> /etc/apt/sources.list.d/microsoft-edge.list \
#   && apt-get update -qqy \
#   && if echo "${EDGE_VERSION}" | grep -qE "microsoft-edge-stable[_|=][0-9]*"; \
#     then \
#       EDGE_VERSION=$(echo "$EDGE_VERSION" | tr '=' '_') \
#       && wget -qO microsoft-edge.deb "https://packages.microsoft.com/repos/edge/pool/main/m/microsoft-edge-stable/${EDGE_VERSION}_${TARGETARCH}.deb" \
#       && apt-get -qqy --no-install-recommends install --allow-downgrades ./microsoft-edge.deb \
#       && rm -rf microsoft-edge.deb ; \
#     else \
#       apt-get -qqy --no-install-recommends install ${EDGE_VERSION} ; \
#     fi \
#   && rm /etc/apt/sources.list.d/microsoft-edge.list \
#   && rm -rf /var/lib/apt/lists/* /var/cache/apt/*

# #============================================
# # Edge webdriver
# #============================================
# # can specify versions by EDGE_DRIVER_VERSION
# # Latest released version will be used by default
# #============================================
# ARG EDGE_DRIVER_VERSION
# RUN if [ -z "$EDGE_DRIVER_VERSION" ]; \
#   then EDGE_MAJOR_VERSION=$(microsoft-edge --version | sed -E "s/.* ([0-9]+)(\.[0-9]+){3}.*/\1/") \
#     && EDGE_DRIVER_VERSION=$(wget --no-verbose -O - "https://msedgedriver.azureedge.net/LATEST_RELEASE_${EDGE_MAJOR_VERSION}_LINUX" | tr -cd "\11\12\15\40-\176" | tr -d "\r"); \
#   fi \
#   && echo "Using msedgedriver version: "$EDGE_DRIVER_VERSION \
#   && wget --no-verbose -O /tmp/msedgedriver_linux64.zip https://msedgedriver.azureedge.net/$EDGE_DRIVER_VERSION/edgedriver_linux64.zip \
#   && rm -rf /opt/selenium/msedgedriver \
#   && unzip /tmp/msedgedriver_linux64.zip -d /opt/selenium \
#   && rm /tmp/msedgedriver_linux64.zip \
#   && mv /opt/selenium/msedgedriver /opt/selenium/msedgedriver-$EDGE_DRIVER_VERSION \
#   && chmod 755 /opt/selenium/msedgedriver-$EDGE_DRIVER_VERSION \
#   && ln -fs /opt/selenium/msedgedriver-$EDGE_DRIVER_VERSION /usr/bin/msedgedriver


#===================================================
# Run the following commands as non-privileged user
#===================================================
# Install Doc Detective from NPM
RUN npm install -g doc-detective@dev


# FROM node:bookworm

# # Set environment container to trigger container-based behaviors
# # TODO: Update scripts to override certain config options to static container values (for example, -i and -o should always map to the same directories).
# ENV CONTAINER=1

# # Create app directory
WORKDIR /app

# # Install necessary packages for XFCE, VNC, Firefox, and Google Chrome
# RUN apt-get update && apt-get install -y xfce4 xfce4-goodies x11vnc xvfb chromium wget gnupg \
#     && wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
#     && dpkg -i google-chrome-stable_current_amd64.deb; apt-get -fy install \
#     && apt-get clean \
#     && rm -rf /var/lib/apt/lists/* ./google-chrome-stable_current_amd64.deb \
#     && adduser --disabled-password --gecos "" user

# # Install from NPM

# # Add entrypoint command base
# # ENTRYPOINT [ "npx", "doc-detective" ]

# # Set default command
CMD [ "/bin/bash" ]
# # CMD [ "" ]