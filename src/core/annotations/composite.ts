// The buffer renderer: burn annotations into a captured PNG.
//
// This is one of the two adapters over the shared SVG generator (the other,
// coming with the `annotate` step, mounts the same markup into a live DOM
// overlay so annotations appear in recordings). Both consume
// annotationsToSvg, so a shape drawn here and a shape drawn there come from
// one implementation.
//
// `sharp` is injected rather than imported: it's a heavy optional dep loaded
// JIT through the runtime loader, and saveScreenshot already holds the
// resolved module. Taking it as a parameter keeps this module free of the
// loader and unit-testable with a stub.

import type { BlurRegion } from "./svg.js";

export { compositeAnnotations };

/**
 * Apply blur regions and an SVG overlay to a PNG buffer, returning a new PNG.
 *
 * Blurs land first so the overlay paints on top: an outline or callout drawn
 * over a redacted region must stay sharp, and blurring after compositing would
 * smear the annotation itself.
 *
 * @param sharp The loaded sharp module.
 * @param buffer The PNG to annotate.
 * @param svg Overlay markup, already sized to the image in pixels.
 * @param blurRegions Regions to blur, already clipped to the image.
 */
async function compositeAnnotations({
  sharp,
  buffer,
  svg,
  blurRegions,
}: {
  sharp: any;
  buffer: Buffer;
  svg: string;
  blurRegions: BlurRegion[];
}): Promise<Buffer> {
  const layers: any[] = [];

  // Extract -> blur -> paste back. sharp's blur applies to a whole image, so
  // redacting a region means lifting it out and dropping the blurred copy back
  // at the same coordinates.
  //
  // Every region is lifted from the ORIGINAL buffer and they all composite in
  // one pass, rather than re-encoding the whole PNG once per region. With
  // `all: true` over a form full of fields that's the difference between one
  // encode and dozens. Lifting from the original also keeps overlapping blurs
  // from compounding into a progressively muddier smear.
  const blurred = await Promise.all(
    blurRegions.map(async (region) => ({
      input: await sharp(buffer)
        .extract({
          left: region.rect.x,
          top: region.rect.y,
          width: region.rect.width,
          height: region.rect.height,
        })
        .blur(region.intensity)
        .toBuffer(),
      left: region.rect.x,
      top: region.rect.y,
    }))
  );
  layers.push(...blurred);

  // Blurs go under the overlay so an outline or callout drawn over a redacted
  // region stays sharp. An overlay with no shapes still parses, but
  // compositing it is pure work for no pixels — skip it when every annotation
  // was a blur.
  if (hasDrawableMarkup(svg)) {
    layers.push({ input: Buffer.from(svg), top: 0, left: 0 });
  }

  if (layers.length === 0) return buffer;

  return await sharp(buffer).composite(layers).png().toBuffer();
}

// True when the overlay contains at least one shape. The generator emits a
// well-formed but empty <svg …></svg> when every annotation was a blur.
function hasDrawableMarkup(svg: string): boolean {
  return /<(rect|circle|line|polygon|text|path)[\s>]/.test(svg);
}
