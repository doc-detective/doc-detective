Check that the page server is up
================================

.. test {"testId":"custom-option-metaexcludes","detectSteps":true}

Request the type echo page:

.. code-block:: bash

   curl -sf -o /dev/null http://localhost:8092/type-echo.html

If the request fails, start the server from the repository root:

.. code-block:: bash
   :class: no-run

   node test/server/start.js

.. test end
