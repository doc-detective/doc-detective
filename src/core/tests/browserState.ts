// Browser state shared by saveCookie, loadCookie, saveState and loadState:
// where the file goes, reading cookies from the browser, and applying them.
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

export {
  resolveStatePath,
  publishFile,
  readCookies,
  toDriverCookie,
  applyCookies,
  cookiesFor,
  matchesDomain,
  isDomainCompatible,
  isLocalOrPrivateNetwork,
  siteOrigin,
  readLocalStorage,
  applyLocalStorage,
  formatStateFile,
  parseStateFile,
};

/**
 * Writes `content` to `fullPath` for a file that holds live session tokens.
 * It writes the whole file to an owner-only (0600) temp file beside the target,
 * then publishes it in one step: a rename replaces an old file atomically, and
 * a hard link fails with EEXIST rather than replace one. A reader never sees
 * partial content, a failed write never touches the old file, an old file's
 * broader permissions don't carry over, and the temp file is always removed.
 * Returns false, having written nothing, when the file exists and `overwrite`
 * isn't true.
 */
function publishFile(fullPath: string, content: string, overwrite: boolean) {
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  // A random name, opened with `wx`, so two writers never share a temp file.
  const temp = `${fullPath}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
  } catch (error: any) {
    // EEXIST means another writer owns that name: leave its file alone. Any
    // other failure happened after `wx` created the file, so it's ours.
    if (error.code !== "EEXIST") fs.rmSync(temp, { force: true });
    throw error;
  }
  try {
    if (overwrite) {
      fs.renameSync(temp, fullPath);
      return true;
    }
    try {
      fs.linkSync(temp, fullPath);
      return true;
    } catch (error: any) {
      if (error.code === "EEXIST") return false;
      throw error;
    }
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

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
// Read in one script with the page's origin, so the entries can't come from a
// page the browser navigated to after the caller read the URL.
async function readLocalStorage(driver: any): Promise<{ origin: string; entries: { name: string; value: string }[] }> {
  const { origin, entries } = await driver.execute(
    "return { origin: window.location.origin, entries: Object.keys(window.localStorage).map(function (name) { return { name: name, value: window.localStorage.getItem(name) }; }) };"
  );
  return { origin, entries: entries || [] };
}

/**
 * Sets each `{ name, value }` entry in the open page's `localStorage`, only if
 * the page is still on `origin`. Returns false, having written nothing, when it
 * isn't. It checks the origin even with no entries, so a cookie-only restore
 * gets the same guard.
 */
async function applyLocalStorage(driver: any, origin: string, entries: { name: string; value: string }[]) {
  return (
    (await driver.execute(
      "if (window.location.origin !== arguments[0]) return false; arguments[1].forEach(function (entry) { window.localStorage.setItem(entry.name, entry.value); }); return true;",
      origin,
      entries
    )) === true
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
      expires: cookie.expiry != null && cookie.expiry > 0 ? cookie.expiry : -1,
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
  // Every record is checked before anything touches the browser.
  const isObject = (value: any) => !!value && typeof value === "object" && !Array.isArray(value);
  const isEntry = (entry: any) => isObject(entry) && typeof entry.name === "string" && typeof entry.value === "string";
  const optional = (value: any, type: string) => value === undefined || typeof value === type;
  const validCookie = (cookie: any) =>
    isEntry(cookie) &&
    optional(cookie.domain, "string") &&
    optional(cookie.path, "string") &&
    optional(cookie.expires, "number") &&
    optional(cookie.httpOnly, "boolean") &&
    optional(cookie.secure, "boolean") &&
    optional(cookie.sameSite, "string");
  const validOrigin = (entry: any) =>
    isObject(entry) && typeof entry.origin === "string" && Array.isArray(entry.localStorage) && entry.localStorage.every(isEntry);
  if (!(cookies || []).every(validCookie) || !(origins || []).every(validOrigin)) return null;
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
 * - Any real expiry is kept, so a cookie that has expired is dropped by the
 *   browser rather than kept as a session cookie.
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
  // Keep any real expiry, even one that just passed: the browser then drops the
  // cookie, rather than keeping it as a session cookie. cookiesFor skips the
  // already expired ones up front.
  if (cookie.expiry > 0) driverCookie.expiry = cookie.expiry;
  return driverCookie;
}

/** `sameSite` in the Pascal case WebDriver and Playwright use. Anything else is `Lax`. */
function normalizeSameSite(sameSite: unknown) {
  const lower = typeof sameSite === "string" ? sameSite.toLowerCase() : "";
  return lower === "none" ? "None" : lower === "strict" ? "Strict" : "Lax";
}

/**
 * The cookies the page at `currentUrl` can take: an unexpired cookie whose
 * domain is the page's host or a parent of it. An expired cookie is skipped,
 * not set as a session cookie.
 */
function cookiesFor(cookies: any[], currentUrl: string) {
  const host = new URL(currentUrl).hostname;
  const now = Math.floor(Date.now() / 1000);
  return cookies.filter(
    (cookie) => !(cookie.expiry && cookie.expiry <= now) && (!cookie.domain || isDomainCompatible(host, cookie.domain))
  );
}

/**
 * Sets each cookie `cookiesFor` keeps, and returns the ones it set.
 */
async function applyCookies(driver: any, cookies: any[], currentUrl: string) {
  const applied = cookiesFor(cookies, currentUrl);
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
