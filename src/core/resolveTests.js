/**
 * Test resolution logic for Doc Detective Core.
 * This module handles transforming detected tests into resolved test specifications
 * with contexts, platforms, and browsers resolved.
 */

const crypto = require("crypto");
const { log } = require("./utils");
const { loadDescription } = require("./openapi");

// Doc Detective actions that require a driver.
const driverActions = [
  "click",
  "dragAndDrop",
  "find",
  "goTo",
  "loadCookie",
  "record",
  "saveCookie",
  "screenshot",
  "stopRecord",
  "type",
];

function isDriverRequired({ test }) {
  let driverRequired = false;
  test.steps.forEach((step) => {
    // Check if test includes actions that require a driver.
    driverActions.forEach((action) => {
      if (typeof step[action] !== "undefined") driverRequired = true;
    });
  });
  return driverRequired;
}

function resolveContexts({ contexts, test, config }) {
  log(config, "debug", `Determining required contexts for test: ${test.testId}`);
  const resolvedContexts = [];

  // Check if current test requires a browser
  let browserRequired = false;
  test.steps.forEach((step) => {
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
      context.browsers = context.browsers.map((browser) => {
        if (typeof browser === "string") {
          browser = { name: browser };
        }
        if (browser.name === "safari") browser.name = "webkit";
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
    const staticContexts = [];
    context.platforms.forEach((platform) => {
      if (!browserRequired) {
        const staticContext = { platform };
        staticContexts.push(staticContext);
      } else {
        context.browsers.forEach((browser) => {
          const staticContext = { platform, browser };
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

async function fetchOpenApiDocuments({ config, documentArray }) {
  log(config, "debug", `Fetching OpenAPI documents:\n${JSON.stringify(documentArray, null, 2)}`);
  const openApiDocuments = [];
  if (config?.integrations?.openApi?.length > 0)
    openApiDocuments.push(...config.integrations.openApi);
  if (documentArray?.length > 0) {
    for (const definition of documentArray) {
      try {
        const openApiDefinition = await loadDescription(
          definition.descriptionPath
        );
        definition.definition = openApiDefinition;
      } catch (error) {
        log(
          config,
          "error",
          `Failed to load OpenAPI definition from ${definition.descriptionPath}: ${error.message}`
        );
        continue;
      }
      const existingDefinitionIndex = openApiDocuments.findIndex(
        (def) => def.name === definition.name
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

async function resolveContext({ config, test, context }) {
  const contextId = context.contextId || crypto.randomUUID();
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

async function resolveTest({ config, spec, test }) {
  const testId = test.testId || crypto.randomUUID();
  log(config, "debug", `RESOLVING TEST ID ${testId}:\n${JSON.stringify(test, null, 2)}`);
  const resolvedTest = {
    ...test,
    testId: testId,
    runOn: test.runOn || spec.runOn,
    openApi: await fetchOpenApiDocuments({
      config,
      documentArray: [...spec.openApi, ...(test.openApi || [])],
    }),
    contexts: [],
  };
  delete resolvedTest.steps;

  const testContexts = resolveContexts({
    test: test,
    contexts: resolvedTest.runOn,
    config: config,
  });

  for (const context of testContexts) {
    const resolvedContext = await resolveContext({
      config,
      test: test,
      context,
    });
    resolvedTest.contexts.push(resolvedContext);
  }
  log(config, "debug", `RESOLVED TEST ${testId}:\n${JSON.stringify(resolvedTest, null, 2)}`);
  return resolvedTest;
}

async function resolveSpec({ config, spec }) {
  const specId = spec.specId || crypto.randomUUID();
  log(config, "debug", `RESOLVING SPEC ID ${specId}:\n${JSON.stringify(spec, null, 2)}`);
  const resolvedSpec = {
    ...spec,
    specId: specId,
    runOn: spec.runOn || config.runOn || [],
    openApi: await fetchOpenApiDocuments({
      config,
      documentArray: spec.openApi,
    }),
    tests: [],
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
async function resolveTests({ config, detectedTests }) {
  log(config, "debug", `RESOLVING DETECTED TEST SPECS:\n${JSON.stringify(detectedTests, null, 2)}`);
  
  const resolvedTests = {
    resolvedTestsId: crypto.randomUUID(),
    config: config,
    specs: [],
  };

  log(config, "info", "Resolving test specs.");
  for (const spec of detectedTests) {
    const resolvedSpec = await resolveSpec({ config, spec });
    resolvedTests.specs.push(resolvedSpec);
  }

  log(config, "debug", `RESOLVED TEST SPECS:\n${JSON.stringify(resolvedTests, null, 2)}`);
  return resolvedTests;
}

module.exports = {
  resolveTests,
  resolveContexts,
  isDriverRequired,
};
