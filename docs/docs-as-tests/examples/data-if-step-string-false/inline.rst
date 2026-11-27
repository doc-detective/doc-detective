Show help only when Node.js fails
=================================

.. test {"testId":"data-if-step-string-false","detectSteps":false}

#. Print the Node.js version:

   .. code-block:: shell

      node --version

   .. step {"runShell":"node --version","stepId":"version"}

#. If that failed, print the help for ``node``:

   .. code-block:: shell

      node --help

   .. step {"if":"$$steps.version.outputs.exitCode != 0","runShell":"node --help"}

.. test end
