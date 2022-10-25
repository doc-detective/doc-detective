const { setEnvs, loadEnvs } = require("../utils");

exports.goTo = goTo;

// Open a URI in the browser
async function goTo(action, page) {
  let uri;
  if (!action.uri) {
    // FAIL: No URI
    let status = "FAIL";
    let description = "'uri' is a required field.";
    let result = { status, description };
    return { result };
  }
  // Load environment variables
  if (action.env) {
    let result = await setEnvs(action.env);
    if (result.status === "FAIL") return { result };
  }
  uri = loadEnvs(action.uri);

  // Catch common formatting errors
  if (!uri.includes("://")) uri = "https://" + uri;
  // Run action
  try {
    await page.goto(uri);
  } catch {
    // FAIL: Error opening URI
    let status = "FAIL";
    let description = "Couldn't open URI.";
    let result = { status, description };
    return { result };
  }
  // PASS
  let status = "PASS";
  let description = "Opened URI.";
  let result = { status, description };
  return { result };
}
