import { schemas } from "../schemas/index.js";

// `true` waits the schema's default duration. The string "true" arrives here
// as `true` too: AJV coerces it through wait_v3's ["number", "boolean"] type
// (ADR 01161, and the schema's $comment). A number, `false` (skip the step),
// and a $VAR string stay as they are.
export default function wait(value: any): any {
  return value === true ? (schemas as any).wait_v3.default : value;
}
