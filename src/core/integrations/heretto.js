/**
 * Heretto CMS uploader - handles uploading files back to Heretto CMS.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { URL } = require("url");

/**
 * Heretto uploader class implementing the uploader interface.
 */
class HerettoUploader {
  /**
   * Checks if this uploader can handle the given source integration.
   * @param {Object} sourceIntegration - Source integration metadata
   * @returns {boolean} True if this uploader handles Heretto integrations
   */
  canHandle(sourceIntegration) {
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
  async upload({ config, integrationConfig, localFilePath, sourceIntegration, log }) {
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
        log: (level, msg) => log(config, level, msg),
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
            log: (level, msg) => log(config, level, msg),
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
              log: (level, msg) => log(config, level, msg),
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
              log: (level, msg) => log(config, level, msg),
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
            log: (level, msg) => log(config, level, msg),
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
              log: (level, msg) => log(config, level, msg),
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
                log: (level, msg) => log(config, level, msg),
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
            log: (level, msg) => log(config, level, msg),
          });
          
          if (!fileId) {
            result.description = `Could not find file or parent folder in Heretto: ${sourceIntegration.filePath}`;
            return result;
          }
        }
      } catch (error) {
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
        log: (level, msg) => log(config, level, msg),
      });

      result.status = "PASS";
      result.description = `Successfully uploaded to Heretto (document ID: ${fileId})`;
    } catch (error) {
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
  resolveFromDependencies({ resourceDependencies, filePath, filename, log }) {
    if (!resourceDependencies) return null;
    
    // Normalize the file path for comparison using posix normalize for cross-platform support
    // Use normalize to handle multiple levels of relative references like ../../folder/file.png
    const normalizedPath = path.posix
      .normalize(filePath.replace(/\\/g, "/"))
      .replace(/^\.\.\/+/g, "") // Remove leading ../
      .replace(/^\.\//, ""); // Remove leading ./
    
    // Try exact path match first
    for (const [depPath, info] of Object.entries(resourceDependencies)) {
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
    
    for (const [depPath, info] of Object.entries(resourceDependencies)) {
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
    for (const [depPath, info] of Object.entries(resourceDependencies)) {
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
  findParentFolderFromDependencies({ resourceDependencies, filePath, log }) {
    const result = {
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
    for (const [depPath, info] of Object.entries(resourceDependencies)) {
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
    for (const [depPath, info] of Object.entries(resourceDependencies)) {
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
  async getChildFolderByName({ apiBaseUrl, apiToken, username, parentFolderId, folderName, log }) {
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

      const req = protocol.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
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
            } catch (parseError) {
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

      req.on("error", (error) => {
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
  async createDocument({ apiBaseUrl, apiToken, username, parentFolderId, filename, mimeType, log }) {
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

      const req = protocol.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
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
            } catch (parseError) {
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

      req.on("error", (error) => {
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
  async getFileInFolder({ apiBaseUrl, apiToken, username, folderId, filename, log }) {
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

      const req = protocol.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
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
            } catch (parseError) {
              log("debug", `Error parsing folder contents: ${parseError.message}`);
              resolve(null);
            }
          } else {
            log("debug", `Failed to get folder contents: ${res.statusCode}`);
            resolve(null);
          }
        });
      });

      req.on("error", (error) => {
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
  escapeXml(str) {
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
  async searchFolderByName({ apiBaseUrl, apiToken, username, folderName, log }) {
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

      const req = protocol.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
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
                  (r) => r.name === folderName || r.title === folderName
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
            } catch (parseError) {
              reject(new Error(`Failed to parse folder search response: ${parseError.message}`));
            }
          } else {
            reject(new Error(`Folder search request failed with status ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on("error", (error) => {
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
  async searchFileByName({ apiBaseUrl, apiToken, username, filename, log }) {
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

      const req = protocol.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
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
                  (r) => r.name === filename || r.title === filename
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
            } catch (parseError) {
              reject(new Error(`Failed to parse search response: ${parseError.message}`));
            }
          } else {
            reject(new Error(`Search request failed with status ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on("error", (error) => {
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
  async uploadFile({ apiBaseUrl, apiToken, username, documentId, content, contentType, log }) {
    const uploadUrl = new URL(`/rest/all-files/${documentId}/content`, apiBaseUrl);

    return new Promise((resolve, reject) => {
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

      const req = protocol.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
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

      req.on("error", (error) => {
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
  async getDocumentInfo({ apiBaseUrl, apiToken, username, documentId, log }) {
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

      const req = protocol.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
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
            } catch (parseError) {
              reject(new Error(`Failed to parse document info: ${parseError.message}`));
            }
          } else {
            reject(new Error(`Get document info failed with status ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on("error", (error) => {
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
  async getDocumentContent({ apiBaseUrl, apiToken, username, documentId, log }) {
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

      const req = protocol.request(options, (res) => {
        const chunks = [];

        res.on("data", (chunk) => {
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

      req.on("error", (error) => {
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
  getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    const contentTypes = {
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

module.exports = {
  HerettoUploader,
};
