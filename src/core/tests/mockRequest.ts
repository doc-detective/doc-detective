import fs from "node:fs";
import path from "node:path";
import { validate } from "../../common/src/validate.js";
import { log, invalidStepMessage } from "../utils.js";

export { mockRequest, restoreMocks };

// One live mock per `url` and `method` (ADR 01225). `answered` carries the
// count of the mocks it replaced, so `outputs.matched` covers that key.
type MockEntry = { mock: any; answered: number };

/**
 * Answer matching browser requests with a fixed response until the test ends.
 * Uses webdriverio `browser.mock()`, which needs the BiDi socket, so it runs
 * only in a browser listed in `bidiBrowsers`.
 */
async function mockRequest({
  config,
  step,
  driver,
  browserName,
  bidiBrowsers,
}: {
  config: any;
  step: any;
  driver: any;
  browserName?: string;
  bidiBrowsers: ReadonlySet<string>;
}) {
  const result: any = { status: "PASS", description: "Mocked requests.", outputs: {} };

  const isValidStep = validate({ schemaKey: "step_v3", object: step });
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = invalidStepMessage(step);
    return result;
  }
  const { url, method, response = {} } = isValidStep.object.mockRequest;

  if (!browserName || !bidiBrowsers.has(browserName)) {
    result.status = "SKIPPED";
    result.description = `Skipped: \`${browserName === "webkit" ? "safari" : browserName}\` can't mock requests.`;
    return result;
  }

  let body = response.body;
  if (typeof response.bodyPath === "string") {
    // Detection resolved a spec's bodyPath against the spec file; a step from
    // getRunner() has none, so resolve against the working directory.
    const file = path.resolve(response.bodyPath);
    try {
      // Bytes, which webdriverio sends as base64, so a binary file survives.
      body = fs.readFileSync(file);
    } catch {
      result.status = "FAIL";
      result.description = `Couldn't read \`bodyPath\` \`${file}\`.`;
      return result;
    }
  }

  if (!driver?.isBidi) {
    result.status = "FAIL";
    result.description = `Couldn't mock requests to \`${url}\`. The browser session has no WebDriver BiDi connection.`;
    return result;
  }

  const filter = method ? { method } : {};
  const key = `${method ?? "*"} ${url}`;
  if (!(driver.state.mocks instanceof Map)) driver.state.mocks = new Map();
  const mocks: Map<string, MockEntry> = driver.state.mocks;
  const replaced = mocks.get(key);
  const entry: MockEntry = {
    mock: undefined,
    answered: replaced ? replaced.answered : 0,
  };

  try {
    // webdriverio restores an earlier mock with the same url and filter itself.
    entry.mock = await driver.mock(url, filter);
    entry.mock.on("overwrite", () => {
      entry.answered += 1;
    });
    entry.mock.respond(body ?? "", {
      statusCode: response.statusCode ?? 200,
      ...(response.headers ? { headers: response.headers } : {}),
      // Answer before the request is sent: the server never sees it.
      fetchResponse: false,
    });
  } catch (error: any) {
    result.status = "FAIL";
    result.description = `Couldn't mock requests to \`${url}\`. The browser rejected the intercept: ${error?.message ?? "unknown error"}.`;
    return result;
  }
  mocks.set(key, entry);
  log(config, "debug", `Mocking ${key}.`);

  result.outputs.matched = entry.answered;
  return result;
}

// Restore every mock a driver holds. Called when the test ends, before the
// session closes. Best-effort: a restore failure never fails the test.
async function restoreMocks(driver: any) {
  const mocks: Map<string, MockEntry> | undefined = driver?.state?.mocks;
  if (!(mocks instanceof Map)) return;
  for (const { mock } of mocks.values()) {
    try {
      await mock.restore();
    } catch {
      // The session may already be gone.
    }
  }
  mocks.clear();
}
