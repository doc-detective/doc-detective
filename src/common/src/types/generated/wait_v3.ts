/* eslint-disable */
/**
 * Auto-generated from wait_v3.schema.json
 * Do not edit manually
 */

/**
 * Pause before the next action, in milliseconds. `true` pauses for 5000 milliseconds, and `false` skips the step.
 */
export type Wait = WaitSimple | WaitEnvironmentVariable;
export type WaitSimple = number | boolean;
export type WaitEnvironmentVariable = string;
