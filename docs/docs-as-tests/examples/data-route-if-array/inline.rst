Skip ahead after a valid version
================================

.. test {"testId":"data-route-if-array","detectSteps":false}

#. Print the Node.js version:

   .. code-block:: shell

      node --version

   .. step {"runShell":"node --version","onPass":[{"if":["$$outputs.exitCode == 0","$$outputs.stdio.stdout matches /^v/"],"goToStep":"path"}]}

#. Print the npm version:

   .. code-block:: shell

      npm --version

   .. step {"stepId":"npm","runShell":"npm --version"}

#. Find the Node.js executable:

   .. code-block:: shell

      command -v node

   .. step {"stepId":"path","runShell":"command -v node"}

.. test end
