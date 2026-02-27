/* eslint-disable */
/**
 * Auto-generated from find_v3.schema.json
 * Do not edit manually
 */

/**
 * Find an element based on display text or a selector, then optionally interact with it.
 */
export type Find = FindElementSimple | FindElementDetailed;
/**
 * Identifier for the element to find. Can be a selector, element text, ARIA name, ID, or test ID.
 */
export type FindElementSimple = string;
export type FindElementDetailed = {
  [k: string]: unknown;
};
