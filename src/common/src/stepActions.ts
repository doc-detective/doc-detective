/* eslint-disable */
/**
 * Auto-generated from step_v3.schema.json by scripts/generateTypes.cjs
 * Do not edit manually
 */

/** Every step action key, sorted. A step carries exactly one. */
export const stepActions = [
  "annotate",
  "checkFile",
  "checkLink",
  "click",
  "closeSurface",
  "dragAndDrop",
  "find",
  "goTo",
  "httpRequest",
  "loadCookie",
  "loadState",
  "loadVariables",
  "mockRequest",
  "record",
  "runBrowserScript",
  "runCode",
  "runShell",
  "saveCookie",
  "saveState",
  "screenshot",
  "startSurface",
  "stopRecord",
  "swipe",
  "type",
  "wait",
] as const;

export type StepAction = (typeof stepActions)[number];
