import { schemas } from "../schemas/index.js";

// `true` waits the schema's default duration. A number, `false` (skip the
// step), and a $VAR string stay as they are.
export default function wait(value: any): any {
  return value === true ? (schemas as any).wait_v3.default : value;
}
