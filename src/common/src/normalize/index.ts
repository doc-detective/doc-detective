// Step normalization (ADR 01167). validate() runs it on its own clone after the
// schema check passes, so it returns the effective step: shorthand expanded,
// deprecated keys renamed, scalars canonicalized, and defaults filled.
//
// Each action has one normalizer, in this folder, named for the action. It gets
// the action's value, that value's path, and the step (read-only: a capture
// names its file for `stepId`), and returns the normalized value.
// In order, it:
//   1. expands shorthand to the object form;
//   2. renames deprecated aliases (renameAliases);
//   3. canonicalizes scalars;
//   4. applies defaults: plain ones from the schema (applyDefaults), and
//      conditional ones in code.
// It must be idempotent, and it never touches $VAR or $$ values, paths, config,
// or runtime state. Step-level keys stay as authored.
import annotate from "./annotate.js";
import checkLink from "./checkLink.js";
import click from "./click.js";
import closeSurface from "./closeSurface.js";
import dragAndDrop from "./dragAndDrop.js";
import find from "./find.js";
import goTo from "./goTo.js";
import httpRequest from "./httpRequest.js";
import loadCookie from "./loadCookie.js";
import loadVariables from "./loadVariables.js";
import record from "./record.js";
import runBrowserScript from "./runBrowserScript.js";
import runCode from "./runCode.js";
import runShell from "./runShell.js";
import saveCookie from "./saveCookie.js";
import screenshot from "./screenshot.js";
import startSurface from "./startSurface.js";
import stopRecord from "./stopRecord.js";
import swipe from "./swipe.js";
import typeAction from "./type.js";
import wait from "./wait.js";

export { NormalizeError } from "./helpers.js";

export const normalizers: Record<string, (value: any, path: string, step: any) => any> = {
  annotate,
  checkLink,
  click,
  closeSurface,
  dragAndDrop,
  find,
  goTo,
  httpRequest,
  loadCookie,
  loadVariables,
  record,
  runBrowserScript,
  runCode,
  runShell,
  saveCookie,
  screenshot,
  startSurface,
  stopRecord,
  swipe,
  type: typeAction,
  wait,
};

// A valid step has exactly one action.
function normalizeStep(step: any, path: string) {
  const action = Object.keys(normalizers).find((name) => name in step)!;
  step[action] = normalizers[action](step[action], path + action, step);
}

// Authored steps only. A test's `contexts` hold resolved steps from a report.
function normalizeTest(test: any, path: string) {
  test.steps?.forEach((step: any, i: number) => normalizeStep(step, `${path}steps[${i}].`));
}

/** Normalize, in place, every step in a valid object of a schema that holds steps. */
export function normalize(schemaKey: string, object: any) {
  if (schemaKey === "step_v3") normalizeStep(object, "");
  else if (schemaKey === "test_v3") normalizeTest(object, "");
  else if (schemaKey === "spec_v3") object.tests.forEach((test: any, i: number) => normalizeTest(test, `tests[${i}].`));
}
