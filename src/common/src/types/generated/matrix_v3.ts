/* eslint-disable */
/**
 * Auto-generated from matrix_v3.schema.json
 * Do not edit manually
 */

/**
 * Values to run this context once per combination of. Each key names a list of values. Reference a value in the context's fields or in the test's steps as `$$matrix.<key>`, or `$$matrix.<key>.<field>` for a field of an object value. The context runs once per combination of the keys it references, and each combination's context ID ends in `~<key>=<value>`. A reference that is the whole string keeps the value's type; one inside a longer string is spliced in as text. A key that the test doesn't reference doesn't multiply its contexts, but on a `runOn` the test sets itself, an unreferenced key is an error.
 */
export interface Matrix {
  /**
   * The values for this key: a non-empty list of unique items, either all scalars (string, number, or boolean) or all objects whose values are scalars.
   */
  [k: string]:
    | [string | number | boolean, ...(string | number | boolean)[]]
    | [
        {
          [k: string]: string | number | boolean;
        },
        ...{
          [k: string]: string | number | boolean;
        }[],
      ];
}
