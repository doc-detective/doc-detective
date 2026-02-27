import { validate, schemas } from "../dist/index.js";
import assert from "assert";

// Loop through JSON schemas
for (const [key, value] of Object.entries(schemas)) {
  describe(`${key} schema`, function () {
    it("should have one or more examples", function () {
      // Schema needs one or more examples
      assert(value.examples);
      assert(value.examples.length >= 1);
    });

    // Loop through and validate schema examples
    value.examples.forEach((example, index) => {
      it(`example with index ${index} passes validation`, function () {
        try {
          const validityCheck = validate({schemaKey: key, object: example});
          assert.ok(
            validityCheck.valid,
            `Validation failed for ${key}, example ${index}: ${validityCheck.errors}`
          );
        } catch (error) {
          assert.fail(
            `Unexpected error during validation of ${key}, example ${index}: ${error.message}`
          );
        }
      });
    });
  });
}
