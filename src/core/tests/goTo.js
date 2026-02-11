const { validate } = require("doc-detective-common");
const { isRelativeUrl } = require("../utils");
const { findElement } = require("./findElement");

exports.goTo = goTo;

// Open a URI in the browser
async function goTo({ config, step, driver }) {
  let result = { status: "PASS", description: "Opened URL." };

  // Resolve to object
  if (typeof step.goTo === "string") {
    step.goTo = { url: step.goTo };
  }

  // Set origin for relative URLs
  if (isRelativeUrl(step.goTo.url)) {
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

  // Fill in defaults for any missing properties
  if (step.goTo.waitUntil.networkIdleTime === undefined) {
    step.goTo.waitUntil.networkIdleTime = 500;
  }
  if (step.goTo.waitUntil.domIdleTime === undefined) {
    step.goTo.waitUntil.domIdleTime = 1000;
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
      const parallelChecks = [];

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
            .catch((error) => {
              waitResults.networkIdle.message = `Network idle timeout: ${error.message}`;
              throw error;
            })
        );
      } else {
        waitResults.networkIdle.passed = true;
        waitResults.networkIdle.message = "Network idle check skipped (null)";
      }

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
            .catch((error) => {
              waitResults.domStable.message = `DOM stability timeout: ${error.message}`;
              throw error;
            })
        );
      } else {
        waitResults.domStable.passed = true;
        waitResults.domStable.message = "DOM stability check skipped (null)";
      }

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
                  .filter((m) => m)
                  .join(", ");
                waitResults.elementFound.message = `Element found (${combinedMsg})`;
              } else {
                throw new Error(findResult.description);
              }
            } catch (error) {
              const selectorMsg = step.goTo.waitUntil.find.selector
                ? `selector: "${step.goTo.waitUntil.find.selector}"`
                : "";
              const textMsg = step.goTo.waitUntil.find.elementText
                ? `text: "${step.goTo.waitUntil.find.elementText}"`
                : "";
              const combinedMsg = [selectorMsg, textMsg]
                .filter((m) => m)
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
          throw failures[0].reason;
        }
      }

      result.description = "Opened URL and all wait conditions met.";
    } catch (waitError) {
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
  } catch (error) {
    // FAIL: Error opening URL
    result.status = "FAIL";
    result.description = `Couldn't open URL: ${error.message}`;
    return result;
  }

  // PASS
  return result;
}

/**
 * Wait for network activity to be idle for a specified duration.
 * Uses a polling approach to check for network requests.
 */
async function waitForNetworkIdle(driver, idleTime, timeout) {
  const startTime = Date.now(); // Only for Node.js timeout tracking

  // Initialize monitor with browser time only
  await driver.execute(() => {
    if (!window.__docDetectiveNetworkMonitor) {
      const originalFetch = window.fetch;
      const originalXHROpen = XMLHttpRequest.prototype.open;
      
      window.__docDetectiveNetworkMonitor = {
        lastRequestTime: Date.now(), // Use browser time
        requestCount: 0,
        startTime: Date.now(), // Track start in browser
        originalFetch: originalFetch,
        originalXHROpen: originalXHROpen,
      };

      window.fetch = function (...args) {
        window.__docDetectiveNetworkMonitor.lastRequestTime = Date.now();
        window.__docDetectiveNetworkMonitor.requestCount++;
        return originalFetch.apply(this, args);
      };

      XMLHttpRequest.prototype.open = function (...args) {
        window.__docDetectiveNetworkMonitor.lastRequestTime = Date.now();
        window.__docDetectiveNetworkMonitor.requestCount++;
        return originalXHROpen.apply(this, args);
      };
    }
  });

  // Fast path: check after 100ms
  await new Promise((resolve) => setTimeout(resolve, 100));
  const initialCheck = await driver.execute(() => {
    const monitor = window.__docDetectiveNetworkMonitor;
    const now = Date.now();
    return {
      idleFor: now - monitor.lastRequestTime,
      requestCount: monitor.requestCount,
    };
  });

  if (initialCheck.idleFor >= idleTime && initialCheck.requestCount === 0) {
    // Clean up network monitor
    await driver.execute(() => {
      if (window.__docDetectiveNetworkMonitor) {
        // Restore original methods if they were patched
        if (window.__docDetectiveNetworkMonitor.originalFetch) {
          window.fetch = window.__docDetectiveNetworkMonitor.originalFetch;
        }
        if (window.__docDetectiveNetworkMonitor.originalXHROpen) {
          XMLHttpRequest.prototype.open = window.__docDetectiveNetworkMonitor.originalXHROpen;
        }
        delete window.__docDetectiveNetworkMonitor;
      }
    });
    return; // Fast path
  }

  // Poll with browser-based time checks
  try {
    while (true) {
      if (Date.now() - startTime > timeout) {
        // Clean up network monitor before throwing
        await driver.execute(() => {
          if (window.__docDetectiveNetworkMonitor) {
            // Restore original methods if they were patched
            if (window.__docDetectiveNetworkMonitor.originalFetch) {
              window.fetch = window.__docDetectiveNetworkMonitor.originalFetch;
            }
            if (window.__docDetectiveNetworkMonitor.originalXHROpen) {
              XMLHttpRequest.prototype.open = window.__docDetectiveNetworkMonitor.originalXHROpen;
            }
            delete window.__docDetectiveNetworkMonitor;
          }
        });
        throw new Error("Network idle timeout exceeded");
      }

      const state = await driver.execute(() => {
        const monitor = window.__docDetectiveNetworkMonitor;
        const now = Date.now();
        return {
          idleFor: now - monitor.lastRequestTime,
          elapsedTotal: now - monitor.startTime,
        };
      });

      if (state.idleFor >= idleTime) {
        break; // Network idle achieved
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } finally {
    // Always clean up network monitor
    await driver.execute(() => {
      if (window.__docDetectiveNetworkMonitor) {
        // Restore original methods if they were patched
        if (window.__docDetectiveNetworkMonitor.originalFetch) {
          window.fetch = window.__docDetectiveNetworkMonitor.originalFetch;
        }
        if (window.__docDetectiveNetworkMonitor.originalXHROpen) {
          XMLHttpRequest.prototype.open = window.__docDetectiveNetworkMonitor.originalXHROpen;
        }
        delete window.__docDetectiveNetworkMonitor;
      }
    });
  }
}

/**
 * Wait for the DOM to stop mutating for a specified duration.
 * Uses MutationObserver to detect changes.
 */
async function waitForDOMStable(driver, idleTime, timeout) {
  const startTime = Date.now(); // Only for Node.js timeout tracking

  // Initialize monitor with browser time only
  await driver.execute(() => {
    if (!window.__docDetectiveDOMMonitor) {
      window.__docDetectiveDOMMonitor = {
        lastMutationTime: Date.now(), // Use browser time
        mutationCount: 0,
        startTime: Date.now(), // Track start in browser
        observer: null,
      };

      const observer = new MutationObserver(() => {
        window.__docDetectiveDOMMonitor.lastMutationTime = Date.now();
        window.__docDetectiveDOMMonitor.mutationCount++;
      });

      // Observe all changes to the body and its descendants
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      window.__docDetectiveDOMMonitor.observer = observer;
    }
  });

  // Fast path: check after 100ms
  await new Promise((resolve) => setTimeout(resolve, 100));
  const initialCheck = await driver.execute(() => {
    const monitor = window.__docDetectiveDOMMonitor;
    const now = Date.now();
    return {
      idleFor: now - monitor.lastMutationTime,
      mutationCount: monitor.mutationCount,
    };
  });

  if (initialCheck.idleFor >= idleTime && initialCheck.mutationCount === 0) {
    // Clean up observer
    await driver.execute(() => {
      if (window.__docDetectiveDOMMonitor?.observer) {
        window.__docDetectiveDOMMonitor.observer.disconnect();
        delete window.__docDetectiveDOMMonitor;
      }
    });
    return; // Fast path
  }

  // Poll with browser-based time checks
  try {
    while (true) {
      if (Date.now() - startTime > timeout) {
        // Clean up observer before throwing
        await driver.execute(() => {
          if (window.__docDetectiveDOMMonitor?.observer) {
            window.__docDetectiveDOMMonitor.observer.disconnect();
            delete window.__docDetectiveDOMMonitor;
          }
        });
        throw new Error("DOM stability timeout exceeded");
      }

      const state = await driver.execute(() => {
        const monitor = window.__docDetectiveDOMMonitor;
        const now = Date.now();
        return {
          idleFor: now - monitor.lastMutationTime,
          elapsedTotal: now - monitor.startTime,
          mutationCount: monitor.mutationCount,
        };
      });

      if (state.idleFor >= idleTime) {
        // Clean up observer before returning
        await driver.execute(() => {
          if (window.__docDetectiveDOMMonitor?.observer) {
            window.__docDetectiveDOMMonitor.observer.disconnect();
            delete window.__docDetectiveDOMMonitor;
          }
        });
        break; // DOM stable achieved
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } catch (error) {
    // Clean up observer before re-throwing
    await driver.execute(() => {
      if (window.__docDetectiveDOMMonitor?.observer) {
        window.__docDetectiveDOMMonitor.observer.disconnect();
        delete window.__docDetectiveDOMMonitor;
      }
    });
    throw new Error(`DOM stability check failed: ${error.message}`, {
      cause: error,
    });
  }
}
