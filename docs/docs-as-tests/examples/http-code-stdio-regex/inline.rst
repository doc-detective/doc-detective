Match code output
=================

.. test {"testId":"http-code-stdio-regex","detectSteps":false}

This script prints a number:

.. code-block:: js

   console.log(6 * 7);

.. step {"runCode":{"language":"js","code":"console.log(6 * 7);","stdio":"/^\\d+$/"}}

.. test end
