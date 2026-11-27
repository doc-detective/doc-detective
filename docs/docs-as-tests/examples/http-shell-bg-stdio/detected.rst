Start a background process
==========================

.. test {"testId":"http-shell-bg-stdio","detectSteps":true}

Start the process:

.. code-block:: shell

   node -e "console.log('Preview ready'); setInterval(() => {}, 1000)"

.. step {"runShell":{"command":"node -e \"console.log('Preview ready'); setInterval(() => {}, 1000)\"","background":{"name":"http-shell-bg-stdio","waitUntil":{"stdio":"Preview ready"}},"timeout":15000}}

Stop it when you're done.

.. step {"closeSurface":"http-shell-bg-stdio"}

.. test end
