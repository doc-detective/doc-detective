Echo text through the service
=============================

Check that the service is ready
-------------------------------

The service can take a few seconds to start, so wait five seconds before you check it.

Check that the service is ready. If the check fails, check again after a short wait:

.. code-block:: shell

   node -e "const fs=require('fs'),f=require('path').join(require('os').tmpdir(),'doc-detective-docs-ready');if(fs.existsSync(f)){fs.rmSync(f)}else{fs.writeFileSync(f,'');console.error('Not ready yet.');process.exit(1)}"

This example simulates a service that isn't ready the first time you check.

Restart the service
-------------------

If the service still isn't ready, restart it:

.. code-block:: shell

   node -e "console.log('Restarting the service.')"

Echo text
---------

#. Go to `the type echo page <http://localhost:8092/type-echo.html>`_.

#. Click **Type here:**.

#. Type "Hello, Doc Detective".

#. Check that the page shows **Hello, Doc Detective** below the field. If it doesn't, type the text again.

#. Send the text to the messages API. Send a ``POST`` request to ``http://localhost:8093/api/messages`` with this body:

   .. code-block:: json

      {"text": "Hello, Doc Detective"}

   The API returns the same text.
