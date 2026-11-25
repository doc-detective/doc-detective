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
};

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
  let sameSite = cookie.sameSite || "Lax";
  let secure = cookie.secure || false;

  if (typeof sameSite === "string") {
    const lower = sameSite.toLowerCase();
    if (lower === "none") sameSite = "None";
    else if (lower === "strict") sameSite = "Strict";
    else sameSite = "Lax";
  }
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
