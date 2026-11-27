<!-- test {"testId":"data-if-step-string-true","detectSteps":true} -->

# Print the npm version after Node.js

1. Print the Node.js version:

   ```shell
   node --version
   ```
   <!-- step {"runShell":"node --version","stepId":"version"} -->
2. If that worked, print the npm version:

   ```shell
   npm --version
   ```
   <!-- step {"if":"$$steps.version.outputs.exitCode == 0","runShell":"npm --version"} -->

<!-- test end -->
