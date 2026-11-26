// Nothing to normalize: mockRequest has no shorthand and no schema defaults. The
// runner applies the `200` status code (ADR 01225).
export { passthrough as default } from "./helpers.js";
