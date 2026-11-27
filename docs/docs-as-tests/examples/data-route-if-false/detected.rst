Fall back to the default route
==============================

.. test {"testId":"data-route-if-false","detectSteps":true}

#. Print the Node.js version:

   .. code-block:: shell

      node --version

   .. step {"runShell":"node --version","onPass":[{"if":"$$outputs.exitCode != 0","stop":"test"}]}

#. Print the npm version:

   .. code-block:: shell

      npm --version

   .. step {"stepId":"npm","runShell":"npm --version"}

.. test end
