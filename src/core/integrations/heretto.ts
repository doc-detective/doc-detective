/**
 * Heretto CMS uploader - handles uploading files back to Heretto CMS.
 */

import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import http from "node:http";

/**
 * Heretto uploader class implementing the uploader interface.
 */
class HerettoUploader {
  /**
   * Checks if this uploader can handle the given source integration.
   * @param {Object} sourceIntegration - Source integration metadata
   * @returns {boolean} True if this uploader handles Heretto integrations
   */
  canHandle(sourceIntegration: any) {
    return sourceIntegration?.type === "heretto";
  }

  /**
   * Uploads a file to Heretto CMS.
   * @param {Object} options - Upload options
   * @param {Object} options.config - Doc Detective config
   * @param {Object} options.integrationConfig - Heretto integration config
   * @param {string} options.localFilePath - Local file path to upload
   * @param {Object} options.sourceIntegration - Source integration metadata
   * @param {Function} options.log - Logging function
   * @returns {Promise<Object>} Upload result with status and description
   */
  async upload({ config, integrationConfig, localFilePath, sourceIntegration, log }: { config: any; integrationConfig: any; localFilePath: any; sourceIntegration: any; log: any }) {
    const result = {
      status: "FAIL",
      description: "",
    };

    // Validate we have the necessary configuration
    if (!integrationConfig) {
      result.description = "No Heretto integration configuration found";
      return result;
    }

    if (!integrationConfig.organizationId || !integrationConfig.apiToken) {
      result.description = "Heretto integration missing organizationId or apiToken";
      return result;
    }

    // Construct the API base URL from organizationId
    const apiBaseUrl = `https://${integrationConfig.organizationId}.heretto.com`;

    // Resolve the file ID using resource dependencies map
    let fileId = sourceIntegration.fileId;
    let parentFolderId = sourceIntegration.parentFolderId;
    const filename = path.basename(sourceIntegration.filePath);
    const relativeFilePath = sourceIntegration.filePath;

    // Try to resolve from resource dependencies map first (most accurate)
    if (!fileId && integrationConfig.resourceDependencies) {
      const resolvedFile = this.resolveFromDependencies({
        resourceDependencies: integrationConfig.resourceDependencies,
        filePath: relativeFilePath,
        filename,
        log: (level: any, msg: any) => log(config, level, msg),
      });

      if (resolvedFile) {
        fileId = resolvedFile.uuid;
        if (!parentFolderId && resolvedFile.parentFolderId) {
          parentFolderId = resolvedFile.parentFolderId;
        }
        log(config, "debug", `Resolved from dependencies: ${relativeFilePath} -> ${fileId}`);
      }
    }

    if (!fileId) {
      log(config, "debug", `No fileId found, resolving correct folder for: ${sourceIntegration.filePath}`);

      try {
        // STEP 1: Resolve the correct target folder first
        // This ensures we upload to the right location, not just any file with the same name
        if (!parentFolderId && integrationConfig.resourceDependencies) {
          const folderResolution = this.findParentFolderFromDependencies({
            resourceDependencies: integrationConfig.resourceDependencies,
            filePath: relativeFilePath,
            log: (level: any, msg: any) => log(config, level, msg),
          });

          parentFolderId = folderResolution.folderId;

          // If not found in dependencies, try to find the target folder as a child
          // of the ditamap's parent folder via API
          if (!parentFolderId && folderResolution.ditamapParentFolderId && folderResolution.targetFolderName) {
            log(config, "debug", `Searching for folder '${folderResolution.targetFolderName}' in ditamap's parent folder`);
            parentFolderId = await this.getChildFolderByName({
              apiBaseUrl,
              apiToken: integrationConfig.apiToken,
              username: integrationConfig.username || "",
              parentFolderId: folderResolution.ditamapParentFolderId,
              folderName: folderResolution.targetFolderName,
              log: (level: any, msg: any) => log(config, level, msg),
            });
          }
        }

        // Fall back to folder search if not found in dependencies
        if (!parentFolderId && relativeFilePath) {
          const parentDirPath = path.dirname(relativeFilePath);
          if (parentDirPath && parentDirPath !== ".") {
            const folderName = path.basename(parentDirPath);
            log(config, "debug", `Searching for parent folder by name: ${folderName}`);

            parentFolderId = await this.searchFolderByName({
              apiBaseUrl,
              apiToken: integrationConfig.apiToken,
              username: integrationConfig.username || "",
              folderName,
              log: (level: any, msg: any) => log(config, level, msg),
            });
          }
        }

        // STEP 2: Look for the file in the correct folder
        if (parentFolderId) {
          log(config, "debug", `Looking for file '${filename}' in target folder ${parentFolderId}`);
          fileId = await this.getFileInFolder({
            apiBaseUrl,
            apiToken: integrationConfig.apiToken,
            username: integrationConfig.username || "",
            folderId: parentFolderId,
            filename,
            log: (level: any, msg: any) => log(config, level, msg),
          });

          if (fileId) {
            log(config, "debug", `Found existing file in target folder with ID: ${fileId}`);
          } else {
            // STEP 3: File doesn't exist in target folder - create it
            log(config, "debug", `File not in target folder, creating new document`);

            const mimeType = this.getContentType(localFilePath);
            const createResult = await this.createDocument({
              apiBaseUrl,
              apiToken: integrationConfig.apiToken,
              username: integrationConfig.username || "",
              parentFolderId,
              filename,
              mimeType,
              log: (level: any, msg: any) => log(config, level, msg),
            });

            if (createResult.created) {
              fileId = createResult.documentId;
              log(config, "info", `Created new document in Heretto with ID: ${fileId}`);
            } else if (createResult.existsInFolder) {
              // This shouldn't happen since we just checked, but handle it anyway
              log(config, "debug", `File exists in folder (race condition), searching for its ID`);
              fileId = await this.getFileInFolder({
                apiBaseUrl,
                apiToken: integrationConfig.apiToken,
                username: integrationConfig.username || "",
                folderId: parentFolderId,
                filename,
                log: (level: any, msg: any) => log(config, level, msg),
              });

              if (!fileId) {
                result.description = `File exists in folder but could not get its ID: ${filename}`;
                return result;
              }
            } else {
              result.description = `Failed to create document in Heretto: ${filename}`;
              return result;
            }
          }
        } else {
          // Last resort: search globally by filename (may find file in wrong folder)
          log(config, "debug", `No target folder found, searching globally for file: ${filename}`);
          fileId = await this.searchFileByName({
            apiBaseUrl,
            apiToken: integrationConfig.apiToken,
            username: integrationConfig.username || "",
            filename,
            log: (level: any, msg: any) => log(config, level, msg),
          });

          if (!fileId) {
            result.description = `Could not find file or parent folder in Heretto: ${sourceIntegration.filePath}`;
            return result;
          }
        }
      } catch (error: any) {
        result.description = `Error searching/creating file: ${error.message}`;
        return result;
      }
    }

    // Read the local file
    if (!fs.existsSync(localFilePath)) {
      result.description = `Local file not found: ${localFilePath}`;
      return result;
    }

    const fileContent = fs.readFileSync(localFilePath);
    const contentType = this.getContentType(localFilePath);

    // Upload to Heretto
    try {
      await this.uploadFile({
        apiBaseUrl,
        apiToken: integrationConfig.apiToken,
        username: integrationConfig.username || "",
        documentId: fileId,
        content: fileContent,
        contentType,
        log: (level: any, msg: any) => log(config, level, msg),
      });

      result.status = "PASS";
      result.description = `Successfully uploaded to Heretto (document ID: ${fileId})`;
    } catch (error: any) {
      result.description = `Upload failed: ${error.message}`;
    }

    return result;
  }

  /**
   * Resolves a file path to its UUID using the resource dependencies map.
   * @param {Object} options - Resolution options
   * @param {Object.<string, {uuid: string, parentFolderId: string}>} options.resourceDependencies - Map of resource paths to resource metadata
   * @param {string} options.filePath - Original file path to resolve
   * @param {string} options.filename - Filename extracted from the file path
   * @param {Function} options.log - Logging function
   * @returns {{uuid: string, parentFolderId: string}|null} File info with uuid and parentFolderId, or null if not found
   */
  resolveFromDependencies({ resourceDependencies, filePath, filename, log }: { resourceDependencies: any; filePath: any; filename: any; log: any }) {
    if (!resourceDependencies) return null;

    // Normalize the file path for comparison using posix normalize for cross-platform support
    // Use normalize to handle multiple levels of relative references like ../../folder/file.png
    const normalizedPath = path.posix
      .normalize(filePath.replace(/\\/g, "/"))
      .replace(/^\.\.\/+/g, "") // Remove leading ../
      .replace(/^\.\//, ""); // Remove leading ./

    // Try exact path match first
    for (const [depPath, info] of Object.entries(resourceDependencies) as [string, any][]) {
      if (depPath.startsWith("_")) continue; // Skip internal keys

      const normalizedDepPath = depPath.replace(/\\/g, "/");

      // Check if paths match (accounting for relative path variations)
      if (normalizedDepPath === normalizedPath ||
          normalizedDepPath.endsWith("/" + normalizedPath) ||
          normalizedDepPath.endsWith(normalizedPath)) {
        log("debug", `Found exact path match in dependencies: ${depPath}`);
        return info;
      }
    }

    // Try filename match with parent folder context
    const parentDir = path.dirname(normalizedPath);
    const parentFolderName = path.basename(parentDir);

    for (const [depPath, info] of Object.entries(resourceDependencies) as [string, any][]) {
      if (depPath.startsWith("_")) continue;

      const depFilename = path.basename(depPath);
      const depParentDir = path.dirname(depPath);
      const depParentFolderName = path.basename(depParentDir);

      // Match by filename and parent folder name
      if (depFilename === filename && depParentFolderName === parentFolderName) {
        log("debug", `Found filename+folder match in dependencies: ${depPath}`);
        return info;
      }
    }

    // Try filename-only match as last resort
    for (const [depPath, info] of Object.entries(resourceDependencies) as [string, any][]) {
      if (depPath.startsWith("_")) continue;

      const depFilename = path.basename(depPath);
      if (depFilename === filename) {
        log("debug", `Found filename match in dependencies: ${depPath}`);
        return info;
      }
    }

    log("debug", `No match found in dependencies for: ${filePath}`);
    return null;
  }

  /**
   * Finds the parent folder ID for a file path using resource dependencies.
   * Returns the target folder name for API lookup if not found in dependencies.
   * @param {Object} options - Resolution options
   * @param {Object.<string, {uuid: string, parentFolderId: string}>} options.resourceDependencies - Map of resource paths to resource metadata.
   *   Keys are relative file paths, values are objects with uuid and parentFolderId.
   *   Special keys starting with '_' (e.g., '_ditamapParentFolderId') store internal metadata.
   * @param {string} options.filePath - File path to find parent folder for (can be relative with ../ or ./ prefixes)
   * @param {Function} options.log - Logging function with signature (level, message)
   * @returns {{folderId: string|null, targetFolderName: string|null, ditamapParentFolderId: string|null}} Resolution result containing:
   *   - folderId: The parent folder UUID if found in dependencies, null otherwise
   *   - targetFolderName: The name of the target folder extracted from the file path
   *   - ditamapParentFolderId: The ditamap's parent folder ID from dependencies (for API fallback lookup)
   */
  findParentFolderFromDependencies({ resourceDependencies, filePath, log }: { resourceDependencies: any; filePath: any; log: any }) {
    const result: { folderId: any; targetFolderName: any; ditamapParentFolderId: any } = {
      folderId: null,
      targetFolderName: null,
      ditamapParentFolderId: null,
    };

    if (!resourceDependencies) return result;

    // Normalize path and get parent directory using posix normalize for cross-platform support
    // Use a loop/regex pattern to handle multiple levels of relative references like ../../folder/file.png
    const normalizedPath = path.posix
      .normalize(filePath.replace(/\\/g, "/"))
      .replace(/^(\.\.\/)+/g, "") // Remove all leading ../
      .replace(/^\.\//, ""); // Remove leading ./
    const parentDir = path.dirname(normalizedPath);
    const targetFolderName = path.basename(parentDir);

    result.targetFolderName = targetFolderName;
    result.ditamapParentFolderId = resourceDependencies._ditamapParentFolderId || null;

    log("debug", `Looking for parent folder '${targetFolderName}' in dependencies`);

    // Find a sibling file in the same folder to get the parent folder ID
    for (const [depPath, info] of Object.entries(resourceDependencies) as [string, any][]) {
      if (depPath.startsWith("_")) continue;

      const depParentDir = path.dirname(depPath);
      const depFolderName = path.basename(depParentDir);

      // If we find a file in the same folder, use its parent folder ID
      if (depFolderName === targetFolderName && info.parentFolderId) {
        log("debug", `Found sibling file ${depPath} with parent folder ID: ${info.parentFolderId}`);
        result.folderId = info.parentFolderId;
        return result;
      }
    }

    // Alternative: look for folder paths in the dependencies
    for (const [depPath, info] of Object.entries(resourceDependencies) as [string, any][]) {
      if (depPath.startsWith("_")) continue;

      // Check if this is the folder itself (ends with folder name)
      if (depPath.endsWith("/" + targetFolderName) || depPath === targetFolderName) {
        log("debug", `Found folder ${depPath} with ID: ${info.uuid}`);
        result.folderId = info.uuid;
        return result;
      }
    }

    log("debug", `Could not find parent folder '${targetFolderName}' in dependencies, will search via API`);
    return result;
  }

  /**
   * Gets a child folder within a parent folder by name.
   * @param {Object} options - Search options
   * @returns {Promise<string|null>} Child folder ID if found, null otherwise
   */
  async getChildFolderByName({ apiBaseUrl, apiToken, username, parentFolderId, folderName, log }: { apiBaseUrl: any; apiToken: any; username: any; parentFolderId: any; folderName: any; log: any }) {
    const folderUrl = new URL(`/rest/all-files/${parentFolderId}`, apiBaseUrl);

    return new Promise((resolve, reject) => {
      const protocol = folderUrl.protocol === "https:" ? https : http;
      const authString = Buffer.from(`${username}:${apiToken}`).toString("base64");

      const options = {
        hostname: folderUrl.hostname,
        port: folderUrl.port || (folderUrl.protocol === "https:" ? 443 : 80),
        path: folderUrl.pathname,
        method: "GET",
        headers: {
          "Authorization": `Basic ${authString}`,
          "Accept": "application/xml",
        },
      };

      log("debug", `Looking for child folder '${folderName}' in parent ${parentFolderId}`);

      const req = protocol.request(options, (res: any) => {
        let data = "";

        res.on("data", (chunk: any) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode === 200) {
            try {
              // Parse XML to find the folder by name in children
              // Looking for: <folder name="folderName" id="uuid"/>
              // Double-escape backslashes for proper regex character class matching
              const escapedFolderName = folderName.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
              const folderMatch = data.match(new RegExp(`<folder\\s+name="${escapedFolderName}"\\s+id="([^"]+)"`, 'i'));

              if (folderMatch && folderMatch[1]) {
                log("debug", `Found child folder '${folderName}' with ID: ${folderMatch[1]}`);
                resolve(folderMatch[1]);
              } else {
                log("debug", `Child folder '${folderName}' not found in parent ${parentFolderId}`);
                resolve(null);
              }
            } catch (parseError: any) {
              log("debug", `Error parsing folder contents: ${parseError.message}`);
              resolve(null);
            }
          } else {
            log("debug", `Failed to get parent folder contents: ${res.statusCode}`);
            resolve(null);
          }
        });
      });

      // Set a reasonable timeout (30 seconds)
      req.setTimeout(30000, () => {
        req.destroy(new Error('Request timeout'));
      });

      req.on("error", (error: any) => {
        log("debug", `Error getting folder contents: ${error.message}`);
        resolve(null);
      });

      req.end();
    });
  }

  /**
   * Creates a new document in Heretto.
   * @param {Object} options - Creation options
   * @returns {Promise<Object>} Result with created: boolean, documentId: string (if successful or already exists)
   */
  async createDocument({ apiBaseUrl, apiToken, username, parentFolderId, filename, mimeType, log }: { apiBaseUrl: any; apiToken: any; username: any; parentFolderId: any; filename: any; mimeType: any; log: any }): Promise<any> {
    const createUrl = new URL(`/rest/all-files/${parentFolderId}`, apiBaseUrl);

    const createBody = `<resource><name>${this.escapeXml(filename)}</name><mime-type>${mimeType}</mime-type></resource>`;

    return new Promise((resolve, reject) => {
      const protocol = createUrl.protocol === "https:" ? https : http;
      const authString = Buffer.from(`${username}:${apiToken}`).toString("base64");

      const options = {
        hostname: createUrl.hostname,
        port: createUrl.port || (createUrl.protocol === "https:" ? 443 : 80),
        path: createUrl.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/xml",
          "Authorization": `Basic ${authString}`,
          "Content-Length": Buffer.byteLength(createBody),
        },
      };

      log("debug", `Creating document at ${createUrl.toString()}`);

      const req = protocol.request(options, (res: any) => {
        let data = "";

        res.on("data", (chunk: any) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode === 200 || res.statusCode === 201) {
            try {
              // Parse the XML response to extract the document ID
              // Response format: <resource id="uuid">...</resource>
              const idMatch = data.match(/id="([^"]+)"/);
              if (idMatch && idMatch[1]) {
                log("debug", `Document created successfully with ID: ${idMatch[1]}`);
                resolve({ created: true, documentId: idMatch[1] });
              } else {
                log("warning", `Document created but could not parse ID from response: ${data}`);
                reject(new Error("Could not parse document ID from create response"));
              }
            } catch (parseError: any) {
              reject(new Error(`Failed to parse create response: ${parseError.message}`));
            }
          } else if (res.statusCode === 400 && data.includes("already exists")) {
            // File already exists in this folder - we need to find its ID
            log("debug", `Document already exists in folder, will search for existing file`);
            resolve({ created: false, existsInFolder: true, parentFolderId });
          } else {
            reject(new Error(`Create document failed with status ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on("error", (error: any) => {
        reject(new Error(`Create document request error: ${error.message}`));
      });

      // Set a reasonable timeout (30 seconds)
      req.setTimeout(30000, () => {
        req.destroy(new Error('Request timeout'));
      });

      req.write(createBody);
      req.end();
    });
  }

  /**
   * Gets file information from a specific folder.
   * @param {Object} options - Options
   * @returns {Promise<string|null>} File ID if found, null otherwise
   */
  async getFileInFolder({ apiBaseUrl, apiToken, username, folderId, filename, log }: { apiBaseUrl: any; apiToken: any; username: any; folderId: any; filename: any; log: any }) {
    const folderUrl = new URL(`/rest/all-files/${folderId}`, apiBaseUrl);

    return new Promise((resolve, reject) => {
      const protocol = folderUrl.protocol === "https:" ? https : http;
      const authString = Buffer.from(`${username}:${apiToken}`).toString("base64");

      const options = {
        hostname: folderUrl.hostname,
        port: folderUrl.port || (folderUrl.protocol === "https:" ? 443 : 80),
        path: folderUrl.pathname,
        method: "GET",
        headers: {
          "Authorization": `Basic ${authString}`,
          "Accept": "application/xml",
        },
      };

      log("debug", `Getting folder contents: ${folderUrl.toString()}`);

      const req = protocol.request(options, (res: any) => {
        let data = "";

        res.on("data", (chunk: any) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode === 200) {
            try {
              // Parse XML to find the file by name
              // Looking for child resources with matching name
              // Example: <resource id="uuid" name="filename">...
              // Double-escape backslashes for proper regex character class matching
              const escapedFilename = filename.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
              const nameIdMatch = data.match(new RegExp(`id="([^"]+)"[^>]*name="${escapedFilename}"`, 'i'));
              const idNameMatch = data.match(new RegExp(`name="${escapedFilename}"[^>]*id="([^"]+)"`, 'i'));

              const match = nameIdMatch || idNameMatch;
              if (match && match[1]) {
                log("debug", `Found file ${filename} with ID: ${match[1]}`);
                resolve(match[1]);
              } else {
                log("debug", `File ${filename} not found in folder ${folderId}`);
                resolve(null);
              }
            } catch (parseError: any) {
              log("debug", `Error parsing folder contents: ${parseError.message}`);
              resolve(null);
            }
          } else {
            log("debug", `Failed to get folder contents: ${res.statusCode}`);
            resolve(null);
          }
        });
      });

      req.on("error", (error: any) => {
        log("debug", `Error getting folder contents: ${error.message}`);
        resolve(null);
      });

      // Set a reasonable timeout (30 seconds)
      req.setTimeout(30000, () => {
        req.destroy(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * Escapes special characters for XML.
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeXml(str: string) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /**
   * Searches for a folder in Heretto by name.
   * @param {Object} options - Search options
   * @returns {Promise<string|null>} Folder ID if found, null otherwise
   */
  async searchFolderByName({ apiBaseUrl, apiToken, username, folderName, log }: { apiBaseUrl: any; apiToken: any; username: any; folderName: any; log: any }) {
    const searchUrl = new URL("/ezdnxtgen/api/search", apiBaseUrl);

    const searchBody = JSON.stringify({
      queryString: folderName,
      searchResultType: "FOLDERS_ONLY",
    });

    return new Promise((resolve, reject) => {
      const protocol = searchUrl.protocol === "https:" ? https : http;
      const authString = Buffer.from(`${username}:${apiToken}`).toString("base64");

      const options = {
        hostname: searchUrl.hostname,
        port: searchUrl.port || (searchUrl.protocol === "https:" ? 443 : 80),
        path: searchUrl.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${authString}`,
          "Content-Length": Buffer.byteLength(searchBody),
        },
      };

      log("debug", `Searching for folder: ${folderName}`);

      const req = protocol.request(options, (res: any) => {
        let data = "";

        res.on("data", (chunk: any) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              // Handle empty response body (no results)
              if (!data || data.trim() === "") {
                log("debug", "Folder search returned empty response - no results found");
                resolve(null);
                return;
              }

              const result = JSON.parse(data);
              // Find the matching folder in results
              if (result.searchResults && result.searchResults.length > 0) {
                // Look for exact folder name match
                const match = result.searchResults.find(
                  (r: any) => r.name === folderName || r.title === folderName
                );
                if (match) {
                  log("debug", `Found folder: ${folderName} with ID: ${match.uuid || match.id}`);
                  resolve(match.uuid || match.id);
                } else {
                  // Take first result as fallback
                  log("debug", `Exact folder match not found, using first result: ${result.searchResults[0].uuid || result.searchResults[0].id}`);
                  resolve(result.searchResults[0].uuid || result.searchResults[0].id);
                }
              } else {
                log("debug", `No folders found matching: ${folderName}`);
                resolve(null);
              }
            } catch (parseError: any) {
              reject(new Error(`Failed to parse folder search response: ${parseError.message}`));
            }
          } else {
            reject(new Error(`Folder search request failed with status ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on("error", (error: any) => {
        reject(new Error(`Folder search request error: ${error.message}`));
      });

      // Set a reasonable timeout (30 seconds)
      req.setTimeout(30000, () => {
        req.destroy(new Error('Request timeout'));
      });

      req.write(searchBody);
      req.end();
    });
  }

  /**
   * Searches for a file in Heretto by filename.
   * @param {Object} options - Search options
   * @returns {Promise<string|null>} Document ID if found, null otherwise
   */
  async searchFileByName({ apiBaseUrl, apiToken, username, filename, log }: { apiBaseUrl: any; apiToken: any; username: any; filename: any; log: any }) {
    const searchUrl = new URL("/ezdnxtgen/api/search", apiBaseUrl);

    const searchBody = JSON.stringify({
      queryString: filename,
      searchResultType: "FILES_ONLY",
    });

    return new Promise((resolve, reject) => {
      const protocol = searchUrl.protocol === "https:" ? https : http;
      const authString = Buffer.from(`${username}:${apiToken}`).toString("base64");

      const options = {
        hostname: searchUrl.hostname,
        port: searchUrl.port || (searchUrl.protocol === "https:" ? 443 : 80),
        path: searchUrl.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${authString}`,
          "Content-Length": Buffer.byteLength(searchBody),
        },
      };

      const req = protocol.request(options, (res: any) => {
        let data = "";

        res.on("data", (chunk: any) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              // Handle empty response body (no results)
              if (!data || data.trim() === "") {
                log("debug", "Search returned empty response - no results found");
                resolve(null);
                return;
              }

              const result = JSON.parse(data);
              // Find the matching file in results
              if (result.searchResults && result.searchResults.length > 0) {
                // Look for exact filename match
                const match = result.searchResults.find(
                  (r: any) => r.name === filename || r.title === filename
                );
                if (match) {
                  resolve(match.uuid || match.id);
                } else {
                  // Take first result as fallback
                  resolve(result.searchResults[0].uuid || result.searchResults[0].id);
                }
              } else {
                resolve(null);
              }
            } catch (parseError: any) {
              reject(new Error(`Failed to parse search response: ${parseError.message}`));
            }
          } else {
            reject(new Error(`Search request failed with status ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on("error", (error: any) => {
        reject(new Error(`Search request error: ${error.message}`));
      });

      // Set a reasonable timeout (30 seconds)
      req.setTimeout(30000, () => {
        req.destroy(new Error('Request timeout'));
      });

      req.write(searchBody);
      req.end();
    });
  }

  /**
   * Uploads file content to Heretto.
   * @param {Object} options - Upload options
   * @returns {Promise<void>}
   */
  async uploadFile({ apiBaseUrl, apiToken, username, documentId, content, contentType, log }: { apiBaseUrl: any; apiToken: any; username: any; documentId: any; content: any; contentType: any; log: any }) {
    const uploadUrl = new URL(`/rest/all-files/${documentId}/content`, apiBaseUrl);

    return new Promise<void>((resolve, reject) => {
      const protocol = uploadUrl.protocol === "https:" ? https : http;
      const authString = Buffer.from(`${username}:${apiToken}`).toString("base64");

      const options = {
        hostname: uploadUrl.hostname,
        port: uploadUrl.port || (uploadUrl.protocol === "https:" ? 443 : 80),
        path: uploadUrl.pathname,
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "Authorization": `Basic ${authString}`,
          "Content-Length": Buffer.byteLength(content),
        },
      };

      log("debug", `Uploading to ${uploadUrl.toString()}`);

      const req = protocol.request(options, (res: any) => {
        let data = "";

        res.on("data", (chunk: any) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            log("debug", `Upload successful: ${res.statusCode}`);
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on("error", (error: any) => {
        reject(new Error(`Upload request error: ${error.message}`));
      });

      // Set a reasonable timeout (30 seconds)
      req.setTimeout(30000, () => {
        req.destroy(new Error('Request timeout'));
      });

      req.write(content);
      req.end();
    });
  }

  /**
   * Gets document information from Heretto.
   * @param {Object} options - Options
   * @returns {Promise<Object>} Document info including id, name, mimeType, folderUuid, uri
   */
  async getDocumentInfo({ apiBaseUrl, apiToken, username, documentId, log }: { apiBaseUrl: any; apiToken: any; username: any; documentId: any; log: any }) {
    const docUrl = new URL(`/rest/all-files/${documentId}`, apiBaseUrl);

    return new Promise((resolve, reject) => {
      const protocol = docUrl.protocol === "https:" ? https : http;
      const authString = Buffer.from(`${username}:${apiToken}`).toString("base64");

      const options = {
        hostname: docUrl.hostname,
        port: docUrl.port || (docUrl.protocol === "https:" ? 443 : 80),
        path: docUrl.pathname,
        method: "GET",
        headers: {
          "Authorization": `Basic ${authString}`,
          "Accept": "application/xml",
        },
      };

      log("debug", `Getting document info: ${docUrl.toString()}`);

      const req = protocol.request(options, (res: any) => {
        let data = "";

        res.on("data", (chunk: any) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode === 200) {
            try {
              // Parse XML response to extract document info
              // The <resource> tag has id and folder-uuid as ATTRIBUTES
              // But <name>, <mime-type>, <xmldb-uri> are CHILD ELEMENTS

              // Extract attributes from the opening <resource> tag
              const resourceMatch = data.match(/<resource\s+([^>]+)>/);
              let id = null;
              let folderUuid = null;

              if (resourceMatch) {
                const attrs = resourceMatch[1];
                const idMatch = attrs.match(/\bid="([^"]+)"/);
                const folderMatch = attrs.match(/\bfolder-uuid="([^"]+)"/);
                id = idMatch ? idMatch[1] : null;
                folderUuid = folderMatch ? folderMatch[1] : null;
              }

              // Extract child elements
              const nameMatch = data.match(/<name>([^<]+)<\/name>/);
              const mimeMatch = data.match(/<mime-type>([^<]+)<\/mime-type>/);
              const uriMatch = data.match(/<xmldb-uri>([^<]+)<\/xmldb-uri>/);

              resolve({
                id,
                name: nameMatch ? nameMatch[1] : null,
                mimeType: mimeMatch ? mimeMatch[1] : null,
                folderUuid,
                uri: uriMatch ? uriMatch[1] : null,
                rawXml: data,
              });
            } catch (parseError: any) {
              reject(new Error(`Failed to parse document info: ${parseError.message}`));
            }
          } else {
            reject(new Error(`Get document info failed with status ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on("error", (error: any) => {
        reject(new Error(`Get document info request error: ${error.message}`));
      });

      // Set a reasonable timeout (30 seconds)
      req.setTimeout(30000, () => {
        req.destroy(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * Gets document content from Heretto.
   * @param {Object} options - Options
   * @returns {Promise<Buffer>} Document content as buffer
   */
  async getDocumentContent({ apiBaseUrl, apiToken, username, documentId, log }: { apiBaseUrl: any; apiToken: any; username: any; documentId: any; log: any }) {
    const contentUrl = new URL(`/rest/all-files/${documentId}/content`, apiBaseUrl);

    return new Promise((resolve, reject) => {
      const protocol = contentUrl.protocol === "https:" ? https : http;
      const authString = Buffer.from(`${username}:${apiToken}`).toString("base64");

      const options = {
        hostname: contentUrl.hostname,
        port: contentUrl.port || (contentUrl.protocol === "https:" ? 443 : 80),
        path: contentUrl.pathname,
        method: "GET",
        headers: {
          "Authorization": `Basic ${authString}`,
        },
      };

      log("debug", `Getting document content: ${contentUrl.toString()}`);

      const req = protocol.request(options, (res: any) => {
        const chunks: any[] = [];

        res.on("data", (chunk: any) => {
          chunks.push(chunk);
        });

        res.on("end", () => {
          if (res.statusCode === 200) {
            resolve(Buffer.concat(chunks));
          } else {
            reject(new Error(`Get document content failed with status ${res.statusCode}`));
          }
        });
      });

      req.on("error", (error: any) => {
        reject(new Error(`Get document content request error: ${error.message}`));
      });

      // Set a reasonable timeout (30 seconds)
      req.setTimeout(30000, () => {
        req.destroy(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * Determines the content type based on file extension.
   * @param {string} filePath - File path
   * @returns {string} MIME content type
   */
  getContentType(filePath: string) {
    const ext = path.extname(filePath).toLowerCase();

    const contentTypes: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".webp": "image/webp",
      ".bmp": "image/bmp",
      ".ico": "image/x-icon",
      ".pdf": "application/pdf",
      ".xml": "application/xml",
      ".dita": "application/xml",
      ".ditamap": "application/xml",
    };

    return contentTypes[ext] || "application/octet-stream";
  }
}

export { HerettoUploader };

// ─── Heretto Content Loader ────────────────────────────────────────────────────
// Functions for downloading content from Heretto CMS during test detection.
// Ported from the standalone resolver package.

import axios, { AxiosInstance } from "axios";
import os from "node:os";
import crypto from "node:crypto";
import AdmZip from "adm-zip";

// Constants
const POLLING_INTERVAL_MS = 5000;
const POLLING_TIMEOUT_MS = 300000; // 5 minutes
const API_REQUEST_TIMEOUT_MS = 30000;
const DOWNLOAD_TIMEOUT_MS = 300000; // 5 minutes
const DEFAULT_SCENARIO_NAME = "Doc Detective";

export { POLLING_INTERVAL_MS, POLLING_TIMEOUT_MS, DEFAULT_SCENARIO_NAME };

export function createAuthHeader(username: string, apiToken: string): string {
  const credentials = `${username}:${apiToken}`;
  return Buffer.from(credentials).toString("base64");
}

export function getBaseUrl(organizationId: string): string {
  return `https://${organizationId}.heretto.com/ezdnxtgen/api/v2`;
}

export function validateDitamapInAssets(assets: string[]): boolean {
  return assets.some(
    (assetPath) =>
      assetPath.startsWith("ot-output/dita/") && assetPath.endsWith(".ditamap")
  );
}

export function createApiClient(herettoConfig: any): AxiosInstance {
  const authHeader = createAuthHeader(
    herettoConfig.username,
    herettoConfig.apiToken
  );
  return axios.create({
    baseURL: getBaseUrl(herettoConfig.organizationId),
    timeout: API_REQUEST_TIMEOUT_MS,
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/json",
    },
  });
}

export function createRestApiClient(herettoConfig: any): AxiosInstance {
  const authHeader = createAuthHeader(
    herettoConfig.username,
    herettoConfig.apiToken
  );
  return axios.create({
    baseURL: `https://${herettoConfig.organizationId}.heretto.com`,
    timeout: API_REQUEST_TIMEOUT_MS,
    headers: {
      Authorization: `Basic ${authHeader}`,
      Accept: "application/xml, text/xml, */*",
    },
  });
}

export async function findScenario(
  client: AxiosInstance,
  log: Function,
  config: any,
  scenarioName: string
): Promise<{ scenarioId: string; fileId: string } | null> {
  try {
    const scenariosResp = await client.get("/publishes/scenarios");
    const scenarios = scenariosResp.data.content || [];
    const foundScenario = scenarios.find((s: any) => s.name === scenarioName);

    if (!foundScenario) {
      log(config, "error", `No existing "${scenarioName}" scenario found.`);
      return null;
    }

    const paramsResp = await client.get(
      `/publishes/scenarios/${foundScenario.id}/parameters`
    );
    const scenarioParameters = paramsResp.data;

    if (!scenarioParameters) {
      log(config, "error", `Failed to retrieve scenario details for ID: ${foundScenario.id}`);
      return null;
    }

    log(config, "debug", `Scenario parameters: ${JSON.stringify(scenarioParameters.content?.map((p: any) => ({ name: p.name, type: p.type, value: p.value })))}`);

    const transtypeParam = scenarioParameters.content?.find(
      (param: any) => param.name === "transtype"
    );
    if (!transtypeParam || (transtypeParam.value !== "dita" && transtypeParam.options?.[0]?.value !== "dita")) {
      log(config, "error", `Existing "${scenarioName}" scenario: "transtype" must be set to "dita".`);
      return null;
    }

    const toolKitParam = scenarioParameters.content?.find(
      (param: any) => param.name === "tool-kit-name"
    );
    if (!toolKitParam || !toolKitParam.value) {
      log(config, "error", `Existing "${scenarioName}" scenario has incorrect "tool-kit-name" parameter settings.`);
      return null;
    }

    const fileUuidPickerParam = scenarioParameters.content?.find(
      (param: any) => param.type === "file_uuid_picker"
    );
    if (!fileUuidPickerParam || !fileUuidPickerParam.value) {
      log(config, "error", `Existing "${scenarioName}" scenario has incorrect "file_uuid_picker" parameter settings. Make sure it has a valid value.`);
      return null;
    }

    log(config, "debug", `Found existing "${scenarioName}" scenario: ${foundScenario.id}`);
    return {
      scenarioId: foundScenario.id,
      fileId: fileUuidPickerParam.value,
    };
  } catch (error: any) {
    log(config, "error", `Failed to find publishing scenario: ${error.message}`);
    return null;
  }
}

export async function triggerPublishingJob(
  client: AxiosInstance,
  fileId: string,
  scenarioId: string
): Promise<any> {
  const response = await client.post(`/files/${fileId}/publishes`, {
    scenario: scenarioId,
    parameters: [],
  });
  if (!response.data?.jobId) {
    throw new Error("Publishing job response missing jobId");
  }
  return response.data;
}

export async function getJobStatus(
  client: AxiosInstance,
  fileId: string,
  jobId: string
): Promise<any> {
  const response = await client.get(`/files/${fileId}/publishes/${jobId}`);
  return response.data;
}

export async function getJobAssetDetails(
  client: AxiosInstance,
  fileId: string,
  jobId: string
): Promise<string[]> {
  const allAssets: string[] = [];
  let page = 0;
  const pageSize = 100;
  const maxPages = 1000;
  let hasMorePages = true;

  while (hasMorePages && page < maxPages) {
    const response = await client.get(
      `/files/${fileId}/publishes/${jobId}/assets`,
      { params: { page, size: pageSize } }
    );

    const data = response.data;
    const content = data.content || [];

    for (const asset of content) {
      if (asset.filePath) {
        allAssets.push(asset.filePath);
      }
    }

    const totalPages = data.totalPages || 1;
    page++;
    hasMorePages = page < totalPages;
  }

  return allAssets;
}

export async function pollJobStatus(
  client: AxiosInstance,
  fileId: string,
  jobId: string,
  log: Function,
  config: any
): Promise<any | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < POLLING_TIMEOUT_MS) {
    try {
      const job = await getJobStatus(client, fileId, jobId);
      log(config, "debug", `Job ${jobId} status: ${job?.status?.status}`);

      if (job?.status?.result) {
        log(config, "debug", `Job ${jobId} completed with result: ${job.status.result}`);

        if (job.status.result !== "success") {
          log(config, "warning", `Publishing job ${jobId} finished with non-success result: ${job.status.result}`);
          return null;
        }

        try {
          const assets = await getJobAssetDetails(client, fileId, jobId);
          log(config, "debug", `Job ${jobId} has ${assets.length} assets`);

          if (validateDitamapInAssets(assets)) {
            log(config, "debug", `Found .ditamap file in ot-output/dita/`);
            return job;
          }

          log(config, "warning", `Publishing job ${jobId} completed but no .ditamap file found in ot-output/dita/`);
          return null;
        } catch (assetError: any) {
          log(config, "warning", `Failed to validate job assets: ${assetError.message}`);
          return null;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL_MS));
    } catch (error: any) {
      log(config, "warning", `Error polling job status: ${error.message}`);
      return null;
    }
  }

  log(config, "warning", `Publishing job ${jobId} timed out after ${POLLING_TIMEOUT_MS / 1000} seconds`);
  return null;
}

interface DownloadDeps {
  fsModule?: typeof fs;
  ZipClass?: any;
}

export async function downloadAndExtractOutput(
  client: AxiosInstance,
  fileId: string,
  jobId: string,
  herettoName: string,
  log: Function,
  config: any,
  deps?: DownloadDeps
): Promise<string | null> {
  const fsModule = deps?.fsModule || fs;
  const ZipClass = deps?.ZipClass || AdmZip;

  const tempDir = path.join(os.tmpdir(), "doc-detective");
  const hash = crypto
    .createHash("md5")
    .update(`${herettoName}_${jobId}`)
    .digest("hex");

  try {
    fsModule.mkdirSync(tempDir, { recursive: true });

    const outputDir = path.join(tempDir, `heretto_${hash}`);

    log(config, "debug", `Downloading publishing job output for ${herettoName}...`);
    const response = await client.get(
      `/files/${fileId}/publishes/${jobId}/assets-all`,
      {
        responseType: "arraybuffer",
        timeout: DOWNLOAD_TIMEOUT_MS,
        headers: { Accept: "application/octet-stream" },
      }
    );

    const zipPath = path.join(tempDir, `heretto_${hash}.zip`);
    fsModule.writeFileSync(zipPath, response.data);

    log(config, "debug", `Extracting output to ${outputDir}...`);
    const zip = new ZipClass(zipPath);
    const resolvedOutputDir = path.resolve(outputDir);

    for (const entry of zip.getEntries()) {
      const normalizedName = path.posix.normalize(entry.entryName.replace(/\\/g, "/"));

      // Reject entries with path traversal sequences
      if (normalizedName.startsWith("..") || normalizedName.includes("/..")) {
        log(config, "warning", `Skipping ZIP entry with path traversal: ${entry.entryName}`);
        continue;
      }

      const resolvedPath = path.resolve(outputDir, normalizedName);

      if (
        !resolvedPath.startsWith(resolvedOutputDir + path.sep) &&
        resolvedPath !== resolvedOutputDir
      ) {
        log(config, "warning", `Skipping ZIP entry outside output directory: ${entry.entryName}`);
        continue;
      }

      if (entry.isDirectory) {
        fsModule.mkdirSync(resolvedPath, { recursive: true });
      } else {
        fsModule.mkdirSync(path.dirname(resolvedPath), { recursive: true });
        fsModule.writeFileSync(resolvedPath, entry.getData());
      }
    }

    fsModule.unlinkSync(zipPath);

    log(config, "info", `Heretto content "${herettoName}" extracted to ${outputDir}`);
    return outputDir;
  } catch (error: any) {
    // Clean up zip file and partial output directory
    try {
      const zipCleanupPath = path.join(tempDir, `heretto_${hash}.zip`);
      if (fsModule.existsSync(zipCleanupPath)) {
        fsModule.unlinkSync(zipCleanupPath);
      }
    } catch { /* best-effort cleanup */ }
    try {
      const cleanupOutputDir = path.join(tempDir, `heretto_${hash}`);
      if (fsModule.existsSync(cleanupOutputDir)) {
        fsModule.rmSync(cleanupOutputDir, { recursive: true, force: true });
      }
    } catch { /* best-effort cleanup */ }
    log(config, "warning", `Failed to download or extract output: ${error.message}`);
    return null;
  }
}

export async function getResourceDependencies(
  restClient: AxiosInstance,
  ditamapId: string,
  log: Function,
  config: any
): Promise<Record<string, any>> {
  const { XMLParser } = await import("fast-xml-parser");
  const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  const pathToUuidMap: Record<string, any> = {};
  const REST_API_PATH = "/rest/all-files";

  // Get ditamap info
  try {
    log(config, "debug", `Fetching ditamap info for: ${ditamapId}`);
    const ditamapInfo = await restClient.get(`${REST_API_PATH}/${ditamapId}`);
    const ditamapParsed = xmlParser.parse(ditamapInfo.data);

    const ditamapUri = ditamapParsed.resource?.["xmldb-uri"] || ditamapParsed["@_uri"];
    const ditamapName = ditamapParsed.resource?.name || ditamapParsed["@_name"];
    const ditamapParentFolder =
      ditamapParsed.resource?.["folder-uuid"] ||
      ditamapParsed.resource?.["@_folder-uuid"] ||
      ditamapParsed["@_folder-uuid"];

    if (ditamapUri) {
      let relativePath = ditamapUri;
      const orgPathMatch = relativePath?.match(/\/db\/organizations\/[^/]+\/(.+)/);
      if (orgPathMatch) {
        relativePath = orgPathMatch[1];
      }

      pathToUuidMap[relativePath] = {
        uuid: ditamapId,
        fullPath: ditamapUri,
        name: ditamapName,
        parentFolderId: ditamapParentFolder,
        isDitamap: true,
      };

      pathToUuidMap._ditamapPath = relativePath;
      pathToUuidMap._ditamapId = ditamapId;
      pathToUuidMap._ditamapParentFolderId = ditamapParentFolder;
    }
  } catch (ditamapError: any) {
    log(config, "warning", `Could not get ditamap info: ${ditamapError.message}`);
  }

  // Get dependencies
  try {
    log(config, "debug", `Fetching resource dependencies for ditamap: ${ditamapId}`);
    const response = await restClient.get(`${REST_API_PATH}/${ditamapId}/dependencies`);
    const parsed = xmlParser.parse(response.data);

    const extractDependencies = (obj: any) => {
      if (!obj) return;

      let dependencies = obj.dependencies?.dependency || obj.dependency;
      if (!dependencies) {
        if (obj["@_id"] && obj["@_uri"]) {
          dependencies = [obj];
        } else if (Array.isArray(obj)) {
          dependencies = obj;
        }
      }
      if (!dependencies) return;
      if (!Array.isArray(dependencies)) {
        dependencies = [dependencies];
      }

      for (const dep of dependencies) {
        const uuid = dep["@_id"] || dep["@_uuid"] || dep.id || dep.uuid;
        const uri = dep["@_uri"] || dep["@_path"] || dep.uri || dep.path || dep["xmldb-uri"];
        const name = dep["@_name"] || dep.name;
        const parentFolderId = dep["@_folder-uuid"] || dep["@_parent"] || dep["folder-uuid"];

        if (uuid && (uri || name)) {
          let relativePath = uri || name;
          const orgPathMatch = relativePath?.match(/\/db\/organizations\/[^/]+\/(.+)/);
          if (orgPathMatch) {
            relativePath = orgPathMatch[1];
          }

          pathToUuidMap[relativePath] = {
            uuid,
            fullPath: uri,
            name: name || path.basename(relativePath || ""),
            parentFolderId,
          };
        }

        if (dep.dependencies || dep.dependency) {
          extractDependencies(dep);
        }
      }
    };

    extractDependencies(parsed);
    log(config, "info", `Retrieved ${Object.keys(pathToUuidMap).length} resource dependencies from Heretto`);
  } catch (error: any) {
    const statusCode = error.response?.status;
    log(config, "debug", `Dependencies endpoint not available (${statusCode}), will use ditamap info as fallback`);
  }

  return pathToUuidMap;
}

interface LoadDeps {
  createApiClientFn?: (config: any) => AxiosInstance;
  createRestApiClientFn?: (config: any) => AxiosInstance;
  downloadFn?: typeof downloadAndExtractOutput;
  getResourceDependenciesFn?: typeof getResourceDependencies;
}

export async function loadHerettoContent(
  herettoConfig: any,
  log: Function,
  config: any,
  deps?: LoadDeps
): Promise<string | null> {
  const createApiClientFn = deps?.createApiClientFn || createApiClient;
  const createRestApiClientFn = deps?.createRestApiClientFn || createRestApiClient;
  const downloadFn = deps?.downloadFn || downloadAndExtractOutput;
  const getResourceDependenciesFn = deps?.getResourceDependenciesFn || getResourceDependencies;

  log(config, "info", `Loading content from Heretto "${herettoConfig.name}"...`);

  try {
    const client = createApiClientFn(herettoConfig);
    const restClient = createRestApiClientFn(herettoConfig);

    const scenarioName = herettoConfig.scenarioName || DEFAULT_SCENARIO_NAME;
    const scenario = await findScenario(client, log, config, scenarioName);
    if (!scenario) {
      log(config, "warning", `Skipping Heretto "${herettoConfig.name}" - could not find publishing scenario`);
      return null;
    }

    if (herettoConfig.uploadOnChange) {
      log(config, "debug", `Fetching resource dependencies for ditamap ${scenario.fileId}...`);
      const resourceDependencies = await getResourceDependenciesFn(
        restClient,
        scenario.fileId,
        log,
        config
      );
      herettoConfig.resourceDependencies = resourceDependencies;
    }

    log(config, "debug", `Triggering publishing job for file ${scenario.fileId}...`);
    const job = await triggerPublishingJob(client, scenario.fileId, scenario.scenarioId);
    log(config, "debug", `Publishing job started: ${job.jobId}`);

    log(config, "info", `Waiting for publishing job to complete...`);
    const completedJob = await pollJobStatus(client, scenario.fileId, job.jobId, log, config);
    if (!completedJob) {
      log(config, "warning", `Skipping Heretto "${herettoConfig.name}" - publishing job failed or timed out`);
      return null;
    }

    const outputPath = await downloadFn(
      client,
      scenario.fileId,
      job.jobId,
      herettoConfig.name,
      log,
      config
    );

    return outputPath;
  } catch (error: any) {
    log(config, "warning", `Failed to load Heretto "${herettoConfig.name}": ${error.message}`);
    return null;
  }
}
