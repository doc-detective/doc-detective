const fs = require("fs");
const { PuppeteerScreenRecorder } = require("puppeteer-screen-recorder");
const { log } = require("../utils");
const uuid = require("uuid");
const path = require("path");
const { exec } = require("child_process");

exports.startRecording = startRecording;
exports.stopRecording = stopRecording;

async function startRecording(action, page, config) {
  let status;
  let description;
  let result;
  const formats = [".mp4", ".webm", ".gif"];
  const defaultPayload = {
    overwrite: false,
    mediaDirectory: config.mediaDirectory,
    filename: `${uuid.v4()}.mp4`,
    fps: 30,
    height: config.browserOptions.height,
    width: config.browserOptions.width,
  };

  // Set overwrite
  let overwrite = action.overwrite || defaultPayload.overwrite;
  switch (overwrite) {
    case true:
    case "true":
      overwrite = true;
      break;
    case false:
    case "false":
      overwrite = false;
      break;
    default:
      overwrite = defaultPayload.overwrite;
      log(
        config,
        "warning",
        `Invalid 'overwrite' value. Reverting to default: ${overwrite}`
      );
  }

  // Set mediaDirectory
  let mediaDirectory = action.mediaDirectory || defaultPayload.mediaDirectory;
  mediaDirectory = path.resolve(mediaDirectory);
  if (!fs.existsSync(mediaDirectory)) {
    mediaDirectory = defaultPayload.mediaDirectory;
    log(
      config,
      "warning",
      `Invalid media directory. Reverting to default: ${mediaDirectory}`
    );
  }

  // Set filename
  let filename = action.filename || defaultPayload.filename;
  let targetExtension = path.extname(action.filename);
  if (formats.indexOf(targetExtension) === -1) {
    filename = defaultPayload.filename;
    log(
      config,
      "warning",
      `Invalid filename. Reverting to default: ${filename}`
    );
  }
  if (targetExtension === ".gif") {
    tempExtension = ".mp4";
  } else {
    tempExtension = targetExtension;
  }

  // Set filepath
  filepath = path.join(mediaDirectory, filename);
  tempFilepath = path.join(
    mediaDirectory,
    "temp_" + path.parse(filename).name + tempExtension
  );

  if (fs.existsSync(filepath) && !action.overwrite) {
    // PASS: Don't record/overwrite
    status = "PASS";
    description = `Skipping action. Output file already exists, and overwrite set to 'false'.`;
    result = { status, description };
    return { result };
  }

  // Set FPS
  targetFps = action.fps || action.gifFps || defaultPayload.fps;
  try {
    targetFps = Number(targetFps);
    if (targetFps >= 30) {
      fps = targetFps;
    } else {
      fps = 30;
    }
  } catch {
    targetFps = defaultPayload.fps;
    log(config, "warning", `Invalid FPS. Reverting to default: ${targetFps}`);
  }

  // Set height
  height = action.height || defaultPayload.height;
  try {
    height = Number(height);
  } catch {
    height = defaultPayload;
    log(config, "warning", `Invalid height. Reverting to default: ${height}`);
  }

  // Set width
  width = action.width || action.gifWidth || defaultPayload.width;
  try {
    width = Number(width);
  } catch {
    width = defaultPayload;
    log(config, "warning", `Invalid width. Reverting to default: ${width}`);
  }

  try {
    const recorder = new PuppeteerScreenRecorder(page, { fps });
    await recorder.start(tempFilepath);
    // PASS
    status = "PASS";
    description = `Started recording: ${tempFilepath}`;
    result = { status, description, video: tempFilepath };
    videoDetails = {
      recorder,
      targetExtension,
      filepath,
      tempFilepath,
      fps,
      targetFps,
      height,
      width,
    };
    return { result, videoDetails };
  } catch {
    // FAIL: Couldn't capture screenshot
    status = "FAIL";
    description = `Couldn't start recording.`;
    result = { status, description };
    return { result };
  }
}

async function stopRecording(videoDetails, config) {
  let status;
  let description;
  let result;

  if (typeof videoDetails.recorder === "undefined") {
    status = "PASS";
    description = `Skipping action. No action-defined recording in progress.`;
    result = { status, description };
    return { result };
  }

  recorder = videoDetails.recorder;
  targetExtension = videoDetails.targetExtension;
  height = videoDetails.height;
  width = videoDetails.width;
  filepath = videoDetails.filepath;
  tempFilepath = videoDetails.tempFilepath;
  fps = videoDetails.fps;
  targetFps = videoDetails.targetFps;

  try {
    await recorder.stop();
    if (
      targetExtension === ".gif" ||
      height != config.browserOptions.height ||
      width != config.browserOptions.width ||
      targetFps != fps
    ) {
      let output = await convertVideo(config, videoDetails);
      filepath = output;
    } else {
      fs.renameSync(tempFilepath, filepath);
      log(config, "debug", `Removed intermediate file: ${tempFilepath}`);
    }
    // PASS
    status = "PASS";
    description = `Stopped recording: ${filepath}`;
    result = { status, description };
    return { result };
  } catch {
    // FAIL: Couldn't capture screenshot
    status = "FAIL";
    description = `Couldn't stop recording.`;
    result = { status, description };
    return { result };
  }
}

async function convertVideo(config, videoDetails) {
  const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;

  input = videoDetails.tempFilepath;
  output = videoDetails.filepath;
  fps = videoDetails.fps;
  targetExtension = videoDetails.targetExtension;
  height = videoDetails.height;
  if (
    height === config.browserOptions.height &&
    width != config.browserOptions.height
  ) {
    height = -2;
  }
  width = videoDetails.width;
  if (
    width === config.browserOptions.width &&
    height != config.browserOptions.width
  ) {
    width = -2;
  }

  if (!fs.existsSync(input)) return { error: "Invalid input." };

  switch (targetExtension) {
    case ".mp4":
    case ".webm":
      vf = `scale=${width}:${height}`;
      break;
    case ".gif":
      vf = `fps=${fps},scale=${width}:${height}:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
  }

  let command = `${ffmpegPath} -nostats -loglevel 0 -y -i "${input}" -vf "${vf}" -loop 0 "${output}"`;
  exec(command, (error, stdout, stderr) => {
    if (error) {
      log(config, "debug", error.message);
      return { error: error.message };
    }
    if (stderr) {
      log(config, "debug", stderr);
      return { stderr };
    }
    log(config, "debug", stdout);
    fs.unlink(input, function (err) {
      if (err) {
        log(config, "warning", `Couldn't delete intermediate file: ${input}`);
      } else {
        log(config, "debug", `Deleted intermediate file: ${input}`);
      }
    });
    return { stdout };
  });
  return output;
}
