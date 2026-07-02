export { waitForNetworkIdle, waitForDOMStable };

// Page-readiness probes shared by goTo (navigation waitUntil) and typeKeys
// (browser-surface waitUntil). Moved out of goTo.ts so typeKeys can reuse
// them without a goTo → findElement → typeKeys → goTo import cycle.

/**
 * Wait for network activity to be idle for a specified duration.
 * Uses a polling approach to check for network requests.
 */
async function waitForNetworkIdle(driver: any, idleTime: any, timeout: any) {
  const startTime = Date.now(); // Only for Node.js timeout tracking

  // Initialize monitor with browser time only
  await driver.execute(() => {
    if (!(window as any).__docDetectiveNetworkMonitor) {
      const originalFetch = window.fetch;
      const originalXHROpen = XMLHttpRequest.prototype.open;

      (window as any).__docDetectiveNetworkMonitor = {
        lastRequestTime: Date.now(), // Use browser time
        requestCount: 0,
        startTime: Date.now(), // Track start in browser
        originalFetch: originalFetch,
        originalXHROpen: originalXHROpen,
      };

      window.fetch = function (...args: any[]) {
        (window as any).__docDetectiveNetworkMonitor.lastRequestTime = Date.now();
        (window as any).__docDetectiveNetworkMonitor.requestCount++;
        return originalFetch.apply(this, args as [RequestInfo | URL, RequestInit?]);
      };

      XMLHttpRequest.prototype.open = function (...args: any[]) {
        (window as any).__docDetectiveNetworkMonitor.lastRequestTime = Date.now();
        (window as any).__docDetectiveNetworkMonitor.requestCount++;
        return originalXHROpen.apply(this, args as [string, string | URL, boolean, (string | null)?, (string | null)?]);
      };
    }
  });

  // Fast path: check after 100ms
  await new Promise((resolve) => setTimeout(resolve, 100));
  const initialCheck = await driver.execute(() => {
    const monitor = (window as any).__docDetectiveNetworkMonitor;
    const now = Date.now();
    return {
      idleFor: now - monitor.lastRequestTime,
      requestCount: monitor.requestCount,
    };
  });

  if (initialCheck.idleFor >= idleTime && initialCheck.requestCount === 0) {
    // Clean up network monitor
    await driver.execute(() => {
      if ((window as any).__docDetectiveNetworkMonitor) {
        // Restore original methods if they were patched
        if ((window as any).__docDetectiveNetworkMonitor.originalFetch) {
          window.fetch = (window as any).__docDetectiveNetworkMonitor.originalFetch;
        }
        if ((window as any).__docDetectiveNetworkMonitor.originalXHROpen) {
          XMLHttpRequest.prototype.open = (window as any).__docDetectiveNetworkMonitor.originalXHROpen;
        }
        delete (window as any).__docDetectiveNetworkMonitor;
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
          if ((window as any).__docDetectiveNetworkMonitor) {
            // Restore original methods if they were patched
            if ((window as any).__docDetectiveNetworkMonitor.originalFetch) {
              window.fetch = (window as any).__docDetectiveNetworkMonitor.originalFetch;
            }
            if ((window as any).__docDetectiveNetworkMonitor.originalXHROpen) {
              XMLHttpRequest.prototype.open = (window as any).__docDetectiveNetworkMonitor.originalXHROpen;
            }
            delete (window as any).__docDetectiveNetworkMonitor;
          }
        });
        throw new Error("Network idle timeout exceeded");
      }

      const state = await driver.execute(() => {
        const monitor = (window as any).__docDetectiveNetworkMonitor;
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
      if ((window as any).__docDetectiveNetworkMonitor) {
        // Restore original methods if they were patched
        if ((window as any).__docDetectiveNetworkMonitor.originalFetch) {
          window.fetch = (window as any).__docDetectiveNetworkMonitor.originalFetch;
        }
        if ((window as any).__docDetectiveNetworkMonitor.originalXHROpen) {
          XMLHttpRequest.prototype.open = (window as any).__docDetectiveNetworkMonitor.originalXHROpen;
        }
        delete (window as any).__docDetectiveNetworkMonitor;
      }
    });
  }
}

/**
 * Wait for the DOM to stop mutating for a specified duration.
 * Uses MutationObserver to detect changes.
 */
async function waitForDOMStable(driver: any, idleTime: any, timeout: any) {
  const startTime = Date.now(); // Only for Node.js timeout tracking

  // Initialize monitor with browser time only
  await driver.execute(() => {
    if (!(window as any).__docDetectiveDOMMonitor) {
      (window as any).__docDetectiveDOMMonitor = {
        lastMutationTime: Date.now(), // Use browser time
        mutationCount: 0,
        startTime: Date.now(), // Track start in browser
        observer: null,
      };

      const observer = new MutationObserver(() => {
        (window as any).__docDetectiveDOMMonitor.lastMutationTime = Date.now();
        (window as any).__docDetectiveDOMMonitor.mutationCount++;
      });

      // Observe all changes to the body and its descendants. Fall back to
      // documentElement when body isn't attached yet (can happen immediately
      // after navigation), so observe() never throws on a null target.
      observer.observe(document.body ?? document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      (window as any).__docDetectiveDOMMonitor.observer = observer;
    }
  });

  // Fast path: check after 100ms
  await new Promise((resolve) => setTimeout(resolve, 100));
  const initialCheck = await driver.execute(() => {
    const monitor = (window as any).__docDetectiveDOMMonitor;
    const now = Date.now();
    return {
      idleFor: now - monitor.lastMutationTime,
      mutationCount: monitor.mutationCount,
    };
  });

  if (initialCheck.idleFor >= idleTime && initialCheck.mutationCount === 0) {
    // Clean up observer
    await driver.execute(() => {
      if ((window as any).__docDetectiveDOMMonitor?.observer) {
        (window as any).__docDetectiveDOMMonitor.observer.disconnect();
        delete (window as any).__docDetectiveDOMMonitor;
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
          if ((window as any).__docDetectiveDOMMonitor?.observer) {
            (window as any).__docDetectiveDOMMonitor.observer.disconnect();
            delete (window as any).__docDetectiveDOMMonitor;
          }
        });
        throw new Error("DOM stability timeout exceeded");
      }

      const state = await driver.execute(() => {
        const monitor = (window as any).__docDetectiveDOMMonitor;
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
          if ((window as any).__docDetectiveDOMMonitor?.observer) {
            (window as any).__docDetectiveDOMMonitor.observer.disconnect();
            delete (window as any).__docDetectiveDOMMonitor;
          }
        });
        break; // DOM stable achieved
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } catch (error: any) {
    // Clean up observer before re-throwing
    await driver.execute(() => {
      if ((window as any).__docDetectiveDOMMonitor?.observer) {
        (window as any).__docDetectiveDOMMonitor.observer.disconnect();
        delete (window as any).__docDetectiveDOMMonitor;
      }
    });
    throw new Error(`DOM stability check failed: ${error.message}`, {
      cause: error,
    });
  }
}
