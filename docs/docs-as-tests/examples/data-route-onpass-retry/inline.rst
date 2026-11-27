Print the Node.js version twice
===============================

.. test {"testId":"data-route-onpass-retry","detectSteps":false}

#. Print the Node.js version:

   .. code-block:: shell

      node --version

   .. step {"runShell":"node --version","onPass":[{"retry":{"limit":1}}]}

#. Print the npm version:

   .. code-block:: shell

      npm --version

   .. step {"stepId":"npm","runShell":"npm --version"}

.. test end
