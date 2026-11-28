Print tool versions even if one fails
=====================================

.. test {"testId":"data-route-onfail-continue","detectSteps":false}

#. Print the Node.js version:

   .. code-block:: shell

      node --version

   .. step {"runShell":"node --version","onFail":[{"continue":true}]}

#. Print the npm version:

   .. code-block:: shell

      npm --version

   .. step {"stepId":"npm","runShell":"npm --version"}

.. test end
