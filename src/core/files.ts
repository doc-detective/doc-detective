import fs from "node:fs";
import path from "node:path";
import { validate } from "../common/src/validate.js";
import { requireYaml } from "./lazyYaml.js";

/**
 * Reads and parses content from a remote URL or local file path, supporting JSON and YAML formats.
 *
 * @param {Object} options - Options object
 * @param {string} options.fileURLOrPath - The URL or local file path to read.
 * @returns {Promise<Object|string|null>} Parsed object for JSON or YAML files, raw string for other formats, or null if reading fails.
 * @throws {Error} If fileURLOrPath is missing, not a string, or is an empty string.
 */
async function readFile({ fileURLOrPath }: { fileURLOrPath: string }) {
  if (!fileURLOrPath) {
    throw new Error("fileURLOrPath is required");
  }
  if (typeof fileURLOrPath !== "string") {
    throw new Error("fileURLOrPath must be a string");
  }
  if (fileURLOrPath.trim() === "") {
    throw new Error("fileURLOrPath cannot be an empty string");
  }

  let content: any;
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
      const response = await (await import("axios")).default.get(fileURLOrPath);
      content = response.data;
    } catch (error: any) {
      console.warn(
        `Error reading remote file from ${fileURLOrPath}: ${error.message}`
      );
      return null;
    }
  } else {
    try {
      content = await fs.promises.readFile(fileURLOrPath, "utf8");
    } catch (error: any) {
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
    } catch (error: any) {
      console.warn(`Failed to parse JSON: ${error.message}`);
      return content;
    }
  } else if (ext === "yaml" || ext === "yml") {
    try {
      return requireYaml().parse(content);
    } catch (error: any) {
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
  isStep = false,
}: {
  config: any;
  object: any;
  filePath: string;
  nested?: boolean;
  objectType?: string;
  isStep?: boolean;
}) {
  // Config properties that contain paths
  const configPaths = [
    "input",
    "output",
    "outputDir",
    "loadVariables",
    "setup",
    "cleanup",
    "configPath",
    "beforeAll",
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
  // Spec objects that are configurable by the user and shouldn't be resolved:
  // httpRequest's `request` and `response`, and their v2 names.
  const specNoResolve = [
    "request",
    "response",
    "requestData",
    "responseData",
    "requestHeaders",
    "responseHeaders",
    "requestParams",
    "responseParams",
  ];
  // Step actions whose STRING (not object) shorthand value IS a path itself
  // (e.g. `"screenshot": "shot.png"`), rather than a wrapper containing a
  // `path`/`directory` key. The object form already resolves via the generic
  // `path`/`directory` handling above; only the bare-string form needs this
  // separate list. Scoped to `isStep` so a coincidentally-named field nested
  // inside request/response data (not a step) is never mistaken for one.
  const stepShorthandPathProperties = ["screenshot", "record"];

  function resolve(baseType: string, relativePath: string, filePath: string) {
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

    // Check if filePath exists and is a file. A trailing separator marks a
    // folder that may not exist yet, even one with a dot in its name.
    const fileExists = fs.existsSync(filePath);
    const isFile = /[\\/]$/.test(filePath)
      ? false
      : fileExists
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

  let pathProperties: string[];
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
            isStep: property === "steps",
          });
        } else if (
          typeof item === "string" &&
          pathProperties!.includes(property)
        ) {
          const resolved =
            property === "path" &&
            object.directory &&
            path.isAbsolute(object.directory)
              ? // Append sep so resolve() treats it as a folder even if it doesn't
                // exist yet or has a dot in its name (ADR 01173).
                resolve(relativePathBase, item, object.directory + path.sep)
              : resolve(relativePathBase, item, filePath);
          object[property][i] = resolved;
        }
      }
    } else if (
      typeof object[property] === "object" &&
      ((objectType === "spec" && !specNoResolve.includes(property)) ||
        objectType === "config")
    ) {
      // A cookie file `path` without `directory` belongs under outputDir, which
      // the cookie handlers join at run time (ADR 01174). The recursive call
      // below resolves every `path` against the spec, so save this one first
      // and put it back afterward, undoing that resolution.
      const cookie = object[property];
      const cookiePath =
        isStep && (property === "saveCookie" || property === "loadCookie") && cookie?.path && !cookie.directory
          ? cookie.path
          : undefined;
      object[property] = await resolvePaths({
        config: config,
        object: object[property],
        filePath: filePath,
        nested: true,
        objectType: objectType,
      });
      if (cookiePath !== undefined) object[property].path = cookiePath;
    } else if (typeof object[property] === "string") {
      if (
        object[property].startsWith("https://") ||
        object[property].startsWith("http://") ||
        object[property].startsWith("heretto:")
      ) {
        continue;
      }
      if (
        pathProperties!.includes(property) ||
        (isStep && stepShorthandPathProperties.includes(property))
      ) {
        if (property === "path" && object.directory) {
          const directory = path.isAbsolute(object.directory)
            ? object.directory
            : resolve(relativePathBase, object.directory, filePath);
          // `directory` is a folder, even before it exists.
          object[property] = resolve(
            relativePathBase,
            object[property],
            directory + path.sep
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

export { readFile, resolvePaths };
