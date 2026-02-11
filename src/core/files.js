const fs = require("fs");
const path = require("path");
const YAML = require("yaml");
const axios = require("axios");
const { validate } = require("doc-detective-common");

/**
 * Reads and parses content from a remote URL or local file path, supporting JSON and YAML formats.
 *
 * @param {Object} options - Options object
 * @param {string} options.fileURLOrPath - The URL or local file path to read.
 * @returns {Promise<Object|string|null>} Parsed object for JSON or YAML files, raw string for other formats, or null if reading fails.
 * @throws {Error} If fileURLOrPath is missing, not a string, or is an empty string.
 */
async function readFile({ fileURLOrPath }) {
  if (!fileURLOrPath) {
    throw new Error("fileURLOrPath is required");
  }
  if (typeof fileURLOrPath !== "string") {
    throw new Error("fileURLOrPath must be a string");
  }
  if (fileURLOrPath.trim() === "") {
    throw new Error("fileURLOrPath cannot be an empty string");
  }

  let content;
  let isRemote = false;

  try {
    const parsedURL = new URL(fileURLOrPath);
    isRemote =
      parsedURL.protocol === "http:" || parsedURL.protocol === "https:";
  } catch (error) {
    // Not a valid URL, assume local file path
  }

  if (isRemote) {
    try {
      const response = await axios.get(fileURLOrPath);
      content = response.data;
    } catch (error) {
      console.warn(
        `Error reading remote file from ${fileURLOrPath}: ${error.message}`
      );
      return null;
    }
  } else {
    try {
      content = await fs.promises.readFile(fileURLOrPath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        console.warn(`File not found: ${fileURLOrPath}`);
      } else {
        console.warn(`Error reading file: ${error.message}`);
      }
      return null;
    }
  }

  // Parse based on file extension
  const ext = fileURLOrPath.split(".").pop()?.toLowerCase();

  if (ext === "json") {
    try {
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Failed to parse JSON: ${error.message}`);
      return content;
    }
  } else if (ext === "yaml" || ext === "yml") {
    try {
      return YAML.parse(content);
    } catch (error) {
      console.warn(`Failed to parse YAML: ${error.message}`);
      return content;
    }
  } else {
    return content;
  }
}

/**
 * Convert recognized relative path properties in a config or spec object to absolute paths.
 *
 * @param {Object} options - Options for path resolution.
 * @param {Object} options.config - Configuration containing settings such as relativePathBase.
 * @param {Object} options.object - The config or spec object whose path properties will be resolved.
 * @param {string} options.filePath - Reference file or directory used to resolve relative paths.
 * @param {boolean} [options.nested=false] - True when invoked recursively for nested objects.
 * @param {string} [options.objectType] - 'config' or 'spec'; required for nested invocations.
 * @returns {Promise<Object>} The same object with applicable path properties converted to absolute paths.
 * @throws {Error} If the top-level object matches neither config nor spec schema, or if objectType is missing for nested calls.
 */
async function resolvePaths({
  config,
  object,
  filePath,
  nested = false,
  objectType,
}) {
  // Config properties that contain paths
  const configPaths = [
    "input",
    "output",
    "loadVariables",
    "setup",
    "cleanup",
    "configPath",
    "beforeAny",
    "afterAll",
    "mediaDirectory",
    "downloadDirectory",
    "descriptionPath",
    "path",
  ];
  // Spec properties that contain paths
  const specPaths = [
    "file",
    "path",
    "directory",
    "before",
    "after",
    "loadVariables",
    "setup",
    "cleanup",
    "savePath",
    "saveDirectory",
    "specPath",
    "descriptionPath",
    "workingDirectory",
  ];
  // Spec objects that are configurable by the user and shouldn't be resolved
  const specNoResolve = [
    "requestData",
    "responseData",
    "requestHeaders",
    "responseHeaders",
    "requestParams",
    "responseParams",
  ];

  function resolve(baseType, relativePath, filePath) {
    // If the path is an http:// or https:// URL, or a heretto: URI, return it
    if (
      relativePath.startsWith("https://") ||
      relativePath.startsWith("http://") ||
      relativePath.startsWith("heretto:")
    ) {
      return relativePath;
    }

    // If path is already absolute, return it
    if (path.isAbsolute(relativePath)) {
      return relativePath;
    }

    // Check if filePath exists and is a file
    const fileExists = fs.existsSync(filePath);
    const isFile = fileExists
      ? fs.lstatSync(filePath).isFile()
      : path.parse(filePath).ext !== "";

    // Use directory of filePath if it's a file (or looks like one)
    const basePath = isFile ? path.dirname(filePath) : filePath;

    // Resolve the path based on the base type
    return baseType === "file"
      ? path.resolve(basePath, relativePath)
      : path.resolve(relativePath);
  }

  const relativePathBase = config.relativePathBase;

  let pathProperties;
  if (!nested && !objectType) {
    // Check if object matches the config schema
    const validation = validate({
      schemaKey: "config_v3",
      object: { ...object },
    });
    if (validation.valid) {
      pathProperties = configPaths;
      objectType = "config";
    } else {
      // Check if object matches the spec schema
      const validation = validate({
        schemaKey: "spec_v3",
        object: { ...object },
      });
      if (validation.valid) {
        pathProperties = specPaths;
        objectType = "spec";
      } else {
        throw new Error("Object isn't a valid config or spec.");
      }
    }
  } else if (nested && !objectType) {
    throw new Error("Object type is required for nested objects.");
  } else if (objectType === "config") {
    pathProperties = configPaths;
  } else if (objectType === "spec") {
    pathProperties = specPaths;
  } else {
    throw new Error("Invalid objectType");
  }

  // If the object is null or empty, return it as is
  if (object === null || Object.keys(object).length === 0) {
    return object;
  }

  for (const property of Object.keys(object)) {
    if (Array.isArray(object[property])) {
      for (let i = 0; i < object[property].length; i++) {
        const item = object[property][i];

        if (typeof item === "object") {
          await resolvePaths({
            config: config,
            object: item,
            filePath: filePath,
            nested: true,
            objectType: objectType,
          });
        } else if (
          typeof item === "string" &&
          pathProperties.includes(property)
        ) {
          const resolved =
            property === "path" &&
            object.directory &&
            path.isAbsolute(object.directory)
              ? resolve(relativePathBase, item, object.directory)
              : resolve(relativePathBase, item, filePath);
          object[property][i] = resolved;
        }
      }
    } else if (
      typeof object[property] === "object" &&
      ((objectType === "spec" && !specNoResolve.includes(property)) ||
        objectType === "config")
    ) {
      object[property] = await resolvePaths({
        config: config,
        object: object[property],
        filePath: filePath,
        nested: true,
        objectType: objectType,
      });
    } else if (typeof object[property] === "string") {
      if (
        object[property].startsWith("https://") ||
        object[property].startsWith("http://") ||
        object[property].startsWith("heretto:")
      ) {
        continue;
      }
      if (pathProperties.includes(property)) {
        if (property === "path" && object.directory) {
          const directory = path.isAbsolute(object.directory)
            ? object.directory
            : resolve(relativePathBase, object.directory, filePath);
          object[property] = resolve(
            relativePathBase,
            object[property],
            directory
          );
        } else {
          object[property] = resolve(
            relativePathBase,
            object[property],
            filePath
          );
        }
      }
    }
  }
  return object;
}

module.exports = { readFile, resolvePaths };
