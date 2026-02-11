const { validate } = require("doc-detective-common");

exports.moveTo = moveTo;
exports.instantiateCursor = instantiateCursor;

async function instantiateCursor(driver, options = { position: "current" }) {

  try {
  // Wait for page to load
  await driver.waitUntil(
    async () => {
      const readyState = await driver.execute(() => {
        return document.readyState;
      });
      return readyState === "complete";
    },
    { timeout: 10000 }
  );
  } catch {
    // FAIL
    result.status = "FAIL";
    result.description = `Couldn't wait for page to load.`;
    return result;
  }

  // Detect if cursor is instantiated
  const cursor = await driver.$("dd-mouse-pointer");

  // Instantiate cursor if not already instantiated
  if (!cursor.elementId) {
    if (options.position === "center" || driver.state.x === null) {
      // Get viewport size
      const viewport = await driver.execute(() => {
        return {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          mouseX: window.mouseX,
          mouseY: window.mouseY,
        };
      });
      driver.state.x = Math.round(viewport.innerWidth / 2);
      driver.state.y = Math.round(viewport.innerHeight / 2);
    }

    // Add cursor to DOM
    await driver.execute(() => {
      const cursor = document.createElement("dd-mouse-pointer");
      cursor.style.display = "none";
      const styleElement = document.createElement("style");
      styleElement.textContent = `
      dd-mouse-pointer {
        pointer-events: none;
        position: absolute;
        top: 0;
        z-index: 10000;
        left: 0;
        width: 20px;
        height: 20px;
        background: #2f2f2f;
        border: 1px solid #fff;
        border-radius: 50%;
        margin: -10px 0 0 -10px;
        padding: 0;
        transition: background .2s, border-radius .2s, border-color .2s;
      }
      dd-mouse-pointer.click {
        transition: none;
        background: #fff;
      }
    `;
      document.head.appendChild(styleElement);
      document.body.appendChild(cursor);
      document.addEventListener(
        "mousedown",
        (e) => {
          cursor.classList.add("click");
        },
        false
      );
      document.addEventListener(
        "mouseup",
        (e) => {
          cursor.classList.remove("click");
        },
        false
      );
      document.addEventListener(
        "mousemove",
        (e) => {
          cursor.style.left = e.clientX + "px";
          cursor.style.top = e.clientY + "px";
          window.mouseX = e.clientX;
          window.mouseY = e.clientY;
        },
        false
      );
    });

    // Move cursor
    await driver.performActions([
      {
        type: "pointer",
        id: "mouse",
        parameters: { pointerType: "mouse" },
        actions: [
          {
            type: "pointerMove",
            duration: 0,
            x: driver.state.x,
            y: driver.state.y,
          },
        ],
      },
    ]);
    // Update display style
    await driver.execute(() => {
      document.querySelector("dd-mouse-pointer").style.display = "block";
    });
  }
}

// Move mouse.
// TODO: Remove most of this function or rework it as it's own step.
async function moveTo({config, step, driver, element}) {
  let result = {
    status: "PASS",
    description: "Moved mouse.",
  };
  if (!element?.elementId){
    result.status = "FAIL";
    result.description = `Couldn't find element.`;
    return result;
  }
  
  // Calculate target coordinates based on selector, alignments, and offsets
  const size = await element.getSize();
  const location = await element.getLocation();
  const dimensions = {
    width: size.width,
    height: size.height,
    x: location.x,
    y: location.y,
  };

  const coordinates = {};
  switch (step.alignment) {
    case "center":
      coordinates.x = dimensions.x + dimensions.width / 2;
      coordinates.y = dimensions.y + dimensions.height / 2;
      break;
    case "top":
      coordinates.x = dimensions.x + dimensions.width / 2;
      coordinates.y = dimensions.y;
      break;
    case "bottom":
      coordinates.x = dimensions.x + dimensions.width / 2;
      coordinates.y = dimensions.y + dimensions.height;
      break;
    case "left":
      coordinates.x = dimensions.x;
      coordinates.y = dimensions.y + dimensions.height / 2;
      break;
    case "right":
      coordinates.x = dimensions.x + dimensions.width;
      coordinates.y = dimensions.y + dimensions.height / 2;
      break;
    default:
      break;
  }

  // Add offsets
  driver.state.x = Math.round(coordinates.x + step.offset.x);
  driver.state.y = Math.round(coordinates.y + step.offset.y);

  try {
    // Move mouse
    await driver
      .action("pointer")
      .move({
        x: driver.state.x,
        y: driver.state.y,
        origin: "pointer",
        duration: step.duration,
      })
      .perform();
  } catch {
    // FAIL
    result.status = "FAIL";
    result.description = `Couldn't move mouse.`;
    return result;
  }

  // PASS
  return result;
}
