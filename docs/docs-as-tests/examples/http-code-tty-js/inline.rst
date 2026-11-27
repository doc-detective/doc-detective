Check the terminal size from code
=================================

.. test {"testId":"http-code-tty-js","detectSteps":false}

Print the size of the terminal the code runs in:

.. code-block:: js

   console.log('Terminal: ' + process.stdout.columns + 'x' + process.stdout.rows); setInterval(() => {}, 1000);

.. step {"runCode":{"language":"js","code":"console.log('Terminal: ' + process.stdout.columns + 'x' + process.stdout.rows); setInterval(() => {}, 1000);","background":{"name":"http-code-tty-js","tty":true,"waitUntil":{"stdio":"Terminal: 120x30"}},"timeout":30000}}

Stop it when you're done.

.. step {"closeSurface":"http-code-tty-js"}

.. test end
