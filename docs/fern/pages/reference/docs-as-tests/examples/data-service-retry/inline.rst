Echo text through the service
=============================

.. test {"testId":"data-service-ready","onPass":[{"goToTest":"data-echo-text"}],"onFail":[{"stop":"spec"}],"detectSteps":false}

Check that the service is ready
-------------------------------

The service can take a few seconds to start. Check that it's ready. If the check fails, check again after a short wait:

.. code-block:: shell

   node -e "const fs=require('fs'),f=require('path').join(require('os').tmpdir(),'doc-detective-docs-ready');if(fs.existsSync(f)){fs.rmSync(f)}else{fs.writeFileSync(f,'');console.error('Not ready yet.');process.exit(1)}"

.. step {"runShell":"node -e \"const fs=require('fs'),f=require('path').join(require('os').tmpdir(),'doc-detective-docs-ready');if(fs.existsSync(f)){fs.rmSync(f)}else{fs.writeFileSync(f,'');console.error('Not ready yet.');process.exit(1)}\"","onFail":[{"retry":{"limit":3,"delay":500,"backoff":"exponential"}}]}

This example simulates a service that isn't ready the first time you check.

.. test end

.. test {"testId":"data-service-restart","detectSteps":false}

Restart the service
-------------------

If the service still isn't ready, restart it:

.. code-block:: shell

   node -e "console.log('Restarting the service.')"

.. step {"runShell":"node -e \"console.log('Restarting the service.')\""}

.. test end

.. test {"testId":"data-echo-text","publicVariables":["ECHOED"],"contexts":[{"retries":2}],"onWarning":[{"continue":true}],"detectSteps":false}

Echo text
---------

#. Go to `the type echo page <http://localhost:8092/type-echo.html>`_.

   .. step {"goTo":"http://localhost:8092/type-echo.html"}

#. Click **Type here:**.

   .. step {"click":"Type here:"}

#. Type "Hello, Doc Detective".

   .. step {"type":"Hello, Doc Detective"}

#. Check that the page shows **Hello, Doc Detective** below the field. If it doesn't, type the text again.

   .. step {"stepId":"read-echo","find":{"selector":"#echo","elementText":"Hello, Doc Detective"},"variables":{"ECHOED":"$$element.text"},"onPass":[{"goToStep":"send-echo"}],"onFail":[{"retry":{"limit":2,"delay":500}}]}

   .. step {"stepId":"retype","type":"Hello, Doc Detective"}

#. Send the text to the messages API. Send a ``POST`` request to ``http://localhost:8093/api/messages`` with this body:

   .. code-block:: json

      {"text": "Hello, Doc Detective"}

   The API returns the same text.

   .. step {"stepId":"send-echo","if":"$$steps.read-echo.outputs.element.text == \"Hello, Doc Detective\"","httpRequest":{"url":"http://localhost:8093/api/messages","method":"post","request":{"body":{"text":"$ECHOED"}},"response":{"body":{"text":"Hello, Doc Detective"}}},"assertions":"$$outputs.response.body.text == \"$ECHOED\""}

.. test end
