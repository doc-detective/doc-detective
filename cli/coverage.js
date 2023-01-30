const { coverage } = require("doc-detective");
const { argv } = require("node:process");

coverage({}, argv);