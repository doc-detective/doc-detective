<!-- test {"testId":"data-route-if-string","detectSteps":true} -->

# Skip ahead on desktop platforms

1. Print the Node.js version:

   ```shell
   node --version
   ```
   <!-- step {"runShell":"node --version","onPass":[{"if":"$$platform oneOf [linux, mac, windows]","goToStep":"path"}]} -->
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
