Jump past the help steps
========================

.. test {"testId":"data-route-onskip-gotostep","detectSteps":true}

#. Print the Node.js version:

   .. code-block:: shell

      node --version

   .. step {"runShell":"node --version","stepId":"version"}

#. If that failed, print the help for ``node``:

   .. code-block:: shell

      node --help

   .. step {"if":"$$steps.version.outputs.exitCode != 0","runShell":"node --help","onSkip":[{"goToStep":"path"}]}

#. Print the npm version:

   .. code-block:: shell

      npm --version

   .. step {"stepId":"npm","runShell":"npm --version"}

#. Find the Node.js executable:

   .. code-block:: shell

      command -v node

   .. step {"stepId":"path","runShell":"command -v node"}

.. test end
