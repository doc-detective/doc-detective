Print the npm version after a valid Node.js version
===================================================

.. test {"testId":"data-if-step-array","detectSteps":false}

#. Print the Node.js version:

   .. code-block:: shell

      node --version

   .. step {"runShell":"node --version","stepId":"version"}

#. If that printed a version, print the npm version:

   .. code-block:: shell

      npm --version

   .. step {"if":["$$steps.version.outputs.exitCode == 0","$$steps.version.outputs.stdio.stdout matches /^v/"],"runShell":"npm --version"}

.. test end
