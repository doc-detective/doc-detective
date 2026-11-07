import { applyDefaults } from "./helpers.js";

// Every default is plain. The source and target are find's to normalize.
export default function dragAndDrop(value: any): any {
  return applyDefaults(structuredClone(value), "dragAndDrop");
}
