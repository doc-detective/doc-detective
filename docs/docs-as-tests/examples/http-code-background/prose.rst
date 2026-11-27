Start a server from code
========================

Start a server on port 8251:

.. code-block:: js

   require('http').createServer((q, r) => r.end('ok')).listen(8251);

Stop it when you're done.
