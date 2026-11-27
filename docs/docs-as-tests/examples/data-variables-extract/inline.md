<!-- test {"testId":"data-variables-extract","detectSteps":false} -->

# Save the Node.js major version

1. Print the Node.js version:

   ```shell
   node --version
   ```
   <!-- step {"runShell":"node --version","variables":{"NODE_MAJOR":"extract($$stdio.stdout, \"v([0-9]+)\")"}} -->
2. Check that the major version is a number:

   ```shell
   node -e "process.exit(/^[0-9]+$/.test(process.env.NODE_MAJOR) ? 0 : 1)"
   ```
   <!-- step {"runShell":"node -e \"process.exit(/^[0-9]+$/.test(process.env.NODE_MAJOR) ? 0 : 1)\""} -->

<!-- test end -->
