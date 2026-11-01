/* eslint-disable */
/**
 * Auto-generated from elementImage_v3.schema.json
 * Do not edit manually
 */

/**
 * A picture of the element to find. Doc Detective looks for it on screen, matching both its shape and its color. Works on browser surfaces on desktop. If combined with other element finding fields, the match must lie inside an element that meets them.
 */
export type ElementImage = ImagePath | ImageDetailed;
/**
 * Path to a PNG, JPEG, or SVG file. A relative path resolves against the spec file, unless `relativePathBase` is `cwd`.
 */
export type ImagePath = string;
export type ImageDetailed = {
  [k: string]: unknown;
} & {
  /**
   * Path to a PNG, JPEG, or SVG file. A relative path resolves against the spec file, unless `relativePathBase` is `cwd`.
   */
  path?: string;
  /**
   * The image's bytes as base64, with or without a `data:image/png;base64,` prefix. Failure messages call it `base64 reference` rather than printing the value.
   */
  base64?: string;
  /**
   * The lowest score that counts as a match. A location's score is the lower of its shape score and its color score, and 1 is a perfect match. Defaults to 0.9.
   */
  threshold?: number;
  /**
   * The icon's color on the page, as a six-digit hex value. Use this for a file drawn in `currentColor`, which renders black, or to find a one-color icon in another color. Works only with a transparent file in one color.
   */
  color?: string;
};
