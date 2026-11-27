<!-- test {"testId":"data-route-onskip-stop","detectSteps":true} -->

# Stop when the help step is skipped

1. Print the Node.js version:

   ```shell
   node --version
   ```
   <!-- step {"runShell":"node --version","stepId":"version"} -->
2. If that failed, print the help for `node`:

   ```shell
   node --help
   ```
   <!-- step {"if":"$$steps.version.outputs.exitCode != 0","runShell":"node --help","onSkip":[{"stop":"test"}]} -->
3. Print the npm version:

   ```shell
   npm --version
   ```
   <!-- step {"stepId":"npm","runShell":"npm --version"} -->

<!-- test end -->
