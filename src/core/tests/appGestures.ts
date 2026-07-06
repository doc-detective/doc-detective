// Per-platform gesture adapters for app surfaces (phase A6): swipe,
// long-press, device keys, focused typing, and the find auto-scroll step.
// Keyed identically to APP_DRIVER_PLATFORMS in appSurface.ts — adding a
// platform means adding a row in both tables. Rows use each driver's native
// execute extensions where they exist and the shared W3C movement engine
// (movement.ts) where they don't; everything is mockable with a fake
// { execute, getWindowRect, action } driver.

import {
  directionToPoints,
  fractionsToPixels,
  performMovement,
  DEFAULT_SWIPE_DISTANCE,
  DEFAULT_SWIPE_DURATION,
  MOVEMENT_INSET,
} from "./movement.js";
import type { MovementPoint, SwipeDirection } from "./movement.js";

export {
  APP_GESTURES,
  ANDROID_KEYCODES,
  IOS_BUTTONS,
  IOS_TEXT_KEYS,
  DEVICE_KEYS,
};
export type { AppGestureAdapter, SwipeGesture };

// A normalized swipe: either direction/distance (shorthand) or from/to
// (point-to-point), never both — the schema enforces the split.
interface SwipeGesture {
  direction?: SwipeDirection;
  distance?: number;
  from?: MovementPoint;
  to?: MovementPoint;
  duration: number;
}

interface AppGestureAdapter {
  // Swipe the app's window/screen. Throws on driver errors; the step handler
  // wraps them into FAIL results.
  swipe(driver: any, gesture: SwipeGesture): Promise<void>;
  // Press-and-hold a located element for durationMs.
  longPress(driver: any, element: any, durationMs: number): Promise<void>;
  // Handle one $KEY$ token. Returns {} on success or { error } when the token
  // is meaningless on this platform. Absent on desktop rows — the desktop key
  // vocabulary is a later phase, and typeKeys keeps its rejection.
  pressKey?(driver: any, token: string): Promise<{ error?: string }>;
  // Type text into the currently focused element. Android-only: XCUITest's
  // `mobile: keys` is iPad-only (Xcode 15+), so iOS keeps requiring element
  // criteria for text.
  typeFocused?(driver: any, text: string): Promise<void>;
  // One find-auto-scroll step toward content further down. Returns false when
  // the surface reports it can't scroll further, true otherwise (iOS has no
  // feedback channel, so its row always returns true and the caller's attempt
  // bound is the only stop). Mobile rows only.
  scrollStep?(driver: any): Promise<boolean>;
}

// Android KeyEvent codes (https://developer.android.com/reference/android/view/KeyEvent).
// $HOME$ on an app surface is the DEVICE home button, not cursor-to-line-start
// — the design-doc overload, called out in the type reference docs.
const ANDROID_KEYCODES: Record<string, number> = {
  // Device keys (the new A6 vocabulary)
  $BACK$: 4,
  $HOME$: 3,
  $APP_SWITCH$: 187,
  $VOLUME_UP$: 24,
  $VOLUME_DOWN$: 25,
  // Common editing keys, mapped onto keycodes for app surfaces
  $ENTER$: 66,
  $RETURN$: 66,
  $TAB$: 61,
  $SPACE$: 62,
  $BACKSPACE$: 67,
  $DELETE$: 112,
  $ESCAPE$: 111,
  $ARROW_UP$: 19,
  $ARROW_DOWN$: 20,
  $ARROW_LEFT$: 21,
  $ARROW_RIGHT$: 22,
  $PAGE_UP$: 92,
  $PAGE_DOWN$: 93,
};

// Physical buttons XCUITest can press (mobile: pressButton).
const IOS_BUTTONS: Record<string, string> = {
  $HOME$: "home",
  $VOLUME_UP$: "volumeup",
  $VOLUME_DOWN$: "volumedown",
};

// Tokens that fold into typed text on iOS (sent through setValue/addValue).
const IOS_TEXT_KEYS: Record<string, string> = {
  $ENTER$: "\n",
  $RETURN$: "\n",
  $TAB$: "\t",
  $BACKSPACE$: "\b",
  $DELETE$: "\b",
};

// Device-only keys: pressing these needs no element criteria (there's no
// text field involved in pressing Back or Volume Up).
const DEVICE_KEYS: Set<string> = new Set([
  "$BACK$",
  "$HOME$",
  "$APP_SWITCH$",
  "$VOLUME_UP$",
  "$VOLUME_DOWN$",
]);

// The window area directional swipes act within, inset per MOVEMENT_INSET.
async function insetWindowArea(driver: any): Promise<{
  left: number;
  top: number;
  width: number;
  height: number;
}> {
  const rect = await driver.getWindowRect();
  return {
    left: Math.round(rect.x + rect.width * MOVEMENT_INSET),
    top: Math.round(rect.y + rect.height * MOVEMENT_INSET),
    width: Math.round(rect.width * (1 - 2 * MOVEMENT_INSET)),
    height: Math.round(rect.height * (1 - 2 * MOVEMENT_INSET)),
  };
}

// XCUITest's dragFromToForDuration takes absolute screen coordinates and a
// float-second duration in [0.5, 60].
async function iosDrag(
  driver: any,
  from: MovementPoint,
  to: MovementPoint,
  durationMs: number
): Promise<void> {
  const rect = await driver.getWindowRect();
  const fromPx = fractionsToPixels(rect, from);
  const toPx = fractionsToPixels(rect, to);
  await driver.execute("mobile: dragFromToForDuration", {
    duration: Math.min(60, Math.max(0.5, durationMs / 1000)),
    fromX: fromPx.x,
    fromY: fromPx.y,
    toX: toPx.x,
    toY: toPx.y,
  });
}

// Desktop wheel-scroll sign conventions are only loosely documented; each is
// isolated here so a fixture-observed inversion is a one-line fix.
// NovaWindows deltas are wheel clicks ("positive deltaY = forward rotation");
// a swipe up (revealing content below) is a backward rotation, and a wheel
// click moves roughly 120px of content, so clicks ≈ distance × axis / 120.
function windowsWheelDeltas(
  direction: SwipeDirection,
  distance: number,
  rect: { width: number; height: number }
): { deltaX?: number; deltaY?: number } {
  const clicks = (axis: number) => Math.max(1, Math.round((distance * axis) / 120));
  switch (direction) {
    case "up":
      return { deltaY: -clicks(rect.height) };
    case "down":
      return { deltaY: clicks(rect.height) };
    case "left":
      return { deltaX: clicks(rect.width) };
    case "right":
      return { deltaX: -clicks(rect.width) };
  }
}

// Mac2 deltas are float pixels; XCTest's scroll convention has positive
// deltaY scroll toward content above, so a swipe up is negative deltaY.
function macScrollDeltas(
  direction: SwipeDirection,
  distance: number,
  rect: { width: number; height: number }
): { deltaX: number; deltaY: number } {
  switch (direction) {
    case "up":
      return { deltaX: 0, deltaY: -Math.round(distance * rect.height) };
    case "down":
      return { deltaX: 0, deltaY: Math.round(distance * rect.height) };
    case "left":
      return { deltaX: -Math.round(distance * rect.width), deltaY: 0 };
    case "right":
      return { deltaX: Math.round(distance * rect.width), deltaY: 0 };
  }
}

const APP_GESTURES: Record<string, AppGestureAdapter> = {
  android: {
    async swipe(driver, gesture) {
      if (gesture.from && gesture.to) {
        const rect = await driver.getWindowRect();
        await performMovement({
          driver,
          rect,
          from: gesture.from,
          to: gesture.to,
          duration: gesture.duration,
          pointerType: "touch",
        });
        return;
      }
      const area = await insetWindowArea(driver);
      await driver.execute("mobile: swipeGesture", {
        ...area,
        direction: gesture.direction,
        percent: gesture.distance ?? DEFAULT_SWIPE_DISTANCE,
      });
    },
    async longPress(driver, element, durationMs) {
      await driver.execute("mobile: longClickGesture", {
        elementId: element.elementId,
        duration: durationMs,
      });
    },
    async pressKey(driver, token) {
      const keycode = ANDROID_KEYCODES[token];
      if (keycode === undefined) {
        return {
          error: `${token} has no Android key mapping on app surfaces. Supported keys: ${Object.keys(ANDROID_KEYCODES).join(", ")}.`,
        };
      }
      await driver.execute("mobile: pressKey", { keycode });
      return {};
    },
    async typeFocused(driver, text) {
      await driver.execute("mobile: type", { text });
    },
    async scrollStep(driver) {
      const area = await insetWindowArea(driver);
      // scrollGesture's direction is the CONTENT direction: scrolling "down"
      // views content further down (the finger moves up). Returns true while
      // the container can still scroll that way.
      const canScrollMore = await driver.execute("mobile: scrollGesture", {
        ...area,
        direction: "down",
        percent: 0.7,
      });
      return canScrollMore !== false;
    },
  },

  ios: {
    async swipe(driver, gesture) {
      const points =
        gesture.from && gesture.to
          ? { from: gesture.from, to: gesture.to }
          : directionToPoints(
              gesture.direction as SwipeDirection,
              gesture.distance ?? DEFAULT_SWIPE_DISTANCE
            );
      await iosDrag(driver, points.from, points.to, gesture.duration);
    },
    async longPress(driver, element, durationMs) {
      await driver.execute("mobile: touchAndHold", {
        elementId: element.elementId,
        duration: durationMs / 1000,
      });
    },
    async pressKey(driver, token) {
      const button = IOS_BUTTONS[token];
      if (button) {
        await driver.execute("mobile: pressButton", { name: button });
        return {};
      }
      if (token === "$BACK$") {
        return {
          error: `$BACK$ isn't supported on iOS: iOS devices have no system back button. Click the app's own back control instead (e.g. { "click": { "elementText": "Back", "surface": { "app": "…" } } }).`,
        };
      }
      if (token === "$APP_SWITCH$") {
        return {
          error: `$APP_SWITCH$ isn't supported on iOS app surfaces: XCUITest exposes no app-switcher button. Switch apps by targeting another app surface by name instead.`,
        };
      }
      return {
        error: `${token} has no iOS key mapping on app surfaces. Physical buttons: ${Object.keys(IOS_BUTTONS).join(", ")}; text keys (${Object.keys(IOS_TEXT_KEYS).join(", ")}) type into an element.`,
      };
    },
    // No typeFocused: XCUITest's `mobile: keys` is iPad-only (Xcode 15+), so
    // iOS text typing keeps requiring element criteria.
    async scrollStep(driver) {
      const { from, to } = directionToPoints("up", 0.7);
      await iosDrag(driver, from, to, DEFAULT_SWIPE_DURATION);
      // XCUITest has no can-scroll-more feedback; the caller's attempt bound
      // is the only stop.
      return true;
    },
  },

  windows: {
    async swipe(driver, gesture) {
      const rect = await driver.getWindowRect();
      if (gesture.from && gesture.to) {
        const fromPx = fractionsToPixels(rect, gesture.from);
        const toPx = fractionsToPixels(rect, gesture.to);
        await driver.execute("windows: clickAndDrag", {
          startX: fromPx.x,
          startY: fromPx.y,
          endX: toPx.x,
          endY: toPx.y,
          durationMs: gesture.duration,
        });
        return;
      }
      const center = fractionsToPixels(rect, { x: 0.5, y: 0.5 });
      const deltas = windowsWheelDeltas(
        gesture.direction as SwipeDirection,
        gesture.distance ?? DEFAULT_SWIPE_DISTANCE,
        rect
      );
      await driver.execute("windows: scroll", {
        x: center.x,
        y: center.y,
        ...deltas,
      });
    },
    async longPress(driver, element, durationMs) {
      // durationMs is NovaWindows' press-to-release hold time.
      await driver.execute("windows: click", {
        elementId: element.elementId,
        durationMs,
      });
    },
  },

  mac: {
    async swipe(driver, gesture) {
      const rect = await driver.getWindowRect();
      if (gesture.from && gesture.to) {
        const fromPx = fractionsToPixels(rect, gesture.from);
        const toPx = fractionsToPixels(rect, gesture.to);
        await driver.execute("macos: clickAndDrag", {
          startX: fromPx.x,
          startY: fromPx.y,
          endX: toPx.x,
          endY: toPx.y,
          duration: gesture.duration / 1000,
        });
        return;
      }
      const center = fractionsToPixels(rect, { x: 0.5, y: 0.5 });
      const deltas = macScrollDeltas(
        gesture.direction as SwipeDirection,
        gesture.distance ?? DEFAULT_SWIPE_DISTANCE,
        rect
      );
      await driver.execute("macos: scroll", {
        x: center.x,
        y: center.y,
        ...deltas,
      });
    },
    async longPress(driver, element, durationMs) {
      // Mac2 supports mouse-only W3C actions; prefer the standard chain and
      // fall back to the native extension if the actions endpoint misbehaves.
      try {
        await driver
          .action("pointer", { parameters: { pointerType: "mouse" } })
          .move({ origin: element })
          .down()
          .pause(durationMs)
          .up()
          .perform();
      } catch {
        await driver.execute("macos: clickAndDragAndHold", {
          sourceElementId: element.elementId,
          destinationElementId: element.elementId,
          duration: 0.1,
          holdDuration: durationMs / 1000,
        });
      }
    },
  },
};
