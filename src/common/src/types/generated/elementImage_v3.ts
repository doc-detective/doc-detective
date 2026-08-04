/* eslint-disable */
/**
 * Auto-generated from elementImage_v3.schema.json
 * Do not edit manually
 */

/**
 * Locate the element visually by template image (OpenCV template matching, auto-scaled across display scales). Combinable with other element criteria.
 */
export type Image = ImageSimple | ImageDetailed;
/**
 * Template image: a PNG/JPEG file path (resolved relative to the spec) or a data:image/…;base64 URI.
 */
export type ImageSimple = string;

export interface ImageDetailed {
  /**
   * Template image: a PNG/JPEG file path (resolved relative to the spec) or a data:image/…;base64 URI.
   */
  path: string;
  /**
   * Minimum normalized match score (0–1). Defaults to the config-level `imageMatching.matchThreshold` (0.8).
   */
  matchThreshold?: number;
  /**
   * Search area: a rect ({x, y, width, height} in logical units) or element criteria (selector, elementText, …) whose match's bounds become the search area. Shape is validated at runtime; a nested `image` is rejected.
   */
  region?: {
    [k: string]: unknown;
  };
}
