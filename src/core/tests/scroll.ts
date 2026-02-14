export { scroll };

/**
 * Perform a scroll action on the page or skip if no recordings are active.
 *
 * Attempts to scroll the page using `action.x` and `action.y`. If both
 * `config.videoDetails` and `config.debugRecording` are empty objects the
 * action is skipped.
 *
 * @param action - Object with numeric `x` and `y` delta values for the wheel scroll
 * @param page - Page-like object exposing `mouse.wheel({ deltaX, deltaY })`
 * @param config - Configuration containing `videoDetails` and `debugRecording` objects
 * @returns An object `{ result }` where `result` contains:
 *          - `status`: `'PASS'` when skipped or scroll succeeds, `'FAIL'` when scroll fails
 *          - `description`: human-readable explanation of the outcome
 */
async function scroll(action: any, page: any, config: any) {
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
    status = "FAIL";
    description = `Couldn't scroll.`;
    result = { status, description };
    return { result };
  }
}