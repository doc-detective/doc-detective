/* eslint-disable */
/**
 * Auto-generated from stopRecord_v3.schema.json
 * Do not edit manually
 */

/**
 * Stop a recording started by an earlier `record` step. With no target (`true`/`null`), stops the most recently started recording that is still active (LIFO). To stop a specific recording when several overlap, target it by name with a string (`stopRecord: "<name>"`) or an object (`stopRecord: { name: "<name>" }`).
 */
export type StopRecord = StopRecordBoolean | StopRecordNull | StopRecordName | StopRecordDetailed;
/**
 * If `true`, stops the most recently started active recording (LIFO).
 */
export type StopRecordBoolean = boolean;
/**
 * Stops the most recently started active recording (LIFO).
 */
export type StopRecordNull = null;
/**
 * Name of the recording to stop. Matches the `name` given to a `record` step.
 */
export type StopRecordName = string;

export interface StopRecordDetailed {
  /**
   * Name of the recording to stop. Matches the `name` given to a `record` step.
   */
  name: string;
}
