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

export const mochaHooks = {
  async beforeAll() {
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
  },
};
