Start a background process
==========================

.. test {"testId":"http-shell-bg-delayms","detectSteps":true}

Start the process:

.. code-block:: shell

   node -e "setInterval(() => {}, 1000)"

.. step {"runShell":{"command":"node -e \"setInterval(() => {}, 1000)\"","background":{"name":"http-shell-bg-delayms","waitUntil":{"delayMs":500}},"timeout":15000}}

Stop it when you're done.

.. step {"closeSurface":"http-shell-bg-delayms"}

.. test end
