<!-- test {"testId":"data-route-onfail-retry-then-continue","detectSteps":true} -->

# Wait for a service, then move on

1. Check that the service is ready. If the check fails, check again:

   ```shell
   node -e "const fs=require('fs'),f=require('path').join(require('os').tmpdir(),'dd-data-route-onfail-retry-then-continue');if(fs.existsSync(f)){fs.rmSync(f)}else{fs.writeFileSync(f,'');console.error('Not ready yet.');process.exit(1)}"
   ```
   <!-- step {"runShell":"node -e \"const fs=require('fs'),f=require('path').join(require('os').tmpdir(),'dd-data-route-onfail-retry-then-continue');if(fs.existsSync(f)){fs.rmSync(f)}else{fs.writeFileSync(f,'');console.error('Not ready yet.');process.exit(1)}\"","onFail":[{"retry":{"limit":2}},{"continue":true}]} -->
2. Print the npm version:

   ```shell
   npm --version
   ```
   <!-- step {"stepId":"npm","runShell":"npm --version"} -->

<!-- test end -->
