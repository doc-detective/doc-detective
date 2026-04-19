import { validate } from "../../common/src/validate.js";
import { isRelativeUrl, appendQueryParams } from "../utils.js";
import axios from "axios";

export { checkLink };

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-User": "?1",
  "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
};

// Initial request plus up to 3 retries, producing sleeps of 1s, 2s, 4s.
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 1000;
const MAX_RETRY_AFTER_MS = 10000;

function parseHeaderString(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    // Match httpRequest's behavior: require a non-empty key AND a non-empty
    // value. Silently dropping a header with no value avoids sending
    // "X-Example:" lines that are almost always formatting mistakes.
    if (key && value) out[key] = value;
  }
  return out;
}

function mergeHeaders(
  userHeaders: Record<string, unknown> | string | undefined
): Record<string, string> {
  const merged: Record<string, string> = { ...DEFAULT_HEADERS };
  if (!userHeaders) return merged;
  const parsed: Record<string, unknown> =
    typeof userHeaders === "string"
      ? parseHeaderString(userHeaders)
      : userHeaders;
  // Case-insensitive override: strip any default with the same name (any casing)
  for (const userKey of Object.keys(parsed)) {
    const raw = parsed[userKey];
    if (raw === null || raw === undefined) continue;
    const value = typeof raw === "string" ? raw : String(raw);
    const lower = userKey.toLowerCase();
    for (const existingKey of Object.keys(merged)) {
      if (existingKey.toLowerCase() === lower) delete merged[existingKey];
    }
    merged[userKey] = value;
  }
  return merged;
}

function parseRetryAfter(value: unknown): number | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string" && typeof candidate !== "number") return null;
  const str = String(candidate).trim();
  if (!str) return null;
  const seconds = Number(str);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.min(seconds * 1000, MAX_RETRY_AFTER_MS));
  }
  const date = Date.parse(str);
  if (!Number.isNaN(date)) {
    return Math.max(0, Math.min(date - Date.now(), MAX_RETRY_AFTER_MS));
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(statusCode: number | null): boolean {
  if (statusCode === null) return false;
  return statusCode === 429 || statusCode >= 500;
}

type AttemptResult = { statusCode: number | null; retryAfter: number | null };

async function attemptRequest(
  method: "get" | "head",
  url: string,
  headers: Record<string, string>
): Promise<AttemptResult> {
  try {
    const res = await axios.request({
      method,
      url,
      headers,
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: () => true,
    });
    const retryAfter = parseRetryAfter(
      res.headers?.["retry-after"] ?? res.headers?.["Retry-After"]
    );
    return { statusCode: res.status, retryAfter };
  } catch (error: any) {
    if (error?.response?.status) {
      return {
        statusCode: error.response.status,
        retryAfter: parseRetryAfter(
          error.response.headers?.["retry-after"] ??
            error.response.headers?.["Retry-After"]
        ),
      };
    }
    return { statusCode: null, retryAfter: null };
  }
}

async function checkLink({ config, step }: { config: any; step: any }) {
  let result = { status: "PASS", description: "Checked link." };

  // Resolve to object
  if (typeof step.checkLink === "string") {
    step.checkLink = { url: step.checkLink };
  }

  const relative = isRelativeUrl(step.checkLink.url);

  // Set origin for relative URLs
  if (relative) {
    if (!step.checkLink.origin && !config.origin) {
      result.status = "FAIL";
      result.description =
        "Relative URL provided without origin. Specify an origin in either the step or the config.";
      return result;
    }
    step.checkLink.origin = step.checkLink.origin || config.origin;
    // If there isn't the necessary slash, add it
    if (
      !step.checkLink.origin.endsWith("/") &&
      !step.checkLink.url.startsWith("/")
    ) {
      step.checkLink.origin += "/";
    }
    step.checkLink.url = step.checkLink.origin + step.checkLink.url;
  }

  // config.originParams only apply to URLs resolved against an origin;
  // step.checkLink.params applies regardless so per-step params on absolute
  // URLs aren't silently dropped. Step keys win on collision.
  const params = {
    ...(relative ? config.originParams : undefined),
    ...step.checkLink.params,
  };
  step.checkLink.url = appendQueryParams(step.checkLink.url, params);

  // Make sure there's a protocol
  if (step.checkLink.url && !step.checkLink.url.includes("://"))
    step.checkLink.url = "https://" + step.checkLink.url;

  // Validate step payload
  const isValidStep = validate({ schemaKey: "step_v3", object: step });
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = `Invalid step definition: ${isValidStep.errors}`;
    return result;
  }
  // Accept coerced and defaulted values
  step = isValidStep.object;

  // Resolve to detailed object with defaults
  if (typeof step.checkLink.statusCodes === "undefined") {
    step.checkLink.statusCodes = [200, 301, 302, 307, 308];
  } else if (typeof step.checkLink.statusCodes === "number") {
    step.checkLink.statusCodes = [step.checkLink.statusCodes];
  }

  const headers = mergeHeaders(step.checkLink.headers);
  const url = step.checkLink.url;

  const acceptedCodes: number[] = step.checkLink.statusCodes;
  const isAccepted = (code: number | null) =>
    code !== null && acceptedCodes.indexOf(code) >= 0;

  // Attempt GET with bounded retry on 429/5xx, honoring Retry-After.
  // Short-circuit retries if the response is already an accepted status code.
  let last: AttemptResult = { statusCode: null, retryAfter: null };
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    last = await attemptRequest("get", url, headers);
    if (isAccepted(last.statusCode)) break;
    if (!shouldRetry(last.statusCode)) break;
    if (attempt < MAX_ATTEMPTS - 1) {
      const backoff =
        last.retryAfter ?? BASE_BACKOFF_MS * Math.pow(2, attempt);
      await sleep(backoff);
    }
  }

  // HEAD fallback on final 429/403 when the result is not already accepted.
  // Some WAFs rate-limit HTML GETs but allow HEADs.
  if (
    !isAccepted(last.statusCode) &&
    (last.statusCode === 429 || last.statusCode === 403)
  ) {
    const headResult = await attemptRequest("head", url, headers);
    if (isAccepted(headResult.statusCode)) {
      last = headResult;
    }
  }

  if (last.statusCode === null) {
    result.status = "FAIL";
    result.description = `Invalid or unresolvable URL: ${url}`;
    return result;
  }

  // Compare status codes
  if (step.checkLink.statusCodes.indexOf(last.statusCode) >= 0) {
    result.status = "PASS";
    result.description = `Returned ${last.statusCode}`;
  } else {
    result.status = "FAIL";
    result.description = `Returned ${last.statusCode}. Expected one of ${JSON.stringify(
      step.checkLink.statusCodes
    )}`;
  }

  return result;
}
