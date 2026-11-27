<!-- test {"testId":"data-if-step-array","detectSteps":false} -->

# Print the npm version after a valid Node.js version

1. Print the Node.js version:

   ```shell
   node --version
   ```
   <!-- step {"runShell":"node --version","stepId":"version"} -->
2. If that printed a version, print the npm version:

   ```shell
   npm --version
   ```
   <!-- step {"if":["$$steps.version.outputs.exitCode == 0","$$steps.version.outputs.stdio.stdout matches /^v/"],"runShell":"npm --version"} -->

<!-- test end -->
