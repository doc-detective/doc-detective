<!-- test {"testId":"data-route-onwarning-stop","detectSteps":false} -->

# Stop after a warning

1. Print the Node.js version:

   ```shell
   node --version
   ```
   <!-- step {"runShell":"node --version","onWarning":[{"stop":"test"}]} -->
2. Print the npm version:

   ```shell
   npm --version
   ```
   <!-- step {"stepId":"npm","runShell":"npm --version"} -->

<!-- test end -->
