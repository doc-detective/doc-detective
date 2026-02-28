/* eslint-disable */
/**
 * Auto-generated from dragAndDrop_v3.schema.json
 * Do not edit manually
 */

/**
 * Display text, selector, or regex pattern (enclosed in forward slashes) of the element.
 */
export type ElementSimple = string;
export type ElementDetailed = {
  [k: string]: unknown;
};
/**
 * Display text, selector, or regex pattern (enclosed in forward slashes) of the element.
 */
export type ElementSimple1 = string;
export type ElementDetailed1 = {
  [k: string]: unknown;
};

/**
 * Drag and drop an element from source to target.
 */
export interface DragAndDrop {
  /**
   * The element to drag.
   */
  source: ElementSimple | ElementDetailed;
  /**
   * The target location to drop the element.
   */
  target: ElementSimple1 | ElementDetailed1;
  /**
   * Duration of the drag operation in milliseconds.
   */
  duration?: number;
  [k: string]: unknown;
}
