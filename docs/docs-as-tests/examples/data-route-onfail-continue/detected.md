<!-- test {"testId":"data-route-onfail-continue","detectSteps":true} -->

# Print tool versions even if one fails

1. Print the Node.js version:

   ```shell
   node --version
   ```
   <!-- step {"runShell":"node --version","onFail":[{"continue":true}]} -->
2. Print the npm version:

   ```shell
   npm --version
   ```
   <!-- step {"stepId":"npm","runShell":"npm --version"} -->

<!-- test end -->
