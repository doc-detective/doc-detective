<!-- test {"testId":"data-route-onpass-retry","detectSteps":false} -->

# Print the Node.js version twice

1. Print the Node.js version:

   ```shell
   node --version
   ```
   <!-- step {"runShell":"node --version","onPass":[{"retry":{"limit":1}}]} -->
2. Print the npm version:

   ```shell
   npm --version
   ```
   <!-- step {"stepId":"npm","runShell":"npm --version"} -->

<!-- test end -->
