Print the npm version after Node.js
===================================

.. test {"testId":"data-if-step-string-true","detectSteps":true}

#. Print the Node.js version:

   .. code-block:: shell

      node --version

   .. step {"runShell":"node --version","stepId":"version"}

#. If that worked, print the npm version:

   .. code-block:: shell

      npm --version

   .. step {"if":"$$steps.version.outputs.exitCode == 0","runShell":"npm --version"}

.. test end
