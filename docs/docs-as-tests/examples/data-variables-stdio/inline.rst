Save the Node.js version
========================

.. test {"testId":"data-variables-stdio","detectSteps":false}

#. Print the Node.js version:

   .. code-block:: shell

      node --version

   .. step {"runShell":"node --version","variables":{"NODE_VERSION":"$$stdio.stdout"}}

#. Check that the saved version starts with ``v``:

   .. code-block:: shell

      node -e "process.exit(process.env.NODE_VERSION.startsWith('v') ? 0 : 1)"

   .. step {"runShell":"node -e \"process.exit(process.env.NODE_VERSION.startsWith('v') ? 0 : 1)\""}

.. test end
