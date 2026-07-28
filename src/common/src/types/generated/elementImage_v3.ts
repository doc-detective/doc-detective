/* eslint-disable */
/**
 * Auto-generated from elementImage_v3.schema.json
 * Do not edit manually
 */

/**
 * Locate the element visually by template image. Doc Detective screenshots the surface and finds the region matching the template via OpenCV template matching, auto-scaling the template across display scales (Retina, Windows scaling). Combine with other element criteria to disambiguate identical-looking targets; on browser surfaces the matched region resolves to the real element under its center.
 */
export type Image = ImageSimple | ImageDetailed;
/**
 * Template image: a PNG/JPEG file path (resolved relative to the spec like other paths) or an inline data URI (data:image/png;base64,…).
 */
export type ImageSimple = string;
export type RegionElementCriteria = {
  [k: string]: unknown;
};

export interface ImageDetailed {
  /**
   * Template image: a PNG/JPEG file path (resolved relative to the spec like other paths) or an inline data URI (data:image/png;base64,…).
   */
  path: string;
  /**
   * Minimum normalized match score (0–1) to accept a match. Higher is stricter: 1 demands a near pixel-perfect match, lower values tolerate more rendering variation but risk matching lookalikes. Defaults to the config-level `imageMatching.matchThreshold` (0.8).
   */
  matchThreshold?: number;
  /**
   * Restrict the search area: a rect in logical units ({x, y, width, height}), or element-finding criteria whose matched element's bounds become the search area. Use it to speed up matching or to disambiguate multiple identical-looking targets.
   */
  region?: RegionRect | RegionElementCriteria;
}
export interface RegionRect {
  /**
   * Left edge of the search area in logical units.
   */
  x: number;
  /**
   * Top edge of the search area in logical units.
   */
  y: number;
  /**
   * Width of the search area in logical units.
   */
  width: number;
  /**
   * Height of the search area in logical units.
   */
  height: number;
}
