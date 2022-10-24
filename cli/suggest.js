const { suggest } = require("../src/index.js");
const { argv } = require("node:process");

suggest({}, argv);