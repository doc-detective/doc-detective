# Echo text through the service

<!-- test {"testId":"data-service-ready","onPass":[{"goToTest":"data-echo-text"}],"onFail":[{"stop":"spec"}],"detectSteps":true} -->

## Check that the service is ready

The service can take a few seconds to start. Check that it's ready. If the check fails, check again after a short wait:

```shell
node -e "const fs=require('fs'),f=require('path').join(require('os').tmpdir(),'doc-detective-docs-ready');if(fs.existsSync(f)){fs.rmSync(f)}else{fs.writeFileSync(f,'');console.error('Not ready yet.');process.exit(1)}"
```

<!-- step {"runShell":"node -e \"const fs=require('fs'),f=require('path').join(require('os').tmpdir(),'doc-detective-docs-ready');if(fs.existsSync(f)){fs.rmSync(f)}else{fs.writeFileSync(f,'');console.error('Not ready yet.');process.exit(1)}\"","onFail":[{"retry":{"limit":3,"delay":500,"backoff":"exponential"}}]} -->

This example simulates a service that isn't ready the first time you check.

<!-- test end -->

<!-- test {"testId":"data-service-restart","detectSteps":true} -->

## Restart the service

If the service still isn't ready, restart it:

```shell
node -e "console.log('Restarting the service.')"
```

<!-- step {"runShell":"node -e \"console.log('Restarting the service.')\""} -->

<!-- test end -->

<!-- test {"testId":"data-echo-text","publicVariables":["ECHOED"],"contexts":[{"retries":2}],"onWarning":[{"continue":true}],"detectSteps":true} -->

## Echo text

1. Go to [the type echo page](http://localhost:8092/type-echo.html).
2. Click **Type here:**.
3. Type "Hello, Doc Detective".
4. Check that the page shows **Hello, Doc Detective** below the field. If it doesn't, type the text again.
5. Send the text to the messages API. Send a `POST` request to `http://localhost:8093/api/messages` with this body:

   ```json
   {"text": "Hello, Doc Detective"}
   ```

   The API returns the same text.
   <!-- step {"httpRequest":{"url":"http://localhost:8093/api/messages","method":"post","request":{"body":{"text":"Hello, Doc Detective"}},"response":{"body":{"text":"Hello, Doc Detective"}}}} -->

<!-- test end -->
