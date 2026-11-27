Check command output
====================

.. test {"testId":"http-shell-stdio-string","detectSteps":true}

Run this command. It prints ``ready``:

.. code-block:: shell

   node -e "console.log('ready')"

.. step {"runShell":{"command":"node -e \"console.log('ready')\"","stdio":"ready"}}

.. test end
