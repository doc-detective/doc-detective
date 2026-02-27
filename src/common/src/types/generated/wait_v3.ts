/* eslint-disable */
/**
 * Auto-generated from wait_v3.schema.json
 * Do not edit manually
 */

/**
 * Pause (in milliseconds) before performing the next action.
 */
export type Wait = WaitSimple | WaitEnvironmentVariable | WaitBoolean;
export type WaitSimple = number;
export type WaitEnvironmentVariable = string;
export type WaitBoolean = boolean;
