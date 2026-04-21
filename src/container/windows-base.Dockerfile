# Prebuilt base image for docdetective/docdetective:windows.
#
# Contains Node.js, Python, Microsoft OpenJDK, and DITA-OT. Rebuilt rarely —
# only when a pinned tool version bumps. Kept separate from the thin top
# layer in windows.Dockerfile so that cold local builds can skip the
# multi-minute Windows installer steps and just `docker pull` this image.
#
# Tags: docdetective/docdetective-windows-base:<windowsServer>-<node>-<python>-<java>-<dita>
#       docdetective/docdetective-windows-base:latest
#
# Tool versions are sourced from windows-base.versions.json; the ARG defaults
# below must stay in sync with that file.
#
# Bumping a pinned version (bootstrap flow for contributors):
# -----------------------------------------------------------
# A PR that edits windows-base.versions.json or this file will:
#   1. Trigger the `build-windows-base` CI job on PR (build-only, no push),
#      so any install/syntax errors in the base are caught in review.
#   2. Skip the windows-2022 leg of the app `build` job via the
#      WINDOWS_APP_BUILD_SKIP gate in docker-build.yml — the new composite
#      base tag isn't on Docker Hub yet, so its FROM couldn't resolve.
#      The ubuntu leg of the app build still runs for Linux coverage.
#      PR checks stay green on the app-build side.
#
# The new base tag still needs to be published before any new app image
# that references it can be pushed. After merge, the push-to-main trigger
# rebuilds and re-pushes the base automatically, keeping Docker Hub in
# sync with the merged pin file; subsequent app-image publishes then
# resolve their FROM normally. If you need the base on Hub sooner (e.g.
# to validate on a non-CI windows host), dispatch the `Docker build`
# workflow manually with `build_base=true`.

ARG WINDOWS_SERVER_TAG=ltsc2022
FROM mcr.microsoft.com/windows/server:${WINDOWS_SERVER_TAG}

ARG NODE_VERSION=22.15.0
ARG PYTHON_VERSION=3.13.1
ARG JAVA_VERSION=17.0.14
ARG DITA_VERSION=4.3.4

ENV NODE_VERSION=${NODE_VERSION}
ENV PYTHON_VERSION=${PYTHON_VERSION}
ENV JAVA_VERSION=${JAVA_VERSION}
ENV DITA_VERSION=${DITA_VERSION}

LABEL authors="Doc Detective" \
    description="Prebuilt Windows toolchain base for Doc Detective (Node, Python, OpenJDK, DITA-OT)." \
    maintainer="manny@doc-detective.com" \
    license="AGPL-3.0" \
    homepage="https://www.doc-detective.com" \
    repository="https://github.com/doc-detective/doc-detective" \
    source="https://github.com/doc-detective/doc-detective" \
    documentation="https://www.doc-detective.com" \
    vendor="Doc Detective"

SHELL ["powershell", "-Command", "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue';"]

RUN Set-ExecutionPolicy Bypass -Scope Process -Force

# Download all four toolchain archives in parallel, then install sequentially.
# msiexec / Windows installers do not play well when run concurrently, so
# only the downloads are parallelized. This typically cuts 2-4 minutes off
# a cold base-image build versus the original per-tool RUN layout.
RUN [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; \
    $NodeUrl   = 'https://nodejs.org/dist/v' + $env:NODE_VERSION + '/node-v' + $env:NODE_VERSION + '-x64.msi'; \
    $PythonUrl = 'https://www.python.org/ftp/python/' + $env:PYTHON_VERSION + '/python-' + $env:PYTHON_VERSION + '-amd64.exe'; \
    $JavaUrl   = 'https://aka.ms/download-jdk/microsoft-jdk-' + $env:JAVA_VERSION + '-windows-x64.zip'; \
    $DitaUrl   = 'https://github.com/dita-ot/dita-ot/releases/download/' + $env:DITA_VERSION + '/dita-ot-' + $env:DITA_VERSION + '.zip'; \
    $downloads = @( \
        @{ Url = $NodeUrl;   Path = 'C:\node-installer.msi'   }, \
        @{ Url = $PythonUrl; Path = 'C:\python-installer.exe' }, \
        @{ Url = $JavaUrl;   Path = 'C:\openjdk.zip'          }, \
        @{ Url = $DitaUrl;   Path = 'C:\dita-ot.zip'          }  \
    ); \
    $jobs = $downloads | ForEach-Object { \
        $dl = $_; \
        Start-Job -ScriptBlock { \
            param($url, $path) \
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; \
            (New-Object System.Net.WebClient).DownloadFile($url, $path) \
        } -ArgumentList $dl.Url, $dl.Path \
    }; \
    $jobs | Wait-Job | ForEach-Object { \
        if ($_.State -ne 'Completed') { \
            Receive-Job $_; \
            throw ('Download job failed: ' + $_.Name + ' (state=' + $_.State + ')') \
        }; \
        Receive-Job $_ | Out-Null; \
        Remove-Job $_ \
    }; \
    Write-Host 'Installing Node.js...'; \
    $nodeInstall = Start-Process -FilePath 'msiexec.exe' -ArgumentList '/i', 'C:\node-installer.msi', '/quiet', '/norestart' -Wait -PassThru; \
    # 3010 = success, reboot required. Normal for MSI silent installs and safe to ignore inside a container.
    if ($nodeInstall.ExitCode -notin 0, 3010) { throw ('Node.js installer failed with exit code ' + $nodeInstall.ExitCode) }; \
    Remove-Item -Path 'C:\node-installer.msi' -Force; \
    Write-Host 'Installing Python...'; \
    $pythonInstall = Start-Process -FilePath 'C:\python-installer.exe' -ArgumentList '/quiet', 'InstallAllUsers=1', 'PrependPath=0', 'Include_test=0' -Wait -PassThru; \
    if ($pythonInstall.ExitCode -notin 0, 3010) { throw ('Python installer failed with exit code ' + $pythonInstall.ExitCode) }; \
    Remove-Item -Path 'C:\python-installer.exe' -Force; \
    Write-Host 'Extracting OpenJDK...'; \
    Expand-Archive -Path 'C:\openjdk.zip' -DestinationPath 'C:\temp-jdk' -Force; \
    $ExtractedDir = Get-ChildItem -Path 'C:\temp-jdk' -Directory | Select-Object -First 1; \
    Move-Item -Path $ExtractedDir.FullName -Destination 'C:\openjdk' -Force; \
    Remove-Item -Path 'C:\temp-jdk' -Force -Recurse; \
    Remove-Item -Path 'C:\openjdk.zip' -Force; \
    Write-Host 'Extracting DITA-OT...'; \
    Expand-Archive -Path 'C:\dita-ot.zip' -DestinationPath 'C:\' -Force; \
    Move-Item -Path ('C:\dita-ot-' + $env:DITA_VERSION) -Destination 'C:\dita-ot' -Force; \
    Remove-Item -Path 'C:\dita-ot.zip' -Force

# Persist PATH and JAVA_HOME for all downstream layers / containers.
RUN $PythonMajorMinor = ($env:PYTHON_VERSION -split '\.')[0..1] -join ''; \
    $PythonPath        = 'C:\Program Files\Python' + $PythonMajorMinor; \
    $PythonScriptsPath = $PythonPath + '\Scripts'; \
    $newPath = 'C:\Program Files\nodejs;' + $PythonPath + ';' + $PythonScriptsPath + ';C:\openjdk\bin;C:\dita-ot\bin;' + $env:Path; \
    [Environment]::SetEnvironmentVariable('Path', $newPath, [System.EnvironmentVariableTarget]::Machine); \
    [Environment]::SetEnvironmentVariable('JAVA_HOME', 'C:\openjdk', [System.EnvironmentVariableTarget]::Machine)

# Verify every tool installed correctly. Fails the build fast if any step
# silently broke above. $ErrorActionPreference=Stop catches cmdlet
# failures but NOT native-command non-zero exits, and a later successful
# command would reset $LASTEXITCODE — so each invocation is checked
# explicitly.
RUN $checks = @( \
        @('node',   '-v'), \
        @('npm',    '-v'), \
        @('python', '--version'), \
        @('pip',    '--version'), \
        @('java',   '-version'), \
        @('dita',   '--version')  \
    ); \
    foreach ($c in $checks) { \
        $exe = $c[0]; \
        $cmdArgs = $c[1..($c.Length - 1)]; \
        & $exe @cmdArgs; \
        if ($LASTEXITCODE -ne 0) { \
            throw ($exe + ' ' + ($cmdArgs -join ' ') + ' failed with exit code ' + $LASTEXITCODE) \
        } \
    }
