/* eslint-disable */
/**
 * Auto-generated from click_v3.schema.json
 * Do not edit manually
 */

/**
 * Click or tap an element.
 */
export type Click = ClickElementSimple | ClickElementDetailed | boolean;
/**
 * Identifier for the element to click. Can be a selector, element text, ARIA name, ID, or test ID.
 */
export type ClickElementSimple = string;
export type ClickElementDetailed = {
  [k: string]: unknown;
};
