import { validate } from "../../common/src/validate.js";
import {
  isRelativeUrl,
  appendQueryParams,
  isDeviceWebContext,
} from "../utils.js";
import { findElement } from "./findElement.js";
import { waitForNetworkIdle, waitForDOMStable } from "./browserWait.js";
import {
  switchToSurface,
  syncHandles,
  registerOpenedHandle,
  ensureSurfaceState,
} from "./browserSurface.js";

export { goTo };

// Normalize the progressive newTab/newWindow forms to `null` (disabled) or an
// object: `true` → {} (anonymous), `"name"` → { name }, object → itself.
// `false` means explicitly disabled and normalizes to null like `undefined`.
function normalizeOpener(value: any): { name?: string; tab?: string } | null {
  if (value === undefined || value === null || value === false) return null;
  if (value === true) return {};
  if (typeof value === "string") {
    const name = value.trim();
    return name ? { name } : null;
  }
  return value;
}

// Open a URI in the browser
async function goTo({ config, step, driver }: { config: any; step: any; driver: any }) {
  let result = { status: "PASS", description: "Opened URL." };

  // Resolve to object
  if (typeof step.goTo === "string") {
    step.goTo = { url: step.goTo };
  }

  const relative = isRelativeUrl(step.goTo.url);

  // Set origin for relative URLs
  if (relative) {
    if (!step.goTo.origin && !config.origin) {
      result.status = "FAIL";
      result.description =
        "Relative URL provided without origin. Specify an origin in either the step or the config.";
      return result;
    }
    step.goTo.origin = step.goTo.origin || config.origin;
    // If there isn't the necessary slash, add it
    if (!step.goTo.origin.endsWith("/") && !step.goTo.url.startsWith("/")) {
      step.goTo.origin += "/";
    }
    step.goTo.url = step.goTo.origin + step.goTo.url;
  }

  // config.originParams only apply to URLs resolved against an origin;
  // step.goTo.params applies regardless so per-step params on absolute URLs
  // aren't silently dropped.
  //
  // Apply each source in a separate pass instead of pre-merging via
  // object spread. Spreading would convert an accidentally-array-shaped
  // input (e.g. `originParams: ["x"]`) into `{0: "x"}`, sneaking past
  // appendQueryParams's `Array.isArray` guard. Two passes route each
  // source through the guard independently. Step wins on collision
  // because the second pass dedupes against the first.
  if (relative) {
    step.goTo.url = appendQueryParams(step.goTo.url, config.originParams);
  }
  step.goTo.url = appendQueryParams(step.goTo.url, step.goTo.params);

  // Make sure there's a protocol
  if (step.goTo.url && !step.goTo.url.includes("://"))
    step.goTo.url = "https://" + step.goTo.url;

  // Validate step payload
  const isValidStep = validate({ schemaKey: "step_v3", object: step });
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = `Invalid step definition: ${isValidStep.errors}`;
    return result;
  }

  // Use the validated object
  step = isValidStep.object;

  // Apply defaults if not specified
  step.goTo.timeout = step.goTo.timeout || 30000;
  if (!step.goTo.waitUntil) {
    step.goTo.waitUntil = {
      networkIdleTime: 500,
      domIdleTime: 1000,
    };
  } else {
    if (step.goTo.waitUntil.networkIdleTime === undefined) {
      step.goTo.waitUntil.networkIdleTime = 500;
    }
    if (step.goTo.waitUntil.domIdleTime === undefined) {
      step.goTo.waitUntil.domIdleTime = 1000;
    }
  }

  // Multi-surface Phase 3/4: focus the requested session + window/tab, and
  // open a new tab/window when asked. goTo is the only step that opens
  // USER-ADDRESSABLE windows/tabs (`record` opens an internal, non-addressable
  // recorder tab) — and, per ADR 01019, the only step that opens browser
  // SESSIONS: `allowOpen` lets an unresolved browser surface launch one.
  const newTab = normalizeOpener(step.goTo.newTab);
  const newWindow = normalizeOpener(step.goTo.newWindow);
  if (step.goTo.surface !== undefined) {
    // With an opener, the surface selects the WINDOW the new tab opens in;
    // without one, it selects the tab to navigate.
    const switched = await switchToSurface(driver, step.goTo.surface, {
      allowOpen: true,
    });
    if (!switched.ok) {
      result.status = "FAIL";
      result.description = switched.message;
      return result;
    }
    driver = switched.driver ?? driver;
  }
  if (newTab || newWindow) {
    try {
      await syncHandles(driver);
      // Pre-check name collisions before creating the window so a duplicate
      // name doesn't leave an orphan tab behind.
      const state = ensureSurfaceState(driver);
      const wantedTabName = newTab?.name ?? newWindow?.tab;
      const wantedWindowName = newWindow?.name;
      if (wantedTabName && state.windows.some((w) => w.tabName === wantedTabName)) {
        result.status = "FAIL";
        result.description = `A tab named "${wantedTabName}" already exists in this browser. Tab names must be unique.`;
        return result;
      }
      if (wantedWindowName && state.windows.some((w) => w.windowName === wantedWindowName)) {
        result.status = "FAIL";
        result.description = `A window named "${wantedWindowName}" already exists in this browser. Window names must be unique.`;
        return result;
      }
      // Record the parent window (the current tab's window lead) for tabs we
      // open, so `window`-scoped selectors can find them later. A page-opened
      // current tab has no recorded parent — the new tab is then parentless too.
      let parentWindow: string | undefined;
      if (newTab) {
        const current = await driver.getWindowHandle();
        const entry = state.windows.find((w) => w.handle === current);
        parentWindow = entry?.parentWindow ?? (entry?.isWindowLead ? entry.handle : undefined);
      }
      const created = await driver.createWindow(newTab ? "tab" : "window");
      registerOpenedHandle(
        driver,
        newTab
          ? {
              handle: created.handle,
              ...(newTab.name ? { tabName: newTab.name } : {}),
              ...(parentWindow ? { parentWindow } : {}),
            }
          : {
              handle: created.handle,
              isWindowLead: true,
              ...(newWindow!.name ? { windowName: newWindow!.name } : {}),
              ...(newWindow!.tab ? { tabName: newWindow!.tab } : {}),
            }
      );
      await driver.switchToWindow(created.handle);
    } catch (error: any) {
      result.status = "FAIL";
      result.description = `Couldn't open new ${newTab ? "tab" : "window"}: ${error.message}`;
      return result;
    }
  }

  // Run action
  try {
    await driver.url(step.goTo.url);

    // Wait for page to load with wait logic
    const waitStartTime = Date.now();
    const waitTimeout = step.goTo.timeout;
    const waitConditions = {
      networkIdle: step.goTo.waitUntil.networkIdleTime !== null,
      domStable: step.goTo.waitUntil.domIdleTime !== null,
      elementFound: !!step.goTo.waitUntil.find,
    };
    const waitResults = {
      documentReady: { passed: false, message: "" },
      networkIdle: { passed: false, message: "" },
      domStable: { passed: false, message: "" },
      elementFound: { passed: false, message: "" },
    };

    try {
      // 1. Wait for document ready
      await driver.waitUntil(
        async () => {
          const readyState = await driver.execute(() => {
            return document.readyState;
          });
          return readyState === "complete";
        },
        { timeout: waitTimeout }
      );
      waitResults.documentReady.passed = true;
      waitResults.documentReady.message = "Document ready";
      await driver.pause(100); // Small pause to allow for rendering

      // Calculate remaining time
      const elapsedTime = Date.now() - waitStartTime;
      const remainingTimeout = waitTimeout - elapsedTime;

      if (remainingTimeout <= 0) {
        throw new Error("Timeout exceeded before document ready");
      }

      // 2, 3, & 4. Wait for network idle, DOM stable, and element in parallel
      const parallelChecks: Promise<void>[] = [];

      /* c8 ignore start - the `else` arm below (and the `!== null` half of this condition) is
       * structurally dead through the public goTo() entry point: the goTo_v3 schema types
       * networkIdleTime as `anyOf: [integer, null]` with the integer branch listed first, so
       * AJV's coerceTypes coerces an explicit step-level `null` to `0` during validate() before
       * this code ever runs -- `step.goTo.waitUntil.networkIdleTime` can never actually be `null`
       * here, only 0-or-greater. No input a caller can construct reaches the `else` (ADR 01017). */
      if (
        waitConditions.networkIdle &&
        step.goTo.waitUntil.networkIdleTime !== null
      ) {
        parallelChecks.push(
          waitForNetworkIdle(
            driver,
            step.goTo.waitUntil.networkIdleTime,
            remainingTimeout
          )
            .then(() => {
              waitResults.networkIdle.passed = true;
              waitResults.networkIdle.message = `Network idle (${step.goTo.waitUntil.networkIdleTime}ms)`;
            })
            .catch((error: any) => {
              waitResults.networkIdle.message = `Network idle timeout: ${error.message}`;
              throw error;
            })
        );
      } else {
        waitResults.networkIdle.passed = true;
        waitResults.networkIdle.message = "Network idle check skipped (null)";
      }
      /* c8 ignore stop */

      /* c8 ignore start - the `else` arm below (and the `!== null` half of this condition) is
       * structurally dead through the public goTo() entry point: the goTo_v3 schema types
       * domIdleTime as `anyOf: [integer, null]` with the integer branch listed first, so AJV's
       * coerceTypes coerces an explicit step-level `null` to `0` during validate() before this
       * code ever runs -- `step.goTo.waitUntil.domIdleTime` can never actually be `null` here,
       * only 0-or-greater. No input a caller can construct reaches the `else` (ADR 01017). */
      if (
        waitConditions.domStable &&
        step.goTo.waitUntil.domIdleTime !== null
      ) {
        parallelChecks.push(
          waitForDOMStable(
            driver,
            step.goTo.waitUntil.domIdleTime,
            remainingTimeout
          )
            .then(() => {
              waitResults.domStable.passed = true;
              waitResults.domStable.message = `DOM stable (${step.goTo.waitUntil.domIdleTime}ms)`;
            })
            .catch((error: any) => {
              waitResults.domStable.message = `DOM stability timeout: ${error.message}`;
              throw error;
            })
        );
      } else {
        waitResults.domStable.passed = true;
        waitResults.domStable.message = "DOM stability check skipped (null)";
      }
      /* c8 ignore stop */

      // Add element search to parallel checks
      if (waitConditions.elementFound && step.goTo.waitUntil.find) {
        parallelChecks.push(
          (async () => {
            try {
              // Construct a findElement step with the timeout
              const findStep = {
                action: "find",
                find: {
                  ...step.goTo.waitUntil.find,
                  timeout: remainingTimeout,
                },
              };

              const findResult = await findElement({
                config,
                step: findStep,
                driver,
              });

              if (findResult.status === "PASS") {
                waitResults.elementFound.passed = true;
                const selectorMsg = step.goTo.waitUntil.find.selector
                  ? `selector: "${step.goTo.waitUntil.find.selector}"`
                  : "";
                const textMsg = step.goTo.waitUntil.find.elementText
                  ? `text: "${step.goTo.waitUntil.find.elementText}"`
                  : "";
                const combinedMsg = [selectorMsg, textMsg]
                  .filter((m: any) => m)
                  .join(", ");
                waitResults.elementFound.message = `Element found (${combinedMsg})`;
              } else {
                throw new Error(findResult.description);
              }
            } catch (error: any) {
              const selectorMsg = step.goTo.waitUntil.find.selector
                ? `selector: "${step.goTo.waitUntil.find.selector}"`
                : "";
              const textMsg = step.goTo.waitUntil.find.elementText
                ? `text: "${step.goTo.waitUntil.find.elementText}"`
                : "";
              const combinedMsg = [selectorMsg, textMsg]
                .filter((m: any) => m)
                .join(", ");
              waitResults.elementFound.message = `Element not found (${combinedMsg})`;
              throw error;
            }
          })()
        );
      } else {
        waitResults.elementFound.passed = true;
        waitResults.elementFound.message = "Element search not requested";
      }

      // Wait for all checks to complete
      if (parallelChecks.length > 0) {
        const results = await Promise.allSettled(parallelChecks);
        // Check if any checks failed
        const failures = results.filter((r) => r.status === "rejected");
        if (failures.length > 0) {
          // Throw the first error to trigger the catch block
          // All waitResults have been updated by individual catch blocks
          throw (failures[0] as PromiseRejectedResult).reason;
        }
      }

      // Device-web post-navigation settle (ADR 01044). goTo's readiness gate
      // above queries the JS bridge (document.readyState / network / DOM), a
      // SEPARATE path from the WebDriver element tree (the remote-debugger DOM
      // the next `find` walks). On a freshly-built WDA under macOS-runner load,
      // an iOS Safari (XCUITest web) context can momentarily hand back an EMPTY
      // element tree right after navigation even though readyState already
      // reports "complete" — so the first `find` after goTo can spuriously miss.
      //
      // Bound-wait for the element tree to become queryable before returning,
      // reusing the driver's own waitUntil (returns as soon as satisfied — NOT a
      // fixed sleep). Gated as tightly as possible to device web contexts, so
      // desktop (and every app context) keeps a byte-identical control path with
      // no added latency. This is best-effort: it does not weaken the gate above
      // and never fails goTo — if the ceiling elapses we still hand control to
      // `find`, which owns the real "element genuinely absent" verdict via its
      // own wait.
      if (isDeviceWebContext(driver)) {
        try {
          const remaining = waitTimeout - (Date.now() - waitStartTime);
          const settleCeiling = Math.max(0, Math.min(3000, remaining));
          if (settleCeiling > 0) {
            await driver.waitUntil(
              async () => {
                try {
                  const elements = await driver.$$("body *");
                  return Array.isArray(elements)
                    ? elements.length > 0
                    : !!elements;
                } catch {
                  return false;
                }
              },
              { timeout: settleCeiling }
            );
          }
        } catch {
          // Ceiling elapsed with the tree still empty: proceed anyway. find's
          // own wait remains the authority on a genuinely-absent element.
        }
      }

      result.description = "Opened URL and all wait conditions met.";
    } catch (waitError: any) {
      // Detailed error reporting
      const totalElapsed = Date.now() - waitStartTime;
      let errorMessage = `goTo action timed out after ${totalElapsed}ms\n`;

      // Add status for each condition
      if (waitResults.documentReady.passed) {
        errorMessage += `✓ ${waitResults.documentReady.message}\n`;
      } else {
        errorMessage += `✗ Document not ready\n`;
      }

      if (waitConditions.networkIdle) {
        if (waitResults.networkIdle.passed) {
          errorMessage += `✓ ${waitResults.networkIdle.message}\n`;
        } else {
          errorMessage += `✗ ${waitResults.networkIdle.message}\n`;
        }
      }

      if (waitConditions.domStable) {
        if (waitResults.domStable.passed) {
          errorMessage += `✓ ${waitResults.domStable.message}\n`;
        } else {
          errorMessage += `✗ ${waitResults.domStable.message}\n`;
        }
      }

      if (waitConditions.elementFound) {
        if (waitResults.elementFound.passed) {
          errorMessage += `✓ ${waitResults.elementFound.message}\n`;
        } else {
          errorMessage += `✗ ${waitResults.elementFound.message}\n`;
        }
      }

      result.status = "FAIL";
      result.description = errorMessage.trim();
      return result;
    }
  } catch (error: any) {
    // FAIL: Error opening URL
    result.status = "FAIL";
    result.description = `Couldn't open URL: ${error.message}`;
    return result;
  }

  // PASS
  return result;
}
