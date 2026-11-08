/* eslint-disable */
/**
 * Auto-generated from step_v3.schema.json by scripts/generateTypes.cjs
 * Do not edit manually
 */

/** Every step action key, sorted. A step carries exactly one. */
export const stepActions = [
  "annotate",
  "checkLink",
  "click",
  "closeSurface",
  "dragAndDrop",
  "find",
  "goTo",
  "httpRequest",
  "loadCookie",
  "loadVariables",
  "record",
  "runBrowserScript",
  "runCode",
  "runShell",
  "saveCookie",
  "screenshot",
  "startSurface",
  "stopRecord",
  "swipe",
  "type",
  "wait",
] as const;

export type StepAction = (typeof stepActions)[number];
