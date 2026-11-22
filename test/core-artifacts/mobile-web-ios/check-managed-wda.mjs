// Run by wda-first-use.spec.json, from the repo root, after an iOS session
// started. Exits 0 when the cache holds a managed WebDriverAgent build for this
// Xcode and driver, which is what a session's locator looks for. Exits 1 when
// it doesn't.
//
// A run with the first-use build turned off builds nothing by design, so there
// is nothing to check. The variables are read the way the runtime reads them.
import { envFlag } from "../../../dist/envFlag.js";
import { locateManagedWda } from "../../../dist/runtime/wdaProducts.js";

if (
  envFlag("DOC_DETECTIVE_NO_IOS_AUTOINSTALL") ||
  process.env.DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH?.trim()
) {
  console.log("The first-use build is off, so there's no managed build to check.");
  process.exit(0);
}

const hit = locateManagedWda();
if (!hit) {
  console.error("No managed WebDriverAgent build is in the cache.");
  process.exit(1);
}
console.log(`Managed WebDriverAgent build: ${hit.key}`);
