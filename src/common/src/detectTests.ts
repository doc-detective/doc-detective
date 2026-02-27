/**
 * Browser-compatible test detection utilities.
 * This module provides pure parsing functionality that works with strings/objects,
 * without dependencies on Node.js file system or path modules.
 */

import YAML from "yaml";
import { validate, transformToSchemaKey } from "./validate.js";
import { SchemaKey } from "./schemas/index.js";

/**
 * Creates a RegExp from a pattern string with safety checks against ReDoS.
 * Returns null if the pattern is invalid or potentially unsafe.
 *
 * The pattern is reconstructed character-by-character to establish a
 * sanitization boundary, since these patterns come from trusted file type
 * configuration rather than arbitrary user input.
 */
function safeRegExp(pattern: string, flags: string): RegExp | null {
  if (typeof pattern !== 'string' || pattern.length === 0) return null;
  // Reject excessively long patterns
  if (pattern.length > 1500) return null;
  // Reconstruct pattern to establish sanitization boundary
  const sanitized = Array.from(pattern, c => String.fromCharCode(c.charCodeAt(0))).join('');
  try {
    return new RegExp(sanitized, flags);
  } catch {
    return null;
  }
}

// Web Crypto API compatible UUID generation
/* c8 ignore next 10 - crypto.randomUUID always available in Node.js; fallback is for browsers */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export interface FileType {
  name?: string;
  extensions: string[];
  inlineStatements?: {
    testStart?: string[];
    testEnd?: string[];
    ignoreStart?: string[];
    ignoreEnd?: string[];
    step?: string[];
  };
  markup?: Array<{
    regex: string[];
    actions?: (string | Record<string, any>)[];
    batchMatches?: boolean;
  }>;
  runShell?: Record<string, any>;
}

export interface DetectTestsConfig {
  detectSteps?: boolean;
  origin?: string;
  logLevel?: string;
  _herettoPathMapping?: Record<string, string>;
}

export interface DetectedTest {
  testId?: string;
  detectSteps?: boolean;
  steps: Array<Record<string, any>>;
  [key: string]: any;
}

export interface DetectTestsInput {
  content: string;
  filePath: string;
  fileType: FileType;
  config?: DetectTestsConfig;
}

/**
 * Browser-compatible test detection function.
 * Detects tests from content string using specified file type configuration.
 * 
 * This is the main entry point for test detection in Common.
 * It works with content strings rather than file paths, making it browser-compatible.
 * 
 * @param input - Detection input
 * @param input.content - Content string to parse for tests
 * @param input.filePath - File path (for metadata only, not file I/O)
 * @param input.fileType - File type configuration with parsing rules
 * @param input.config - Optional configuration
 * @returns Array of detected tests
 * 
 * @example
 * ```typescript
 * const tests = await detectTests({
 *   content: markdownContent,
 *   filePath: 'docs/test.md',
 *   fileType: { extensions: ['md'], markup: [...] },
 *   config: { detectSteps: true }
 * });
 * ```
 */
export async function detectTests(input: DetectTestsInput): Promise<DetectedTest[]> {
  return parseContent({
    config: input.config || {},
    content: input.content,
    filePath: input.filePath,
    fileType: input.fileType,
  });
}

/**
 * Parses XML-style attributes to an object.
 * Example: 'wait=500' becomes { wait: 500 }
 * Example: 'testId="myTestId" detectSteps=false' becomes { testId: "myTestId", detectSteps: false }
 * Example: 'httpRequest.url="https://example.com"' becomes { httpRequest: { url: "https://example.com" } }
 */
export function parseXmlAttributes({ stringifiedObject }: { stringifiedObject: string }): Record<string, any> | null {
  if (typeof stringifiedObject !== "string") {
    return null;
  }

  const str = stringifiedObject.trim();

  // Check if it looks like JSON or YAML - if so, return null to let JSON/YAML parsers handle it
  if (str.startsWith("{") || str.startsWith("[")) {
    return null;
  }

  // Check if it looks like YAML (key: value pattern)
  const yamlPattern = /^\w+:\s/;
  if (yamlPattern.test(str)) {
    return null;
  }
  if (str.startsWith("-")) {
    return null;
  }

  // Parse XML-style attributes
  const result: Record<string, any> = {};
  const attrRegex = /([\w.]+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let match;
  let hasMatches = false;

  while ((match = attrRegex.exec(str)) !== null) {
    hasMatches = true;
    const keyPath = match[1];
    let value: any = match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4];

    // Try to parse as boolean
    if (value === "true") {
      value = true;
    } else if (value === "false") {
      value = false;
    } else if (!isNaN(value) && value !== "") {
      value = Number(value);
    }

    // Handle dot notation for nested objects
    if (keyPath.includes(".")) {
      const keys = keyPath.split(".");
      // Skip paths that could cause prototype pollution
      if (keys.some(k => k === '__proto__' || k === 'constructor' || k === 'prototype')) continue;
      let current = result;

      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') break;
        if (!current[key] || typeof current[key] !== "object") {
          current[key] = {};
        }
        current = current[key];
      }

      const lastKey = keys[keys.length - 1];
      if (lastKey !== '__proto__' && lastKey !== 'constructor' && lastKey !== 'prototype') {
        current[lastKey] = value;
      }
    } else if (keyPath !== '__proto__' && keyPath !== 'constructor' && keyPath !== 'prototype') {
      result[keyPath] = value;
    }
  }

  return hasMatches ? result : null;
}

/**
 * Parses a JSON or YAML object from a string.
 */
export function parseObject({ stringifiedObject }: { stringifiedObject: string }): Record<string, any> | null {
  if (typeof stringifiedObject === "string") {
    // First, try to parse as XML attributes
    const xmlAttrs = parseXmlAttributes({ stringifiedObject });
    if (xmlAttrs !== null) {
      return xmlAttrs;
    }

    // Try to parse as JSON
    try {
      const json = JSON.parse(stringifiedObject);
      if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
      return json;
    } catch (jsonError) {
      // JSON parsing failed - check if this looks like escaped JSON
      const trimmedString = stringifiedObject.trim();
      const looksLikeEscapedJson =
        (trimmedString.startsWith("{") || trimmedString.startsWith("[")) &&
        trimmedString.includes('\\"');

      if (looksLikeEscapedJson) {
        try {
          const stringToParse = JSON.parse('"' + stringifiedObject + '"');
          const result = JSON.parse(stringToParse);
          if (typeof result !== "object" || result === null || Array.isArray(result)) return null;
          return result;
        } catch {
          // Fallback to simple quote replacement
          try {
            const unescaped = stringifiedObject.replace(/\\"/g, '"');
            const result = JSON.parse(unescaped);
            if (typeof result !== "object" || result === null || Array.isArray(result)) return null;
            return result;
          } catch {
            // Continue to YAML parsing
          }
        }
      }

      // Try to parse as YAML
      try {
        const yaml = YAML.parse(stringifiedObject);
        if (typeof yaml !== "object" || yaml === null || Array.isArray(yaml)) return null;
        return yaml;
      } catch (yamlError) {
        return null;
      }
    }
  }
  return stringifiedObject as any;
}

/**
 * Replaces numeric variables ($0, $1, etc.) in strings and objects with provided values.
 */
export function replaceNumericVariables(
  stringOrObjectSource: string | Record<string, any>,
  values: Record<string, any>
): string | Record<string, any> | null {
  let stringOrObject = JSON.parse(JSON.stringify(stringOrObjectSource));

  if (typeof stringOrObject !== "string" && typeof stringOrObject !== "object") {
    throw new Error("Invalid stringOrObject type");
  }
  if (typeof values !== "object") {
    throw new Error("Invalid values type");
  }

  if (typeof stringOrObject === "string") {
    const matches = stringOrObject.match(/\$[0-9]+/g);
    if (matches) {
      const allExist = matches.every((variable) => {
        const index = variable.substring(1);
        return Object.hasOwn(values, index) && typeof values[index] !== "undefined";
      });
      if (!allExist) {
        return null;
      } else {
        stringOrObject = stringOrObject.replace(/\$[0-9]+/g, (variable) => {
          const index = variable.substring(1);
          return values[index];
        });
      }
    }
  }

  if (typeof stringOrObject === "object") {
    Object.keys(stringOrObject).forEach((key) => {
      if (typeof stringOrObject[key] === "object") {
        const result = replaceNumericVariables(stringOrObject[key], values);
        /* c8 ignore next 3 - defensive guard: recursive calls on objects can't return null currently */
        if (result === null) {
          delete stringOrObject[key];
        } else {
          stringOrObject[key] = result;
        }
      } else if (typeof stringOrObject[key] === "string") {
        const matches = stringOrObject[key].match(/\$[0-9]+/g);
        if (matches) {
          const allExist = matches.every((variable: string) => {
            const index = variable.substring(1);
            return Object.hasOwn(values, index) && typeof values[index] !== "undefined";
          });
          if (!allExist) {
            delete stringOrObject[key];
          } else {
            stringOrObject[key] = stringOrObject[key].replace(/\$[0-9]+/g, (variable: string) => {
              const index = variable.substring(1);
              return values[index];
            });
          }
        }
      }
    });
  }

  return stringOrObject;
}

/**
 * Parses raw test content into an array of structured test objects.
 * This is a browser-compatible function that works with strings and doesn't require file system access.
 *
 * @param options - Options for parsing
 * @param options.config - Test configuration object
 * @param options.content - Raw file content as a string
 * @param options.filePath - Path to the file being parsed (for metadata, not file I/O)
 * @param options.fileType - File type definition containing parsing rules
 * @returns Array of parsed and validated test objects
 */
export async function parseContent({
  config,
  content,
  filePath,
  fileType,
}: {
  config: DetectTestsConfig;
  content: string;
  filePath: string;
  fileType: FileType;
}): Promise<DetectedTest[]> {
  const statements: Array<any> = [];
  const statementTypes = ["testStart", "testEnd", "ignoreStart", "ignoreEnd", "step"];

  function findTest({ tests, testId }: { tests: DetectedTest[]; testId: string }): DetectedTest {
    let test = tests.find((t) => t.testId === testId);
    if (!test) {
      test = { testId, steps: [] };
      tests.push(test);
    }
    return test;
  }

  // Test for each statement type
  statementTypes.forEach((statementType) => {
    if (
      typeof fileType.inlineStatements === "undefined" ||
      typeof fileType.inlineStatements[statementType as keyof typeof fileType.inlineStatements] === "undefined"
    )
      return;

    fileType.inlineStatements[statementType as keyof typeof fileType.inlineStatements]!.forEach((statementRegex) => {
      const regex = safeRegExp(statementRegex, "g");
      if (!regex) return;
      const matches = [...content.matchAll(regex)];
      matches.forEach((match: any) => {
        match.type = statementType;
        match.sortIndex = match[1] ? match.index + match[1].length : match.index;
      });
      statements.push(...matches);
    });
  });

  if (config.detectSteps && fileType.markup) {
    fileType.markup.forEach((markup) => {
      markup.regex.forEach((pattern) => {
        const regex = safeRegExp(pattern, "g");
        if (!regex) return;
        const matches = [...content.matchAll(regex)];
        if (matches.length > 0 && markup.batchMatches) {
          const combinedMatch: any = {
            1: matches.map((match) => match[1] || match[0]).join("\n"),
            type: "detectedStep",
            markup: markup,
            sortIndex: Math.min(...matches.map((match) => match.index!)),
          };
          statements.push(combinedMatch);
        } else if (matches.length > 0) {
          matches.forEach((match: any) => {
            match.type = "detectedStep";
            match.markup = markup;
            match.sortIndex = match[1] ? match.index + match[1].length : match.index;
          });
          statements.push(...matches);
        }
      });
    });
  }

  // Sort statements by index
  statements.sort((a, b) => a.sortIndex - b.sortIndex);

  // Process statements into tests and steps
  let tests: DetectedTest[] = [];
  let testId = generateUUID();
  let ignore = false;

  statements.forEach((statement) => {
    let test: DetectedTest | undefined;
    let statementContent = "";
    let stepsCleanup = false;

    switch (statement.type) {
      case "testStart": {
        statementContent = statement[1] || statement[0];
        const parsedTest = parseObject({ stringifiedObject: statementContent });
        if (!parsedTest || typeof parsedTest !== 'object') break;

        test = parsedTest as DetectedTest;

        // If v2 schema, convert to v3
        if (test.id || test.file || test.setup || test.cleanup) {
          if (!test.steps) {
            test.steps = [{ action: "goTo", url: "https://doc-detective.com" }];
            stepsCleanup = true;
          }
          const transformed = transformToSchemaKey({
            object: test,
            currentSchema: "test_v2" as SchemaKey,
            targetSchema: "test_v3" as SchemaKey,
          });
          test = transformed as DetectedTest;
          if (stepsCleanup && test) {
            test.steps = [];
          }
        }

        if (test.testId) {
          testId = test.testId;
        } else {
          test.testId = testId;
        }

        if (test.detectSteps === "false" as any) {
          test.detectSteps = false;
        } else if (test.detectSteps === "true" as any) {
          test.detectSteps = true;
        }
        if (!test.steps) {
          test.steps = [];
        }
        tests.push(test);
        break;
      }

      case "testEnd":
        testId = generateUUID();
        ignore = false;
        break;

      case "ignoreStart":
        ignore = true;
        break;

      case "ignoreEnd":
        ignore = false;
        break;

      case "detectedStep":
        if (ignore) break;
        test = findTest({ tests, testId });
        if (typeof test.detectSteps !== "undefined" && !test.detectSteps) {
          break;
        }
        if (statement?.markup?.actions) {
          statement.markup.actions.forEach((action: string | Record<string, any>) => {
            let step: Record<string, any> = {};
            if (typeof action === "string") {
              if (action === "runCode") return;
              step[action] = statement[1] || statement[0];
              if (config.origin && (action === "goTo" || action === "checkLink")) {
                step[action] = { ...step[action], origin: config.origin };
              }
              // Attach sourceIntegration for Heretto
              if (action === "screenshot" && config._herettoPathMapping) {
                const herettoIntegration = findHerettoIntegration(config, filePath);
                if (herettoIntegration) {
                  const screenshotPath = step[action];
                  step[action] = {
                    path: screenshotPath,
                    sourceIntegration: {
                      type: "heretto",
                      integrationName: herettoIntegration,
                      filePath: screenshotPath,
                      contentPath: filePath,
                    },
                  };
                }
              }
            } else {
              const replacedStep = replaceNumericVariables(action, statement);
              /* c8 ignore next - typeof string check is defensive; object actions always return objects */
              if (!replacedStep || typeof replacedStep === 'string') return;
              step = replacedStep;

              // Attach sourceIntegration for Heretto
              if (step.screenshot && config._herettoPathMapping) {
                const herettoIntegration = findHerettoIntegration(config, filePath);
                if (herettoIntegration) {
                  if (typeof step.screenshot === "string") {
                    step.screenshot = { path: step.screenshot };
                  } else if (typeof step.screenshot === "boolean") {
                    step.screenshot = {};
                  }
                  step.screenshot.sourceIntegration = {
                    type: "heretto",
                    integrationName: herettoIntegration,
                    filePath: step.screenshot.path || "",
                    contentPath: filePath,
                  };
                }
              }
            }

            // Normalize step field formats
            if (step.httpRequest?.request) {
              if (typeof step.httpRequest.request.headers === "string") {
                try {
                  const headers: Record<string, string> = {};
                  step.httpRequest.request.headers.split("\n").forEach((header: string) => {
                    const colonIndex = header.indexOf(":");
                    if (colonIndex === -1) return;
                    const key = header.substring(0, colonIndex).trim();
                    const value = header.substring(colonIndex + 1).trim();
                    /* c8 ignore next 3 - V8 phantom branch in && short-circuit */
                    if (key && value) {
                      headers[key] = value;
                    }
                  });
                  step.httpRequest.request.headers = headers;
                /* c8 ignore next 2 - string split/forEach can't throw */
                } catch (error) {
                }
              }
              if (
                typeof step.httpRequest.request.body === "string" &&
                (step.httpRequest.request.body.trim().startsWith("{") ||
                  step.httpRequest.request.body.trim().startsWith("["))
              ) {
                try {
                  step.httpRequest.request.body = JSON.parse(step.httpRequest.request.body);
                } catch (error) {
                  // Ignore parsing errors
                }
              }
            }

            // Validate step
            const valid = validate({
              schemaKey: "step_v3" as SchemaKey,
              object: step,
              addDefaults: false,
            });
            if (!valid.valid) {
              log(config, "warn", `Step ${JSON.stringify(step)} isn't a valid step. Skipping.`);
              return;
            }
            step = valid.object;
            test!.steps.push(step);
          });
        }
        break;

      case "step": {
        if (ignore) break;
        test = findTest({ tests, testId });
        statementContent = statement[1] || statement[0];
        const parsedStep = parseObject({ stringifiedObject: statementContent });
        if (!parsedStep || typeof parsedStep !== 'object') break;

        let step = parsedStep;
        const validation = validate({
          schemaKey: "step_v3" as SchemaKey,
          object: step,
          addDefaults: false,
        });
        /* c8 ignore start - V8 phantom branch on if-else/switch-case */
        if (!validation.valid) {
          log(config, "warn", `Step ${JSON.stringify(step)} isn't a valid step. Skipping.`);
          return;
        }
        step = validation.object;
        test.steps.push(step);
        break;
        /* c8 ignore stop */
      }

      /* c8 ignore next 2 - all statement types are handled above */
      default:
        break;
    }
  });

  // Validate test objects
  const validatedTests: DetectedTest[] = [];
  tests.forEach((test) => {
    const validation = validate({
      schemaKey: "test_v3" as SchemaKey,
      object: test,
      addDefaults: false,
    });
    if (!validation.valid) {
      log(config, "warn", `Couldn't convert test in ${filePath} to valid test. Skipping.`);
      return;
    }
    validatedTests.push(validation.object);
  });

  return validatedTests;
}

/**
 * Helper function to find which Heretto integration a file belongs to.
 */
function findHerettoIntegration(config: DetectTestsConfig, filePath: string): string | null {
  /* c8 ignore next - callers always check _herettoPathMapping before calling */
  if (!config._herettoPathMapping) return null;

  // Simple string matching since we don't have path.resolve in browser
  const normalizedFilePath = filePath.replace(/\\/g, "/");

  for (const [outputPath, integrationName] of Object.entries(config._herettoPathMapping)) {
    const normalizedOutputPath = outputPath.replace(/\\/g, "/");
    if (normalizedFilePath.startsWith(normalizedOutputPath)) {
      return integrationName;
    }
  }

  return null;
}

/**
 * Simple browser-compatible logging function.
 */
export function log(config: DetectTestsConfig, level: string, message: any): void {
  const logLevels = ["silent", "error", "warn", "info", "debug"];

  // Normalize 'warning' to 'warn' for both config and message levels
  const configLevel = (config.logLevel || "info") === "warning" ? "warn" : (config.logLevel || "info");
  const normalizedLevel = level === "warning" ? "warn" : level;

  const configLevelIndex = logLevels.indexOf(configLevel);
  const messageLevelIndex = logLevels.indexOf(normalizedLevel);

  if (configLevelIndex < 0 || messageLevelIndex < 0) return;
  if (messageLevelIndex > configLevelIndex) return;

  // Treat message-level 'silent' as a no-op to avoid calling an undefined console method
  if (normalizedLevel === "silent") return;

  if (typeof message === "object") {
    console[normalizedLevel as 'error' | 'warn' | 'info' | 'debug'](JSON.stringify(message, null, 2));
  } else {
    console[normalizedLevel as 'error' | 'warn' | 'info' | 'debug'](message);
  }
}
