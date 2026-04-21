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
// Log the stack so a real bug stays visible but don't re-throw.
function onUnhandledRejection(reason) {
  const stack = reason && reason.stack ? reason.stack : String(reason);
  console.error(`[test/hooks] unhandledRejection (non-fatal):\n${stack}`);
}
function onUncaughtException(err) {
  const stack = err && err.stack ? err.stack : String(err);
  console.error(`[test/hooks] uncaughtException (non-fatal):\n${stack}`);
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
