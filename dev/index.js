import { setArgs, setConfig } from "../dist/utils.js";

// Test that arguments are parsed correctly
const json = {
}
console.log(setConfig(json,setArgs(process.argv)))
