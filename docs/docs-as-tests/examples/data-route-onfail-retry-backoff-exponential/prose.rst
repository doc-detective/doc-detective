Wait for a service to be ready
==============================

#. Check that the service is ready. If the check fails, check again:

   .. code-block:: shell

      node -e "const fs=require('fs'),f=require('path').join(require('os').tmpdir(),'dd-data-route-onfail-retry-backoff-exponential');if(fs.existsSync(f)){fs.rmSync(f)}else{fs.writeFileSync(f,'');console.error('Not ready yet.');process.exit(1)}"
