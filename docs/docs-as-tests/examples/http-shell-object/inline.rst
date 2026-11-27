Run a command with arguments
============================

.. test {"testId":"http-shell-object","detectSteps":false}

Print the Node.js version:

.. code-block:: shell

   node --version

.. step {"runShell":{"command":"node","args":["--version"]}}

.. test end
