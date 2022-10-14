const { coverage } = require("../src/index.js");
const { argv } = require("node:process");

coverage({}, argv);