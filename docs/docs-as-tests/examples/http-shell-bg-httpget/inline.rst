Start a background process
==========================

.. test {"testId":"http-shell-bg-httpget","detectSteps":false}

Start a server on port 8242:

.. code-block:: shell

   node -e "require('http').createServer((q, r) => r.end('ok')).listen(8242)"

.. step {"runShell":{"command":"node -e \"require('http').createServer((q, r) => r.end('ok')).listen(8242)\"","background":{"name":"http-shell-bg-httpget","waitUntil":{"httpGet":"http://localhost:8242/"}},"timeout":15000}}

Stop it when you're done.

.. step {"closeSurface":"http-shell-bg-httpget"}

.. test end
