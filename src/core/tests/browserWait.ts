export { waitForNetworkIdle, waitForDOMStable };

// Page-readiness probes shared by goTo (navigation waitUntil) and typeKeys
// (browser-surface waitUntil). Moved out of goTo.ts so typeKeys can reuse
// them without a goTo → findElement → typeKeys → goTo import cycle.
//
// Both probes inject a monitor global and poll it. The poll treats a MISSING
// monitor as "the page changed under us" (a navigation/redirect completing
// mid-wait replaces the window and wipes the global — observed on Safari,
// including the phase A5 XCUITest web context) and re-injects instead of
// throwing, so a page swap restarts the measurement rather than failing the
// whole navigation wait.

// Inject the network monitor global (idempotent per page).
async function injectNetworkMonitor(driver: any) {
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
}

// Remove the network monitor and restore the patched globals (idempotent —
// a fresh page without the monitor is a no-op).
async function cleanupNetworkMonitor(driver: any) {
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

/**
 * Wait for network activity to be idle for a specified duration.
 * Uses a polling approach to check for network requests.
 */
async function waitForNetworkIdle(driver: any, idleTime: any, timeout: any) {
  const startTime = Date.now(); // Only for Node.js timeout tracking

  await injectNetworkMonitor(driver);

  // Fast path: check after 100ms. `null` = the monitor global vanished (page
  // swap) — fall through to the poll loop, which re-injects.
  await new Promise((resolve) => setTimeout(resolve, 100));
  const initialCheck = await driver.execute(() => {
    const monitor = (window as any).__docDetectiveNetworkMonitor;
    if (!monitor) return null;
    const now = Date.now();
    return {
      idleFor: now - monitor.lastRequestTime,
      requestCount: monitor.requestCount,
    };
  });

  if (
    initialCheck &&
    initialCheck.idleFor >= idleTime &&
    initialCheck.requestCount === 0
  ) {
    await cleanupNetworkMonitor(driver);
    return; // Fast path
  }

  // Poll with browser-based time checks
  try {
    let needsInject = !initialCheck;
    while (true) {
      if (Date.now() - startTime > timeout) {
        throw new Error("Network idle timeout exceeded");
      }

      if (needsInject) {
        // The page changed under the wait; re-arm the monitor on the new
        // page and keep polling (the idle measurement restarts there).
        await injectNetworkMonitor(driver);
        needsInject = false;
      }

      const state = await driver.execute(() => {
        const monitor = (window as any).__docDetectiveNetworkMonitor;
        if (!monitor) return null;
        const now = Date.now();
        return {
          idleFor: now - monitor.lastRequestTime,
          elapsedTotal: now - monitor.startTime,
        };
      });

      if (state === null || state === undefined) {
        needsInject = true;
        continue;
      }

      if (state.idleFor >= idleTime) {
        break; // Network idle achieved
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } finally {
    // Always clean up network monitor
    await cleanupNetworkMonitor(driver);
  }
}

// Inject the DOM-mutation monitor global (idempotent per page).
async function injectDOMMonitor(driver: any) {
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
}

// Disconnect and remove the DOM monitor (idempotent).
async function cleanupDOMMonitor(driver: any) {
  await driver.execute(() => {
    if ((window as any).__docDetectiveDOMMonitor?.observer) {
      (window as any).__docDetectiveDOMMonitor.observer.disconnect();
    }
    delete (window as any).__docDetectiveDOMMonitor;
  });
}

/**
 * Wait for the DOM to stop mutating for a specified duration.
 * Uses a MutationObserver to detect changes.
 */
async function waitForDOMStable(driver: any, idleTime: any, timeout: any) {
  const startTime = Date.now(); // Only for Node.js timeout tracking

  await injectDOMMonitor(driver);

  // Fast path: check after 100ms. `null` = the monitor global vanished (page
  // swap) — fall through to the poll loop, which re-injects.
  await new Promise((resolve) => setTimeout(resolve, 100));
  const initialCheck = await driver.execute(() => {
    const monitor = (window as any).__docDetectiveDOMMonitor;
    if (!monitor) return null;
    const now = Date.now();
    return {
      idleFor: now - monitor.lastMutationTime,
      mutationCount: monitor.mutationCount,
    };
  });

  if (
    initialCheck &&
    initialCheck.idleFor >= idleTime &&
    initialCheck.mutationCount === 0
  ) {
    await cleanupDOMMonitor(driver);
    return; // Fast path
  }

  // Poll with browser-based time checks
  try {
    let needsInject = !initialCheck;
    while (true) {
      if (Date.now() - startTime > timeout) {
        throw new Error("DOM stability timeout exceeded");
      }

      if (needsInject) {
        // The page changed under the wait; re-arm the observer on the new
        // page and keep polling (the stability measurement restarts there).
        await injectDOMMonitor(driver);
        needsInject = false;
      }

      const state = await driver.execute(() => {
        const monitor = (window as any).__docDetectiveDOMMonitor;
        if (!monitor) return null;
        const now = Date.now();
        return {
          idleFor: now - monitor.lastMutationTime,
          elapsedTotal: now - monitor.startTime,
          mutationCount: monitor.mutationCount,
        };
      });

      if (state === null || state === undefined) {
        needsInject = true;
        continue;
      }

      if (state.idleFor >= idleTime) {
        break; // DOM stable achieved
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } catch (error: any) {
    // Clean up the observer before re-throwing. Every failure keeps the
    // established "DOM stability check failed" wording (including the plain
    // timeout, matching the pre-refactor contract goTo callers assert on).
    await cleanupDOMMonitor(driver);
    throw new Error(`DOM stability check failed: ${error.message}`, {
      cause: error,
    });
  }
  await cleanupDOMMonitor(driver);
}
