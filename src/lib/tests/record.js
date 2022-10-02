const fs = require("fs");
const { PuppeteerScreenRecorder } = require("puppeteer-screen-recorder");
const { convertToGif, log } = require("../utils");
const uuid = require("uuid");
const path = require("path");
const { fileURLToPath } = require("url");

exports.startRecording = startRecording;
exports.stopRecording = stopRecording;

async function startRecording(action, page, config) {
  let status;
  let description;
  let result;
  let defaultPayload = {
    overwrite: false,
    mediaDirectory: config.mediaDirectory,
    filename: test.id + uuid.v4 + ".mp4",
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
  if (targetExtension != ".mp4" && targetExtension != ".gif") {
    filename = defaultPayload.filename;
    log(
      config,
      "warning",
      `Invalid filename. Reverting to default: ${filename}`
    );
  }

  // Set filepath
  filepath = path.join(filepath, filename);

  // Set FPS
  fps = action.fps || defaultPayload.fps;
  try {
    fps = Number(fps);
  } catch {
    fps = defaultPayload;
    log(config, "warning", `Invalid FPS. Reverting to default: ${fps}`);
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
  width = action.width || defaultPayload.width;
  try {
    width = Number(width);
  } catch {
    width = defaultPayload;
    log(config, "warning", `Invalid width. Reverting to default: ${width}`);
  }

  if (fs.existsSync(filepath) && !action.overwrite) {
    // PASS: Don't record/overwrite
    status = "PASS";
    description = `Skipping action. Output file already exists, and overwrite set to 'false'.`;
    result = { status, description };
    return { result };
  }

  try {
    const recorder = new PuppeteerScreenRecorder(page);
    await recorder.start(filepath);
    // PASS
    status = "PASS";
    description = `Started recording: ${filepath}`;
    result = { status, description, video: filepath };
    videoDetails = {
      recorder,
      targetExtension,
      filepath,
      fps,
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
  try {
    await videoDetails.recorder.stop();
    if (videoDetails.targetExtension === ".gif") {
      let output = await convertToGif(
        config,
        videoDetails.filepath,
        videoDetails.fps,
        videoDetails.width
      );
      videoDetails.filepath = output;
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
