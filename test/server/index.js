const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");

/**
 * Creates an echo server that can serve static content and echo back API requests
 * @param {Object} options - Configuration options
 * @param {number} [options.port=8080] - Port to run the server on
 * @param {string} [options.staticDir="public"] - Directory to serve static files from
 * @param {Function} [options.modifyResponse] - Function to modify responses before sending
 * @returns {Object} Server object with start and stop methods
 */
function createServer(options = {}) {
  const {
    port = 8080,
    staticDir = "public",
    modifyResponse = (req, body) => body,
  } = options;

  const app = express();
  let server = null;

  // Parse JSON and urlencoded bodies
  app.use(bodyParser.json({ limit: "10mb" }));
  app.use(bodyParser.urlencoded({ extended: true }));

  // Serve static files if a directory is provided
  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
  }

  // Echo API endpoint that returns the request body
  app.all("/api/:path", (req, res) => {
    try {
      const requestBody = req.method === "GET" ? req.query : req.body;
      const modifiedResponse = modifyResponse(req, requestBody);
      console.log("Request:", {
        Method: req.method,
        Path: req.path,
        Query: req.query,
        Headers: req.headers,
        Body: req.body,
      });

      res.set("x-server", "doc-detective-echo-server");

      console.log("Response:", { Body: modifiedResponse });

      res.json(modifiedResponse);
    } catch (error) {
      console.error("Error processing request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return {
    /**
     * Start the server
     * @returns {Promise} Promise that resolves with the server address
     */

    start: () => {
      return new Promise((resolve, reject) => {
        try {
          server = app.listen(port, () => {
            const serverAddress = `http://localhost:${port}`;
            console.log(`Echo server running at ${serverAddress}`);
            resolve(serverAddress);
          });

          server.on("error", (error) => {
            console.error(`Failed to start server: ${error.message}`);
            reject(error);
          });
        } catch (error) {
          console.error(`Error setting up server: ${error.message}`);
          reject(error);
        }
      });
    },

    /**
     * Stop the server
     * @returns {Promise} Promise that resolves when server is stopped
     */
    stop: () => {
      return new Promise((resolve) => {
        if (server) {
          server.close((error) => {
            if (error) {
              console.error("Error stopping server:", error);
              reject(error);
            } else {
              console.log("Echo server stopped");
              server = null;
              resolve();
            }
          });
        } else {
          resolve();
        }
      });
    },

    /**
     * Get the Express app instance
     * @returns {Object} Express app
     */
    getApp: () => app,
  };
}

// Export the function
module.exports = { createServer };

// If this file is run directly, start a server
if (require.main === module) {
  const server = createServer({
    port: process.env.PORT || 8080,
    staticDir:
      process.env.STATIC_DIR ||
      path.join(process.cwd(), "./test/server/public"),
  });

  server.start();

  // Handle graceful shutdown
  const shutdown = () => {
    console.log("Shutting down server...");
    server
      .stop()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
