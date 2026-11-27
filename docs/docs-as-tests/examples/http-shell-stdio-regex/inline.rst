Match command output
====================

.. test {"testId":"http-shell-stdio-regex","detectSteps":false}

Print the Node.js version. It starts with ``v`` and a number:

.. code-block:: shell

   node --version

.. step {"runShell":{"command":"node --version","stdio":"/^v\\d+\\./"}}

.. test end
