/**
 * Test resolution logic for Doc Detective Core.
 * This module handles transforming detected tests into resolved test specifications
 * with contexts, platforms, and browsers resolved.
 */

import crypto from "node:crypto";
import path from "node:path";
import { log, logLevelEnabled } from "./utils.js";
import { generateSpecId, noteInvalidSpec } from "./detectTests.js";
import { contentHash } from "../common/src/textUtils.js";
import { loadDescription } from "./openapi.js";
// Single source of truth for browser/driver-requiring step keys.
import {
  BROWSER_STEP_KEYS as driverActions,
  stepOpensBrowserSurface,
} from "../runtime/browserStepKeys.js";
import { isMobileTargetPlatform } from "./tests/mobilePlatform.js";
import {
  matrixReferences,
  matrixCombinations,
  substituteMatrix,
  matrixIdSuffix,
  checkMatrixPaths,
} from "../common/src/matrix.js";
import { loadMatrixValues } from "../common/src/matrixFile.js";

// A matrix with each `{ file }` key replaced by its values (ADR 01228). Each
// file is read once per run; resolvePaths already made its path absolute.
function loadMatrixFiles(matrix: any, config: any) {
  if (!matrix) return matrix;
  const cache: Map<string, unknown[]> = config._matrixFileCache || (config._matrixFileCache = new Map());
  return Object.fromEntries(
    Object.entries(matrix).map(([key, source]: [string, any]) => {
      if (typeof source?.file !== "string") return [key, source];
      const file = path.resolve(source.file);
      if (!cache.has(file)) cache.set(file, loadMatrixValues(key, { file }, process.cwd()));
      return [key, cache.get(file)];
    })
  );
}

// Expand one static context over its `matrix` (ADR 01227): one context per
// combination of the keys its own fields or the test's steps reference, with
// the combination substituted into the context and its copy of the steps.
// `authoredOnTest` makes an unreferenced key an error: there it can only be dead.
// Throws a message without its `tests[<i>]: ` prefix.
function expandMatrix({ staticContext, matrix, test, authoredOnTest }: { staticContext: any; matrix: any; test: any; authoredOnTest: boolean }) {
  const { matrix: _definition, ...fields } = staticContext;
  const name = staticContext.contextId || [staticContext.platform, staticContext.browser?.name].filter(Boolean).join("-") || "default";
  const ownReferences = matrixReferences(fields);
  const stepReferences = matrixReferences(test.steps);
  const referenced = new Set([...ownReferences, ...stepReferences]);
  const keys = Object.keys(matrix ?? {});
  for (const key of referenced) {
    if (!keys.includes(key)) throw new Error(`\`$$matrix.${key}\` names no \`matrix\` key in context \`${name}\`.`);
  }
  if (authoredOnTest) {
    const unused = keys.find((key) => !referenced.has(key));
    if (unused) throw new Error(`\`matrix\` key \`${unused}\` isn't used. Reference it as \`$$matrix.${unused}\` or remove it.`);
  }
  if (referenced.size === 0) return [fields];
  const expanding = keys.filter((key) => referenced.has(key));
  const [pathProblem] = checkMatrixPaths(test.steps, matrix, expanding);
  if (pathProblem) throw new Error(pathProblem);
  const seen = new Map<string, any>();
  return matrixCombinations(matrix, referenced).map((combination) => {
    const suffix = matrixIdSuffix(combination);
    const clash = seen.get(suffix);
    if (clash) {
      const differing = expanding.find((key) => JSON.stringify(clash[key]) !== JSON.stringify(combination[key]))!;
      const show = (value: any) => (typeof value === "object" ? JSON.stringify(value) : String(value));
      throw new Error(`\`matrix\` values \`${show(clash[differing])}\` and \`${show(combination[differing])}\` give the same context ID.`);
    }
    seen.set(suffix, combination);
    return {
      ...substituteMatrix(fields, combination),
      matrix: combination,
      matrixIdSuffix: suffix,
      steps: substituteMatrix(test.steps, combination),
    };
  });
}

function isDriverRequired({ test }: { test: any }) {
  let driverRequired = false;
  test.steps.forEach((step: any) => {
    // Check if test includes actions that require a driver.
    driverActions.forEach((action) => {
      if (typeof step[action] !== "undefined") driverRequired = true;
    });
    // A startSurface browser descriptor opens a WebDriver session (Phase 6);
    // app/process descriptors provision their own runtimes and don't count.
    if (stepOpensBrowserSurface(step)) driverRequired = true;
  });
  return driverRequired;
}

function resolveContexts({ contexts, test, config }: { contexts: any[]; test: any; config: any }) {
  log(config, "debug", `Determining required contexts for test: ${test.testId}`);
  const resolvedContexts: any[] = [];

  // Check if current test requires a browser
  let browserRequired = false;
  test.steps.forEach((step: any) => {
    // Check if test includes actions that require a driver.
    driverActions.forEach((action) => {
      if (typeof step[action] !== "undefined") browserRequired = true;
    });
    // Phase 6: `startSurface: { browser: … }` opens a session too.
    if (stepOpensBrowserSurface(step)) browserRequired = true;
  });

  // Standardize context format
  contexts.forEach((context) => {
    if (context.browsers) {
      if (
        typeof context.browsers === "string" ||
        (typeof context.browsers === "object" &&
          !Array.isArray(context.browsers))
      ) {
        // If browsers is a string or an object, convert to array
        context.browsers = [context.browsers];
      }
      context.browsers = context.browsers.map((browser: any) => {
        if (typeof browser === "string") {
          browser = { name: browser };
        }
        // Mark the engine as explicitly requested by the author. The runner's
        // cross-engine fallback uses this to decide PASS vs WARNING when it has
        // to substitute another browser: an auto-selected default falls back
        // silently (PASS), a pinned engine reports a degraded run (WARNING).
        browser.explicit = true;
        return browser;
      });
    }
    if (context.platforms) {
      if (typeof context.platforms === "string") {
        context.platforms = [context.platforms];
      }
    }
  });

  // Resolve to final contexts. Each context should include a single platform and at most a single browser.
  contexts.forEach((context) => {
    const staticContexts: any[] = [];
    // Carry forward authored fields (e.g. an explicit `contextId`) onto each
    // expanded static context — rebuilding as a bare `{ platform, browser }`
    // would silently drop a user-supplied contextId. `platforms`/`browsers`
    // are the array forms we're expanding away, so strip them.
    const carry = { ...context };
    delete carry.platforms;
    delete carry.browsers;
    // An entry may omit `platforms` (e.g. a `requires`-only gate) and, for
    // driver tests, `browsers`. Expand those with an undefined slot so the
    // static context carries no platform/browser key — runContext fills the
    // current platform and default browser at run time, exactly as it does
    // for a test with no runOn at all.
    const platformsToExpand = context.platforms ?? [undefined];
    const browsersToExpand = context.browsers ?? [undefined];
    platformsToExpand.forEach((platform: any) => {
      if (!browserRequired) {
        const staticContext = { ...carry };
        if (platform !== undefined) staticContext.platform = platform;
        staticContexts.push(staticContext);
      } else {
        browsersToExpand.forEach((browser: any) => {
          const staticContext = { ...carry };
          if (platform !== undefined) staticContext.platform = platform;
          if (browser !== undefined) {
            // Desktop `safari` is an alias for the `webkit` engine, so the
            // rewrite happens per platform pair (not during normalization):
            // on a mobile target platform (android/ios) the authored name is
            // preserved — `safari` on ios is the real device browser (phase
            // A5), and the mobile support matrix, not engine aliasing,
            // decides unsupported combinations. Every pair gets its own
            // clone so contexts sharing one authored browser object can't
            // leak a rewrite (or any later per-context mutation) across
            // platforms. `version` is readOnly report output (ADR 01163): an
            // authored one is dropped so only the browser session sets it.
            const { version: _authored, ...authoredBrowser } = browser;
            staticContext.browser =
              browser.name === "safari" && !isMobileTargetPlatform(platform)
                ? { ...authoredBrowser, name: "webkit" }
                : authoredBrowser;
          }
          staticContexts.push(staticContext);
        });
      }
    });
    // A matrix is a third expansion axis (ADR 01227).
    const matrix = loadMatrixFiles(context.matrix, config);
    const expandedContexts = staticContexts.flatMap((staticContext) =>
      expandMatrix({ staticContext, matrix, test, authoredOnTest: Boolean(test.runOn) })
    );
    // For each static context, check if a matching object already exists in
    // resolvedContexts. `requires` participates in identity: two entries that
    // differ only in their capability gate must stay distinct, or one gate
    // would silently swallow the other. So does the matrix combination.
    expandedContexts.forEach((staticContext) => {
      const existingContext = resolvedContexts.find((resolvedContext) => {
        return (
          resolvedContext.platform === staticContext.platform &&
          JSON.stringify(resolvedContext.browser) ===
            JSON.stringify(staticContext.browser) &&
          JSON.stringify(resolvedContext.requires) ===
            JSON.stringify(staticContext.requires) &&
          JSON.stringify(resolvedContext.matrix) ===
            JSON.stringify(staticContext.matrix)
        );
      });
      if (!existingContext) {
        resolvedContexts.push(staticContext);
      }
    });
  });

  // If no contexts are defined, use default contexts
  if (resolvedContexts.length === 0) {
    resolvedContexts.push(...expandMatrix({ staticContext: {}, matrix: undefined, test, authoredOnTest: false }));
  }

  if (logLevelEnabled(config, "debug")) log(config, "debug", `Resolved contexts for test ${test.testId}:\n${JSON.stringify(resolvedContexts, null, 2)}`);
  return resolvedContexts;
}

async function fetchOpenApiDocuments({ config, documentArray }: { config: any; documentArray: any[] }) {
  if (logLevelEnabled(config, "debug")) log(config, "debug", `Fetching OpenAPI documents:\n${JSON.stringify(documentArray, null, 2)}`);
  const openApiDocuments: any[] = [];
  if (config?.integrations?.openApi?.length > 0)
    openApiDocuments.push(...config.integrations.openApi);
  // Per-run cache of dereferenced OpenAPI descriptions, keyed by resolved
  // description path. resolveTests seeds a fresh Map at the start of each run;
  // the `||=` fallback covers direct resolveSpec/resolveTest callers. Without
  // this, a spec's T tests each re-enter here with the SAME spec-level
  // definition objects and re-read + re-dereference the same document T more
  // times (resolveSpec already loaded it once). Promises are cached (not just
  // resolved values) so concurrent callers share one in-flight load.
  const descriptionCache: Map<string, Promise<any>> =
    config._openApiDescriptionCache ||
    (config._openApiDescriptionCache = new Map());
  if (documentArray?.length > 0) {
    for (const definition of documentArray) {
      try {
        // Reuse a definition already dereferenced onto this object earlier in
        // the run (resolveSpec attaches spec-level definitions before the tests
        // re-process them); otherwise load through the per-run path cache.
        if (!definition.definition) {
          const key = definition.descriptionPath;
          let pending = descriptionCache.get(key);
          if (!pending) {
            // Evict on failure so one failed load (especially a transient remote
            // fetch error) doesn't poison every later test for this path — the
            // next caller re-attempts, matching the old per-call behavior. The
            // success case stays memoized (read + dereferenced once per run).
            pending = loadDescription(key).catch((err) => {
              descriptionCache.delete(key);
              throw err;
            });
            descriptionCache.set(key, pending);
          }
          definition.definition = await pending;
        }
      } catch (error: any) {
        log(
          config,
          "error",
          `Failed to load OpenAPI definition from ${definition.descriptionPath}: ${error.message}`
        );
        continue;
      }
      const existingDefinitionIndex = openApiDocuments.findIndex(
        (def: any) => def.name === definition.name
      );
      if (existingDefinitionIndex > -1) {
        openApiDocuments.splice(existingDefinitionIndex, 1);
      }
      openApiDocuments.push(definition);
    }
  }
  if (logLevelEnabled(config, "debug")) log(config, "debug", `Fetched OpenAPI documents:\n${JSON.stringify(openApiDocuments, null, 2)}`);
  return openApiDocuments;
}

// Make `base` unique within `usedIds` by appending an ordinal suffix on
// collision (`base`, `base-2`, `base-3`, …).
function uniqueId(base: string, usedIds: Set<string>): string {
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}-${suffix++}`;
  }
  return id;
}

// Deterministic fallback IDs: when a spec/test/context doesn't declare its
// own ID, derive one from stable inputs (file path, content hash, platform +
// browser) instead of a random UUID. Same inputs → same IDs on every run,
// which is what makes run-over-run result comparison possible. Explicitly
// declared IDs always win.
function deriveContextId({ context, suffix = "", usedIds }: { context: any; suffix?: string; usedIds: Set<string> }) {
  const base =
    [context.platform, context.browser?.name].filter(Boolean).join("-") ||
    "default";
  return uniqueId(`${base}${suffix}`, usedIds);
}

async function resolveContext({ config, test, context, usedContextIds, openApi }: { config: any; test: any; context: any; usedContextIds: Set<string>; openApi?: any[] }) {
  // Normalize the resolved ID back onto the context so any downstream reader
  // of `context.contextId` (not just the resolved copy) sees the same value.
  // Explicit IDs win, but are still de-duplicated: one authored context with
  // `platforms`/`browsers` arrays expands into several contexts that all carry
  // the same authored `contextId`, so the 2nd+ must be suffixed or they'd
  // collide in `metaValues` and other contextId-keyed structures.
  // A matrix combination's `~key=value` suffix keeps each combination's ID
  // distinct, authored or derived (ADR 01227).
  const suffix = context.matrixIdSuffix ?? "";
  context.contextId = context.contextId
    ? uniqueId(`${context.contextId}${suffix}`, usedContextIds)
    : deriveContextId({ context, suffix, usedIds: usedContextIds });
  const contextId = context.contextId;
  usedContextIds.add(contextId);
  if (logLevelEnabled(config, "debug")) log(config, "debug", `RESOLVING CONTEXT ID ${contextId}:\n${JSON.stringify(context, null, 2)}`);
  const { matrixIdSuffix: _suffix, ...contextFields } = context;
  const resolvedContext = {
    ...contextFields,
    unsafe: test.unsafe || false,
    // Prefer the caller's description-loaded set (resolvedTest.openApi, which
    // merges spec + test and attaches each `definition`). The raw
    // `test.openApi` carries no loaded definition and omits spec-level entries,
    // so httpRequest would receive an empty openApiDefinitions. See ADR 01044.
    openApi: openApi ?? test.openApi ?? [],
    // A matrix context carries its own substituted copy (ADR 01227).
    steps: context.steps ?? [...test.steps],
    contextId: contextId,
  };
  if (logLevelEnabled(config, "debug")) log(config, "debug", `RESOLVED CONTEXT ${contextId}:\n${JSON.stringify(resolvedContext, null, 2)}`);
  return resolvedContext;
}

async function resolveTest({ config, spec, test }: { config: any; spec: any; test: any }) {
  // Last-resort content-hash fallback (detection already assigns
  // `<specId>~<hash>` IDs for both inline and JSON/YAML tests); covers
  // programmatic callers that hand resolveTests raw specs.
  const testId = test.testId || `${spec.specId}~${contentHash(test)}`;
  if (logLevelEnabled(config, "debug")) log(config, "debug", `RESOLVING TEST ID ${testId}:\n${JSON.stringify(test, null, 2)}`);
  const resolvedTest = {
    ...test,
    testId: testId,
    runOn: test.runOn || spec.runOn,
    openApi: await fetchOpenApiDocuments({
      config,
      documentArray: [...spec.openApi, ...(test.openApi || [])],
    }),
    contexts: [] as any[],
  };
  delete resolvedTest.steps;

  let testContexts: any[];
  try {
    testContexts = resolveContexts({
      test: test,
      contexts: resolvedTest.runOn,
      config: config,
    });
  } catch (error: any) {
    // A `matrix` mistake makes the spec invalid (ADR 01227).
    error.invalidSpec = true;
    throw error;
  }

  const usedContextIds = new Set<string>();
  for (const context of testContexts) {
    const resolvedContext = await resolveContext({
      config,
      test: test,
      context,
      usedContextIds,
      // The description-loaded, spec+test-merged set — see resolveContext.
      openApi: resolvedTest.openApi,
    });
    resolvedTest.contexts.push(resolvedContext);
  }
  // One sitemap can expand a test into hundreds of contexts, so say how many.
  const fromMatrix = resolvedTest.contexts.filter((context: any) => context.matrix).length;
  if (fromMatrix) log(config, "info", `${testId}: ${fromMatrix} contexts from matrix.`);
  if (logLevelEnabled(config, "debug")) log(config, "debug", `RESOLVED TEST ${testId}:\n${JSON.stringify(resolvedTest, null, 2)}`);
  return resolvedTest;
}

async function resolveSpec({ config, spec }: { config: any; spec: any }) {
  // Prefer a path-derived specId over a random UUID so the same spec file
  // keeps the same ID across runs. UUIDs remain only for programmatic specs
  // with neither a specId nor a content path.
  const specId =
    spec.specId ||
    (spec.contentPath ? generateSpecId(spec.contentPath) : crypto.randomUUID());
  if (logLevelEnabled(config, "debug")) log(config, "debug", `RESOLVING SPEC ID ${specId}:\n${JSON.stringify(spec, null, 2)}`);
  const resolvedSpec = {
    ...spec,
    specId: specId,
    runOn: spec.runOn || config.runOn || [],
    openApi: await fetchOpenApiDocuments({
      config,
      documentArray: spec.openApi,
    }),
    tests: [] as any[],
  };
  const problems: string[] = [];
  for (const [index, test] of spec.tests.entries()) {
    try {
      const resolvedTest = await resolveTest({
        config,
        spec: resolvedSpec,
        test,
      });
      resolvedSpec.tests.push(resolvedTest);
    } catch (error: any) {
      if (!error.invalidSpec) throw error;
      problems.push(`tests[${index}]: ${error.message}`);
    }
  }
  // An invalid spec runs none of its tests, like one that fails its schema
  // check (ADR 01199): a strict run stops, any other run skips it with a warning.
  if (problems.length) {
    const source = spec.contentPath ?? specId;
    const reason = problems.join("\n");
    noteInvalidSpec(config, source, reason);
    if (!config._strictSpecs) log(config, "warning", `Skipped: \`${source}\` has tests that aren't valid.\n${reason}`);
    return null;
  }
  if (logLevelEnabled(config, "debug")) log(config, "debug", `RESOLVED SPEC ${specId}:\n${JSON.stringify(resolvedSpec, null, 2)}`);
  return resolvedSpec;
}

/**
 * Resolves detected tests into fully-resolved test specifications.
 *
 * @param {Object} options - Resolution options
 * @param {Object} options.config - Configuration object
 * @param {Array} options.detectedTests - Array of detected test specifications
 * @returns {Promise<Object>} Resolved tests object with config and specs
 */
async function resolveTests({ config, detectedTests }: { config: any; detectedTests: any[] }) {
  if (logLevelEnabled(config, "debug")) log(config, "debug", `RESOLVING DETECTED TEST SPECS:\n${JSON.stringify(detectedTests, null, 2)}`);

  const resolvedTests = {
    resolvedTestsId: crypto.randomUUID(),
    config: config,
    specs: [] as any[],
  };

  // Seed a fresh OpenAPI description cache for this run so fetchOpenApiDocuments
  // reads + dereferences each document once, not once per (spec + test). Fresh
  // per resolveTests call so a config reused across runs never serves a stale
  // description.
  config._openApiDescriptionCache = new Map();
  // Same for `matrix` files (ADR 01228).
  config._matrixFileCache = new Map();

  log(config, "info", "Resolving test specs.");
  for (const spec of detectedTests) {
    const resolvedSpec = await resolveSpec({ config, spec });
    if (resolvedSpec) resolvedTests.specs.push(resolvedSpec);
  }

  if (logLevelEnabled(config, "debug")) log(config, "debug", `RESOLVED TEST SPECS:\n${JSON.stringify(resolvedTests, null, 2)}`);
  return resolvedTests;
}

export {
  resolveTests,
  resolveContexts,
  isDriverRequired,
};
