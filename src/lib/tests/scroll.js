exports.scroll = scroll;

async function scroll(action, page, config) {
  let status;
  let description;
  let result;

  if (
    Object.keys(config.videoDetails).length === 0 &&
    Object.keys(config.debugRecording).length === 0
  ) {
    status = "PASS";
    description = "Skipping action. No recordings are in progress.";
    result = { status, description };
    return { result };
  }

  try {
    await page.mouse.wheel({ deltaX: action.x, deltaY: action.y });
    // PASS
    status = "PASS";
    description = `Scroll complete.`;
    result = { status, description };
    return { result };
  } catch {
    // FAIL
    status = "PASS";
    description = `Couldn't scroll.`;
    result = { status, description };
    return { result };
  }
}
