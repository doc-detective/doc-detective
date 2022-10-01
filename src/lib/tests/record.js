const fs = require("fs");
const { PuppeteerScreenRecorder } = require("puppeteer-screen-recorder");
const { convertToGif, log } = require("../utils");
const uuid = require("uuid");
const path = require("path");

exports.startRecording = startRecording;
exports.stopRecording = stopRecording;

async function startRecording(action, page, config) {
  let status;
  let description;
  let result;
  let defaultPayload = {
    overwrite: false,
    mediaDirectory: config.mediaDirectory,
    filename: "recording.mp4",
    gifFps: "",
    gifWidth: "",
  };

  // Set overwrite
  overwrite = action.overwrite || defaultPayload.overwrite;
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
  mediaDirectory = action.mediaDirectory || defaultPayload.mediaDirectory;
  if (!fs.existsSync(mediaDirectory)) {
    mediaDirectory = defaultPayload.mediaDirectory;
    log(config, "warning", `Invalid media directory. Reverting to default: ${mediaDirectory}`);
  }

  // Set filename
  let targetExtension = path.extname(action.filename);
  filename =
    `${path.basename(action.filename, ".gif")}.mp4` ||
    `${test.id}-${uuid.v4()}.mp4`;

  // Set directory
  filePath = action.mediaDirectory || config.mediaDirectory;

  filePath = path.join(filePath, filename);

  if (fs.existsSync(filePath) && !action.overwrite) {
    // PASS: Don't record/overwrite
    status = "PASS";
    description = `Skipping action. Output file already exists, and overwrite set to 'false'.`;
    result = { status, description };
    return { result };
  }

  try {
    const recorder = new PuppeteerScreenRecorder(page);
    await recorder.start(filePath);
    // PASS
    status = "PASS";
    description = `Started recording: ${filePath}`;
    result = { status, description, video: filePath };
    videoDetails = {
      recorder,
      targetExtension,
      filePath,
      width: config.browserOptions.width,
    };
    if (action.gifFps || action.gifWidth) {
      if (action.gifFps) videoDetails.fps = action.gifFps;
      if (action.gifWidth) videoDetails.width = action.gifWidth;
    }
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
        videoDetails.filePath,
        videoDetails.fps,
        videoDetails.width
      );
      videoDetails.filePath = output;
    }
    // PASS
    status = "PASS";
    description = `Stopped recording: ${filePath}`;
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
