import { createServer } from "./server/index.js";

const server = createServer({
  port: 8092,
  staticDir: "./test/server/public",
  modifyResponse: (req, body) => {
    return { ...body, extraField: "added by server" };
  },
});

const apiServer = createServer({
  port: 8093,
  staticDir: "./test/server/public",
});

// Late unhandled rejections from WebdriverIO's HTTP client (fired after
// deleteSession's try/catch has resolved, when in-flight requests lose
// their socket as kill(appium.pid) tears down the Appium tree) can kill
// the mocha process with exit 1 before the reporter flushes. Observed on
// Windows + Node 24; microtask-scheduling differences make the other
// matrix legs settle the rejection inside the suppressed try/catch.
//
// Handlers below are narrowly scoped: only suppress rejections shaped
// like a WebDriver/Appium teardown race. For every other unhandled
// rejection or uncaught exception we still log the stack AND set
// process.exitCode = 1, so mocha flushes its reporter but the run
// still fails — nothing masked.
function isWebDriverTeardownError(reason) {
  if (!reason) return false;
  const text = [reason.name, reason.message, reason.stack]
    .filter(Boolean)
    .join(" ");
  if (!/WebDriver(Error|RequestError)/.test(text)) return false;
  if (!/(ECONNREFUSED|ECONNRESET|socket hang up)/.test(text)) return false;
  // Session CREATION (POST /session) is NOT teardown — a ECONNREFUSED here
  // means the new Appium isn't ready yet, and the test genuinely cannot
  // proceed. Let that propagate as a real failure rather than swallowing
  // it silently and leaving the caller with a truncated result object.
  if (/method[:\s"']+POST/i.test(text)) return false;
  return true;
}

function onUnhandledRejection(reason) {
  const stack = reason && reason.stack ? reason.stack : String(reason);
  if (isWebDriverTeardownError(reason)) {
    console.error(
      `[test/hooks] WebDriver teardown rejection (non-fatal):\n${stack}`
    );
    return;
  }
  console.error(`[test/hooks] unhandledRejection (failing run):\n${stack}`);
  process.exitCode = 1;
}

function onUncaughtException(err) {
  const stack = err && err.stack ? err.stack : String(err);
  if (isWebDriverTeardownError(err)) {
    console.error(
      `[test/hooks] WebDriver teardown exception (non-fatal):\n${stack}`
    );
    return;
  }
  console.error(`[test/hooks] uncaughtException (failing run):\n${stack}`);
  process.exitCode = 1;
}

export const mochaHooks = {
  async beforeAll() {
    process.on("unhandledRejection", onUnhandledRejection);
    process.on("uncaughtException", onUncaughtException);
    for (const [name, s] of [["main", server], ["API", apiServer]]) {
      try {
        await s.start();
      } catch (error) {
        if (error.code === "EADDRINUSE") {
          console.log(`Test server (${name}) already running`);
        } else {
          throw error;
        }
      }
    }
  },
  async afterAll() {
    for (const s of [server, apiServer]) {
      try {
        await s.stop();
      } catch (error) {
        console.error(`Failed to stop test server: ${error.message}`);
      }
    }
    process.off("unhandledRejection", onUnhandledRejection);
    process.off("uncaughtException", onUncaughtException);
  },
};
