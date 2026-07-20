/* eslint-disable */
/**
 * Auto-generated from annotationDefaults_v3.schema.json
 * Do not edit manually
 */

/**
 * Theme for annotations. Set base visual properties, override them per annotation type, and set a default transition. Resolved test-level first, then spec, then config, then the built-in theme; an individual annotation's own `style` wins over all of them.
 */
export interface AnnotationDefaults {
  /**
   * Default foreground color for every annotation type.
   */
  color?: string;
  /**
   * Default background color for text-bearing annotations.
   */
  background?: string;
  /**
   * Default line width in pixels.
   */
  strokeWidth?: number;
  /**
   * Default font size in pixels.
   */
  fontSize?: number;
  /**
   * Default font family.
   */
  fontFamily?: string;
  /**
   * Default opacity, from 0 to 1.
   */
  opacity?: number;
  /**
   * Default corner radius in pixels.
   */
  radius?: number;
  /**
   * Default padding in pixels.
   */
  padding?: number;
  /**
   * Default maximum text width in pixels.
   */
  maxWidth?: number;
  /**
   * Default blur strength.
   */
  intensity?: number;
  outline?: AnnotationStyle;
  arrow?: AnnotationStyle1;
  badge?: AnnotationStyle2;
  callout?: AnnotationStyle3;
  blur?: AnnotationStyle4;
  text?: AnnotationStyle5;
  transition?: AnnotationTransition;
}
/**
 * Style overrides applied to every `outline` annotation.
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
 * Style overrides applied to every `arrow` annotation.
 */
export interface AnnotationStyle1 {
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
 * Style overrides applied to every `badge` annotation.
 */
export interface AnnotationStyle2 {
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
 * Style overrides applied to every `callout` annotation.
 */
export interface AnnotationStyle3 {
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
 * Style overrides applied to every `blur` annotation.
 */
export interface AnnotationStyle4 {
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
 * Style overrides applied to every `text` annotation.
 */
export interface AnnotationStyle5 {
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
 * Default transition for annotations that don't set their own.
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
