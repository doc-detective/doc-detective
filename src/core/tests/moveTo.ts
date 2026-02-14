export { moveTo, instantiateCursor };

/**
 * Ensure a visible custom mouse cursor element exists in the page and set its initial position.
 *
 * Waits for the document to finish loading, injects a `dd-mouse-pointer` element with styling and event handling if one is not present, and positions the cursor based on the provided options or the driver's stored coordinates.
 *
 * @param options - Configuration for cursor instantiation. Recognized property:
 *   - `position`: `"current"` (default) to use the driver's existing coordinates, or `"center"` to position the cursor at the viewport center.
 * @returns An object with `status` and `description`. `status` is `"PASS"` when the cursor is present and positioned, or `"FAIL"` if the page could not be waited for or instantiation/positioning failed.
async function instantiateCursor(driver: any, options: any = { position: "current" }) {
  const result: any = { status: "PASS", description: "Instantiated cursor." };

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
    if (options.position === "center" || driver.state.x == null) {
      // Get viewport size
      const viewport = await driver.execute(() => {
        return {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          mouseX: (window as any).mouseX,
          mouseY: (window as any).mouseY,
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
          (window as any).mouseX = e.clientX;
          (window as any).mouseY = e.clientY;
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
      (document.querySelector("dd-mouse-pointer") as any).style.display = "block";
    });
  }

  return result;
}

// Move mouse.
/**
 * Moves the mouse cursor to a point computed from an element's bounding box using alignment and offsets.
 *
 * @param step - Movement options: `alignment` ("center" | "top" | "bottom" | "left" | "right"), optional `offset` `{ x?: number; y?: number }`, and optional `duration` in milliseconds
 * @param driver - WebDriver-like client whose `state.x` and `state.y` will be updated to the computed coordinates
 * @param element - Element used to compute the target point; must expose size and location
 * @returns An object with `status` (`"PASS"` or `"FAIL"`) and `description` describing success or the failure reason
 */
async function moveTo({config, step, driver, element}: {config: any; step: any; driver: any; element: any}) {
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

  const coordinates: any = {};
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
      // Default to center alignment
      coordinates.x = dimensions.x + dimensions.width / 2;
      coordinates.y = dimensions.y + dimensions.height / 2;
      break;
  }

  // Add offsets
  const offsetX = step.offset?.x ?? 0;
  const offsetY = step.offset?.y ?? 0;
  driver.state.x = Math.round(coordinates.x + offsetX);
  driver.state.y = Math.round(coordinates.y + offsetY);

  try {
    // Move mouse
    await driver
      .action("pointer")
      .move({
        x: driver.state.x,
        y: driver.state.y,
        origin: "viewport",
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