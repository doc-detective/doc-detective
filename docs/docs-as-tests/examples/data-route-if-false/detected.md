<!-- test {"testId":"data-route-if-false","detectSteps":true} -->

# Fall back to the default route

1. Print the Node.js version:

   ```shell
   node --version
   ```
   <!-- step {"runShell":"node --version","onPass":[{"if":"$$outputs.exitCode != 0","stop":"test"}]} -->
2. Print the npm version:

   ```shell
   npm --version
   ```
   <!-- step {"stepId":"npm","runShell":"npm --version"} -->

<!-- test end -->
