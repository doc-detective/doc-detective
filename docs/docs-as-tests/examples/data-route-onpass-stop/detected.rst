Print the Node.js version only
==============================

.. test {"testId":"data-route-onpass-stop","detectSteps":true}

#. Print the Node.js version:

   .. code-block:: shell

      node --version

   .. step {"runShell":"node --version","onPass":[{"stop":"test"}]}

#. Print the npm version:

   .. code-block:: shell

      npm --version

   .. step {"stepId":"npm","runShell":"npm --version"}

.. test end
