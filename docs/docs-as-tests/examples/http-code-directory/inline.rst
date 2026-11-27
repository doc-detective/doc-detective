Save a greeting from code
=========================

.. test {"testId":"http-code-directory","detectSteps":false}

Print a greeting with Node.js, and save the output to ``greeting.txt`` in the ``output`` folder:

.. code-block:: js

   console.log('Hello from the output folder');

.. step {"runCode":{"language":"js","code":"console.log('Hello from the output folder');","path":"greeting.txt","directory":"output"}}

.. test end
