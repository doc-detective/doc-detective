Save the Node.js major version
==============================

.. test {"testId":"data-variables-extract","detectSteps":true}

#. Print the Node.js version:

   .. code-block:: shell

      node --version

   .. step {"runShell":"node --version","variables":{"NODE_MAJOR":"extract($$stdio.stdout, \"v([0-9]+)\")"}}

#. Check that the major version is a number:

   .. code-block:: shell

      node -e "process.exit(/^[0-9]+$/.test(process.env.NODE_MAJOR) ? 0 : 1)"

   .. step {"runShell":"node -e \"process.exit(/^[0-9]+$/.test(process.env.NODE_MAJOR) ? 0 : 1)\""}

.. test end
