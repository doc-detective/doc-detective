Run a command in cmd
====================

.. test {"testId":"http-shell-shell-cmd","detectSteps":true,"runOn":[{"platforms":["windows"]}]}

Print the Windows version:

.. code-block:: shell

   ver

.. step {"runShell":{"command":"ver","shell":"cmd","stdio":"Windows"}}

.. test end
