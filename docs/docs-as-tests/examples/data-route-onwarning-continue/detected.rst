Print tool versions after a warning
===================================

.. test {"testId":"data-route-onwarning-continue","detectSteps":true}

#. Print the Node.js version:

   .. code-block:: shell

      node --version

   .. step {"runShell":"node --version","onWarning":[{"continue":true}]}

#. Print the npm version:

   .. code-block:: shell

      npm --version

   .. step {"stepId":"npm","runShell":"npm --version"}

.. test end
