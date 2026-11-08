// Hide environment variable values in browser captures (ADR 01178). Masking
// text can't reach pixels, so the page hides them itself: a field that receives
// a typed secret shows dots for the life of the page, and each screenshot blurs
// the elements that show a secret while it captures. Native app and device
// captures can't be hidden this way.
//
// The page never receives a secret. Its own scripts could patch
// String.prototype.includes or Array.prototype.some to read one, and a test can
// screenshot any third-party page. So the page returns candidate text, Node
// decides which candidates hold a secret, and the page blurs those by index.
import { secretValuesForCapture } from "../masking.js";

export {
  hideTypedSecret,
  blurSecretsForCapture,
  collectCaptureCandidates,
  selectSecretCandidates,
  blurCandidates,
  unmarkSecretElements,
  hideFocusedField,
};

// Runs in the page, so it's self-contained. Tags each form field that has a
// value, and each element with text of its own, and returns `[index, text]`
// for each: the field's value, or the element's whole text, so a secret split
// across inline children still matches its parent. That trades width for
// safety: an ancestor with text of its own blurs whole when a child shows a
// secret. A secret split only across sibling elements, in a parent with no
// text of its own, isn't matched; the docs list that limit.
function collectCaptureCandidates(): [number, string][] {
  const mark = "data-dd-capture-candidate";
  const out: [number, string][] = [];
  const tag = (element: Element, text: string) => {
    element.setAttribute(mark, String(out.length));
    out.push([out.length, text]);
  };
  document.querySelectorAll("input, textarea, select").forEach((element: any) => {
    if (element.value) tag(element, String(element.value));
  });
  const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "INPUT", "TEXTAREA", "SELECT"]);
  document.querySelectorAll("body, body *").forEach((element) => {
    if (skip.has(element.tagName)) return;
    const ownText = Array.from(element.childNodes).some((node) => node.nodeType === 3 && node.nodeValue?.trim());
    if (ownText) tag(element, element.textContent ?? "");
  });
  return out;
}

// In Node: the indices whose text holds a secret.
function selectSecretCandidates(candidates: [number, string][], secrets: string[]): number[] {
  return candidates.filter(([, text]) => secrets.some((secret) => text.includes(secret))).map(([index]) => index);
}

// Runs in the page: blurs the tagged elements at these indices, keeping each
// one's own filter to put back, and clears every tag.
function blurCandidates(indices: number[]): void {
  const wanted = new Set(indices.map(String));
  document.querySelectorAll("[data-dd-capture-candidate]").forEach((element: any) => {
    if (wanted.has(element.getAttribute("data-dd-capture-candidate")) && !element.hasAttribute("data-dd-secret-blur")) {
      element.setAttribute("data-dd-secret-blur", element.style.filter);
      element.style.filter = "blur(8px)";
    }
    element.removeAttribute("data-dd-capture-candidate");
  });
}

// Runs in the page: puts back each element's own filter.
function unmarkSecretElements(): void {
  document.querySelectorAll("[data-dd-secret-blur]").forEach((element: any) => {
    element.style.filter = element.getAttribute("data-dd-secret-blur");
    element.removeAttribute("data-dd-secret-blur");
  });
}

// Runs in the page, with no arguments: draws the focused field's text as dots,
// or hides it where the browser has no `-webkit-text-security`. Returns which
// style it used.
function hideFocusedField(): string {
  const element = document.activeElement as HTMLElement | null;
  if (!element || element === document.body || element === document.documentElement) return "none";
  if (CSS.supports("-webkit-text-security", "disc")) {
    element.style.setProperty("-webkit-text-security", "disc");
    return "disc";
  }
  element.style.setProperty("color", "transparent");
  element.style.setProperty("text-shadow", "none");
  return "transparent";
}

// Before a `type` step types keys that hold a secret into the focused field.
// The keys themselves reach the page by typing, never as a script argument.
async function hideTypedSecret(driver: any, keys: string[]): Promise<void> {
  const typed = keys.join("");
  if (!secretValuesForCapture().some((secret) => typed.includes(secret))) return;
  await driver.execute(hideFocusedField);
}

// Blurs the page's secrets before a capture, and returns what removes the blur.
// Fails closed: if the page won't run the blur, it throws, so the screenshot
// fails rather than capture a secret unblurred. Unlike hiding a typed field,
// there's no later chance to hide it.
async function blurSecretsForCapture(driver: any): Promise<() => Promise<void>> {
  const secrets = secretValuesForCapture();
  // Only browser captures call this, and every browser session has `execute`.
  // App and device captures never reach it; the docs say they aren't blurred.
  if (secrets.length === 0 || typeof driver?.execute !== "function") return async () => {};
  try {
    const candidates = await driver.execute(collectCaptureCandidates);
    await driver.execute(blurCandidates, selectSecretCandidates(Array.isArray(candidates) ? candidates : [], secrets));
  } catch (error: any) {
    throw new Error(`Couldn't hide secret values on the page before the screenshot: ${error?.message ?? error}`);
  }
  return async () => {
    try {
      await driver.execute(unmarkSecretElements);
    } catch {
      // A page that navigated away has no blur left to remove.
    }
  };
}
