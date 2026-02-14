import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import axios from "axios";
import { validate } from "doc-detective-common";

/**
 * Read content from a remote URL or local filesystem path and parse JSON or YAML when applicable.
 *
 * @param fileURLOrPath - The URL (http/https) or local file path to read.
 * @returns Parsed object for JSON or YAML files, the raw file content string for other formats, or `null` if the file could not be read.
 * @throws Error If `fileURLOrPath` is missing, not a string, or an empty string.
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
      const response = await axios.get(fileURLOrPath);
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
      return YAML.parse(content);
    } catch (error: any) {
      console.warn(`Failed to parse YAML: ${error.message}`);
      return content;
    }
  } else {
    return content;
  }
}

/**
 * Resolve relative path properties in a config or spec object to absolute filesystem or URI paths.
 *
 * @param config - Configuration object that may contain `relativePathBase` used when resolving paths.
 * @param object - The config or spec object whose path-bearing properties will be resolved in place.
 * @param filePath - Reference file or directory used as the base when resolving relative paths.
 * @param nested - True when invoked recursively for nested objects.
 * @param objectType - `'config'` or `'spec'`; required for recursive calls to determine which properties to resolve.
 * @returns The same `object` with applicable path properties converted to absolute paths.
 * @throws Error If the top-level object matches neither the config nor spec schema, if `nested` is true but `objectType` is missing, or if `objectType` is invalid.
 */
async function resolvePaths({
  config,
  object,
  filePath,
  nested = false,
  objectType,
}: {
  config: any;
  object: any;
  filePath: string;
  nested?: boolean;
  objectType?: string;
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

  /**
   * Resolve a relative path to an absolute filesystem path or return certain URIs unchanged.
   *
   * Resolves `relativePath` against a base derived from `filePath` when `baseType` is `"file"`,
   * otherwise resolves `relativePath` against the process working directory. If `relativePath`
   * is already absolute or is an `http://`, `https://`, or `heretto:` URI, it is returned unchanged.
   *
   * @param baseType - When `"file"`, use the directory of `filePath` as the resolution base; any other value resolves `relativePath` relative to the process cwd.
   * @param relativePath - The path or URI to resolve.
   * @param filePath - Reference path used to derive a base directory when `baseType` is `"file"`. May be a file or directory path.
   * @returns The resolved absolute filesystem path, or the original `relativePath` unchanged if it is already absolute or is an `http://`, `https://`, or `heretto:` URI.
   */
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
          });
        } else if (
          typeof item === "string" &&
          pathProperties!.includes(property)
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
      if (pathProperties!.includes(property)) {
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

export { readFile, resolvePaths };