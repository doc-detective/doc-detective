// The `annotate` step: put annotations on screen and keep them there.
//
// A screenshot's own `annotations` live for one capture and are composited
// into the image. These are different: they're drawn INTO the page, so every
// frame of a recording contains them, and they persist across steps until
// something clears them. That persistence is the whole point — and it's why
// this step needs state, ids, and a lifecycle that ephemeral annotations don't.
//
// Node owns the state (`driver.state.annotations`, mirroring how recordings
// live in `driver.state.recordings`) and re-renders the full set on every
// change. The page only renders and tracks. That split means the page never
// has to know how to resolve an `elementText` target, and a reload can't lose
// annotations — the runner re-mounts them from state.

import { validate } from "../../common/src/validate.js";
import { resolveTheme, resolveAnnotation } from "../annotations/model.js";
import { annotationsToSvg } from "../annotations/svg.js";
import { resolveAnnotationRects } from "../annotations/geometry.js";
import {
  mountAnnotations,
  clearLayer,
  TARGET_ATTRIBUTE,
} from "../annotations/domAdapter.js";
import { log } from "../utils.js";

export { annotate, applyAnnotateOps, pruneExpired, renderLayer };

type StoredAnnotation = {
  id: string;
  spec: any;
  expiresAt?: number;
};

/**
 * Fold an annotate payload into the current annotation list.
 *
 * Pure, so the add/update/clear semantics are testable without a browser.
 *
 * @param current Annotations currently on screen.
 * @param payload The step's `annotate` value.
 * @param now Millisecond clock, injected so `duration` is testable.
 * @returns The new list, the ids that are newly added (only those animate in),
 *   and any error that should fail the step.
 */
function applyAnnotateOps(
  current: StoredAnnotation[],
  payload: any,
  now: number
): { next: StoredAnnotation[]; added: string[]; error?: string } {
  let next = [...current];
  const added: string[] = [];
  let autoId = 0;

  // Clear runs FIRST so `{ clear: ["a"], add: [{ id: "a", … }] }` reads as
  // "replace a" rather than "add a then immediately remove it".
  if (payload.clear !== undefined) {
    if (payload.clear === true) {
      next = [];
    } else if (Array.isArray(payload.clear)) {
      const drop = new Set(payload.clear);
      next = next.filter((entry) => !drop.has(entry.id));
    }
    // `clear: false` is an explicit no-op, matching the boolean opt-out other
    // fields use.
  }

  for (const spec of payload.add ?? []) {
    // Annotations without an id are anonymous: they can't be updated or
    // cleared individually, only by `clear: true`. Give them a stable-enough
    // internal id so the renderer can still address them.
    const id = spec.id ?? `dd-anon-${now}-${autoId++}`;
    const entry: StoredAnnotation = {
      id,
      spec,
      expiresAt:
        typeof spec.duration === "number" ? now + spec.duration : undefined,
    };
    const existing = next.findIndex((item) => item.id === id);
    if (existing >= 0) next[existing] = entry;
    else next.push(entry);
    added.push(id);
  }

  for (const spec of payload.update ?? []) {
    const index = next.findIndex((item) => item.id === spec.id);
    if (index < 0) {
      // An update naming an id that isn't on screen is a mistake worth
      // surfacing: the author expected something to be there. Silently adding
      // it would hide a typo'd or already-cleared id.
      return {
        next: current,
        added: [],
        error: `No annotation with id "${spec.id}" is on screen to update. Add it first, or use "add" if you meant to create it.`,
      };
    }
    next[index] = {
      id: spec.id,
      spec,
      expiresAt:
        typeof spec.duration === "number" ? now + spec.duration : undefined,
    };
  }

  return { next, added };
}

/** Drop annotations whose `duration` has elapsed. */
function pruneExpired(
  entries: StoredAnnotation[],
  now: number
): StoredAnnotation[] {
  return entries.filter(
    (entry) => entry.expiresAt === undefined || entry.expiresAt > now
  );
}

/**
 * Resolve and mount the current annotation set into the page.
 *
 * Exported because navigation re-mounts the same set: a fresh document has no
 * layer, so the runner calls this again rather than duplicating the pipeline.
 */
async function renderLayer({
  config,
  driver,
  entries,
  annotationTheme,
  newIds = [],
  departing = [],
}: {
  config: any;
  driver: any;
  entries: StoredAnnotation[];
  annotationTheme?: any;
  newIds?: string[];
  // Annotations that were up before this render and no longer are. Only Node
  // knows this — the page renders what it's told — so their exit transitions
  // are resolved here and handed over.
  departing?: StoredAnnotation[];
}): Promise<{ errors: string[] }> {
  // Nothing to show and nothing to animate out: take the layer down.
  // When annotations ARE leaving, fall through instead — the render mounts an
  // empty set plus their ghosts, so `clear: true` still gets its exit
  // animation rather than blinking out. The page drops the layer once the
  // ghosts finish.
  if (entries.length === 0 && departing.length === 0) {
    await clearLayer(driver);
    return { errors: [] };
  }

  const viewport = await driver.execute(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  const theme = annotationTheme ?? resolveTheme([config?.annotationDefaults]);
  const resolved = entries.map((entry) => ({
    ...resolveAnnotation(entry.spec, theme),
    __ddId: entry.id,
  }));

  // Resolve exit transitions for the annotations that are leaving. Their
  // groups are already in the page, so the page can keep them alive through
  // the animation — but only Node knows the theme and what departed.
  const exitTransitions: Record<string, { type: string; durationMs: number }> = {};
  for (const entry of departing) {
    const spec = resolveAnnotation(entry.spec, theme);
    exitTransitions[entry.id] = {
      type: spec.transition?.exit ?? "fade",
      durationMs: spec.transition?.durationMs ?? 250,
    };
  }

  // Scale is 1 and there's no crop origin: the overlay lives in the page's own
  // CSS pixel space, so the browser applies devicePixelRatio itself. The
  // generator is unit-agnostic — it only needs rects and a canvas in the same
  // space — which is what lets one implementation serve both media.
  const { placed, errors } = await resolveAnnotationRects({
    config,
    annotations: resolved as any,
    driver,
    canvas: viewport,
    scale: 1,
  });
  if (errors.length > 0) return { errors };

  // Give every placed annotation a UNIQUE render id.
  //
  // One stored annotation with `all: true` expands to one placed item per
  // match, and they'd otherwise all carry the same id. The page addresses
  // groups with querySelector, so only the first would ever be found — with
  // `track`, that means the first blur follows its element on scroll while the
  // rest sit still and slide off the content they're redacting. Suffixing the
  // expansions keeps each addressable. The stored id is untouched, so
  // `clear: ["redact"]` still removes the whole set.
  const idCounts = new Map<string, number>();
  for (const item of placed as any[]) {
    const base = item.id ?? item.__ddId;
    const seen = idCounts.get(base) ?? 0;
    idCounts.set(base, seen + 1);
    item.id = seen === 0 ? base : `${base}--${seen}`;
  }
  const tracked = (placed as any[]).filter((item) => item.track && item.element);
  for (const item of tracked) {
    try {
      await driver.execute(
        (el: any, attr: string, id: string) => el.setAttribute(attr, id),
        item.element,
        TARGET_ATTRIBUTE,
        item.id
      );
    } catch {
      // Tagging is best-effort: a failure costs tracking for that annotation,
      // not the step. (The element may have gone stale between resolve and
      // tag on a live page — the annotation still renders at its resolved
      // position.)
    }
  }

  const { svg, blurRegions } = annotationsToSvg(placed as any, viewport);
  log(config, "debug", {
    annotateLayer: {
      viewport,
      count: placed.length,
      ids: (placed as any[]).map((item) => item.id),
    },
  });
  // Translate the caller's newly-added STORED ids into render ids, so an
  // `all` expansion animates all of its parts and nothing else does.
  const newRenderIds = (placed as any[])
    .filter((item) => newIds.includes(item.__ddId))
    .map((item) => item.id);

  await mountAnnotations({
    driver,
    placed: placed as any,
    svg,
    blurRegions,
    newIds: newRenderIds,
    exitTransitions,
  });
  return { errors: [] };
}

async function annotate({
  config,
  step,
  driver,
  annotationTheme,
}: {
  config: any;
  step: any;
  driver: any;
  annotationTheme?: any;
}) {
  const result: any = {
    status: "PASS",
    description: "Updated annotations.",
    outputs: {},
  };

  const isValidStep = validate({ schemaKey: "step_v3", object: step });
  if (!isValidStep.valid) {
    result.status = "FAIL";
    result.description = `Invalid step definition: ${isValidStep.errors}`;
    return result;
  }
  step = isValidStep.object;

  // Annotations are drawn into a page, so this needs a browser. An app-only
  // context has nothing to draw into: SKIP with the reason named rather than
  // failing a test that never asked for a browser. (Screenshot annotations DO
  // work on app surfaces — they're composited into the image instead.)
  if (!driver) {
    result.status = "SKIPPED";
    result.description =
      "No browser session is running in this context, and annotations are drawn into a page. Annotate a browser surface, or use a screenshot's own `annotations` to annotate an app capture.";
    return result;
  }

  if (!driver.state) driver.state = {};
  if (!Array.isArray(driver.state.annotations)) driver.state.annotations = [];

  const now = Date.now();
  const pruned = pruneExpired(driver.state.annotations, now);
  const { next, added, error } = applyAnnotateOps(pruned, step.annotate, now);
  if (error) {
    result.status = "FAIL";
    result.description = error;
    return result;
  }

  // Whatever was up and isn't any more gets to animate out. Computed here
  // because only Node knows the previous set.
  const surviving = new Set(next.map((entry) => entry.id));
  const departing = pruned.filter((entry) => !surviving.has(entry.id));

  try {
    const { errors } = await renderLayer({
      config,
      driver,
      entries: next,
      annotationTheme,
      newIds: added,
      departing,
    });
    if (errors.length > 0) {
      result.status = "FAIL";
      result.description = `Couldn't resolve every annotation target. ${errors.join(" ")}`;
      return result;
    }
  } catch (error: any) {
    result.status = "FAIL";
    result.description = `Couldn't render annotations. ${error?.message ?? error}`;
    return result;
  }

  driver.state.annotations = next;
  result.outputs.annotationCount = next.length;
  result.description =
    next.length === 0
      ? "Cleared all annotations."
      : `Updated annotations (${next.length} on screen).`;
  return result;
}
