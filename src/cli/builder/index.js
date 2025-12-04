/**
 * Builder module index
 * 
 * Note: Most builder components are ESM (.mjs files) that are dynamically
 * imported by builderRunner.js to avoid ESM/CommonJS compatibility issues
 * with ink@6.x which uses top-level await.
 */

module.exports = {
  runBuilder: require('./builderRunner').runBuilder,
};
