<!-- test {"testId":"data-route-onwarning-gotostep","detectSteps":true} -->

# Jump ahead after a warning

1. Print the Node.js version:

   ```shell
   node --version
   ```
   <!-- step {"runShell":"node --version","onWarning":[{"goToStep":"path"}]} -->
2. Print the npm version:

   ```shell
   npm --version
   ```
   <!-- step {"stepId":"npm","runShell":"npm --version"} -->
3. Find the Node.js executable:

   ```shell
   command -v node
   ```
   <!-- step {"stepId":"path","runShell":"command -v node"} -->

<!-- test end -->
