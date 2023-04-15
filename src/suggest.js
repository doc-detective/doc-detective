const { suggest } = require("doc-detective");
const { argv } = require("node:process");

suggest({}, argv);