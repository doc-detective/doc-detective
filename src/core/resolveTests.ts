/**
 * Test resolution logic for Doc Detective Core.
 * This module handles transforming detected tests into resolved test specifications
 * with contexts, platforms, and browsers resolved.
 */

import crypto from "node:crypto";
import { log } from "./utils.js";
import { generateSpecId } from "./detectTests.js";
import { contentHash } from "../common/src/detectTests.js";
import { loadDescription } from "./openapi.js";
// Single source of truth for browser/driver-requiring step keys.
import { BROWSER_STEP_KEYS as driverActions } from "../runtime/browserStepKeys.js";

function isDriverRequired({ test }: { test: any }) {
  let driverRequired = false;
  test.steps.forEach((step: any) => {
    // Check if test includes actions that require a driver.
    driverActions.forEach((action) => {
      if (typeof step[action] !== "undefined") driverRequired = true;
    });
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
        if (browser.name === "safari") browser.name = "webkit";
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
    context.platforms.forEach((platform: any) => {
      if (!browserRequired) {
        const staticContext = { ...carry, platform };
        staticContexts.push(staticContext);
      } else {
        context.browsers.forEach((browser: any) => {
          const staticContext = { ...carry, platform, browser };
          staticContexts.push(staticContext);
        });
      }
    });
    // For each static context, check if a matching object already exists in resolvedContexts.
    staticContexts.forEach((staticContext) => {
      const existingContext = resolvedContexts.find((resolvedContext) => {
        return (
          resolvedContext.platform === staticContext.platform &&
          JSON.stringify(resolvedContext.browser) ===
            JSON.stringify(staticContext.browser)
        );
      });
      if (!existingContext) {
        resolvedContexts.push(staticContext);
      }
    });
  });

  // If no contexts are defined, use default contexts
  if (resolvedContexts.length === 0) {
    resolvedContexts.push({});
  }

  log(config, "debug", `Resolved contexts for test ${test.testId}:\n${JSON.stringify(resolvedContexts, null, 2)}`);
  return resolvedContexts;
}

async function fetchOpenApiDocuments({ config, documentArray }: { config: any; documentArray: any[] }) {
  log(config, "debug", `Fetching OpenAPI documents:\n${JSON.stringify(documentArray, null, 2)}`);
  const openApiDocuments: any[] = [];
  if (config?.integrations?.openApi?.length > 0)
    openApiDocuments.push(...config.integrations.openApi);
  if (documentArray?.length > 0) {
    for (const definition of documentArray) {
      try {
        const openApiDefinition = await loadDescription(
          definition.descriptionPath
        );
        definition.definition = openApiDefinition;
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
  log(config, "debug", `Fetched OpenAPI documents:\n${JSON.stringify(openApiDocuments, null, 2)}`);
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
function deriveContextId({ context, usedIds }: { context: any; usedIds: Set<string> }) {
  const base =
    [context.platform, context.browser?.name].filter(Boolean).join("-") ||
    "default";
  return uniqueId(base, usedIds);
}

async function resolveContext({ config, test, context, usedContextIds }: { config: any; test: any; context: any; usedContextIds: Set<string> }) {
  // Normalize the resolved ID back onto the context so any downstream reader
  // of `context.contextId` (not just the resolved copy) sees the same value.
  // Explicit IDs win, but are still de-duplicated: one authored context with
  // `platforms`/`browsers` arrays expands into several contexts that all carry
  // the same authored `contextId`, so the 2nd+ must be suffixed or they'd
  // collide in `metaValues` and other contextId-keyed structures.
  context.contextId = context.contextId
    ? uniqueId(context.contextId, usedContextIds)
    : deriveContextId({ context, usedIds: usedContextIds });
  const contextId = context.contextId;
  usedContextIds.add(contextId);
  log(config, "debug", `RESOLVING CONTEXT ID ${contextId}:\n${JSON.stringify(context, null, 2)}`);
  const resolvedContext = {
    ...context,
    unsafe: test.unsafe || false,
    openApi: test.openApi || [],
    steps: [...test.steps],
    contextId: contextId,
  };
  log(config, "debug", `RESOLVED CONTEXT ${contextId}:\n${JSON.stringify(resolvedContext, null, 2)}`);
  return resolvedContext;
}

async function resolveTest({ config, spec, test }: { config: any; spec: any; test: any }) {
  // Last-resort content-hash fallback (detection already assigns
  // `<specId>~<hash>` IDs for both inline and JSON/YAML tests); covers
  // programmatic callers that hand resolveTests raw specs.
  const testId = test.testId || `${spec.specId}~${contentHash(test)}`;
  log(config, "debug", `RESOLVING TEST ID ${testId}:\n${JSON.stringify(test, null, 2)}`);
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

  const testContexts = resolveContexts({
    test: test,
    contexts: resolvedTest.runOn,
    config: config,
  });

  const usedContextIds = new Set<string>();
  for (const context of testContexts) {
    const resolvedContext = await resolveContext({
      config,
      test: test,
      context,
      usedContextIds,
    });
    resolvedTest.contexts.push(resolvedContext);
  }
  log(config, "debug", `RESOLVED TEST ${testId}:\n${JSON.stringify(resolvedTest, null, 2)}`);
  return resolvedTest;
}

async function resolveSpec({ config, spec }: { config: any; spec: any }) {
  // Prefer a path-derived specId over a random UUID so the same spec file
  // keeps the same ID across runs. UUIDs remain only for programmatic specs
  // with neither a specId nor a content path.
  const specId =
    spec.specId ||
    (spec.contentPath ? generateSpecId(spec.contentPath) : crypto.randomUUID());
  log(config, "debug", `RESOLVING SPEC ID ${specId}:\n${JSON.stringify(spec, null, 2)}`);
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
  for (const test of spec.tests) {
    const resolvedTest = await resolveTest({
      config,
      spec: resolvedSpec,
      test,
    });
    resolvedSpec.tests.push(resolvedTest);
  }
  log(config, "debug", `RESOLVED SPEC ${specId}:\n${JSON.stringify(resolvedSpec, null, 2)}`);
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
  log(config, "debug", `RESOLVING DETECTED TEST SPECS:\n${JSON.stringify(detectedTests, null, 2)}`);

  const resolvedTests = {
    resolvedTestsId: crypto.randomUUID(),
    config: config,
    specs: [] as any[],
  };

  log(config, "info", "Resolving test specs.");
  for (const spec of detectedTests) {
    const resolvedSpec = await resolveSpec({ config, spec });
    resolvedTests.specs.push(resolvedSpec);
  }

  log(config, "debug", `RESOLVED TEST SPECS:\n${JSON.stringify(resolvedTests, null, 2)}`);
  return resolvedTests;
}

export {
  resolveTests,
  resolveContexts,
  isDriverRequired,
};
