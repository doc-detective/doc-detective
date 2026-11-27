import fs from "node:fs";
import path from "node:path";
import { validate } from "../../common/src/validate.js";
import { log, invalidStepMessage, harToMocks } from "../utils.js";

export { mockRequest, restoreMocks };

// One live mock per `url` and `method` (ADR 01225). `answered` carries the
// count of the mocks it replaced, so `outputs.matched` covers that key.
type MockEntry = { mock: any; answered: number };

/**
 * Answer matching browser requests with a fixed response until the test ends.
 * Uses webdriverio `browser.mock()`, which needs the BiDi socket, so it runs
 * only where `hasBidi(browserName)` is true (ADR 01219).
 */
async function mockRequest({
  config,
  step,
  driver,
  browserName,
  hasBidi,
}: {
  config: any;
  step: any;
  driver: any;
  browserName?: string;
  hasBidi: (browserName: string | undefined) => boolean;
}) {
  const result: any = { status: "PASS", description: "Mocked requests.", outputs: {} };

  const isValidStep = validate({ schemaKey: "step_v3", object: step });
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = invalidStepMessage(step);
    return result;
  }
  const { url, method, response, responses, harPath } = isValidStep.object.mockRequest;
  const label = url ?? harPath;

  // User-facing text names the browser, never the protocol.
  const name = browserName === "webkit" ? "safari" : browserName || "this browser";
  if (!hasBidi(browserName)) {
    result.status = "SKIPPED";
    result.description = `Skipped: \`${name}\` can't mock requests.`;
    return result;
  }

  // Defensive: every session of a BiDi browser has the socket (ADR 01219).
  // Checked before any file read, so this cause wins over a file error.
  if (!driver?.isBidi) {
    result.status = "FAIL";
    result.description = `Couldn't mock requests to \`${label}\` in \`${name}\`.`;
    return result;
  }

  // Each plan is one webdriverio mock: a pattern, a method, and its responses.
  let plans: { pattern: any; method?: string; key: string; responses: any[] }[];
  if (typeof harPath === "string") {
    // Detection resolved the path against the spec; a getRunner() step against cwd.
    const file = path.resolve(harPath);
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      return fail(result, `Couldn't read \`harPath\` \`${file}\`.`);
    }
    let har: any;
    try {
      har = JSON.parse(text);
    } catch {
      // harToMocks turns the undefined into the parse error below.
    }
    const found = harToMocks(har, { url, method });
    if (!found) return fail(result, `Couldn't parse \`harPath\` \`${file}\`: it isn't HAR JSON.`);
    if (found.length === 0) {
      return fail(result, `Couldn't find HAR entries matching \`${url ?? "*"}\` in \`${file}\`.`);
    }
    plans = found.map((m) => ({
      pattern: literalPattern(m.url),
      method: m.method,
      // Its own namespace: a glob that spells the same URL is a different mock.
      key: `${m.method} har:${m.url}`,
      responses: m.responses,
    }));
  } else {
    plans = [{ pattern: url, method, key: `${method ?? "*"} ${url}`, responses: responses ? [...responses] : [response ?? {}] }];
  }

  for (const plan of plans) {
    for (const [i, entry] of plan.responses.entries()) {
      if (typeof entry.bodyPath !== "string") continue;
      // Detection resolved a spec's bodyPath against the spec file; a step from
      // getRunner() has none, so resolve against the working directory.
      const file = path.resolve(entry.bodyPath);
      try {
        // Bytes, which webdriverio sends as base64, so a binary file survives.
        plan.responses[i] = { ...entry, body: fs.readFileSync(file) };
      } catch {
        return fail(result, `Couldn't read \`bodyPath\` \`${file}\`.`);
      }
    }
  }

  if (!(driver.state.mocks instanceof Map)) driver.state.mocks = new Map();
  const mocks: Map<string, MockEntry> = driver.state.mocks;
  let matched = 0;
  for (const plan of plans) {
    const replaced = mocks.get(plan.key);
    const entry: MockEntry = {
      mock: undefined,
      answered: replaced ? replaced.answered : 0,
    };
    try {
      // webdriverio restores an earlier mock with the same url and filter itself.
      entry.mock = await driver.mock(plan.pattern, plan.method ? { method: plan.method } : {});
      // webdriverio emits "overwrite" each time this mock answers a request with
      // its own response. It doesn't mean another mock replaced this one.
      entry.mock.on("overwrite", () => {
        entry.answered += 1;
      });
      respondWith(entry.mock, plan.responses);
    } catch (error: any) {
      // The driver's error names protocol internals, so it goes to the debug log
      // and the user sees the cause in words.
      log(config, "debug", `mockRequest ${plan.key}: ${error?.message ?? error}`);
      return fail(
        result,
        `Couldn't mock requests to \`${label}\` in \`${name}\`. The browser refused the request intercept.`
      );
    }
    mocks.set(plan.key, entry);
    matched += entry.answered;
    log(config, "debug", `Mocking ${plan.key}.`);
  }

  result.outputs.matched = matched;
  return result;
}

function fail(result: any, description: string) {
  result.status = "FAIL";
  result.description = description;
  return result;
}

// Answer before the request is sent: the server never sees it.
function respondWith(mock: any, responses: any[]) {
  if (responses.length === 1) {
    const [only] = responses;
    mock.respond(only.body ?? "", {
      statusCode: only.statusCode ?? 200,
      ...(only.headers ? { headers: only.headers } : {}),
      fetchResponse: false,
    });
    return;
  }
  // A sequence (ADR 01229). webdriverio's respondOnce can't queue ahead of a
  // sticky respond: each call replaces the other. So one sticky respond reads
  // a counter. webdriverio calls body, then headers, then statusCode,
  // synchronously per request, so all three see the entry the body picked.
  let next = 0;
  let current = responses[0];
  mock.respond(
    () => {
      current = responses[Math.min(next++, responses.length - 1)];
      return current.body ?? "";
    },
    {
      headers: () => current.headers ?? {},
      statusCode: () => current.statusCode ?? 200,
      fetchResponse: false,
    }
  );
}

// A URLPattern that matches one URL exactly: `?`, `:` and `*` match themselves.
// The same escaping webdriverio uses for its own literal patterns.
function literalPattern(url: string) {
  const escape = (value: string) => value.replace(/[*:(){}?+\\]/g, "\\$&");
  const { protocol, hostname, port, pathname, search } = new URL(url);
  return new URLPattern({
    protocol: protocol.slice(0, -1),
    username: "*",
    password: "*",
    hostname: escape(hostname),
    port,
    pathname: escape(pathname),
    search: escape(search.slice(1)),
    hash: "*",
  });
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
