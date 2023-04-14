const { setArgs, setConfig } = require("../src/utils");

// Test that arguments are parsed correctly
json = {
}
console.log(setConfig(json,setArgs(process.argv)))