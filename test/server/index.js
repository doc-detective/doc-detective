import express from "express";
import bodyParser from "body-parser";
import fs from "node:fs";

/**
 * Creates an echo server that can serve static content and echo back API requests
 * @param {Object} options - Configuration options
 * @param {number} [options.port=8092] - Port to run the server on
 * @param {string} [options.staticDir="public"] - Directory to serve static files from
 * @param {Function} [options.modifyResponse] - Function to modify responses before sending
 * @returns {Object} Server object with start and stop methods
 */
function createServer(options = {}) {
  const {
    port = 8092,
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

  // Endpoint for testing DOC_DETECTIVE_API - returns resolved tests
  // IMPORTANT: Must be registered before the catch-all /api/:path route
  app.get("/api/resolved-tests", (req, res) => {
    try {
      // Check for x-runner-token header
      const token = req.headers['x-runner-token'];

      if (!token || token !== 'test-token-123') {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Return a valid resolvedTests object
      const resolvedTests = {
        "resolvedTestsId": "api-resolved-tests-id",
        "config": {
          "logLevel": "info"
        },
        "specs": [
          {
            "specId": "api-spec",
            "tests": [
              {
                "testId": "api-test",
                "contexts": [
                  {
                    "contextId": "api-context",
                    "steps": [
                      {
                        "stepId": "step-1",
                        "checkLink": `http://localhost:${port}`
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      };

      res.json(resolvedTests);
    } catch (error) {
      console.error("Error processing resolved tests request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Fixed status code responses
  app.get("/api/status/404", (req, res) => res.status(404).json({ error: "Not found" }));
  app.get("/api/status/500", (req, res) => res.status(500).json({ error: "Internal server error" }));

  // Echo response headers back as JSON body
  app.get("/api/echo-headers", (req, res) => res.json(req.headers));

  // Slow response (fixed 3-second delay)
  app.get("/api/slow", (req, res) => setTimeout(() => res.json({ delayed: true }), 3000));

  // Heretto mock endpoints
  // GET /rest/all-files/:folderId -- list folder contents (XML)
  app.get("/rest/all-files/:folderId", (req, res) => {
    res.set("Content-Type", "application/xml");
    if (req.params.folderId === "root-folder-id") {
      // Response must match the XML parsing in heretto.ts:
      // - getFileInFolder uses regex: id="([^"]+)"[^>]*name="filename" (id & name as attributes)
      // - getChildFolderByName uses regex: <folder\s+name="folderName"\s+id="([^"]+)"
      res.send(`<resources><resource id="existing-doc-id" name="test-screenshot.png"><name>test-screenshot.png</name><mime-type>image/png</mime-type></resource><folder name="subfolder" id="subfolder-id"/></resources>`);
    } else if (req.params.folderId === "empty-folder-id") {
      res.send(`<resources></resources>`);
    } else {
      res.status(404).send(`<error>Not found</error>`);
    }
  });

  // POST /rest/all-files/:folderId -- create document (XML)
  app.post("/rest/all-files/:folderId", (req, res) => {
    res.set("Content-Type", "application/xml");
    // createDocument parses: id="([^"]+)" from <resource id="uuid">...</resource>
    res.status(201).send(`<resource id="new-doc-id"><name>created.png</name></resource>`);
  });

  // PUT /rest/all-files/:documentId/content -- upload file content
  app.put("/rest/all-files/:documentId/content", (req, res) => {
    let body = [];
    req.on("data", chunk => body.push(chunk));
    req.on("end", () => res.status(200).send("OK"));
  });

  // POST /ezdnxtgen/api/search -- search files/folders (JSON)
  app.post("/ezdnxtgen/api/search", express.json(), (req, res) => {
    if (req.body && req.body.searchResultType === "FOLDERS_ONLY") {
      res.json({ searchResults: [{ name: req.body.queryString, uuid: "found-folder-id" }] });
    } else {
      res.json({ searchResults: [{ name: req.body ? req.body.queryString : "unknown", uuid: "found-file-id" }] });
    }
  });

  // Echo API endpoint that returns the request body (catch-all)
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
      return new Promise((resolve, reject) => {
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
export { createServer };
