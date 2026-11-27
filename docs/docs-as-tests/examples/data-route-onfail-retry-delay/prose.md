# Wait for a service to be ready

1. Check that the service is ready. If the check fails, check again:

   ```shell
   node -e "const fs=require('fs'),f=require('path').join(require('os').tmpdir(),'dd-data-route-onfail-retry-delay');if(fs.existsSync(f)){fs.rmSync(f)}else{fs.writeFileSync(f,'');console.error('Not ready yet.');process.exit(1)}"
   ```
