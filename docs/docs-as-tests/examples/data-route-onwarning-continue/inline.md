<!-- test {"testId":"data-route-onwarning-continue","detectSteps":false} -->

# Print tool versions after a warning

1. Print the Node.js version:

   ```shell
   node --version
   ```
   <!-- step {"runShell":"node --version","onWarning":[{"continue":true}]} -->
2. Print the npm version:

   ```shell
   npm --version
   ```
   <!-- step {"stepId":"npm","runShell":"npm --version"} -->

<!-- test end -->
