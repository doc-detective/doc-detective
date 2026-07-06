// The shared coordinate-movement engine (phase A6). `swipe` is the movement
// subset of `dragAndDrop`: dragAndDrop locates two elements and moves between
// them; swipe moves between two points (authored directly, or computed from a
// direction shorthand). Both concepts meet here — dragAndDrop's future
// app-surface branch calls performMovement with element-center fractions.
//
// Coordinates are 0-1 fractions of a rect ({x, y, width, height}); callers
// supply the rect (an app window rect, or the browser viewport) so the engine
// stays driver-agnostic and unit-testable with a fake driver.

export {
  MOVEMENT_INSET,
  DEFAULT_SWIPE_DISTANCE,
  DEFAULT_SWIPE_DURATION,
  directionToPoints,
  fractionsToPixels,
  performMovement,
  performElementPress,
  getBrowserViewportRect,
};
export type { MovementPoint, MovementRect, SwipeDirection };

type SwipeDirection = "up" | "down" | "left" | "right";
type MovementPoint = { x: number; y: number };
type MovementRect = { x: number; y: number; width: number; height: number };

// Directional swipes keep away from the outer 10% of the surface so a
// full-length swipe can't trigger a system edge gesture (Android back/home).
// Explicit point-to-point coordinates are the author's own and aren't inset.
const MOVEMENT_INSET = 0.1;
const DEFAULT_SWIPE_DISTANCE = 0.5;
const DEFAULT_SWIPE_DURATION = 500;

// A direction is the virtual finger's motion: swiping up moves content up,
// revealing content further down the page. The from/to pair is centered on
// the surface and clamped to the inset box, so the maximum effective travel
// is 1 - 2 * MOVEMENT_INSET.
function directionToPoints(
  direction: SwipeDirection,
  distance: number = DEFAULT_SWIPE_DISTANCE
): { from: MovementPoint; to: MovementPoint } {
  const clamp = (value: number) =>
    Math.min(1 - MOVEMENT_INSET, Math.max(MOVEMENT_INSET, value));
  const near = clamp(0.5 - distance / 2);
  const far = clamp(0.5 + distance / 2);
  switch (direction) {
    case "up":
      return { from: { x: 0.5, y: far }, to: { x: 0.5, y: near } };
    case "down":
      return { from: { x: 0.5, y: near }, to: { x: 0.5, y: far } };
    case "left":
      return { from: { x: far, y: 0.5 }, to: { x: near, y: 0.5 } };
    case "right":
      return { from: { x: near, y: 0.5 }, to: { x: far, y: 0.5 } };
  }
}

function fractionsToPixels(
  rect: MovementRect,
  point: MovementPoint
): { x: number; y: number } {
  return {
    x: Math.round(rect.x + point.x * rect.width),
    y: Math.round(rect.y + point.y * rect.height),
  };
}

// One pointer movement through the wdio W3C actions builder: move to the
// start, press, a short settle pause (so touch drivers register the press as
// a drag rather than a tap), a timed move to the end, release.
async function performMovement({
  driver,
  rect,
  from,
  to,
  duration = DEFAULT_SWIPE_DURATION,
  pointerType = "mouse",
}: {
  driver: any;
  rect: MovementRect;
  from: MovementPoint;
  to: MovementPoint;
  duration?: number;
  pointerType?: "mouse" | "touch";
}): Promise<void> {
  const fromPx = fractionsToPixels(rect, from);
  const toPx = fractionsToPixels(rect, to);
  await driver
    .action("pointer", { parameters: { pointerType } })
    .move({ x: fromPx.x, y: fromPx.y })
    .down()
    .pause(50)
    .move({ duration, x: toPx.x, y: toPx.y })
    .up()
    .perform();
}

// Press-and-hold a located element through the W3C actions builder (browser
// long-press, and the Mac2 desktop path). Device web contexts (XCUITest web,
// phase A5) reject the actions endpoint — like non-left buttons, this is
// desktop-browser-only until those contexts grow actions support.
async function performElementPress({
  driver,
  element,
  button = "left",
  duration,
}: {
  driver: any;
  element: any;
  button?: string;
  duration: number;
}): Promise<void> {
  const buttonIndex =
    ({ left: 0, middle: 1, right: 2 } as Record<string, number>)[button] ?? 0;
  await driver
    .action("pointer", { parameters: { pointerType: "mouse" } })
    .move({ origin: element })
    .down({ button: buttonIndex })
    .pause(duration)
    .up({ button: buttonIndex })
    .perform();
}

async function getBrowserViewportRect(driver: any): Promise<MovementRect> {
  const [width, height] = await driver.execute(() => [
    window.innerWidth,
    window.innerHeight,
  ]);
  return { x: 0, y: 0, width, height };
}
