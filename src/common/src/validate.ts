import { schemas, SchemaKey } from "./schemas/index.js";
import Ajv, { ValidateFunction, ErrorObject } from "ajv";
// Ajv extra formats: https://ajv.js.org/packages/ajv-formats.html
import addFormats from "ajv-formats";
// Ajv extra keywords: https://ajv.js.org/packages/ajv-keywords.html
import addKeywords from "ajv-keywords";
// Ajv custom errors: https://ajv.js.org/packages/ajv-errors.html
import addErrors from "ajv-errors";
import dynamicDefaultsDef from "ajv-keywords/dist/definitions/dynamicDefaults.js";

// Browser-compatible UUID function
/* c8 ignore next 10 - crypto.randomUUID always available in Node.js; fallback is for browsers */
function getRandomUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Configure base Ajv. This is the MUTATING validator: `useDefaults` fills in
// schema defaults and `coerceTypes` rewrites values in place. Both mutate the
// data they validate, which is why every validation runs against a clone.
// @ts-expect-error - CJS/ESM interop: Ajv constructor is callable at runtime
const ajv = new Ajv({
  strictSchema: false,
  useDefaults: true,
  allErrors: true,
  allowUnionTypes: true,
  coerceTypes: true,
});

// A second, NON-mutating Ajv used only to *probe* which compatible schema an
// object matches. It has `useDefaults`/`coerceTypes` OFF, so it never touches
// the data — that lets us try every candidate schema against the caller's
// object directly, with no per-candidate clone. The winning schema is then
// re-run through the mutating `ajv` on a single clone to reproduce the exact
// defaults/coercions the old code produced. Schemas compile lazily on first
// use, so this instance only pays for the candidates actually probed.
//
// It deliberately omits the `dynamicDefaultsDef`/`useDefaults` machinery below.
// A consequence: any compatible schema whose VALIDITY depends on a default —
// whether a static `useDefaults` scalar (e.g. config_v2's required
// `telemetry.send`) OR a dynamic default (e.g. a required uuid field) — will not
// match this probe and instead falls to the mutating-probe fallback in
// `validate()`. That fallback replays the exact old behavior, so this is a
// correctness-preserving performance split, not a gap.
// @ts-expect-error - CJS/ESM interop: Ajv constructor is callable at runtime
const ajvCheck = new Ajv({
  strictSchema: false,
  useDefaults: false,
  allErrors: true,
  allowUnionTypes: true,
  coerceTypes: false,
});

// Enable `uuid` dynamic default
// @ts-expect-error - CJS/ESM interop: dynamicDefaultsDef.DEFAULTS exists at runtime
dynamicDefaultsDef.DEFAULTS.uuid = (_args: any) => getRandomUUID;

// Enhance Ajv
// @ts-expect-error - CJS/ESM interop: ajv plugin functions are callable at runtime
addFormats(ajv);
// @ts-expect-error - CJS/ESM interop: ajv plugin functions are callable at runtime
addKeywords(ajv);
// @ts-expect-error - CJS/ESM interop: ajv plugin functions are callable at runtime
addErrors(ajv);
// The probe instance needs the same formats/keywords/error handling so a
// candidate's validity result is identical to the mutating validator's (minus
// the default/coercion effects, which don't decide the compatible v2 schemas).
// @ts-expect-error - CJS/ESM interop: ajv plugin functions are callable at runtime
addFormats(ajvCheck);
// @ts-expect-error - CJS/ESM interop: ajv plugin functions are callable at runtime
addKeywords(ajvCheck);
// @ts-expect-error - CJS/ESM interop: ajv plugin functions are callable at runtime
addErrors(ajvCheck);

// Add all schemas from `schema` object to both instances.
for (const [key, value] of Object.entries(schemas)) {
  ajv.addSchema(value, key);
  ajvCheck.addSchema(value, key);
}

/**
 * Deep-clone a value before validation so the mutating validator can apply
 * defaults/coercions without touching the caller's object.
 *
 * Deliberately a `JSON.parse(JSON.stringify(...))` round-trip rather than
 * `structuredClone`: the JSON round-trip's *normalization* is load-bearing here.
 * `transformToSchemaKey` feeds `validate()` objects that carry `NaN`
 * (`undefined / 100` for an absent `maxVariation`) and `undefined`-valued
 * properties; the JSON clone maps `NaN`→`null` and drops `undefined` keys, and
 * the established validity/coercion results depend on that. `structuredClone`
 * preserves `NaN`/`undefined` verbatim, which flips those results (see ADR
 * 01065). The Phase 3.2 win comes from cloning *once* for the winning pass and
 * probing candidates with a non-mutating validator, not from the clone
 * primitive. Centralized so the clone contract lives in one place.
 */
function cloneForValidation(object: any): any {
  return JSON.parse(JSON.stringify(object));
}

// Define the specific schemas that have compatibility mappings
const compatibleSchemas = {
  config_v3: ["config_v2"],
  context_v3: ["context_v2"],
  openApi_v3: ["openApi_v2"],
  spec_v3: ["spec_v2"],
  step_v3: [
    "checkLink_v2",
    "find_v2",
    "goTo_v2",
    "httpRequest_v2",
    "runShell_v2",
    "runCode_v2",
    "saveScreenshot_v2",
    "setVariables_v2",
    "startRecording_v2",
    "stopRecording_v2",
    "typeKeys_v2",
    "wait_v2",
  ],
  test_v3: ["test_v2"],
} as const;

type CompatibleSchemaKey = keyof typeof compatibleSchemas;

export interface ValidateOptions {
  schemaKey: string;
  object: any;
  addDefaults?: boolean;
  /**
   * When true, `ValidateResult.errorObjects` is populated with the raw AJV
   * `ErrorObject`s from the target-schema validation (empty array when valid or
   * when the schema key is unknown). Off by default so the hot runner path pays
   * nothing; the LSP opts in to map `instancePath`/`keyword`/`params` to source
   * ranges. The string `errors` field is always produced regardless.
   */
  structuredErrors?: boolean;
}

export interface ValidateResult {
  valid: boolean;
  errors: string;
  object: any;
  /**
   * Raw AJV errors from the target-schema validation. Present only when
   * `structuredErrors: true` was passed. Snapshotted (shallow-cloned) so the
   * shared AJV instance's error array can't mutate them out from under a caller.
   */
  errorObjects?: ErrorObject[];
}

/**
 * Shallow-clone AJV errors so a later validation on the shared instance can't
 * mutate the snapshot handed back to the caller. Only ever called inside an
 * `if (check.errors)` guard, so the input is always a non-null error array.
 */
function snapshotErrors(errors: ErrorObject[]): ErrorObject[] {
  return errors.map((error) => ({ ...error }));
}

export interface TransformOptions {
  currentSchema: string;
  targetSchema: string;
  object: any;
}

/**
 * Escapes special characters in a string for safe use in a regular expression pattern.
 *
 * @param string - The input string to escape.
 * @returns The escaped string, safe for use in regular expressions.
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

/**
 * Validates an object against a specified JSON schema, supporting backward compatibility and automatic transformation from older schema versions if needed.
 *
 * If validation against the target schema fails and compatible older schemas are defined, attempts validation against each compatible schema. On a match, transforms the object to the target schema and revalidates. Returns the validation result, any errors, and the (possibly transformed) object.
 *
 * @param options - Validation options
 * @param options.schemaKey - The key identifying the target JSON schema.
 * @param options.object - The object to validate.
 * @param options.addDefaults - Whether to include default values in the returned object.
 * @returns Validation result, error messages, and the validated (and possibly transformed) object.
 *
 * @throws {Error} If {@link schemaKey} or {@link object} is missing.
 */
export function validate({
  schemaKey,
  object,
  addDefaults = true,
  structuredErrors = false,
}: ValidateOptions): ValidateResult {
  if (!schemaKey) {
    throw new Error("Schema key is required.");
  }
  if (!object) {
    throw new Error("Object is required.");
  }
  const result: ValidateResult = {
    valid: false,
    errors: "",
    object: object,
  };
  if (structuredErrors) {
    result.errorObjects = [];
  }
  let validationObject: any;
  let check: ValidateFunction | undefined = ajv.getSchema(schemaKey);
  if (!check) {
    result.valid = false;
    result.errors = `Schema not found: ${schemaKey}`;
    result.object = object;
    return result;
  }

  // Clone the object to avoid modifying the original object. The mutating
  // validator applies defaults/coercions to this clone, never the caller's.
  validationObject = cloneForValidation(object);

  // Check if the object is compatible with the schema (mutating pass).
  result.valid = check(validationObject);
  result.errors = "";

  if (check.errors) {
    // Preserve the target-schema errors: the compatible-schema probing below
    // uses a separate validator, so `check.errors` stays the target's errors
    // for the no-match message.
    const targetErrors = check.errors;
    // Check if the object is compatible with another schema
    const compatibleSchemasList =
      compatibleSchemas[schemaKey as keyof typeof compatibleSchemas];
    if (!compatibleSchemasList) {
      result.errors = targetErrors
        .map(
          (error) =>
            `${error.instancePath} ${error.message} (${JSON.stringify(
              error.params,
            )})`,
        )
        .join(", ");
      if (structuredErrors) {
        result.errorObjects = snapshotErrors(targetErrors);
      }
      result.object = object;
      result.valid = false;
      return result;
    }
    // Probe each candidate with the NON-mutating validator, run directly on the
    // caller's object — no per-candidate clone. Order is preserved, so the first
    // match wins exactly as the old clone-per-candidate loop did. Because
    // useDefaults/coerceTypes only make Ajv MORE permissive, a non-mutating match
    // is always a mutating match too, so this fast path is exact for any
    // candidate whose validity doesn't depend on a default/coercion.
    let matchedSchemaKey = compatibleSchemasList.find((key) => {
      // Every compatible key is registered on ajvCheck (see the addSchema loop
      // above), so getSchema is always defined — assert it, matching the
      // `matchedCheck!` non-null assertion below.
      const probe = ajvCheck.getSchema(key)!;
      return probe(object) as boolean;
    });
    if (!matchedSchemaKey) {
      // Fallback for the candidates the fast probe can miss: a schema whose
      // validity DEPENDS on a default or coercion (e.g. config_v2's required
      // `telemetry.send`, which carries a default). Replay the original
      // clone-per-candidate MUTATING probe before declaring no match, so no input
      // that validated under the old code is newly rejected. Runs only on the
      // rare no-fast-match path, so the common case keeps its single-clone win.
      matchedSchemaKey = compatibleSchemasList.find((key) => {
        const mutatingCheck = ajv.getSchema(key)!;
        return mutatingCheck(cloneForValidation(object)) as boolean;
      });
    }
    if (!matchedSchemaKey) {
      result.errors = targetErrors
        .map(
          (error) =>
            `${error.instancePath} ${error.message} (${JSON.stringify(
              error.params,
            )})`,
        )
        .join(", ");
      if (structuredErrors) {
        result.errorObjects = snapshotErrors(targetErrors);
      }
      result.object = object;
      result.valid = false;
      return result;
    } else {
      // Reproduce the old transform input: a single fresh clone run through the
      // MUTATING validator for the matched schema, so its defaults/coercions are
      // applied exactly as before, then transform.
      validationObject = cloneForValidation(object);
      const matchedCheck = ajv.getSchema(matchedSchemaKey);
      matchedCheck!(validationObject);
      const transformedObject = transformToSchemaKey({
        currentSchema: matchedSchemaKey,
        targetSchema: schemaKey,
        object: validationObject,
      });

      result.valid = check(transformedObject);
      if (result.valid) {
        validationObject = transformedObject;
        object = transformedObject;
        /* c8 ignore start - Defensive: transformToSchemaKey validates internally, so this is unreachable */
      } else if (check.errors) {
        const errors = check.errors.map(
          (error) =>
            `${error.instancePath} ${error.message} (${JSON.stringify(
              error.params,
            )})`,
        );
        result.errors = errors.join(", ");
        return result;
      }
      /* c8 ignore stop */
    }
  }
  if (addDefaults) {
    result.object = validationObject;
  } else {
    result.object = object;
  }

  return result;
}

/**
 * Transform an object from one schema key to another and return a validated instance of the target schema.
 *
 * @param params - Function parameters.
 * @param params.currentSchema - Schema key representing the object's current version.
 * @param params.targetSchema - Schema key to transform the object into.
 * @param params.object - The source object to transform.
 * @returns The transformed object conforming to the target schema.
 * @throws {Error} If transformation between the specified schemas is not supported or if the transformed object fails validation.
 */
export function transformToSchemaKey({
  currentSchema = "",
  targetSchema = "",
  object = {},
}: TransformOptions): any {
  // Check if the current schema is the same as the target schema
  if (currentSchema === targetSchema) {
    return object;
  }
  // Check if the current schema is compatible with the target schema
  const compatibleList = compatibleSchemas[targetSchema as CompatibleSchemaKey];
  if (
    !compatibleList ||
    !(compatibleList as readonly string[]).includes(currentSchema)
  ) {
    throw new Error(
      `Can't transform from ${currentSchema} to ${targetSchema}.`,
    );
  }
  // Transform the object
  if (targetSchema === "step_v3") {
    const transformedObject: any = {
      stepId: object.id,
      description: object.description,
    };
    if (currentSchema === "goTo_v2") {
      transformedObject.goTo = {
        url: object.url,
        origin: object.origin,
      };
    } else if (currentSchema === "checkLink_v2") {
      transformedObject.checkLink = {
        url: object.url,
        origin: object.origin,
        statusCodes: object.statusCodes,
      };
    } else if (currentSchema === "find_v2") {
      transformedObject.find = {
        selector: object.selector,
        elementText: object.matchText,
        timeout: object.timeout,
        moveTo: object.moveTo,
        click: object.click,
        type: object.typeKeys,
      };
      // Handle typeKeys.delay key change
      if (typeof object.typeKeys === "object" && object.typeKeys.keys) {
        transformedObject.find.type.inputDelay = object.typeKeys.delay;
        delete transformedObject.find.type.delay;
      }
      transformedObject.variables = {};
      object.setVariables?.forEach((variable: any) => {
        transformedObject.variables[variable.name] =
          `extract($$element.text, "${variable.regex}")`;
      });
    } else if (currentSchema === "httpRequest_v2") {
      transformedObject.httpRequest = {
        method: object.method,
        url: object.url,
        openApi: object.openApi,
        request: {
          body: object.requestData,
          headers: object.requestHeaders,
          parameters: object.requestParams,
        },
        response: {
          body: object.responseData,
          headers: object.responseHeaders,
        },
        statusCodes: object.statusCodes,
        allowAdditionalFields: object.allowAdditionalFields,
        timeout: object.timeout,
        path: object.savePath,
        directory: object.saveDirectory,
        maxVariation: object.maxVariation / 100,
        overwrite:
          object.overwrite === "byVariation"
            ? "aboveVariation"
            : object.overwrite,
      };
      // Handle openApi.requestHeaders key change
      if (object.openApi) {
        transformedObject.httpRequest.openApi = transformToSchemaKey({
          currentSchema: "openApi_v2",
          targetSchema: "openApi_v3",
          object: object.openApi,
        });
      }
      transformedObject.variables = {};
      object.envsFromResponseData?.forEach((variable: any) => {
        transformedObject.variables[variable.name] =
          `jq($$response.body, "${variable.jqFilter}")`;
      });
    } else if (currentSchema === "runShell_v2") {
      transformedObject.runShell = {
        command: object.command,
        args: object.args,
        workingDirectory: object.workingDirectory,
        exitCodes: object.exitCodes,
        stdio: object.output,
        path: object.savePath,
        directory: object.saveDirectory,
        maxVariation: object.maxVariation / 100,
        overwrite:
          object.overwrite === "byVariation"
            ? "aboveVariation"
            : object.overwrite,
        timeout: object.timeout,
      };
      transformedObject.variables = {};
      object.setVariables?.forEach((variable: any) => {
        transformedObject.variables[variable.name] =
          `extract($$stdio.stdout, "${variable.regex}")`;
      });
    } else if (currentSchema === "runCode_v2") {
      transformedObject.runCode = {
        language: object.language,
        code: object.code,
        args: object.args,
        workingDirectory: object.workingDirectory,
        exitCodes: object.exitCodes,
        stdio: object.output,
        path: object.savePath,
        directory: object.saveDirectory,
        maxVariation: object.maxVariation / 100,
        overwrite:
          object.overwrite === "byVariation"
            ? "aboveVariation"
            : object.overwrite,
        timeout: object.timeout,
      };
      transformedObject.variables = {};
      object?.setVariables?.forEach((variable: any) => {
        transformedObject.variables[variable.name] =
          `extract($$stdio.stdout, "${variable.regex}")`;
      });
    } else if (currentSchema === "setVariables_v2") {
      transformedObject.loadVariables = object.path;
    } else if (currentSchema === "typeKeys_v2") {
      transformedObject.type = {
        keys: object.keys,
        inputDelay: object.delay,
      };
    } else if (currentSchema === "saveScreenshot_v2") {
      transformedObject.screenshot = {
        path: object.path,
        directory: object.directory,
        maxVariation: object.maxVariation / 100,
        overwrite:
          object.overwrite === "byVariation"
            ? "aboveVariation"
            : object.overwrite,
        crop: object.crop,
      };
    } else if (currentSchema === "startRecording_v2") {
      transformedObject.record = {
        path: object.path,
        directory: object.directory,
        overwrite: object.overwrite,
      };
    } else if (currentSchema === "stopRecording_v2") {
      transformedObject.stopRecord = true;
    } else if (currentSchema === "wait_v2") {
      transformedObject.wait = object.duration ?? 5000;
    }
    const result = validate({
      schemaKey: "step_v3",
      object: transformedObject,
    });
    if (!result.valid) {
      throw new Error(`Failed to transform object to step.\nErrors: ${result.errors}`);
    }
    return result.object;
  } else if (targetSchema === "config_v3") {
    // Handle config_v2 to config_v3 transformation
    const transformedObject: any = {
      loadVariables: object.envVariables,
      input: object?.runTests?.input || object.input,
      output: object?.runTests?.output || object.output,
      recursive: object?.runTests?.recursive || object.recursive,
      relativePathBase: object.relativePathBase,
      detectSteps: object?.runTests?.detectSteps,
      beforeAny: object?.runTests?.setup,
      afterAll: object?.runTests?.cleanup,
      logLevel: object.logLevel,
      telemetry: object.telemetry,
    };
    // Handle context transformation
    if (object?.runTests?.contexts)
      transformedObject.runOn = object.runTests.contexts.map((context: any) =>
        transformToSchemaKey({
          currentSchema: "context_v2",
          targetSchema: "context_v3",
          object: context,
        }),
      );
    // Handle openApi transformation
    if (object?.integrations?.openApi) {
      transformedObject.integrations = {};
      transformedObject.integrations.openApi = object.integrations.openApi.map(
        (description: any) =>
          transformToSchemaKey({
            currentSchema: "openApi_v2",
            targetSchema: "openApi_v3",
            object: description,
          }),
      );
    }
    // Handle fileTypes transformation
    if (object?.fileTypes)
      transformedObject.fileTypes = object.fileTypes.map((fileType: any) => {
        const transformedFileType: any = {
          name: fileType.name,
          extensions: fileType.extensions.map((extension: string) =>
            // Trim leading `.` from extension
            extension.replace(/^\./, ""),
          ),
          inlineStatements: {
            // Convert strings to regex, escaping special characters
            testStart: `${escapeRegExp(
              fileType.testStartStatementOpen,
            )}(.*?)${escapeRegExp(fileType.testStartStatementClose)}`,
            testEnd: escapeRegExp(fileType.testEndStatement),
            ignoreStart: escapeRegExp(fileType.testIgnoreStatement),
            step: `${escapeRegExp(
              fileType.stepStatementOpen,
            )}(.*?)${escapeRegExp(fileType.stepStatementClose)}`,
          },
        };
        if (fileType.markup)
          transformedFileType.markup = fileType.markup.map((markup: any) => {
            const transformedMarkup: any = {
              name: markup.name,
              regex: markup.regex,
            };
            if (markup.actions)
              transformedMarkup.actions = markup.actions.map((action: any) => {
                if (typeof action === "string") return action;
                if (typeof action === "object") {
                  if (action.params) {
                    action = {
                      action: action.name,
                      ...action.params,
                    };
                  }
                  const transformedAction = transformToSchemaKey({
                    currentSchema: `${action.action}_v2`,
                    targetSchema: "step_v3",
                    object: action,
                  });
                  return transformedAction;
                }
              });

            return transformedMarkup;
          });
        return transformedFileType;
      });
    const result = validate({
      schemaKey: "config_v3",
      object: transformedObject,
    });
    // Defensive: transformation always produces valid config_v3, unreachable
    /* c8 ignore next 3 */
    if (!result.valid) {
      throw new Error(`Invalid object: ${result.errors}`);
    }
    return result.object;
  } else if (targetSchema === "context_v3") {
    const transformedObject: any = {};
    // Handle context_v2 to context_v3 transformation
    transformedObject.platforms = object.platforms;
    if (object.app?.name) {
      const name = object.app.name === "edge" ? "chrome" : object.app?.name;
      transformedObject.browsers = [];
      transformedObject.browsers.push({
        name,
        headless: object.app?.options?.headless,
        window: {
          width: object.app?.options?.width,
          height: object.app?.options?.height,
        },
        viewport: {
          width: object.app?.options?.viewport_width,
          height: object.app?.options?.viewport_height,
        },
      });
    }
    const result = validate({
      schemaKey: "context_v3",
      object: transformedObject,
    });
    if (!result.valid) {
      throw new Error(`Invalid object: ${result.errors}`);
    }
    return result.object;
  } else if (targetSchema === "openApi_v3") {
    let transformedObject: any;
    // Handle openApi_v2 to openApi_v3 transformation
    const { name, requestHeaders, ...intermediaryObject } = object;
    intermediaryObject.name = object.name;
    intermediaryObject.headers = object.requestHeaders;
    transformedObject = { ...intermediaryObject };

    const result = validate({
      schemaKey: "openApi_v3",
      object: transformedObject,
    });
    if (!result.valid) {
      throw new Error(`Invalid object: ${result.errors}`);
    }
    return result.object;
  } else if (targetSchema === "spec_v3") {
    // Handle spec_v2 to spec_v3 transformation
    const transformedObject: any = {
      specId: object.id,
      description: object.description,
      contentPath: object.file,
    };
    if (object.contexts)
      transformedObject.runOn = object.contexts.map((context: any) =>
        transformToSchemaKey({
          currentSchema: "context_v2",
          targetSchema: "context_v3",
          object: context,
        }),
      );
    if (object.openApi)
      transformedObject.openApi = object.openApi.map((description: any) =>
        transformToSchemaKey({
          currentSchema: "openApi_v2",
          targetSchema: "openApi_v3",
          object: description,
        }),
      );
    transformedObject.tests = object.tests.map((test: any) =>
      transformToSchemaKey({
        currentSchema: "test_v2",
        targetSchema: "test_v3",
        object: test,
      }),
    );

    const result = validate({
      schemaKey: "spec_v3",
      object: transformedObject,
    });
    // Defensive: nested transforms validate; this is unreachable
    /* c8 ignore next 3 */
    if (!result.valid) {
      throw new Error(`Invalid object: ${result.errors}`);
    }
    return result.object;
  } else if (targetSchema === "test_v3") {
    // Handle test_v2 to test_v3 transformation
    const transformedObject: any = {
      testId: object.id,
      description: object.description,
      contentPath: object.file,
      detectSteps: object.detectSteps,
      before: object.setup,
      after: object.cleanup,
    };
    if (object.contexts)
      transformedObject.runOn = object.contexts.map((context: any) =>
        transformToSchemaKey({
          currentSchema: "context_v2",
          targetSchema: "context_v3",
          object: context,
        }),
      );
    if (object.openApi)
      transformedObject.openApi = object.openApi.map((description: any) =>
        transformToSchemaKey({
          currentSchema: "openApi_v2",
          targetSchema: "openApi_v3",
          object: description,
        }),
      );
    transformedObject.steps = object.steps.map((step: any) =>
      transformToSchemaKey({
        currentSchema: `${step.action}_v2`,
        targetSchema: "step_v3",
        object: step,
      }),
    );

    const result = validate({
      schemaKey: "test_v3",
      object: transformedObject,
    });
    // Defensive: nested transforms validate; this is unreachable
    /* c8 ignore next 3 */
    if (!result.valid) {
      throw new Error(`Invalid object: ${result.errors}`);
    }
    return result.object;
  }
  /* c8 ignore next 2 - Dead code: incompatible schemas throw at line 226-228 */
  return null;
}
