import { setArgs, setConfig } from "../dist/utils.js";

// Test that arguments are parsed correctly
const json = {
}
setArgs(process.argv);
console.log(setConfig(json))
