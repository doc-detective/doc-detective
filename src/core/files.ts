import fs from "node:fs";
import path from "node:path";
import { validate } from "../common/src/validate.js";
import { requireYaml } from "./lazyYaml.js";
import { log, redactUrlForOutput } from "./utils.js";

// An error's message as the reason that ends a sentence: ": <text>." keeping
// its own final `.`, `!` or `?`. Just "." for an empty or blank message.
const reason = (text?: string) => {
  const trimmed = text?.trim();
  return !trimmed ? "." : `: ${/[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`}`;
};

/**
 * Reads and parses content from a remote URL or local file path, supporting JSON and YAML formats.
 *
 * @param {Object} options - Options object
 * @param {string} options.fileURLOrPath - The URL or local file path to read.
 * @param {boolean} [options.throwOnError=false] - Throw the read failure's message instead of warning and returning null.
 * @returns {Promise<Object|string|null>} Parsed object for JSON or YAML files, raw string for other formats, or null if reading fails.
 * @throws {Error} If fileURLOrPath is missing, not a string, or is an empty string, or, with throwOnError, if reading fails.
 */
async function readFile({
  fileURLOrPath,
  throwOnError = false,
}: {
  fileURLOrPath: string;
  throwOnError?: boolean;
}) {
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

  // A read failure: a warning and null, or with throwOnError, an Error.
  const fail = (message: string) => {
    if (throwOnError) throw new Error(message);
    log({}, "warning", message);
    return null;
  };

  if (isRemote) {
    try {
      const response = await (await import("axios")).default.get(fileURLOrPath);
      content = response.data;
    } catch (error: any) {
      return fail(`Couldn't read ${redactUrlForOutput(fileURLOrPath)}${reason(error.message)}`);
    }
  } else {
    try {
      content = await fs.promises.readFile(fileURLOrPath, "utf8");
    } catch (error: any) {
      return fail(
        `Couldn't read ${path.resolve(fileURLOrPath)}${
          error.code === "ENOENT" ? ": the file doesn't exist." : reason(error.message)
        }`
      );
    }
  }

  return parseFileContent(content, fileURLOrPath, { throwOnError });
}

// Where a file is, for messages: its redacted URL, or its absolute path.
function locationOf(fileURLOrPath: string): string {
  return /^https?:\/\//i.test(fileURLOrPath)
    ? redactUrlForOutput(fileURLOrPath)
    : path.resolve(fileURLOrPath);
}

/**
 * Parses file content by the extension of its URL or path: JSON, YAML, or as is.
 *
 * @param {any} content - The raw content, or a remote JSON body axios already parsed.
 * @param {string} fileURLOrPath - The URL or path the content came from.
 * @param {Object} [options] - Options object
 * @param {boolean} [options.throwOnError=false] - Throw a parse failure, naming its cause, instead of warning and returning the content.
 * @returns {Object|string} Parsed object for JSON or YAML files, the content otherwise.
 */
function parseFileContent(
  content: any,
  fileURLOrPath: string,
  { throwOnError = false }: { throwOnError?: boolean } = {}
) {
  // Already parsed, as axios does for a JSON response.
  if (typeof content !== "string") return content;
  // A URL's extension comes from its path, so a query string can't hide it.
  const name = /^https?:\/\//i.test(fileURLOrPath)
    ? new URL(fileURLOrPath).pathname
    : fileURLOrPath;
  const ext = name.split(".").pop()?.toLowerCase();
  // A parse failure: a warning and the content, or with throwOnError, an
  // Error. A YAML error's first line is its cause; a code frame follows.
  const failed = (format: string, error: any) => {
    if (throwOnError) {
      const cause = String(error.message).split("\n")[0].replace(/:$/, "");
      throw new Error(
        `Couldn't read ${locationOf(fileURLOrPath)}: it isn't valid ${format} (${cause}).`
      );
    }
    log({}, "warning", `Failed to parse ${format}: ${error.message}`);
    return content;
  };

  if (ext === "json") {
    try {
      return JSON.parse(content);
    } catch (error: any) {
      return failed("JSON", error);
    }
  } else if (ext === "yaml" || ext === "yml") {
    try {
      return requireYaml().parse(content);
    } catch (error: any) {
      return failed("YAML", error);
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
      if (
        pathProperties!.includes(property) ||
        (isStep && stepShorthandPathProperties.includes(property))
      ) {
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

export { readFile, parseFileContent, locationOf, resolvePaths };
