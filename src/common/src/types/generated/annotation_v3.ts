/* eslint-disable */
/**
 * Auto-generated from annotation_v3.schema.json
 * Do not edit manually
 */

/**
 * A visual annotation drawn onto a screenshot or recording. Each annotation names exactly one type (`outline`, `arrow`, `badge`, `callout`, `blur`, or `text`), and the type's value is the target it points at: an element (a selector/display-text string or a detailed find object) or a fixed `position` in the capture. `id`, `track`, `transition`, and `duration` describe behavior over time — they apply to recordings and are inert in still screenshots, so the same annotation means the same thing in both.
 */
export type Annotation = AnnotationFields & ExactlyOneAnnotationType;
/**
 * Display text or selector of the element to annotate.
 */
export type TargetByElementSimple = string;
/**
 * Element to annotate. Mirrors the element-finding fields used elsewhere. On app surfaces only the natively-mappable fields are supported (`elementText`, `elementId`, `elementTestId`, `elementAria`); `selector`, `elementClass`, and `elementAttribute` have no native equivalent.
 */
export type TargetByElementDetailed = ElementFindingFields & AtLeastOneElementFindingField;
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
export type AtLeastOneElementFindingField = {
  [k: string]: unknown;
};
/**
 * A named spot, relative to the target element when the annotation has one, or to the capture when it doesn't.
 */
export type NamedRegion =
  "top" | "bottom" | "left" | "right" | "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
/**
 * Display text or selector of the element to annotate.
 */
export type TargetByElementSimple1 = string;
/**
 * Element to annotate. Mirrors the element-finding fields used elsewhere. On app surfaces only the natively-mappable fields are supported (`elementText`, `elementId`, `elementTestId`, `elementAria`); `selector`, `elementClass`, and `elementAttribute` have no native equivalent.
 */
export type TargetByElementDetailed1 = ElementFindingFields1 & AtLeastOneElementFindingField1;
/**
 * A picture of the element to find. Doc Detective looks for it on screen, matching both its shape and its color. Works on browser surfaces on desktop. If combined with other element finding fields, the match must lie inside an element that meets them.
 */
export type ElementImage1 = ImagePath1 | ImageDetailed1;
/**
 * Path to a PNG, JPEG, or SVG file. A relative path resolves against the spec file, unless `relativePathBase` is `cwd`.
 */
export type ImagePath1 = string;
export type ImageDetailed1 = {
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
export type AtLeastOneElementFindingField1 = {
  [k: string]: unknown;
};
/**
 * A named spot, relative to the target element when the annotation has one, or to the capture when it doesn't.
 */
export type NamedRegion1 =
  "top" | "bottom" | "left" | "right" | "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
/**
 * Display text or selector of the element to annotate.
 */
export type TargetByElementSimple2 = string;
/**
 * Element to annotate. Mirrors the element-finding fields used elsewhere. On app surfaces only the natively-mappable fields are supported (`elementText`, `elementId`, `elementTestId`, `elementAria`); `selector`, `elementClass`, and `elementAttribute` have no native equivalent.
 */
export type TargetByElementDetailed2 = ElementFindingFields2 & AtLeastOneElementFindingField2;
/**
 * A picture of the element to find. Doc Detective looks for it on screen, matching both its shape and its color. Works on browser surfaces on desktop. If combined with other element finding fields, the match must lie inside an element that meets them.
 */
export type ElementImage2 = ImagePath2 | ImageDetailed2;
/**
 * Path to a PNG, JPEG, or SVG file. A relative path resolves against the spec file, unless `relativePathBase` is `cwd`.
 */
export type ImagePath2 = string;
export type ImageDetailed2 = {
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
export type AtLeastOneElementFindingField2 = {
  [k: string]: unknown;
};
/**
 * A named spot, relative to the target element when the annotation has one, or to the capture when it doesn't.
 */
export type NamedRegion2 =
  "top" | "bottom" | "left" | "right" | "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
/**
 * Display text or selector of the element to annotate.
 */
export type TargetByElementSimple3 = string;
/**
 * Element to annotate. Mirrors the element-finding fields used elsewhere. On app surfaces only the natively-mappable fields are supported (`elementText`, `elementId`, `elementTestId`, `elementAria`); `selector`, `elementClass`, and `elementAttribute` have no native equivalent.
 */
export type TargetByElementDetailed3 = ElementFindingFields3 & AtLeastOneElementFindingField3;
/**
 * A picture of the element to find. Doc Detective looks for it on screen, matching both its shape and its color. Works on browser surfaces on desktop. If combined with other element finding fields, the match must lie inside an element that meets them.
 */
export type ElementImage3 = ImagePath3 | ImageDetailed3;
/**
 * Path to a PNG, JPEG, or SVG file. A relative path resolves against the spec file, unless `relativePathBase` is `cwd`.
 */
export type ImagePath3 = string;
export type ImageDetailed3 = {
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
export type AtLeastOneElementFindingField3 = {
  [k: string]: unknown;
};
/**
 * A named spot, relative to the target element when the annotation has one, or to the capture when it doesn't.
 */
export type NamedRegion3 =
  "top" | "bottom" | "left" | "right" | "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
/**
 * Display text or selector of the element to annotate.
 */
export type TargetByElementSimple4 = string;
/**
 * Element to annotate. Mirrors the element-finding fields used elsewhere. On app surfaces only the natively-mappable fields are supported (`elementText`, `elementId`, `elementTestId`, `elementAria`); `selector`, `elementClass`, and `elementAttribute` have no native equivalent.
 */
export type TargetByElementDetailed4 = ElementFindingFields4 & AtLeastOneElementFindingField4;
/**
 * A picture of the element to find. Doc Detective looks for it on screen, matching both its shape and its color. Works on browser surfaces on desktop. If combined with other element finding fields, the match must lie inside an element that meets them.
 */
export type ElementImage4 = ImagePath4 | ImageDetailed4;
/**
 * Path to a PNG, JPEG, or SVG file. A relative path resolves against the spec file, unless `relativePathBase` is `cwd`.
 */
export type ImagePath4 = string;
export type ImageDetailed4 = {
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
export type AtLeastOneElementFindingField4 = {
  [k: string]: unknown;
};
/**
 * A named spot, relative to the target element when the annotation has one, or to the capture when it doesn't.
 */
export type NamedRegion4 =
  "top" | "bottom" | "left" | "right" | "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
/**
 * Display text or selector of the element to annotate.
 */
export type TargetByElementSimple5 = string;
/**
 * Element to annotate. Mirrors the element-finding fields used elsewhere. On app surfaces only the natively-mappable fields are supported (`elementText`, `elementId`, `elementTestId`, `elementAria`); `selector`, `elementClass`, and `elementAttribute` have no native equivalent.
 */
export type TargetByElementDetailed5 = ElementFindingFields5 & AtLeastOneElementFindingField5;
/**
 * A picture of the element to find. Doc Detective looks for it on screen, matching both its shape and its color. Works on browser surfaces on desktop. If combined with other element finding fields, the match must lie inside an element that meets them.
 */
export type ElementImage5 = ImagePath5 | ImageDetailed5;
/**
 * Path to a PNG, JPEG, or SVG file. A relative path resolves against the spec file, unless `relativePathBase` is `cwd`.
 */
export type ImagePath5 = string;
export type ImageDetailed5 = {
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
export type AtLeastOneElementFindingField5 = {
  [k: string]: unknown;
};
/**
 * A named spot, relative to the target element when the annotation has one, or to the capture when it doesn't.
 */
export type NamedRegion5 =
  "top" | "bottom" | "left" | "right" | "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
/**
 * A named spot, relative to the target element when the annotation has one, or to the capture when it doesn't.
 */
export type NamedRegion6 =
  "top" | "bottom" | "left" | "right" | "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type ExactlyOneAnnotationType = {
  [k: string]: unknown;
};

export interface AnnotationFields {
  /**
   * Draw a box around the target.
   */
  outline?: TargetByElementSimple | TargetByElementDetailed | TargetByPosition;
  /**
   * Point an arrow at the target.
   */
  arrow?: TargetByElementSimple1 | TargetByElementDetailed1 | TargetByPosition1;
  /**
   * Mark the target with a small numbered or lettered marker. Set the marker's characters with `label`.
   */
  badge?: TargetByElementSimple2 | TargetByElementDetailed2 | TargetByPosition2;
  /**
   * Label the target with a text box and a leader line. Set the text with `label`.
   */
  callout?: TargetByElementSimple3 | TargetByElementDetailed3 | TargetByPosition3;
  /**
   * Obscure the target to redact sensitive information. Pair with `all` to redact every match rather than the first.
   */
  blur?: TargetByElementSimple4 | TargetByElementDetailed4 | TargetByPosition4;
  /**
   * Place a standalone text box. Set the text with `label`.
   */
  text?: TargetByElementSimple5 | TargetByElementDetailed5 | TargetByPosition5;
  /**
   * Text to display. Required by `badge`, `callout`, and `text`; ignored by the other types.
   */
  label?: string;
  /**
   * Handle for this annotation, so a later `annotate` step can update or clear it. Only meaningful for annotations added by an `annotate` step; ignored on screenshot annotations, which live only for the capture.
   */
  id?: string;
  style?: AnnotationStyle;
  /**
   * Where to place the annotation relative to its target. Accepts a named region, an absolute point, or an offset that nudges the default placement.
   */
  position?: NamedRegion6 | AnnotationPoint6 | AnnotationOffset;
  /**
   * If `true`, the annotation follows its element as the page scrolls or reflows. Applies to recordings; inert in still screenshots, which capture a single moment.
   */
  track?: boolean;
  transition?: AnnotationTransition;
  /**
   * Milliseconds to display the annotation before it clears itself. Omit to display it until an `annotate` step clears it. Applies to recordings; inert in still screenshots.
   */
  duration?: number;
  /**
   * If `true`, annotates every element matching the target instead of only the first. Most useful with `blur`, where redacting only the first match can leave sensitive content visible.
   */
  all?: boolean;
}
export interface ElementFindingFields {
  /**
   * Selector of the element to annotate. Browser surfaces only.
   */
  selector?: string;
  /**
   * Display text of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementText?: string;
  /**
   * ID attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementId?: string;
  /**
   * data-testid attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementTestId?: string;
  /**
   * Class or array of classes that the element must have. Each class supports exact match or regex pattern using /pattern/ syntax. Element must have all specified classes. Browser surfaces only.
   */
  elementClass?: string | string[];
  /**
   * Object of attribute key-value pairs that the element must have. Values can be strings (supporting /pattern/ regex), numbers, or booleans. Boolean true matches attribute presence, false matches absence.
   */
  elementAttribute?: {
    [k: string]: number | boolean | string;
  };
  elementImage?: ElementImage;
  /**
   * Computed accessible name of the element per ARIA specification. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementAria?: string;
  /**
   * Max duration in milliseconds to wait for the element to exist.
   */
  timeout?: number;
}
/**
 * A fixed spot in the capture, for annotations that aren't anchored to an element.
 */
export interface TargetByPosition {
  position: NamedRegion | AnnotationPoint;
}
/**
 * An absolute coordinate in the capture, in pixels from the top-left.
 */
export interface AnnotationPoint {
  /**
   * Horizontal position in pixels from the left edge of the capture.
   */
  x: number;
  /**
   * Vertical position in pixels from the top edge of the capture.
   */
  y: number;
}
export interface ElementFindingFields1 {
  /**
   * Selector of the element to annotate. Browser surfaces only.
   */
  selector?: string;
  /**
   * Display text of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementText?: string;
  /**
   * ID attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementId?: string;
  /**
   * data-testid attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementTestId?: string;
  /**
   * Class or array of classes that the element must have. Each class supports exact match or regex pattern using /pattern/ syntax. Element must have all specified classes. Browser surfaces only.
   */
  elementClass?: string | string[];
  /**
   * Object of attribute key-value pairs that the element must have. Values can be strings (supporting /pattern/ regex), numbers, or booleans. Boolean true matches attribute presence, false matches absence.
   */
  elementAttribute?: {
    [k: string]: number | boolean | string;
  };
  elementImage?: ElementImage1;
  /**
   * Computed accessible name of the element per ARIA specification. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementAria?: string;
  /**
   * Max duration in milliseconds to wait for the element to exist.
   */
  timeout?: number;
}
/**
 * A fixed spot in the capture, for annotations that aren't anchored to an element.
 */
export interface TargetByPosition1 {
  position: NamedRegion1 | AnnotationPoint1;
}
/**
 * An absolute coordinate in the capture, in pixels from the top-left.
 */
export interface AnnotationPoint1 {
  /**
   * Horizontal position in pixels from the left edge of the capture.
   */
  x: number;
  /**
   * Vertical position in pixels from the top edge of the capture.
   */
  y: number;
}
export interface ElementFindingFields2 {
  /**
   * Selector of the element to annotate. Browser surfaces only.
   */
  selector?: string;
  /**
   * Display text of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementText?: string;
  /**
   * ID attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementId?: string;
  /**
   * data-testid attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementTestId?: string;
  /**
   * Class or array of classes that the element must have. Each class supports exact match or regex pattern using /pattern/ syntax. Element must have all specified classes. Browser surfaces only.
   */
  elementClass?: string | string[];
  /**
   * Object of attribute key-value pairs that the element must have. Values can be strings (supporting /pattern/ regex), numbers, or booleans. Boolean true matches attribute presence, false matches absence.
   */
  elementAttribute?: {
    [k: string]: number | boolean | string;
  };
  elementImage?: ElementImage2;
  /**
   * Computed accessible name of the element per ARIA specification. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementAria?: string;
  /**
   * Max duration in milliseconds to wait for the element to exist.
   */
  timeout?: number;
}
/**
 * A fixed spot in the capture, for annotations that aren't anchored to an element.
 */
export interface TargetByPosition2 {
  position: NamedRegion2 | AnnotationPoint2;
}
/**
 * An absolute coordinate in the capture, in pixels from the top-left.
 */
export interface AnnotationPoint2 {
  /**
   * Horizontal position in pixels from the left edge of the capture.
   */
  x: number;
  /**
   * Vertical position in pixels from the top edge of the capture.
   */
  y: number;
}
export interface ElementFindingFields3 {
  /**
   * Selector of the element to annotate. Browser surfaces only.
   */
  selector?: string;
  /**
   * Display text of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementText?: string;
  /**
   * ID attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementId?: string;
  /**
   * data-testid attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementTestId?: string;
  /**
   * Class or array of classes that the element must have. Each class supports exact match or regex pattern using /pattern/ syntax. Element must have all specified classes. Browser surfaces only.
   */
  elementClass?: string | string[];
  /**
   * Object of attribute key-value pairs that the element must have. Values can be strings (supporting /pattern/ regex), numbers, or booleans. Boolean true matches attribute presence, false matches absence.
   */
  elementAttribute?: {
    [k: string]: number | boolean | string;
  };
  elementImage?: ElementImage3;
  /**
   * Computed accessible name of the element per ARIA specification. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementAria?: string;
  /**
   * Max duration in milliseconds to wait for the element to exist.
   */
  timeout?: number;
}
/**
 * A fixed spot in the capture, for annotations that aren't anchored to an element.
 */
export interface TargetByPosition3 {
  position: NamedRegion3 | AnnotationPoint3;
}
/**
 * An absolute coordinate in the capture, in pixels from the top-left.
 */
export interface AnnotationPoint3 {
  /**
   * Horizontal position in pixels from the left edge of the capture.
   */
  x: number;
  /**
   * Vertical position in pixels from the top edge of the capture.
   */
  y: number;
}
export interface ElementFindingFields4 {
  /**
   * Selector of the element to annotate. Browser surfaces only.
   */
  selector?: string;
  /**
   * Display text of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementText?: string;
  /**
   * ID attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementId?: string;
  /**
   * data-testid attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementTestId?: string;
  /**
   * Class or array of classes that the element must have. Each class supports exact match or regex pattern using /pattern/ syntax. Element must have all specified classes. Browser surfaces only.
   */
  elementClass?: string | string[];
  /**
   * Object of attribute key-value pairs that the element must have. Values can be strings (supporting /pattern/ regex), numbers, or booleans. Boolean true matches attribute presence, false matches absence.
   */
  elementAttribute?: {
    [k: string]: number | boolean | string;
  };
  elementImage?: ElementImage4;
  /**
   * Computed accessible name of the element per ARIA specification. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementAria?: string;
  /**
   * Max duration in milliseconds to wait for the element to exist.
   */
  timeout?: number;
}
/**
 * A fixed spot in the capture, for annotations that aren't anchored to an element.
 */
export interface TargetByPosition4 {
  position: NamedRegion4 | AnnotationPoint4;
}
/**
 * An absolute coordinate in the capture, in pixels from the top-left.
 */
export interface AnnotationPoint4 {
  /**
   * Horizontal position in pixels from the left edge of the capture.
   */
  x: number;
  /**
   * Vertical position in pixels from the top edge of the capture.
   */
  y: number;
}
export interface ElementFindingFields5 {
  /**
   * Selector of the element to annotate. Browser surfaces only.
   */
  selector?: string;
  /**
   * Display text of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementText?: string;
  /**
   * ID attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementId?: string;
  /**
   * data-testid attribute of the element to annotate. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementTestId?: string;
  /**
   * Class or array of classes that the element must have. Each class supports exact match or regex pattern using /pattern/ syntax. Element must have all specified classes. Browser surfaces only.
   */
  elementClass?: string | string[];
  /**
   * Object of attribute key-value pairs that the element must have. Values can be strings (supporting /pattern/ regex), numbers, or booleans. Boolean true matches attribute presence, false matches absence.
   */
  elementAttribute?: {
    [k: string]: number | boolean | string;
  };
  elementImage?: ElementImage5;
  /**
   * Computed accessible name of the element per ARIA specification. Supports exact match or regex pattern using /pattern/ syntax.
   */
  elementAria?: string;
  /**
   * Max duration in milliseconds to wait for the element to exist.
   */
  timeout?: number;
}
/**
 * A fixed spot in the capture, for annotations that aren't anchored to an element.
 */
export interface TargetByPosition5 {
  position: NamedRegion5 | AnnotationPoint5;
}
/**
 * An absolute coordinate in the capture, in pixels from the top-left.
 */
export interface AnnotationPoint5 {
  /**
   * Horizontal position in pixels from the left edge of the capture.
   */
  x: number;
  /**
   * Vertical position in pixels from the top edge of the capture.
   */
  y: number;
}
/**
 * Visual overrides for this annotation. Anything unset falls back to the resolved `annotationDefaults` theme (test, then spec, then config), then to the built-in theme.
 */
export interface AnnotationStyle {
  /**
   * Foreground color — strokes, arrowheads, and text (hex, rgb, or named color).
   */
  color?: string;
  /**
   * Background color for text-bearing annotations (hex, rgb, or named color). Use `transparent` for none.
   */
  background?: string;
  /**
   * Line width in pixels.
   */
  strokeWidth?: number;
  /**
   * Font size in pixels.
   */
  fontSize?: number;
  /**
   * Font family. Falls back through the list as in CSS.
   */
  fontFamily?: string;
  /**
   * Opacity, from 0 (invisible) to 1 (opaque).
   */
  opacity?: number;
  /**
   * Corner radius in pixels, for boxes and text backgrounds.
   */
  radius?: number;
  /**
   * Padding in pixels inside text boxes, and between an outline and its element.
   */
  padding?: number;
  /**
   * Maximum width in pixels for text before it wraps.
   */
  maxWidth?: number;
  /**
   * Blur strength. Higher values obscure more.
   */
  intensity?: number;
}
/**
 * An absolute coordinate in the capture, in pixels from the top-left.
 */
export interface AnnotationPoint6 {
  /**
   * Horizontal position in pixels from the left edge of the capture.
   */
  x: number;
  /**
   * Vertical position in pixels from the top edge of the capture.
   */
  y: number;
}
/**
 * A nudge in pixels from the annotation's default placement.
 */
export interface AnnotationOffset {
  /**
   * Pixels to shift the annotation by.
   */
  offset: {
    /**
     * Pixels to shift right. Negative values shift left.
     */
    x: number;
    /**
     * Pixels to shift down. Negative values shift up.
     */
    y: number;
  };
}
/**
 * How the annotation enters and leaves. Applies to recordings; inert in still screenshots, which render the settled state.
 */
export interface AnnotationTransition {
  /**
   * How the annotation appears. Use `none` for annotations that must never reveal what they cover — a `blur` that fades in shows the sensitive content underneath while it does.
   */
  enter?: "none" | "fade" | "pop" | "draw";
  /**
   * How the annotation disappears.
   */
  exit?: "none" | "fade";
  /**
   * Length of the enter and exit animations, in milliseconds.
   */
  durationMs?: number;
}
