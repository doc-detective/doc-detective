Run a command in PowerShell
===========================

.. test {"testId":"http-shell-shell-powershell","detectSteps":true,"runOn":[{"platforms":["windows"]}]}

Print the PowerShell edition:

.. code-block:: shell

   echo $PSEdition

.. step {"runShell":{"command":"echo $PSEdition","shell":"powershell","stdio":"Desktop"}}

.. test end
