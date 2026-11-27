Jump ahead after a warning
==========================

.. test {"testId":"data-route-onwarning-gotostep","detectSteps":false}

#. Print the Node.js version:

   .. code-block:: shell

      node --version

   .. step {"runShell":"node --version","onWarning":[{"goToStep":"path"}]}

#. Print the npm version:

   .. code-block:: shell

      npm --version

   .. step {"stepId":"npm","runShell":"npm --version"}

#. Find the Node.js executable:

   .. code-block:: shell

      command -v node

   .. step {"stepId":"path","runShell":"command -v node"}

.. test end
