exports.moveMouse = moveMouse;

// Move mouse to an element.  Assumes findElement() only found one matching element.
async function moveMouse(action, page, elementHandle, config) {
  let status;
  let description;
  let result;

  // Set defaults
  defaults = {
    alignH: "center",
    alignV: "center",
    offsetX: 0,
    offsetY: 0,
  };

  // Process fallbacks
  action.alignH = action.alignH || defaults.alignH;
  action.alignV = action.alignV || defaults.alignV;
  action.offsetX = action.offsetX || defaults.offsetX;
  action.offsetY = action.offsetY || defaults.offsetY;

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
    // Calc coordinates
    const bounds = await elementHandle.boundingBox();
    let x = bounds.x;
    if (action.offsetX) x = x + Number(action.offsetX);
    if (action.alignH) {
      if (action.alignH === "left") {
        alignHOffset = 10;
      } else if (action.alignH === "center") {
        alignHOffset = bounds.width / 2;
      } else if (action.alignH === "right") {
        alignHOffset = bounds.width - 10;
      } else {
        // FAIL
        status = "FAIL";
        description = `Invalid 'alignH' value.`;
        result = { status, description };
        return { result };
      }
      x = x + alignHOffset;
    }
    let y = bounds.y;
    if (action.offsetY) y = y + Number(action.offsetY);
    if (action.alignV) {
      if (action.alignV === "top") {
        alignVOffset = 10;
      } else if (action.alignV === "center") {
        alignVOffset = bounds.height / 2;
      } else if (action.alignV === "bottom") {
        alignVOffset = bounds.height - 10;
      } else {
        // FAIL
        status = "FAIL";
        description = `Invalid 'alignV' value.`;
        result = { status, description };
        return { result };
      }
      y = y + alignVOffset;
    }
    // Move
    await page.mouse.move(x, y, { steps: 25 });
    // Display mouse cursor
    await page.$eval(
      "puppeteer-mouse-pointer",
      (e) => (e.style.display = "block")
    );
    // PASS
    status = "PASS";
    description = `Moved mouse to element.`;
    result = { status, description };
    return { result };
  } catch {
    // FAIL
    status = "FAIL";
    description = `Couldn't move mouse to element.`;
    result = { status, description };
    return { result };
  }
}
