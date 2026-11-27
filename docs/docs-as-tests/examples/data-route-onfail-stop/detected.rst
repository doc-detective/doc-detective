Stop when Node.js is missing
============================

.. test {"testId":"data-route-onfail-stop","detectSteps":true}

#. Print the Node.js version:

   .. code-block:: shell

      node --version

   .. step {"runShell":"node --version","onFail":[{"stop":"test"}]}

#. Print the npm version:

   .. code-block:: shell

      npm --version

   .. step {"stepId":"npm","runShell":"npm --version"}

.. test end
