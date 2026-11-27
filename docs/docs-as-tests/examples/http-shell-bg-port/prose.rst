Start a background process
==========================

Start a server on port 8241:

.. code-block:: shell

   node -e "require('http').createServer((q, r) => r.end('ok')).listen(8241)"

Stop it when you're done.
