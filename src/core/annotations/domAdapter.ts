// The live renderer: mount annotations into the page so they appear in
// recordings.
//
// This is the second adapter over the shared SVG generator. The buffer adapter
// (composite.ts) burns the same markup into a captured PNG; this one mounts it
// into a `dd-annotation-layer` element so every frame of a recording contains
// it. Both consume annotationsToSvg, so a shape drawn in a still and in a video
// come from one implementation rather than drifting apart.
//
// Division of labor: Node owns the annotation state and resolves geometry (it
// has findElement and the theme); the page owns only re-rendering. The page
// script is deliberately dumb — it mounts markup, animates it, and translates
// tracked groups on rAF. Anything requiring element lookup semantics stays on
// the Node side, which is why targets are tagged with an attribute here and
// merely read by selector there.
//
// Units: unlike the buffer adapter, this works in CSS pixels against the
// viewport. The generator is unit-agnostic — it just needs rects and a canvas
// in the same space — so the browser's own devicePixelRatio handling applies
// and no scaling is needed.

// Declared before the export so the two module constants precede their first
// textual use (the export list is a binding, not an evaluation, so this is
// cosmetic — but it keeps CodeQL's declared-before-use check quiet).
const LAYER_TAG = "dd-annotation-layer";
const TARGET_ATTRIBUTE = "data-dd-annotate-target";

export {
  LAYER_TAG,
  TARGET_ATTRIBUTE,
  mountAnnotations,
  clearLayer,
  layerScript,
};

/**
 * The page-side renderer, serialized into the browser.
 *
 * Written as a single self-contained function because `driver.execute` ships
 * source text: it can't close over anything in this module.
 */
function layerScript(
  tag: string,
  targetAttribute: string,
  payload: any
): void {
  const doc = document;
  let layer: any = doc.querySelector(tag);
  if (!layer) {
    layer = doc.createElement(tag);
    // A shadow root keeps the page's CSS from restyling annotations and keeps
    // annotation CSS from leaking into the page under test.
    layer.attachShadow({ mode: "open" });
    doc.body.appendChild(layer);
  }
  const root = layer.shadowRoot;

  // The host sits above the page and ignores input: the page under test must
  // behave identically whether or not annotations are up, so a later click
  // step can't land on the overlay.
  layer.setAttribute(
    "style",
    [
      "position:fixed",
      "top:0",
      "left:0",
      "width:100%",
      "height:100%",
      "pointer-events:none",
      "z-index:2147483647",
    ].join(";")
  );

  // Which annotations are new is decided by Node, not inferred here. A fresh
  // document has no memory, so a page-side "have I seen this id?" check would
  // replay every enter animation after each navigation — a visible glitch in
  // the recording, and exactly what re-injection must avoid.
  const isNew = new Set<string>(payload.newIds || []);

  const style =
    "<style>" +
    ":host{all:initial}" +
    "svg{position:absolute;top:0;left:0;overflow:visible}" +
    ".dd-blur{position:absolute;pointer-events:none}" +
    "@keyframes dd-fade{from{opacity:0}to{opacity:1}}" +
    "@keyframes dd-pop{from{opacity:0;transform:scale(0.6)}to{opacity:1;transform:scale(1)}}" +
    "@keyframes dd-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}" +
    "@keyframes dd-out{from{opacity:1}to{opacity:0}}" +
    "[data-dd-enter='fade']{animation:dd-fade var(--dd-dur,250ms) ease both}" +
    "[data-dd-enter='pop']{animation:dd-pop var(--dd-dur,250ms) cubic-bezier(.2,1.4,.4,1) both;transform-box:fill-box;transform-origin:center}" +
    // `draw` strokes the shape on. pathLength normalizes every shape's
    // geometry to 1 so one keyframe works for a rect, a circle, and a line
    // alike, without measuring each path.
    "[data-dd-enter='draw'] [pathLength]{stroke-dasharray:1;animation:dd-draw var(--dd-dur,250ms) ease both}" +
    "[data-dd-enter='draw']{animation:dd-fade calc(var(--dd-dur,250ms)/3) ease both}" +
    "[data-dd-exit='1']{animation:dd-out var(--dd-dur,250ms) ease both}" +
    "</style>";

  // Exit transitions. Re-rendering the whole set means a cleared annotation
  // would otherwise blink out mid-frame, so lift the departing groups into a
  // ghost overlay that outlives the swap, animates out, and removes itself.
  // Ghosts are inert: they carry no id and no tracking, and the next render
  // clears any that are still around.
  //
  // Only SVG groups get ghosts; blurs are backdrop-filter divs, so a cleared
  // blur disappears at once. That's the behavior we want anyway — a blur that
  // faded out would reveal what it covers a frame at a time, and every one of
  // those frames is in the recording.
  // A stale ghost timeout from a previous render would remove the layer out
  // from under this one's ghosts. Cancel it the same way the tracking loop is
  // cancelled, before anything new is mounted.
  if (layer.__ddGhostTimeout) {
    clearTimeout(layer.__ddGhostTimeout);
    layer.__ddGhostTimeout = null;
  }

  const goingAway: any[] = [];
  const stillHere = new Set<string>(payload.enter ? Object.keys(payload.enter) : []);
  for (const g of Array.from(
    root.querySelectorAll("[data-dd-annotation]")
  ) as any[]) {
    const id = g.getAttribute("data-dd-annotation");
    // Exit specs are keyed by STORED id, but an `all` expansion renders as
    // `id`, `id--1`, `id--2`. Fall back to the base id so every expansion
    // animates out, not just the first.
    const exit =
      payload.exit &&
      (payload.exit[id] || payload.exit[String(id).replace(/--\d+$/, "")]);
    if (!stillHere.has(id) && exit && exit.type && exit.type !== "none") {
      goingAway.push({ html: g.outerHTML, durationMs: exit.durationMs || 250 });
    }
  }

  root.innerHTML = style + (payload.svg || "") + (payload.blurHtml || "");

  if (goingAway.length > 0) {
    const ghostSvg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    ghostSvg.setAttribute("data-dd-ghost", "1");
    ghostSvg.innerHTML = goingAway.map((x) => x.html).join("");
    root.appendChild(ghostSvg);
    for (const g of Array.from(
      ghostSvg.querySelectorAll("[data-dd-annotation]")
    ) as any[]) {
      g.removeAttribute("data-dd-annotation");
      g.removeAttribute("data-dd-track");
      g.setAttribute("data-dd-exit", "1");
    }
    const longest = goingAway.reduce(
      (max, x) => Math.max(max, x.durationMs),
      0
    );
    ghostSvg.style.setProperty("--dd-dur", longest + "ms");
    layer.__ddGhostTimeout = setTimeout(() => {
      layer.__ddGhostTimeout = null;
      ghostSvg.remove();
      // A `clear: true` renders an empty set plus ghosts so the exit can play.
      // Once they're gone there's nothing left to show, so take the layer down
      // rather than leave an empty element in the page under test.
      if (
        !root.querySelector("[data-dd-annotation]") &&
        !root.querySelector(".dd-blur") &&
        !root.querySelector("[data-dd-ghost]")
      ) {
        layer.remove();
      }
    }, longest + 50);
  }

  // Only newly-added annotations animate in. Re-rendering the whole set on
  // every annotate step is what keeps Node the single source of truth, but it
  // would otherwise re-play the enter animation for annotations that were
  // already sitting on screen — a visible flicker in the recording.
  const groups = root.querySelectorAll("[data-dd-annotation]");
  for (const g of Array.from(groups) as any[]) {
    const id = g.getAttribute("data-dd-annotation");
    const enter = payload.enter && payload.enter[id];
    if (enter && enter.type && enter.type !== "none" && isNew.has(id)) {
      g.setAttribute("data-dd-enter", enter.type);
      g.style.setProperty("--dd-dur", (enter.durationMs || 250) + "ms");
    }
  }

  // Tracking: translate each tracked group by however far its element has
  // moved since the rects were resolved. Cheaper and far less chatty than
  // asking Node to re-resolve geometry every frame, and it survives scrolling
  // and reflow because it re-reads the live rect.
  if (layer.__ddRaf) cancelAnimationFrame(layer.__ddRaf);
  const tracked = payload.tracked || [];
  if (tracked.length > 0) {
    // Ids come from the schema's [A-Za-z0-9_-] pattern (or are generated to
    // match), so they're already selector-safe. Escape anyway rather than let
    // that invariant live only in a schema three files away. The fallback
    // (for the rare engine without CSS.escape) is a real CSS-ident escape —
    // every character outside [A-Za-z0-9_-] becomes a `\` + hex + space
    // escape — not just a strip of quotes, so it holds even if the id
    // constraint ever loosens.
    const esc = (value: string) =>
      (window as any).CSS && (window as any).CSS.escape
        ? (window as any).CSS.escape(value)
        : String(value).replace(/[^A-Za-z0-9_-]/g, (c: string) =>
            "\\" + c.charCodeAt(0).toString(16) + " "
          );
    const step = () => {
      for (const t of tracked) {
        const el = doc.querySelector(
          "[" + targetAttribute + '="' + esc(t.id) + '"]'
        );
        if (!el) continue;
        const now = el.getBoundingClientRect();
        const dx = now.left - t.rect.x;
        const dy = now.top - t.rect.y;
        const g = root.querySelector(
          '[data-dd-annotation="' + esc(t.id) + '"]'
        );
        if (g) g.setAttribute("transform", "translate(" + dx + "," + dy + ")");
        const b = root.querySelector(
          '.dd-blur[data-dd-blur="' + esc(t.id) + '"]'
        );
        if (b)
          (b as any).style.transform =
            "translate(" + dx + "px," + dy + "px)";
      }
      layer.__ddRaf = requestAnimationFrame(step);
    };
    layer.__ddRaf = requestAnimationFrame(step);
  }
}

// Blur can't be expressed in the overlay's SVG — a filter only reaches content
// inside the SVG, not the page behind it. The buffer adapter solves this with
// sharp; here the equivalent is a positioned div with a backdrop-filter.
function blurRegionsToHtml(regions: any[]): string {
  return regions
    .map((region) => {
      const id = String(region.id ?? "").replace(/"/g, "");
      return (
        `<div class="dd-blur" data-dd-blur="${id}" style="` +
        `left:${region.rect.x}px;top:${region.rect.y}px;` +
        `width:${region.rect.width}px;height:${region.rect.height}px;` +
        `backdrop-filter:blur(${region.intensity}px);` +
        `-webkit-backdrop-filter:blur(${region.intensity}px);"></div>`
      );
    })
    .join("");
}

/**
 * Render the given annotations into the page, replacing whatever is up.
 *
 * @param driver Browser driver.
 * @param placed Annotations with rects in CSS pixels.
 * @param svg Overlay markup from the shared generator.
 * @param blurRegions Blur instructions from the shared generator.
 * @param newIds Ids that weren't on screen before, so only they animate in.
 */
async function mountAnnotations({
  driver,
  placed,
  svg,
  blurRegions,
  newIds,
  exitTransitions = {},
}: {
  driver: any;
  placed: any[];
  svg: string;
  blurRegions: any[];
  newIds: string[];
  // Exit transitions for annotations that were up before this render, keyed by
  // render id. Supplied by the caller because only Node knows what the
  // previous set was — the page just renders what it's told.
  exitTransitions?: Record<string, { type: string; durationMs: number }>;
}): Promise<void> {
  const enter: Record<string, any> = {};
  const tracked: any[] = [];
  for (const item of placed) {
    const id = item.id ?? item.__ddId;
    if (!id) continue;
    enter[id] = {
      type: item.transition?.enter ?? "fade",
      durationMs: item.transition?.durationMs ?? 250,
    };
    if (item.track) tracked.push({ id, rect: item.rect });
  }

  await driver.execute(
    layerScript,
    LAYER_TAG,
    TARGET_ATTRIBUTE,
    {
      svg,
      blurHtml: blurRegionsToHtml(blurRegions),
      newIds,
      enter,
      // How annotations that are LEAVING should bow out. Keyed by the ids that
      // were on screen before this render; the page keeps whichever of them
      // aren't in `enter` around long enough to animate.
      exit: exitTransitions,
      tracked,
    }
  );
}

/** Remove the layer entirely, stopping its tracking loop and any pending
 * ghost-exit timeout. Cancelling both mirrors the two timers a render can
 * arm, so a teardown mid-exit leaves nothing pending. (Firing against a
 * removed layer is a DOM no-op, so this is tidiness rather than a crash fix.) */
async function clearLayer(driver: any): Promise<void> {
  await driver.execute((tag: string) => {
    const layer: any = document.querySelector(tag);
    if (!layer) return;
    if (layer.__ddRaf) cancelAnimationFrame(layer.__ddRaf);
    if (layer.__ddGhostTimeout) clearTimeout(layer.__ddGhostTimeout);
    layer.remove();
  }, LAYER_TAG);
}
