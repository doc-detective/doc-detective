Run an unsafe step
==================

.. test {"testId":"http-code-unsafe-allowed","detectSteps":false}

Run this code:

.. code-block:: javascript

   console.log("ready");

.. step {"unsafe":true,"runCode":{"language":"javascript","code":"console.log(\"ready\");"}}

.. test end
