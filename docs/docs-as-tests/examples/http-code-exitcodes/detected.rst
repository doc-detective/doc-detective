Expect a failing exit code
==========================

.. test {"testId":"http-code-exitcodes","detectSteps":true}

This script exits with code ``2``:

.. code-block:: js
   :class: testIgnore

   process.exit(2);

.. step {"runCode":{"language":"js","code":"process.exit(2);","exitCodes":[2]}}

.. test end
