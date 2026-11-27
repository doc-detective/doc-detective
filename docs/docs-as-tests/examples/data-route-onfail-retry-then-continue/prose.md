# Wait for a service, then move on

1. Check that the service is ready. If the check fails, check again:

   ```shell
   node -e "const fs=require('fs'),f=require('path').join(require('os').tmpdir(),'dd-data-route-onfail-retry-then-continue');if(fs.existsSync(f)){fs.rmSync(f)}else{fs.writeFileSync(f,'');console.error('Not ready yet.');process.exit(1)}"
   ```
2. Print the npm version:

   ```shell
   npm --version
   ```
