// Browser state shared by saveCookie, loadCookie, saveState and loadState:
// where the file goes, reading cookies from the browser, and applying them.
import path from "node:path";

export {
  resolveStatePath,
  readCookies,
  toDriverCookie,
  applyCookies,
  matchesDomain,
  isDomainCompatible,
  isLocalOrPrivateNetwork,
  siteOrigin,
  readLocalStorage,
  applyLocalStorage,
  formatStateFile,
  parseStateFile,
};

/** The origin of an http(s) page, or null when no site is open (about:blank, data:). */
function siteOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

/** The open page's `localStorage`, as `{ name, value }` entries. */
async function readLocalStorage(driver: any): Promise<{ name: string; value: string }[]> {
  const entries = await driver.execute(
    "return Object.keys(window.localStorage).map(function (name) { return { name: name, value: window.localStorage.getItem(name) }; });"
  );
  return entries || [];
}

/** Sets each `{ name, value }` entry in the open page's `localStorage`. */
async function applyLocalStorage(driver: any, entries: { name: string; value: string }[]) {
  if (entries.length === 0) return;
  await driver.execute(
    "arguments[0].forEach(function (entry) { window.localStorage.setItem(entry.name, entry.value); });",
    entries
  );
}

/**
 * A state file in Playwright's `storageState` format: WebDriver cookies, with
 * `expiry` as Playwright's `expires` (-1 for a session cookie), and the
 * origin's `localStorage`.
 */
function formatStateFile({ cookies, origin, localStorage }: { cookies: any[]; origin: string; localStorage: { name: string; value: string }[] }) {
  const state = {
    cookies: cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || "/",
      expires: cookie.expiry || -1,
      httpOnly: cookie.httpOnly || false,
      secure: cookie.secure || false,
      sameSite: normalizeSameSite(cookie.sameSite),
    })),
    origins: localStorage.length ? [{ origin, localStorage }] : [],
  };
  return JSON.stringify(state, null, 2) + "\n";
}

/**
 * Reads a Playwright `storageState` file. Returns cookies with `expiry` (the
 * WebDriver name) and the origins, or null when the text isn't a state file.
 */
function parseStateFile(text: string): { cookies: any[]; origins: { origin: string; localStorage: { name: string; value: string }[] }[] } | null {
  let state: any;
  try {
    state = JSON.parse(text);
  } catch {
    return null;
  }
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  const { cookies, origins } = state;
  if (cookies === undefined && origins === undefined) return null;
  if ((cookies !== undefined && !Array.isArray(cookies)) || (origins !== undefined && !Array.isArray(origins))) return null;
  return {
    cookies: (cookies || []).map(({ expires, ...cookie }: any) => (expires > 0 ? { ...cookie, expiry: expires } : cookie)),
    origins: origins || [],
  };
}

/**
 * The absolute path of a state or cookie file. A relative `path` resolves
 * against `directory`, then `outputDir`, then the working directory.
 */
function resolveStatePath(config: any, { path: filePath, directory }: { path: string; directory?: string }) {
  return path.resolve(directory || config.outputDir || process.cwd(), filePath);
}

/** Whether a cookie's domain is `domain` or one of its subdomains. No `domain` matches all. */
function matchesDomain(cookieDomain: string | undefined, domain?: string) {
  if (!domain) return true;
  return !!cookieDomain && (
    cookieDomain === domain ||
    cookieDomain === "." + domain ||
    cookieDomain.endsWith("." + domain)
  );
}

/** The browser's cookies, filtered by `name` and `domain` when given. */
async function readCookies(driver: any, { name, domain }: { name?: string; domain?: string } = {}) {
  const cookies: any[] = await driver.getCookies();
  return cookies.filter((cookie) => (!name || cookie.name === name) && matchesDomain(cookie.domain, domain));
}

/**
 * The WebDriver form of a saved cookie for the page at `currentUrl`.
 * - `sameSite` is Pascal case and defaults to `Lax`. `None` needs HTTPS, so on
 *   HTTP it falls back to `Lax`; on HTTPS it forces `secure`.
 * - On localhost and private addresses the domain is left to the browser.
 * - An expiry in the past is dropped, which makes a session cookie.
 */
function toDriverCookie(cookie: any, currentUrl: string) {
  const isHttps = currentUrl.startsWith("https://");
  let sameSite = normalizeSameSite(cookie.sameSite);
  let secure = cookie.secure || false;

  if (sameSite === "None") {
    if (isHttps) secure = true;
    else sameSite = "Lax";
  }

  const driverCookie: any = {
    name: cookie.name,
    value: cookie.value,
    path: cookie.path || "/",
    secure,
    httpOnly: cookie.httpOnly || false,
    sameSite,
  };
  if (cookie.domain && !isLocalOrPrivateNetwork(new URL(currentUrl).hostname)) {
    driverCookie.domain = cookie.domain;
  }
  if (cookie.expiry && cookie.expiry > Math.floor(Date.now() / 1000)) {
    driverCookie.expiry = cookie.expiry;
  }
  return driverCookie;
}

/** `sameSite` in the Pascal case WebDriver and Playwright use. Anything else is `Lax`. */
function normalizeSameSite(sameSite: unknown) {
  const lower = typeof sameSite === "string" ? sameSite.toLowerCase() : "";
  return lower === "none" ? "None" : lower === "strict" ? "Strict" : "Lax";
}

/**
 * Sets each cookie whose domain fits the page at `currentUrl`, and returns the
 * ones it set.
 */
async function applyCookies(driver: any, cookies: any[], currentUrl: string) {
  const host = new URL(currentUrl).hostname;
  const applied = cookies.filter((cookie) => !cookie.domain || isDomainCompatible(host, cookie.domain));
  for (const cookie of applied) {
    await driver.setCookies(toDriverCookie(cookie, currentUrl));
  }
  return applied;
}

/**
 * Check if a domain is localhost or a private network IP address.
 */
function isLocalOrPrivateNetwork(domain: string) {
  if (domain === "localhost" || domain === "::1") return true;

  const match = domain.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1, 5).map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return false;

  const [first, second] = octets;
  return (
    first === 127 || // loopback
    first === 10 || // private class A
    (first === 192 && second === 168) || // private class C
    (first === 172 && second >= 16 && second <= 31) // private class B
  );
}

/**
 * Check if a cookie domain is compatible with the current page domain: the same
 * host, or a parent of it.
 */
function isDomainCompatible(currentDomain: string, cookieDomain: string) {
  if (!cookieDomain) return true;
  const normalized = cookieDomain.startsWith(".") ? cookieDomain.substring(1) : cookieDomain;
  return currentDomain === normalized || currentDomain.endsWith("." + normalized);
}
